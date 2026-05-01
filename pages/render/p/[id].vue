<script setup lang="ts">
import { loadPublicProject } from '~/composables/useLoadPublicProject'
import { RENDER_MESSAGES } from '~~/shared/render/messages'
import type { PublicStyle } from '~~/shared/domain/types'
import { normalizePublicStyle } from '~~/shared/domain/defaults'

definePageMeta({ layout: false })

const route = useRoute()
const id = computed(() => String(route.params.id))

function clampInt(name: string, def: number, min: number, max: number): number {
  const raw = route.query[name]
  const v = Array.isArray(raw) ? raw[0] : raw
  const n = typeof v === 'string' ? parseInt(v, 10) : Number.NaN
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.round(n)))
}

const sizePx = computed(() => clampInt('size', 1080, 256, 1920))
const fps = computed(() => clampInt('fps', 30, 12, 60))
const durationS = computed(() => clampInt('duration', 5, 1, 30))

function readStyleFromQuery(): PublicStyle | null {
  const raw = route.query.style
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string' || v.length === 0) return null
  try {
    const parsed = JSON.parse(v) as Partial<PublicStyle>
    return normalizePublicStyle(parsed)
  }
  catch {
    return null
  }
}

const loading = ref(true)
const errorMessage = ref('')
const docState = shallowRef<unknown>(null)
const publicStyle = ref<PublicStyle>(normalizePublicStyle())
const captureYaw = ref(0)

const renderModeKey = computed<'technical' | 'render-debug'>(() =>
  publicStyle.value.renderStyle === 'technical' ? 'technical' : 'render-debug',
)

const projectCanvasRef = ref<{
  getCaptureCanvas: () => HTMLCanvasElement | null
  lockCaptureCamera: () => void
  waitForCapturePaint: () => Promise<void>
} | null>(null)

function postToParent(message: unknown) {
  if (!import.meta.client) return
  try {
    window.parent?.postMessage(message, window.location.origin)
  }
  catch { /* ignore */ }
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await loadPublicProject(id.value)
    docState.value = result.doc
    publicStyle.value = normalizePublicStyle(readStyleFromQuery() ?? result.publicStyle)
  }
  catch (err: unknown) {
    const e = err as { statusMessage?: string, message?: string } | null
    errorMessage.value = e?.statusMessage ?? e?.message ?? 'Could not load project.'
    postToParent({ type: RENDER_MESSAGES.ERROR, message: errorMessage.value })
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

const captureRunning = ref(false)
const captureDone = ref(false)

async function runCapture() {
  if (captureRunning.value || captureDone.value) return
  captureRunning.value = true
  try {
    if (typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === 'undefined') {
      postToParent({ type: RENDER_MESSAGES.ERROR, message: 'WebCodecs VideoEncoder is not available in this browser.' })
      return
    }
    await nextTick()
    await nextTick()

    let waited = 0
    while (!projectCanvasRef.value?.getCaptureCanvas() && waited < 120) {
      await new Promise(r => setTimeout(r, 50))
      waited++
    }
    const ref = projectCanvasRef.value
    const canvas = ref?.getCaptureCanvas() ?? null
    if (!ref || !canvas) {
      postToParent({ type: RENDER_MESSAGES.ERROR, message: 'Designer canvas did not become ready.' })
      return
    }

    const mb = await import('mediabunny')
    const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, canEncodeVideo, QUALITY_HIGH } = mb as unknown as {
      Output: any
      Mp4OutputFormat: any
      BufferTarget: any
      CanvasSource: any
      canEncodeVideo: (codec: string, opts: { width: number, height: number }) => Promise<boolean>
      QUALITY_HIGH: number
    }

    if (!(await canEncodeVideo('avc', { width: canvas.width, height: canvas.height }))) {
      postToParent({ type: RENDER_MESSAGES.ERROR, message: 'H.264 (AVC) encoding is not supported for this canvas size.' })
      return
    }

    ref.lockCaptureCamera()
    await ref.waitForCapturePaint()
    await ref.waitForCapturePaint()

    const f = fps.value
    const totalFrames = Math.max(1, Math.round(durationS.value * f))
    const dt = 1 / f
    const target = new BufferTarget()
    const out = new Output({ format: new Mp4OutputFormat(), target })
    const src = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH })
    out.addVideoTrack(src, { frameRate: f })
    postToParent({ type: RENDER_MESSAGES.READY })
    await out.start()

    for (let i = 0; i < totalFrames; i++) {
      captureYaw.value = (i / totalFrames) * Math.PI * 2
      await nextTick()
      await ref.waitForCapturePaint()
      await src.add(i * dt, dt)
      postToParent({ type: RENDER_MESSAGES.PROGRESS, progress: (i + 1) / totalFrames })
    }
    await out.finalize()
    const buffer = target.buffer as ArrayBuffer | null
    if (!buffer) {
      postToParent({ type: RENDER_MESSAGES.ERROR, message: 'Encoding finished but no buffer was produced.' })
      return
    }
    captureDone.value = true
    postToParent({ type: RENDER_MESSAGES.DONE, buffer })
  }
  catch (err: unknown) {
    const message = (err as { message?: string } | null)?.message ?? 'Render failed.'
    postToParent({ type: RENDER_MESSAGES.ERROR, message })
  }
  finally {
    captureRunning.value = false
  }
}

watch(docState, async (d) => {
  if (d && !captureDone.value) {
    await nextTick()
    await runCapture()
  }
}, { flush: 'post' })

onBeforeUnmount(() => {
  const d = docState.value as { destroy?: () => void } | null
  d?.destroy?.()
})
</script>

<template>
  <div
    class="bg-default"
    :style="{ width: `${sizePx}px`, height: `${sizePx}px` }"
  >
    <div
      v-if="loading"
      class="flex size-full items-center justify-center"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin text-muted"
      />
    </div>
    <p
      v-else-if="errorMessage"
      class="p-2 text-xs text-error"
    >
      {{ errorMessage }}
    </p>
    <Suspense v-else-if="docState">
      <template #default>
        <ProjectCanvas
          ref="projectCanvasRef"
          class="size-full"
          :ydoc="(docState as any)"
          headless-capture
          :assembly-open-doors-drawers="true"
          :assembly-space-modules-view="false"
          :render-mode="renderModeKey"
          :public-style="publicStyle"
          :capture-yaw-radians="captureYaw"
        />
      </template>
      <template #fallback>
        <div class="flex size-full items-center justify-center">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-6 animate-spin text-muted"
          />
        </div>
      </template>
    </Suspense>
  </div>
</template>
