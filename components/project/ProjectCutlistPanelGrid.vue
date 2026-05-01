<script setup lang="ts">
import type * as Y from 'yjs'
import { compileAssembly } from '~~/shared/domain/assembly'
import {
  panelCutlistOrientation,
  panelCutlistSignature,
  panelGroupIds,
} from '~~/shared/domain/cutlist'
import type { CompiledPanel, FurnitureDoc, PanelOperation, PanelRole } from '~~/shared/domain/types'
import { readFurnitureDoc } from '~~/shared/yjs/doc'

const PanelSvgPreview = defineAsyncComponent(() => import('~~/components/project/PanelSvgPreview.vue'))
const PanelCanvas = defineAsyncComponent(() => import('~~/components/three/PanelCanvas.vue'))

interface Props {
  ydoc?: Y.Doc | null
  doc?: Y.Doc | null
  selectedDrawingKey?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  ydoc: null,
  doc: null,
  selectedDrawingKey: null,
})

const emit = defineEmits<{
  (e: 'update:selectedDrawingKey', value: string | null): void
}>()

const activeDoc = computed(() => props.ydoc ?? props.doc ?? null)
const snapshot = shallowRef<FurnitureDoc | null>(activeDoc.value ? readFurnitureDoc(activeDoc.value) : null)

function refreshSnapshot() {
  snapshot.value = activeDoc.value ? readFurnitureDoc(activeDoc.value) : null
}

function onDocUpdate() {
  refreshSnapshot()
}

watch(
  activeDoc,
  (next, prev) => {
    prev?.off('update', onDocUpdate)
    next?.on('update', onDocUpdate)
    refreshSnapshot()
  },
  { immediate: true },
)

if (getCurrentScope()) {
  onScopeDispose(() => {
    activeDoc.value?.off('update', onDocUpdate)
  })
}

const compiled = computed(() => snapshot.value ? compileAssembly(snapshot.value) : { panels: [], operations: [], issues: [] })

interface PanelGroup {
  key: string
  groupId: string
  representative: CompiledPanel
  operations: PanelOperation[]
  quantity: number
  width: number
  height: number
  thickness: number
}

const panelGroups = computed<PanelGroup[]>(() => {
  const grouped = new Map<string, Omit<PanelGroup, 'groupId'>>()
  const { panels, operations } = compiled.value

  for (const panel of panels) {
    const key = panelCutlistSignature(panel, operations)
    const existing = grouped.get(key)
    if (existing) {
      existing.quantity += 1
      continue
    }

    grouped.set(key, {
      key,
      representative: panel,
      operations: operations.filter(op => op.targetPanelKey === panel.key),
      quantity: 1,
      width: Math.max(0, panel.width),
      height: Math.max(0, panel.height),
      thickness: Math.max(0, panel.thickness),
    })
  }

  const rows = [...grouped.values()].sort((a, b) =>
    a.representative.role !== b.representative.role
      ? a.representative.role.localeCompare(b.representative.role)
      : a.width !== b.width
        ? b.width - a.width
        : a.height !== b.height
          ? b.height - a.height
          : b.thickness - a.thickness,
  )
  const ids = panelGroupIds(rows)
  return rows.map((row, index) => ({ ...row, groupId: ids[index] }))
})

function isSelectedGroup(group: PanelGroup) {
  return props.selectedDrawingKey === group.key || props.selectedDrawingKey === group.groupId
}

const selectedPanelGroup = computed(() => {
  const selected = props.selectedDrawingKey
  if (!selected) return null
  return panelGroups.value.find(group => group.key === selected || group.groupId === selected) ?? null
})

const isShowingSelectedPanel = computed(() => Boolean(selectedPanelGroup.value))

const visiblePanelGroups = computed(() => {
  const selected = props.selectedDrawingKey
  if (!selected) return panelGroups.value
  return selectedPanelGroup.value ? [selectedPanelGroup.value] : panelGroups.value
})

watch([panelGroups, () => props.selectedDrawingKey], ([groups]) => {
  const selected = props.selectedDrawingKey
  if (selected && !groups.some(group => group.key === selected || group.groupId === selected)) {
    emit('update:selectedDrawingKey', null)
  }
})

function selectPanel(group: PanelGroup) {
  emit('update:selectedDrawingKey', isSelectedGroup(group) ? null : group.key)
}

function onPanelCardClick(group: PanelGroup) {
  if (isShowingSelectedPanel.value) return
  selectPanel(group)
}

function onPanelCardKeydown(group: PanelGroup) {
  if (isShowingSelectedPanel.value) return
  selectPanel(group)
}

function stopSelectedCanvasClick(group: PanelGroup, event: MouseEvent) {
  if (isSelectedGroup(group)) event.stopPropagation()
}

function formatMm(value: number): string {
  return (value * 1000).toFixed(0)
}
</script>

<template>
  <div
    class="h-full min-h-0 w-full px-3 pb-3 pt-32 md:pt-26"
    :class="isShowingSelectedPanel ? 'flex min-h-0 flex-col' : 'overflow-auto'"
  >
    <div
      v-if="panelGroups.length === 0"
      class="flex h-full items-center justify-center text-sm text-muted"
    >
      No panels yet
    </div>
    <div
      v-else
      class="gap-3"
      :class="isShowingSelectedPanel ? 'mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'"
    >
      <article
        v-for="group in visiblePanelGroups"
        :key="group.key"
        class="flex flex-col overflow-hidden rounded-lg bg-default shadow-sm transition-[box-shadow,transform]"
        :class="[
          isSelectedGroup(group) ? 'ring-2 ring-primary' : '',
          isShowingSelectedPanel ? 'min-h-0 flex-1 cursor-default' : 'cursor-pointer active:scale-[0.99]',
        ]"
        :role="isShowingSelectedPanel ? undefined : 'button'"
        :tabindex="isShowingSelectedPanel ? undefined : 0"
        @click="onPanelCardClick(group)"
        @keydown.enter.prevent="onPanelCardKeydown(group)"
        @keydown.space.prevent="onPanelCardKeydown(group)"
      >
        <div
          class="w-full"
          :class="isShowingSelectedPanel ? 'min-h-0 flex-1' : 'aspect-square'"
          @click="stopSelectedCanvasClick(group, $event)"
        >
          <PanelCanvas
            v-if="isShowingSelectedPanel"
            :part="group.representative"
            :operations="group.operations"
            class="h-full min-h-0 w-full"
          />
          <PanelSvgPreview
            v-else
            :part="group.representative"
            :operations="group.operations"
            class="h-full min-h-0 w-full"
          />
        </div>

        <div class="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
          <div class="flex min-w-0 flex-1 items-start gap-2">
            <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-[10px] font-bold leading-none tracking-tight tabular-nums text-highlighted">
              {{ group.groupId }}
            </span>
            <div
              v-if="isShowingSelectedPanel"
              class="min-w-0 flex-1"
            >
              <div class="truncate text-balance text-xs font-semibold text-highlighted">
                {{ group.representative.role }}
              </div>
              <div class="truncate text-xs tabular-nums text-muted">
                {{ formatMm(group.width) }} × {{ formatMm(group.height) }} × {{ formatMm(group.thickness) }} mm
              </div>
            </div>
          </div>
          <div class="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-xs font-semibold tabular-nums text-highlighted">
            ×{{ group.quantity }}
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
