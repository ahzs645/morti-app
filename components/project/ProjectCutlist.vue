<script setup lang="ts">
import type * as Y from 'yjs'
import { compileAssembly } from '~~/shared/domain/assembly'
import {
  panelCutlistOrientation,
  panelCutlistSignature,
  panelGroupIds,
} from '~~/shared/domain/cutlist'
import {
  CUTLIST_FORMATS,
  type CutlistFormat,
  cutlistFileName,
  serializeCutlist,
} from '~~/shared/domain/cutlist-export'
import { computeCosting, costingInputsFromGroups } from '~~/shared/domain/costing'
import { computeBandList, edgeBandSummary } from '~~/shared/domain/edgeband'
import { GRAIN_DIRECTION_CODE, attributesForRole } from '~~/shared/domain/panel-attributes'
import { DEFAULT_PUBLIC_STYLE } from '~~/shared/domain/defaults'
import type { CompiledPanel, PanelRole, PublicStyle } from '~~/shared/domain/types'
import {
  AREA_UNIT_SYMBOL,
  LENGTH_UNITS,
  LENGTH_UNIT_SYMBOL,
  VOLUME_UNIT_SYMBOL,
  WEIGHT_UNIT_SYMBOL,
  formatArea,
  formatLength,
  formatMoney,
  formatVolume,
  formatWeight,
} from '~~/shared/domain/units'
import type { LengthUnit } from '~~/shared/domain/units'
import { readFurnitureDoc, setSettingValue } from '~~/shared/yjs/doc'

interface Props {
  ydoc: Y.Doc
  selectedDrawingKey?: string | null
  projectName?: string
  publicStyle?: PublicStyle
}

const props = withDefaults(defineProps<Props>(), {
  selectedDrawingKey: null,
  projectName: 'cutlist',
  publicStyle: () => DEFAULT_PUBLIC_STYLE,
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
  material: string
  /** Whole-group weight, kg. */
  weightKg: number
  /** Whole-group material cost, in the project currency. */
  cost: number
  /** Grain direction code (`L` / `W` / `—`). */
  grain: string
  /** Banded-edge summary, e.g. `T/B/L`. */
  banding: string
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

const settings = computed(() => snapshot.value.settings)

/** Identical panels collapsed into one row, newest costing attached. */
const panelGroups = computed(() => {
  const { panels, operations } = compiled.value
  const grouped = new Map<string, { representative: CompiledPanel, quantity: number }>()
  for (const panel of panels) {
    const signature = panelCutlistSignature(panel, operations)
    const existing = grouped.get(signature)
    if (existing) existing.quantity += 1
    else grouped.set(signature, { representative: panel, quantity: 1 })
  }
  return grouped
})

const costing = computed(() =>
  computeCosting(
    costingInputsFromGroups([...panelGroups.value.values()], props.publicStyle),
    settings.value.costBasis,
  ),
)

const panelRows = computed<PanelRow[]>(() => {
  // `computeCosting` preserves input order, so the nth costing row belongs to
  // the nth group — index them together before sorting for display.
  const costingByKey = new Map(
    [...panelGroups.value.keys()].map((signature, index) => [signature, costing.value.rows[index]]),
  )

  const rows = [...panelGroups.value.entries()]
    .map(([key, entry]) => {
      const panel = entry.representative
      const cost = costingByKey.get(key)
      return {
        key,
        role: panel.role,
        orientation: panelCutlistOrientation(panel),
        width: Math.max(0, panel.width),
        height: Math.max(0, panel.height),
        thickness: Math.max(0, panel.thickness),
        quantity: entry.quantity,
        material: cost?.materialLabel ?? '—',
        weightKg: cost?.totalWeightKg ?? 0,
        cost: cost?.totalCost ?? 0,
        grain: GRAIN_DIRECTION_CODE[attributesForRole(snapshot.value.panelAttributes, panel.role).grain],
        banding: edgeBandSummary(attributesForRole(snapshot.value.panelAttributes, panel.role).bands),
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

/** Metres → the project's display unit. Table cells, not exports. */
function formatMetric(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const s = settings.value
  return formatLength(value, s.lengthUnit, { precision: s.lengthPrecision, denominator: s.fractionDenominator })
}

const lengthSymbol = computed(() => LENGTH_UNIT_SYMBOL[settings.value.lengthUnit])
const edgeSymbol = computed(() => LENGTH_UNIT_SYMBOL[settings.value.edgeUnit])

function formatRowWeight(kg: number): string {
  return formatWeight(kg, settings.value.weightUnit)
}

function formatRowCost(amount: number): string {
  return formatMoney(amount, settings.value.currency)
}

/** Quick unit switch — the full set of preferences lives in project settings. */
const lengthUnitOptions = LENGTH_UNITS
const lengthUnitModel = computed({
  get: () => settings.value.lengthUnit,
  set: (unit: LengthUnit) => setSettingValue(props.ydoc, 'lengthUnit', unit),
})

const bandList = computed(() =>
  computeBandList(
    [...panelGroups.value.values()].map(({ representative, quantity }) => ({
      width: Math.max(0, representative.width),
      height: Math.max(0, representative.height),
      thickness: Math.max(0, representative.thickness),
      quantity,
      bands: attributesForRole(snapshot.value.panelAttributes, representative.role).bands,
    })),
  ),
)

const totals = computed(() => costing.value.totals)

/** Base 7 columns plus whichever of material/weight/cost the project reports. */
const panelColumnCount = computed(() =>
  9
  + (settings.value.reportWeight || settings.value.reportCost ? 1 : 0)
  + (settings.value.reportWeight ? 1 : 0)
  + (settings.value.reportCost ? 1 : 0),
)

function formatBandLength(metres: number): string {
  const s = settings.value
  return formatLength(metres, s.edgeUnit, { precision: s.edgePrecision, denominator: s.fractionDenominator })
}

const summary = computed(() => {
  const s = settings.value
  const t = totals.value
  const items: { label: string, value: string }[] = [
    { label: 'Panels', value: String(t.panelCount) },
    { label: `Face area (${AREA_UNIT_SYMBOL[s.areaUnit]})`, value: formatArea(t.faceAreaM2, s.areaUnit, s.areaPrecision) },
    { label: `Volume (${VOLUME_UNIT_SYMBOL[s.volumeUnit]})`, value: formatVolume(t.volumeM3, s.volumeUnit) },
    { label: `Edge length (${LENGTH_UNIT_SYMBOL[s.edgeUnit]})`, value: formatLength(t.edgeLengthM, s.edgeUnit, { precision: s.edgePrecision, denominator: s.fractionDenominator }) },
  ]
  if (s.reportWeight) items.push({ label: `Weight (${WEIGHT_UNIT_SYMBOL[s.weightUnit]})`, value: formatWeight(t.weightKg, s.weightUnit) })
  if (s.reportCost) items.push({ label: 'Material cost', value: formatMoney(t.cost, s.currency) })
  return items
})

function exportCutlist(format: CutlistFormat) {
  if (!import.meta.client) return
  const { content, mime, ext } = serializeCutlist(
    {
      projectName: props.projectName,
      exportedAt: new Date().toISOString(),
      settings: settings.value,
      totals: totals.value,
      bandList: bandList.value,
      panels: panelRows.value.map(r => ({
        groupId: r.groupId,
        role: r.role,
        orientation: r.orientation,
        width: r.width,
        height: r.height,
        thickness: r.thickness,
        quantity: r.quantity,
        material: r.material,
        weightKg: r.weightKg,
        cost: r.cost,
        grain: r.grain,
        banding: r.banding,
      })),
      operations: operationRows.value.map(r => ({
        operationType: r.operationType,
        targetRole: r.targetRole,
        face: r.face,
        diameter: r.diameter,
        depth: r.depth,
        width: r.width,
        length: r.length,
        through: r.through,
        quantity: r.quantity,
      })),
    },
    format,
  )
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = cutlistFileName(props.projectName, format)
  void ext
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-balance text-sm font-semibold text-highlighted">
          Panel cutlist
        </h2>
        <div class="flex flex-wrap items-center gap-1.5">
          <label class="flex items-center gap-1.5">
            <span class="text-[11px] text-muted">Units</span>
            <USelect
              v-model="lengthUnitModel"
              :items="lengthUnitOptions"
              value-key="value"
              label-key="label"
              size="xs"
              class="w-40"
              aria-label="Cutlist display units"
            />
          </label>
          <span class="text-[11px] text-muted">Export</span>
          <button
            v-for="fmt in CUTLIST_FORMATS"
            :key="fmt.format"
            type="button"
            class="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-default shadow-sm transition-colors duration-150 hover:bg-elevated hover:text-highlighted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="panelRows.length === 0"
            :aria-label="`Export cutlist as ${fmt.label}`"
            @click="exportCutlist(fmt.format)"
          >
            {{ fmt.label }}
          </button>
        </div>
      </div>
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
            <th class="border border-default px-2 py-1.5 font-medium">Width ({{ lengthSymbol }})</th>
            <th class="border border-default px-2 py-1.5 font-medium"> Height ({{ lengthSymbol }}) </th>
            <th class="border border-default px-2 py-1.5 font-medium"> Thickness ({{ lengthSymbol }}) </th>
            <th class="border border-default px-2 py-1.5 font-medium">Qty</th>
            <th class="border border-default px-2 py-1.5 font-medium">Grain</th>
            <th class="border border-default px-2 py-1.5 font-medium">Banding</th>
            <th
              v-if="settings.reportWeight || settings.reportCost"
              class="border border-default px-2 py-1.5 font-medium"
            >
              Material
            </th>
            <th
              v-if="settings.reportWeight"
              class="border border-default px-2 py-1.5 font-medium"
            >
              Weight
            </th>
            <th
              v-if="settings.reportCost"
              class="border border-default px-2 py-1.5 font-medium"
            >
              Cost
            </th>
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
            <td :class="['border px-2 py-1.5 text-center', isSelectedRow(row) ? 'border-primary/30 text-default' : 'border-default text-muted']">
              {{ row.grain }}
            </td>
            <td :class="['border px-2 py-1.5 text-center', isSelectedRow(row) ? 'border-primary/30 text-default' : 'border-default text-muted']">
              {{ row.banding }}
            </td>
            <td
              v-if="settings.reportWeight || settings.reportCost"
              :class="['border px-2 py-1.5', isSelectedRow(row) ? 'border-primary/30 text-default' : 'border-default text-muted']"
            >
              {{ row.material }}
            </td>
            <td
              v-if="settings.reportWeight"
              :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']"
            >
              {{ formatRowWeight(row.weightKg) }}
            </td>
            <td
              v-if="settings.reportCost"
              :class="['border px-2 py-1.5 tabular-nums', isSelectedRow(row) ? 'border-primary/30 text-highlighted' : 'border-default text-highlighted']"
            >
              {{ formatRowCost(row.cost) }}
            </td>
          </tr>
          <tr v-if="panelRows.length === 0">
            <td
              :colspan="panelColumnCount"
              class="border border-default px-2 py-4 text-center text-muted"
            >
              No panels yet
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <dl
        v-if="panelRows.length > 0"
        class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <div
          v-for="item in summary"
          :key="item.label"
          class="min-w-0"
        >
          <dt class="truncate text-[11px] text-muted">
            {{ item.label }}
          </dt>
          <dd class="truncate text-sm font-semibold tabular-nums text-highlighted">
            {{ item.value }}
          </dd>
        </div>
      </dl>
    </section>

    <section v-if="bandList.rows.length > 0">
      <h2 class="mb-2 text-balance text-sm font-semibold text-highlighted">
        Edge banding
      </h2>
      <div class="-mx-1 max-w-full overflow-x-auto px-1">
        <table class="w-full min-w-[32rem] border-collapse text-xs">
          <thead>
            <tr class="bg-muted/60 text-left text-muted">
              <th class="border border-default px-2 py-1.5 font-medium">Edge band</th>
              <th class="border border-default px-2 py-1.5 font-medium">Edges</th>
              <th class="border border-default px-2 py-1.5 font-medium">Length ({{ edgeSymbol }})</th>
              <th class="border border-default px-2 py-1.5 font-medium">Cost</th>
              <th class="border border-default px-2 py-1.5 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in bandList.rows"
              :key="row.band.id"
              class="odd:bg-default even:bg-muted/20"
            >
              <td class="border border-default px-2 py-1.5 text-highlighted">
                <span class="inline-flex items-center gap-1.5">
                  <span
                    class="inline-block size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-default"
                    :style="{ backgroundColor: row.band.colorHex }"
                  />
                  {{ row.band.label }}
                </span>
              </td>
              <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ row.edgeCount }}</td>
              <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatBandLength(row.lengthM) }}</td>
              <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatRowCost(row.cost) }}</td>
              <td class="border border-default px-2 py-1.5 text-muted">
                <span
                  v-if="row.tooNarrow"
                  class="text-warning"
                >Tape narrower than panel</span>
                <span v-else>—</span>
              </td>
            </tr>
            <tr class="bg-muted/40 font-semibold">
              <td class="border border-default px-2 py-1.5 text-highlighted">Total</td>
              <td class="border border-default px-2 py-1.5" />
              <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatBandLength(bandList.totalLengthM) }}</td>
              <td class="border border-default px-2 py-1.5 tabular-nums text-highlighted">{{ formatRowCost(bandList.totalCost) }}</td>
              <td class="border border-default px-2 py-1.5" />
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
            <th class="border border-default px-2 py-1.5 font-medium"> Diameter ({{ lengthSymbol }}) </th>
            <th class="border border-default px-2 py-1.5 font-medium">Depth ({{ lengthSymbol }})</th>
            <th class="border border-default px-2 py-1.5 font-medium">Width ({{ lengthSymbol }})</th>
            <th class="border border-default px-2 py-1.5 font-medium"> Length ({{ lengthSymbol }}) </th>
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
