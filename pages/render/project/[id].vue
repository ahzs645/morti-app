<script setup lang="ts">
import * as Y from 'yjs'
import { RENDER_MESSAGES } from '~~/shared/render/messages'
import type { ProjectEditorStateRow, PublicStyle } from '~~/shared/domain/types'
import { normalizePublicStyle } from '~~/shared/domain/defaults'
import { STORES, idbGet } from '~~/shared/idb/morti-db'

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
const fps = computed(() => clampInt('fps', 59, 12, 60))
const durationS = computed(() => clampInt('duration', 5, 1, 30))
const renderId = computed(() => {
  const raw = route.query.renderId
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value.slice(0, 128) : ''
})

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
const docState = shallowRef<Y.Doc | null>(null)
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

function postToParent(message: unknown, transfer?: Transferable[]) {
  if (!import.meta.client) return
  try {
    window.parent?.postMessage(message, window.location.origin, transfer ?? [])
  }
  catch { /* ignore */ }
}

interface DesignStateRow {
  projectId: string
  update: Uint8Array
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const row = await idbGet<DesignStateRow>(STORES.designState, id.value)
    if (!row?.update || row.update.byteLength === 0) {
      throw new Error('No local design snapshot for this project.')
    }
    const doc = new Y.Doc()
    Y.applyUpdate(doc, row.update)
    docState.value = doc

    const editor = await idbGet<ProjectEditorStateRow>(STORES.projectEditorState, id.value)
    publicStyle.value = normalizePublicStyle(readStyleFromQuery() ?? editor?.publicStyle)
  }
  catch (err: unknown) {
    errorMessage.value = (err as { message?: string } | null)?.message ?? 'Could not load local design.'
    postToParent({ type: RENDER_MESSAGES.ERROR, message: errorMessage.value })
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

const captureRunning = ref(false)
const captureDone = ref(false)
let disposed = false

async function runCapture() {
  if (captureRunning.value || captureDone.value) return
  captureRunning.value = true
  let out: any = null
  let src: any = null
  let outputStarted = false
  try {
    if (typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === 'undefined') {
      postToParent({ type: RENDER_MESSAGES.ERROR, message: 'WebCodecs VideoEncoder is not available in this browser.', renderId: renderId.value })
      return
    }
    await nextTick()
    await nextTick()
    if (disposed) return

    let waited = 0
    while (!disposed && !projectCanvasRef.value?.getCaptureCanvas() && waited < 80) {
      await new Promise(r => setTimeout(r, 50))
      waited++
    }
    if (disposed) return
    const ref = projectCanvasRef.value
    const canvas = ref?.getCaptureCanvas() ?? null
    if (!ref || !canvas) {
      postToParent({ type: RENDER_MESSAGES.ERROR, message: 'Designer canvas did not become ready.', renderId: renderId.value })
      return
    }

    const mb = await import('mediabunny')
    if (disposed) return
    const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, canEncodeVideo, QUALITY_MEDIUM } = mb as unknown as {
      Output: any
      Mp4OutputFormat: any
      BufferTarget: any
      CanvasSource: any
      canEncodeVideo: (codec: string, opts: Record<string, unknown>) => Promise<boolean>
      QUALITY_MEDIUM: number
    }
    const encoderOptions = {
      width: canvas.width,
      height: canvas.height,
      bitrate: QUALITY_MEDIUM,
      latencyMode: 'realtime',
      hardwareAcceleration: 'prefer-hardware',
    }

    if (!(await canEncodeVideo('avc', encoderOptions))) {
      postToParent({ type: RENDER_MESSAGES.ERROR, message: 'H.264 (AVC) encoding is not supported for this canvas size.', renderId: renderId.value })
      return
    }
    if (disposed) return

    ref.lockCaptureCamera()
    await ref.waitForCapturePaint()
    await ref.waitForCapturePaint()
    if (disposed) return

    const f = fps.value
    const totalFrames = Math.max(1, Math.round(durationS.value * f))
    const dt = 1 / f
    const target = new BufferTarget()
    out = new Output({ format: new Mp4OutputFormat(), target })
    src = new CanvasSource(canvas, {
      codec: 'avc',
      bitrate: QUALITY_MEDIUM,
      latencyMode: 'realtime',
      hardwareAcceleration: 'prefer-hardware',
      alpha: 'discard',
    })
    out.addVideoTrack(src, { frameRate: f })
    postToParent({ type: RENDER_MESSAGES.READY, renderId: renderId.value })
    await out.start()
    outputStarted = true

    for (let i = 0; !disposed && i < totalFrames; i++) {
      captureYaw.value = (i / totalFrames) * Math.PI * 2
      await nextTick()
      await ref.waitForCapturePaint()
      if (disposed) break
      await src.add(i * dt, dt)
      postToParent({ type: RENDER_MESSAGES.PROGRESS, progress: (i + 1) / totalFrames, renderId: renderId.value })
    }
    if (disposed) return
    src.close()
    await out.finalize()
    const buffer = target.buffer as ArrayBuffer | null
    if (!buffer) {
      postToParent({ type: RENDER_MESSAGES.ERROR, message: 'Encoding finished but no buffer was produced.', renderId: renderId.value })
      return
    }
    captureDone.value = true
    postToParent({ type: RENDER_MESSAGES.DONE, buffer, renderId: renderId.value }, [buffer])
  }
  catch (err: unknown) {
    if (disposed) return
    const message = (err as { message?: string } | null)?.message ?? 'Render failed.'
    postToParent({ type: RENDER_MESSAGES.ERROR, message, renderId: renderId.value })
  }
  finally {
    if (disposed && outputStarted && out && out.state !== 'canceled' && out.state !== 'finalized') {
      src?.close()
      await out.cancel().catch(() => undefined)
    }
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
  disposed = true
  docState.value?.destroy()
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
      class="p-3 text-xs text-error text-pretty"
    >
      {{ errorMessage }}
    </p>
    <Suspense v-else-if="docState">
      <template #default>
        <ProjectCanvas
          ref="projectCanvasRef"
          class="size-full"
          :ydoc="docState"
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
