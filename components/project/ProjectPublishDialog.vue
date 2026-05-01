<script setup lang="ts">
import type { CloudProjectRecord, LocalProjectRow, PublicStyle } from '~~/shared/domain/types'
import { normalizePublicStyle } from '~~/shared/domain/defaults'
import { isRenderMessage, RENDER_MESSAGES } from '~~/shared/render/messages'

interface Props {
  open: boolean
  project: LocalProjectRow
  cloudRecord?: CloudProjectRecord | null
  publishedCloudRecord?: CloudProjectRecord | null
  publicStyle?: PublicStyle | null
}

const props = withDefaults(defineProps<Props>(), {
  cloudRecord: null,
  publishedCloudRecord: null,
  publicStyle: null,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'published', record: CloudProjectRecord): void
  (e: 'unpublished'): void
}>()

const RENDER_VIDEO_SIZE_PX = 1080
const RENDER_FPS = 59
const COPIED_FEEDBACK_MS = 2000

const open = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})
const { publishFromLocal, unpublishCloudProject } = useCloudProjects()

const publishing = ref(false)
const unpublishing = ref(false)
const confirmUnpublishOpen = ref(false)
const errorMessage = ref('')
const copiedFlash = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

const cloudRecord = computed(() => props.publishedCloudRecord ?? props.cloudRecord ?? null)
const isPublished = computed(() => {
  const record = cloudRecord.value
  return !!record?.id && record.visibility === 'public' && typeof record.snapshot === 'string' && record.snapshot.length > 0
})
const publicShareUrl = computed(() => {
  const record = cloudRecord.value
  if (!isPublished.value || !record?.id || !import.meta.client) return ''
  return `${window.location.origin}/p/${record.id}`
})
const hasPublicShareUrl = computed(() => publicShareUrl.value.length > 0)
const title = computed(() => isPublished.value ? 'Published project' : 'Publish project')
const description = computed(() =>
  isPublished.value
    ? 'Share the link below. Your cloud draft is what viewers see; autosync keeps it up to date.'
    : 'Make this project public. The share link shows your current cloud design; edits sync to the published view.',
)

const normalizedPublicStyle = computed(() => normalizePublicStyle(props.publicStyle))
const renderStyleFingerprint = computed(() => JSON.stringify(normalizedPublicStyle.value))
const iframeSrc = ref<string | null>(null)
const iframeKey = ref(0)
const renderIframeRef = ref<HTMLIFrameElement | null>(null)
const isRendering = ref(false)
const renderError = ref('')
const previewVideoBlob = ref<Blob | null>(null)
const previewVideoUrl = ref<string | null>(null)

function resetPreview() {
  if (previewVideoUrl.value) URL.revokeObjectURL(previewVideoUrl.value)
  previewVideoUrl.value = null
  previewVideoBlob.value = null
  iframeSrc.value = null
  isRendering.value = false
  renderError.value = ''
}

function startPreviewRender() {
  if (!open.value || !isPublished.value) return
  resetPreview()
  isRendering.value = true
  iframeKey.value += 1
  iframeSrc.value = `/render/project/${encodeURIComponent(props.project.id)}?size=${RENDER_VIDEO_SIZE_PX}&fps=${RENDER_FPS}&style=${encodeURIComponent(renderStyleFingerprint.value)}`
}

function safeFileName(name: string): string {
  const clean = name.trim().replace(/[^\w-]+/g, '_')
  return clean.length > 0 ? clean.slice(0, 80) : 'project'
}

function downloadPreview() {
  if (!previewVideoBlob.value) return
  const url = URL.createObjectURL(previewVideoBlob.value)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFileName(props.project.name)}-360.mp4`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

function onWindowMessage(ev: MessageEvent) {
  if (!import.meta.client) return
  if (ev.origin !== window.location.origin) return
  if (ev.source !== renderIframeRef.value?.contentWindow) return
  if (!isRenderMessage(ev.data)) return
  if (ev.data.type === RENDER_MESSAGES.READY || ev.data.type === RENDER_MESSAGES.PROGRESS) return

  if (ev.data.type === RENDER_MESSAGES.ERROR) {
    renderError.value = ev.data.message
    isRendering.value = false
    iframeSrc.value = null
    return
  }
  if (ev.data.type === RENDER_MESSAGES.DONE) {
    const blob = new Blob([ev.data.buffer.slice(0)], { type: 'video/mp4' })
    previewVideoBlob.value = blob
    if (previewVideoUrl.value) URL.revokeObjectURL(previewVideoUrl.value)
    previewVideoUrl.value = URL.createObjectURL(blob)
    isRendering.value = false
    iframeSrc.value = null
  }
}

watch(open, async (next) => {
  if (next) {
    errorMessage.value = ''
    copiedFlash.value = false
    resetPreview()
    await nextTick()
    startPreviewRender()
  }
  else {
    resetPreview()
  }
})

watch([isPublished, renderStyleFingerprint], async () => {
  if (!open.value) return
  await nextTick()
  startPreviewRender()
})

onMounted(() => {
  if (import.meta.client) window.addEventListener('message', onWindowMessage)
})

onBeforeUnmount(() => {
  if (import.meta.client) window.removeEventListener('message', onWindowMessage)
  if (copiedTimer !== undefined) clearTimeout(copiedTimer)
  resetPreview()
})

async function publishProject() {
  if (isPublished.value) return
  errorMessage.value = ''
  publishing.value = true
  try {
    const published = await publishFromLocal(props.project, normalizedPublicStyle.value)
    emit('published', published)
    await nextTick()
    startPreviewRender()
  }
  catch (err: unknown) {
    errorMessage.value = (err as { message?: string } | null)?.message ?? 'Publish failed.'
  }
  finally {
    publishing.value = false
  }
}

async function copyPublicLink() {
  const url = publicShareUrl.value
  if (!url || !navigator.clipboard?.writeText) return
  await navigator.clipboard.writeText(url)
  if (copiedTimer !== undefined) clearTimeout(copiedTimer)
  copiedFlash.value = true
  copiedTimer = setTimeout(() => {
    copiedFlash.value = false
    copiedTimer = undefined
  }, COPIED_FEEDBACK_MS)
}

async function unpublishProject() {
  const record = cloudRecord.value
  if (!record?.id) return
  errorMessage.value = ''
  unpublishing.value = true
  try {
    await unpublishCloudProject(record.id)
    confirmUnpublishOpen.value = false
    open.value = false
    emit('unpublished')
  }
  catch (err: unknown) {
    errorMessage.value = (err as { message?: string } | null)?.message ?? 'Unpublish failed.'
  }
  finally {
    unpublishing.value = false
  }
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="title"
    :description="description"
  >
    <template #prependBody>
      <div
        v-if="isPublished"
        class="flex flex-col items-center gap-3"
      >
        <div class="relative aspect-square w-full max-w-[min(100%,20rem)] overflow-hidden rounded-lg border border-default bg-muted">
          <div
            v-if="isRendering"
            class="absolute inset-0 flex items-center justify-center"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-10 animate-spin text-muted"
            />
          </div>
          <video
            v-else-if="previewVideoUrl"
            :src="previewVideoUrl"
            class="size-full bg-black object-contain"
            muted
            loop
            autoplay
            playsinline
          />
          <div
            v-else
            class="flex size-full min-h-[8rem] items-center justify-center bg-muted px-3 text-center text-xs text-muted"
          >
            Preparing preview…
          </div>
        </div>
        <UButton
          v-if="previewVideoUrl"
          icon="i-lucide-download"
          label="Download MP4"
          color="neutral"
          variant="outline"
          class="w-full max-w-[min(100%,20rem)] justify-center"
          @click="downloadPreview"
        />
        <UAlert
          v-if="renderError"
          color="error"
          variant="soft"
          :title="renderError"
        />
      </div>
    </template>

    <div class="flex flex-col gap-3">
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="soft"
        :title="errorMessage"
      />

      <template v-if="hasPublicShareUrl">
        <UAlert
          color="success"
          variant="soft"
          title="Published"
          :description="publicShareUrl"
        />
        <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <UButton
            :icon="copiedFlash ? 'i-lucide-square-check' : 'i-lucide-copy'"
            :label="copiedFlash ? 'Copied' : 'Copy public link'"
            color="neutral"
            variant="soft"
            class="w-full min-w-0 justify-center sm:flex-1"
            @click="copyPublicLink"
          />
          <UButton
            icon="i-lucide-eye-off"
            label="Unpublish"
            color="neutral"
            variant="outline"
            class="w-full min-w-0 justify-center sm:flex-1"
            @click="confirmUnpublishOpen = true"
          />
        </div>
      </template>
    </div>

    <template #footer="{ close }">
      <div
        class="grid w-full gap-2"
        :class="isPublished ? 'grid-cols-1' : 'grid-cols-2'"
      >
        <UButton
          label="Close"
          color="neutral"
          variant="outline"
          class="w-full min-w-0 justify-center"
          :disabled="publishing || unpublishing || isRendering"
          @click="close()"
        />
        <UButton
          v-if="!isPublished"
          label="Publish"
          class="w-full min-w-0 justify-center"
          :loading="publishing"
          :disabled="unpublishing || isRendering"
          @click="publishProject"
        />
      </div>
    </template>
  </AppDialog>

  <iframe
    v-if="iframeSrc"
    :key="iframeKey"
    ref="renderIframeRef"
    :src="iframeSrc"
    :width="RENDER_VIDEO_SIZE_PX"
    :height="RENDER_VIDEO_SIZE_PX"
    title="Madera video render"
    class="pointer-events-none fixed left-[-9999px] top-0 border-0 opacity-0"
  />

  <AppConfirmDialog
    v-model:open="confirmUnpublishOpen"
    title="Unpublish project?"
    message="The public link will stop working until you publish again."
    cancel-label="Cancel"
    confirm-label="Unpublish"
    confirm-color="error"
    @confirm="unpublishProject"
  />
</template>
