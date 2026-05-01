<script setup lang="ts">
import * as Y from 'yjs'
import { normalizePublicStyle } from '~~/shared/domain/defaults'
import {
  ensureInitialized,
  insertColumn,
  insertModule,
  setDrawerCount,
  setModuleHeight,
  setModuleType,
} from '~~/shared/yjs/doc'

definePageMeta({ layout: false })

const DesignerCanvas = defineAsyncComponent(() => import('~~/components/three/DesignerCanvas.vue'))
const ProjectCutlistPanelGrid = defineAsyncComponent(() => import('~~/components/project/ProjectCutlistPanelGrid.vue'))

const mode = ref<'design' | 'cutlist'>('design')
const doc = shallowRef<Y.Doc | null>(null)
const selectedDrawingKey = ref<string | null>(null)

// Build the doc synchronously during setup.
{
  const d = new Y.Doc()
  ensureInitialized(d)

  insertColumn(d, 0, 0.52)
  insertColumn(d, 1, 0.44)

  // Set up column 1 (520mm): shelf @ 0.28m, then drawer @ 0.22m with 3 drawers.
  // The defaultColumn helper seeds shelf + drawer modules already; configure them.
  setModuleType(d, 0, 0, 'shelf')
  setModuleHeight(d, 0, 0, 0.28)
  insertModule(d, 0, 1, 'drawer')
  setModuleHeight(d, 0, 1, 0.22)
  setDrawerCount(d, 0, 1, 3)

  // Set up column 2 (440mm): single doors module @ 0.48m.
  setModuleType(d, 1, 0, 'doors')
  setModuleHeight(d, 1, 0, 0.48)

  doc.value = d
}

onBeforeUnmount(() => {
  doc.value?.destroy()
  doc.value = null
})

function selectDesign() {
  mode.value = 'design'
  selectedDrawingKey.value = null
}

function selectCutlist() {
  mode.value = 'cutlist'
}
</script>

<template>
  <div class="relative h-[100dvh] min-h-0 w-full overflow-hidden bg-default">
    <div
      class="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-lg bg-default/90 p-1 shadow-sm backdrop-blur ring ring-default sm:left-3 sm:top-3"
    >
      <UButton
        size="xs"
        :variant="mode === 'design' ? 'solid' : 'ghost'"
        color="neutral"
        label="Design"
        class="active:scale-[0.97] transition-transform"
        @click="selectDesign"
      />
      <UButton
        size="xs"
        :variant="mode === 'cutlist' ? 'solid' : 'ghost'"
        color="neutral"
        label="Cutlist"
        class="active:scale-[0.97] transition-transform"
        @click="selectCutlist"
      />
    </div>

    <ClientOnly>
      <template #fallback>
        <div class="flex h-[100dvh] w-full items-center justify-center bg-default">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-8 animate-spin text-muted"
          />
        </div>
      </template>

      <DesignerCanvas
        v-if="doc && mode === 'design'"
        :ydoc="doc"
        :assembly-open-doors-drawers="false"
        :assembly-space-modules-view="false"
        :module-volume-helpers-visible="false"
        render-mode="rendered"
        :initial-camera-state="null"
        :public-style="normalizePublicStyle()"
        :headless-capture="false"
        :capture-yaw-radians="0"
        class="h-full min-h-0 w-full"
      />
      <ProjectCutlistPanelGrid
        v-else-if="doc"
        v-model:selected-drawing-key="selectedDrawingKey"
        :doc="doc"
        class="h-full min-h-0 w-full"
      />
    </ClientOnly>
  </div>
</template>
