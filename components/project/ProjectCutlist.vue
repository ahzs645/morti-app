<script setup lang="ts">
import type * as Y from 'yjs'
import { compileAssembly } from '~~/shared/domain/assembly'
import {
  panelCutlistOrientation,
  panelCutlistSignature,
  panelGroupIds,
} from '~~/shared/domain/cutlist'
import type { CompiledPanel, PanelOperation, PanelRole } from '~~/shared/domain/types'
import { readFurnitureDoc } from '~~/shared/yjs/doc'

interface Props {
  ydoc: Y.Doc
  selectedDrawingKey?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  selectedDrawingKey: null,
})

const emit = defineEmits<{
  (e: 'update:selectedDrawingKey', value: string | null): void
}>()

const snapshot = ref(readFurnitureDoc(props.ydoc))

function refreshSnapshot() {
  snapshot.value = readFurnitureDoc(props.ydoc)
}

function onDocUpdate() {
  refreshSnapshot()
}

watch(
  () => props.ydoc,
  (next, prev) => {
    prev?.off('update', onDocUpdate)
    next?.on('update', onDocUpdate)
    refreshSnapshot()
  },
  { immediate: true },
)

if (getCurrentScope()) {
  onScopeDispose(() => {
    props.ydoc?.off('update', onDocUpdate)
  })
}

interface PanelRow {
  key: string
  groupId: string
  role: PanelRole
  orientation: string
  width: number
  height: number
  thickness: number
  quantity: number
}

interface OperationRow {
  key: string
  operationType: string
  targetRole: string
  face: string
  diameter: number | null
  depth: number | null
  width: number | null
  length: number | null
  through: boolean
  quantity: number
}

const compiled = computed(() => compileAssembly(snapshot.value))

const panelRows = computed<PanelRow[]>(() => {
  const { panels, operations } = compiled.value
  const grouped = new Map<string, { representative: CompiledPanel, quantity: number }>()
  for (const panel of panels) {
    const signature = panelCutlistSignature(panel, operations)
    const existing = grouped.get(signature)
    if (existing) {
      existing.quantity += 1
    }
    else {
      grouped.set(signature, { representative: panel, quantity: 1 })
    }
  }

  const rows = [...grouped.entries()]
    .map(([key, entry]) => {
      const panel = entry.representative
      return {
        key,
        role: panel.role,
        orientation: panelCutlistOrientation(panel),
        width: Math.max(0, panel.width),
        height: Math.max(0, panel.height),
        thickness: Math.max(0, panel.thickness),
        quantity: entry.quantity,
      }
    })
    .sort((a, b) =>
      a.role !== b.role
        ? a.role.localeCompare(b.role)
        : a.orientation !== b.orientation
          ? a.orientation.localeCompare(b.orientation)
          : a.width !== b.width
            ? b.width - a.width
            : a.height !== b.height
              ? b.height - a.height
              : b.thickness - a.thickness,
    )

  const ids = panelGroupIds(rows)
  return rows.map((row, index) => ({ ...row, groupId: ids[index] }))
})

const operationRows = computed<OperationRow[]>(() => {
  const roleByPanel = new Map(compiled.value.panels.map(panel => [panel.key, panel.role]))
  const grouped = new Map<string, OperationRow>()

  for (const op of compiled.value.operations) {
    const targetRole = roleByPanel.get(op.targetPanelKey) ?? '—'
    const diameter = op.diameter ?? null
    const depth = op.depth ?? null
    const width = op.width ?? null
    const length = op.length ?? op.height ?? null
    const face = op.face ?? 'front'
    const through = op.operationType === 'through-hole'
    const key = [
      op.operationType,
      targetRole,
      face,
      diameter == null ? '—' : diameter.toFixed(6),
      width == null ? '—' : width.toFixed(6),
      length == null ? '—' : length.toFixed(6),
      through ? '1' : '0',
    ].join('|')
    const existing = grouped.get(key)
    if (existing) {
      existing.quantity += 1
    }
    else {
      grouped.set(key, {
        key,
        operationType: op.operationType,
        targetRole,
        face,
        diameter,
        depth,
        width,
        length,
        through,
        quantity: 1,
      })
    }
  }

  return [...grouped.values()].sort((a, b) =>
    a.operationType !== b.operationType
      ? a.operationType.localeCompare(b.operationType)
      : a.targetRole !== b.targetRole
        ? a.targetRole.localeCompare(b.targetRole)
        : (b.diameter ?? 0) - (a.diameter ?? 0),
  )
})

function isSelectedRow(row: PanelRow) {
  return props.selectedDrawingKey === row.key || props.selectedDrawingKey === row.groupId
}

watch([panelRows, () => props.selectedDrawingKey], ([rows]) => {
  const selected = props.selectedDrawingKey
  if (selected && !rows.some(row => row.key === selected || row.groupId === selected)) {
    emit('update:selectedDrawingKey', null)
  }
})

function formatMetric(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(3).replace(/\.?0+$/, '')
}

function selectPanel(row: PanelRow) {
  emit('update:selectedDrawingKey', isSelectedRow(row) ? null : row.key)
}

function clearSelection() {
  emit('update:selectedDrawingKey', null)
}

function stop() {}
</script>

<template>
  <div
    class="min-h-0 overflow-auto space-y-6 pt-32 md:pt-20"
    @click="clearSelection"
  >
    <section @click.stop="stop">
      <h2 class="mb-2 text-balance text-sm font-semibold text-highlighted">
        Panel cutlist
      </h2>
      <div class="-mx-1 max-w-full overflow-x-auto px-1">
      <table class="w-full min-w-[32rem] border-collapse text-xs">
        <thead>
          <tr class="bg-muted/60 text-left text-muted">
            <th
              scope="col"
              class="w-0 whitespace-nowrap border border-default px-1 py-1.5 font-medium"
            >
              <span class="sr-only">Group ID</span>
            </th>
            <th class="border border-default px-2 py-1.5 font-medium">Role</th>
            <th class="border border-default px-2 py-1.5 font-medium"> Orientation </th>
            <th class="border border-default px-2 py-1.5 font-medium">Width</th>
            <th class="border border-default px-2 py-1.5 font-medium"> Height </th>
            <th class="border border-default px-2 py-1.5 font-medium"> Thickness </th>
            <th class="border border-default px-2 py-1.5 font-medium">Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in panelRows"
            :key="row.key"
            :class="['cursor-pointer transition-colors', isSelectedRow(row) ? 'bg-primary/15' : 'odd:bg-default even:bg-muted/20 hover:bg-muted/50']"
            role="button"
            tabindex="0"
            @click="selectPanel(row)"
            @keydown.enter.prevent="selectPanel(row)"
            @keydown.space.prevent="selectPanel(row)"
          >
            <td :class="['w-0 whitespace-nowrap border px-1 py-1.5 align-middle', isSelectedRow(row) ? 'border-primary/30' : 'border-default']">
              <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-[10px] font-bold leading-none tracking-tight tabular-nums text-highlighted">
                {{ row.groupId }}
              </span>
            </td>
            <td :class="['border px-2 py-1.5', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ row.role }}
            </td>
            <td :class="['border px-2 py-1.5', isSelectedRow(row) ? 'border-primary/30 text-default' : 'border-default text-muted']">
              {{ row.orientation }}
            </td>
            <td :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ formatMetric(row.width) }}
            </td>
            <td :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ formatMetric(row.height) }}
            </td>
            <td :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ formatMetric(row.thickness) }}
            </td>
            <td :class="['border px-2 py-1.5 font-semibold tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']">
              {{ row.quantity }}
            </td>
          </tr>
          <tr v-if="panelRows.length === 0">
            <td
              colspan="7"
              class="border border-default px-2 py-4 text-center text-muted"
            >
              No panels yet
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-balance text-sm font-semibold text-highlighted">
        Machining operations
      </h2>
      <div class="-mx-1 max-w-full overflow-x-auto px-1">
      <table class="w-full min-w-[40rem] border-collapse text-xs">
        <thead>
          <tr class="bg-muted/60 text-left text-muted">
            <th class="border border-default px-2 py-1.5 font-medium"> Operation </th>
            <th class="border border-default px-2 py-1.5 font-medium"> Target panel </th>
            <th class="border border-default px-2 py-1.5 font-medium">Face</th>
            <th class="border border-default px-2 py-1.5 font-medium"> Diameter </th>
            <th class="border border-default px-2 py-1.5 font-medium">Depth</th>
            <th class="border border-default px-2 py-1.5 font-medium">Width</th>
            <th class="border border-default px-2 py-1.5 font-medium"> Length </th>
            <th class="border border-default px-2 py-1.5 font-medium"> Through </th>
            <th class="border border-default px-2 py-1.5 font-medium">Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in operationRows"
            :key="row.key"
            class="odd:bg-default even:bg-muted/20"
          >
            <td class="border border-default px-2 py-1.5 text-highlighted">{{ row.operationType }}</td>
            <td class="border border-default px-2 py-1.5 text-highlighted">{{ row.targetRole }}</td>
            <td class="border border-default px-2 py-1.5 text-muted">{{ row.face }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMetric(row.diameter) }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMetric(row.depth) }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMetric(row.width) }}</td>
            <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatMetric(row.length) }}</td>
            <td class="border border-default px-2 py-1.5 text-muted">{{ row.through ? 'yes' : 'no' }}</td>
            <td class="border border-default px-2 py-1.5 font-semibold tabular-nums text-highlighted">{{ row.quantity }}</td>
          </tr>
          <tr v-if="operationRows.length === 0">
            <td
              colspan="9"
              class="border border-default px-2 py-4 text-center text-muted"
            >
              No machining operations
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </section>
  </div>
</template>
