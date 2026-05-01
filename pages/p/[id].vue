<script setup lang="ts">
import { loadPublicProject } from '~/composables/useLoadPublicProject'

definePageMeta({ layout: false })

const route = useRoute()
const id = route.params.id as string

const { isAuthed } = useAuth()
const { importDocAsCopy } = useLocalProjects()

const { data, error, pending } = await useAsyncData(
  `public-project-${id}`,
  () => loadPublicProject(id),
)

// Cross-page state: survive sign-in redirect so we can resume the remix.
const pendingRemixCloudId = useState<string | null>(
  'morti-pending-remix-cloud-id',
  () => null,
)

const authModalOpen = ref(false)
const remixLoading = ref(false)
const viewerAssemblyOpenDoorsDrawers = ref(false)
const viewerAssemblySpaceModulesView = ref(false)
const viewerRenderMode = ref<'render-debug' | 'technical'>('render-debug')

function resetViewerControls() {
  viewerAssemblyOpenDoorsDrawers.value = false
  viewerAssemblySpaceModulesView.value = false
  viewerRenderMode.value = data.value?.publicStyle.renderStyle === 'technical' ? 'technical' : 'render-debug'
}

function onViewerRenderModeUpdate(value: 'rendered' | 'render-debug' | 'technical' | undefined) {
  viewerRenderMode.value = value === 'technical' ? 'technical' : 'render-debug'
}

async function doRemix(cloudIdArg?: string) {
  const cloudId = cloudIdArg ?? id
  if (!data.value) return
  remixLoading.value = true
  try {
    const newRow = await importDocAsCopy(data.value.doc, `${data.value.record.name} (remix)`)
    try {
      await $fetch(`/api/public/projects/${encodeURIComponent(cloudId)}/remix`, { method: 'POST' })
    }
    catch {
      // Remix count is best-effort; the local copy should still open.
    }
    pendingRemixCloudId.value = null
    await navigateTo(`/project/${newRow.id}`)
  }
  finally {
    remixLoading.value = false
  }
}

function onRemixClick() {
  if (isAuthed.value) {
    void doRemix()
  }
  else {
    pendingRemixCloudId.value = id
    authModalOpen.value = true
  }
}

async function onAuthSuccess() {
  const stored = pendingRemixCloudId.value ?? id
  pendingRemixCloudId.value = null
  await doRemix(stored)
}

// If the user closes the auth modal without signing in, drop the pending id.
watch(authModalOpen, (open) => {
  if (!open && !isAuthed.value) pendingRemixCloudId.value = null
})

watch(() => data.value?.record.id, resetViewerControls, { immediate: true })

onBeforeUnmount(() => {
  if (data.value?.doc) data.value.doc.destroy()
})
</script>

<template>
  <div class="fixed inset-0 flex flex-col bg-default">
    <!-- Top-left back link -->
    <div class="absolute left-3 top-3 z-30 flex max-w-[calc(100vw-6rem)] flex-wrap items-center gap-2 sm:left-4 sm:top-4">
      <div class="flex h-8 min-h-8 shrink-0 items-center justify-center rounded-full border border-default bg-muted p-0.5 shadow-sm">
        <UButton
          to="/"
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-arrow-left"
          class="size-7 shrink-0 justify-center rounded-full hover:bg-transparent"
          aria-label="Home"
        />
      </div>
      <div
        v-if="data?.record"
        class="flex h-8 min-h-8 max-w-[min(20rem,calc(100vw-8rem))] items-center rounded-full border border-default bg-muted px-3 shadow-sm"
      >
        <span class="truncate text-xs font-semibold text-highlighted">{{ data.record.name }}</span>
      </div>
    </div>

    <!-- Canvas region -->
    <div class="relative min-h-0 flex-1">
      <div
        v-if="pending"
        class="flex h-full items-center justify-center"
      >
        <p class="text-sm text-muted">
          Loading…
        </p>
      </div>

      <div
        v-else-if="error"
        class="flex h-full flex-col items-center justify-center gap-3 px-4 text-center"
      >
        <p class="text-sm text-error">
          {{ error.statusMessage ?? error.message ?? 'Could not load this project.' }}
        </p>
        <UButton
          to="/"
          label="Home"
          color="neutral"
          variant="outline"
        />
      </div>

      <div
        v-else-if="data"
        class="h-[100dvh] w-full"
      >
        <ProjectCanvas
          :ydoc="data.doc"
          :public-style="data.publicStyle"
          :render-mode="viewerRenderMode"
          :initial-camera-state="null"
          :assembly-open-doors-drawers="viewerAssemblyOpenDoorsDrawers"
          :assembly-space-modules-view="viewerAssemblySpaceModulesView"
          :module-volume-helpers-visible="false"
          :headless-capture="false"
          :capture-yaw-radians="0"
          class="h-full w-full"
          @update:assembly-open-doors-drawers="(v: boolean) => (viewerAssemblyOpenDoorsDrawers = v)"
          @update:assembly-space-modules-view="(v: boolean) => (viewerAssemblySpaceModulesView = v)"
          @update:render-mode="onViewerRenderModeUpdate"
        >
          <template #canvas-chrome-append>
            <UButton
              icon="i-lucide-copy-plus"
              label="Remix"
              color="neutral"
              variant="solid"
              size="xs"
              class="h-8 min-h-8 shrink-0 rounded-full px-3 text-xs font-semibold shadow-sm"
              :loading="remixLoading"
              @click="onRemixClick"
            />
          </template>
        </ProjectCanvas>
      </div>
    </div>

    <AuthModal
      v-model:open="authModalOpen"
      @success="onAuthSuccess"
    />
  </div>
</template>
