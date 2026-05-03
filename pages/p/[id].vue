<script setup lang="ts">
import { loadPublicProject } from '~/composables/useLoadPublicProject'

definePageMeta({ layout: false })

const LazyProjectCanvas = defineAsyncComponent(() => import('~/components/three/ProjectCanvas.vue'))
const LazyAuthModal = defineAsyncComponent(() => import('~/components/app/AuthModal.vue'))
const LazyDemoAiBuildDialog = defineAsyncComponent(() => import('~/components/app/DemoAiBuildDialog.vue'))

const route = useRoute()
const id = route.params.id as string

const { isAuthed, isCloudAuthed } = useAuth()

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
const aiBuildOpen = ref(false)
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
    const { useLocalProjects } = await import('~/composables/useLocalProjects')
    const { importDocAsCopy } = useLocalProjects()
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

function onAiBuildClick() {
  aiBuildOpen.value = true
}

function onAiSignupRequested() {
  pendingRemixCloudId.value = id
  aiBuildOpen.value = false
  authModalOpen.value = true
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
    <div class="absolute inset-x-3 top-3 z-30 flex max-w-[calc(100vw-1.5rem)] flex-nowrap items-center gap-2 md:inset-x-auto md:left-4 md:top-4 md:max-w-[calc(100vw-6rem)]">
      <div class="flex h-10 min-h-10 shrink-0 items-center justify-center rounded-full bg-elevated p-1 shadow-md">
        <UButton
          to="/"
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-arrow-left"
          class="size-8 min-h-8 shrink-0 justify-center rounded-full transition-transform duration-150 ease-out hover:bg-transparent active:scale-[0.97]"
          aria-label="Home"
        />
      </div>
      <div
        v-if="data?.record"
        class="flex h-10 min-h-10 min-w-0 flex-1 items-center rounded-full bg-elevated px-4 shadow-md md:max-w-[min(20rem,calc(100vw-8rem))] md:flex-none"
      >
        <span class="truncate text-xs font-semibold text-highlighted text-pretty">{{ data.record.name }}</span>
      </div>
    </div>

    <!-- Canvas region -->
    <div class="relative min-h-0 flex-1">
      <div
        v-if="pending"
        class="flex h-full items-center justify-center px-4"
      >
        <p class="text-sm text-muted text-pretty">
          Loading…
        </p>
      </div>

      <div
        v-else-if="error"
        class="flex h-full flex-col items-center justify-center gap-4 px-4 text-center"
      >
        <p class="max-w-sm text-sm text-error text-pretty">
          {{ error.statusMessage ?? error.message ?? 'Could not load this project.' }}
        </p>
        <UButton
          to="/"
          label="Home"
          color="neutral"
          variant="outline"
          class="min-h-10 transition-transform duration-150 ease-out active:scale-[0.97]"
        />
      </div>

      <div
        v-else-if="data"
        class="h-[100dvh] w-full"
      >
        <LazyProjectCanvas
          :ydoc="data.doc"
          :public-style="data.publicStyle"
          :render-mode="viewerRenderMode"
          :initial-camera-state="null"
          :assembly-open-doors-drawers="viewerAssemblyOpenDoorsDrawers"
          :assembly-space-modules-view="viewerAssemblySpaceModulesView"
          :module-volume-helpers-visible="false"
          :headless-capture="false"
          :capture-yaw-radians="0"
          :class="['h-full w-full', { 'demo-public-canvas': !isCloudAuthed }]"
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
              class="h-10 min-h-10 shrink-0 rounded-full px-4 text-xs font-semibold shadow-md transition-transform duration-150 ease-out active:scale-[0.97]"
              :loading="remixLoading"
              @click="onRemixClick"
            />
          </template>
        </LazyProjectCanvas>
      </div>
    </div>

    <!-- Anonymous-only AI lead capture CTA (also shown to local-dev bypass users for testing) -->
    <div
      v-if="data && !isCloudAuthed"
      class="demo-ai-cta-wrap pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
    >
      <button
        type="button"
        class="demo-ai-cta pointer-events-auto group relative flex w-full max-w-md items-center gap-3 overflow-hidden rounded-full bg-primary px-4 py-3 text-left text-inverted shadow-[0_18px_40px_-12px_color-mix(in_oklch,var(--ui-primary)_60%,transparent),0_8px_16px_-8px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/15 transition-[transform,box-shadow,filter] duration-200 ease-out hover:shadow-[0_22px_48px_-12px_color-mix(in_oklch,var(--ui-primary)_70%,transparent),0_10px_20px_-8px_rgba(0,0,0,0.4)] active:scale-[0.98]"
        aria-label="Build your own with AI"
        @click="onAiBuildClick"
      >
        <span
          class="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(110deg,transparent_0%,color-mix(in_oklch,white_22%,transparent)_45%,transparent_55%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden="true"
        />
        <span class="grid size-9 shrink-0 place-items-center rounded-full bg-black/15 ring-1 ring-white/10">
          <UIcon
            name="i-lucide-sparkles"
            class="size-5 transition-transform duration-300 ease-out group-hover:rotate-12 group-hover:scale-110"
          />
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-pretty text-sm font-semibold leading-5">Build your own with AI</span>
          <span class="truncate text-[11px] leading-4 opacity-80">Describe a cabinet, shelf, or wardrobe — generate in seconds.</span>
        </span>
        <UIcon
          name="i-lucide-arrow-right"
          class="size-4 shrink-0 opacity-90 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
        />
      </button>
    </div>

    <LazyDemoAiBuildDialog
      v-if="aiBuildOpen"
      v-model:open="aiBuildOpen"
      @request-signup="onAiSignupRequested"
    />

    <LazyAuthModal
      v-if="authModalOpen"
      v-model:open="authModalOpen"
      @success="onAuthSuccess"
    />
  </div>
</template>

<style scoped>
.demo-ai-cta-wrap {
  animation: demo-ai-cta-rise 420ms cubic-bezier(0.2, 0, 0, 1) 200ms both;
}

/* When the AI CTA is present, push the canvas gizmo up so it sits ABOVE the CTA. */
.demo-public-canvas :deep(.canvas-gizmo-anchor) {
  bottom: calc(max(env(safe-area-inset-bottom), 0.75rem) + 5.75rem);
}
.demo-ai-cta {
  animation: demo-ai-cta-glow 4.5s ease-in-out infinite;
}
@keyframes demo-ai-cta-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes demo-ai-cta-glow {
  0%, 100% {
    filter: drop-shadow(0 0 0 transparent);
  }
  50% {
    filter: drop-shadow(0 0 16px color-mix(in oklch, var(--ui-primary) 30%, transparent));
  }
}

@media (prefers-reduced-motion: reduce) {
  .demo-ai-cta-wrap,
  .demo-ai-cta {
    animation: none;
  }
}
</style>
