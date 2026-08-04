<script setup lang="ts">
import type * as Y from 'yjs'
import type { AiFurnitureDraft, AiFurnitureGenerateResponse } from '~~/shared/domain/ai-furniture'
import { AI_FURNITURE_PROMPT_MAX_LENGTH } from '~~/shared/domain/ai-furniture'
import { DEFAULT_COLUMN_WIDTH, DEFAULT_DRAWER_COUNT, DRAWER_COUNT_MAX, DRAWER_COUNT_MIN, DEFAULT_SHELF_COUNT, SHELF_COUNT_MAX, SHELF_COUNT_MIN, DIVIDER_COUNT_MAX, DIVIDER_COUNT_MIN, DEFAULT_FURNITURE_CONFIG, FURNITURE_CONFIG_WRITABLE_KEYS, MODULE_TYPES } from '~~/shared/domain/defaults'
import type { FurnitureConfig, FurnitureModule, ModuleType, PanelRole, ProjectSettings } from '~~/shared/domain/types'
import {
  ALL_PANEL_ROLES,
  GRAIN_DIRECTIONS,
  PANEL_ROLE_LABEL,
  attributesForRole,
  type GrainDirection,
} from '~~/shared/domain/panel-attributes'
import {
  EDGE_BAND_LIBRARY,
  PANEL_EDGES,
  PANEL_EDGE_LABEL,
  type PanelEdge,
} from '~~/shared/domain/edgeband'
import { DRILL_OPERATION_TYPES, type DrillingRule } from '~~/shared/domain/drilling'
import {
  ALL_PROFILE_EDGES,
  ROUTER_PROFILES,
  type RouterProfile,
  type RouterProfileKind,
  conflictingEdges,
  defaultRouterProfile,
} from '~~/shared/domain/router-profiles'
import { JOINT_STYLES } from '~~/shared/domain/joinery'
import { OUTLINE_SHAPES, type PanelOutline, defaultOutline } from '~~/shared/domain/outline'
import {
  PANEL_PLANES,
  type FreePanel,
  type PanelPlane,
  type WorldAxis,
} from '~~/shared/domain/free-panels'
import { PATTERN_ANCHORS, PATTERN_KINDS } from '~~/shared/domain/operations'
import { HARDWARE_CATALOG } from '~~/shared/domain/hardware-catalog'
import {
  AREA_UNITS,
  FRACTION_DENOMINATORS,
  LENGTH_UNITS,
  VOLUME_UNITS,
  WEIGHT_UNITS,
} from '~~/shared/domain/units'
import { validateFurnitureDocIssues } from '~~/shared/domain/assembly-validation'
import {
  insertColumn,
  insertModule,
  readFurnitureDoc,
  removeColumn,
  removeModule,
  replaceFurnitureDoc,
  setColumnWidth,
  setConfigValue,
  setDrawerCount,
  setShelfCount,
  setDividerCount,
  setModuleHeight,
  setModuleType,
  setSettingValue,
  setPanelAttributes,
  addDrillingRule,
  removeDrillingRule,
  updateDrillingRule,
  setJoineryValue,
  setFrameMemberCount,
  setRouterProfile,
  setPanelOutline,
  addFreePanel,
  removeFreePanels,
  updateFreePanel,
  nudgeFreePanels,
  resizeFreePanels,
  duplicateFreePanelToPlane,
  addPanelFromFace,
  addPanelBetween,
  centerFreePanels,
  spaceFreePanelsEqually,
  resetSettings,
  resetPanelAttributes,
  resetDrilling,
  resetRouterProfiles,
  resetPanelOutlines,
} from '~~/shared/yjs/doc'

interface Props {
  ydoc: Y.Doc
  selectedModules?: { id: string }[]
  zoomPercent?: number
}

const props = withDefaults(defineProps<Props>(), {
  selectedModules: () => [],
  zoomPercent: 100,
})

const emit = defineEmits<{
  (e: 'update:selectedModules', value: { id: string }[]): void
  (e: 'update:zoomPercent', value: number): void
}>()

const runtimeConfig = useRuntimeConfig()
const aiFurnitureEnabled = computed<boolean>(
  () => runtimeConfig.public.features?.promptFurniture === true,
)

// --- Reactive snapshot of the doc ---
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

const columns = computed(() => snapshot.value.columns)
const config = computed<FurnitureConfig>(() => snapshot.value.config)
const effectiveConfig = computed(() => config.value)

const internalSelectedIds = ref<string[]>([])
const clampedZoomPercent = computed<number>(() => {
  const z = props.zoomPercent
  return z === 25 || z === 50 || z === 75 || z === 100 ? z : 100
})
const selectedIds = computed<string[]>(() =>
  props.selectedModules.length > 0 ? props.selectedModules.map(s => s.id) : internalSelectedIds.value,
)
const selectedIdSet = computed(() => new Set(selectedIds.value))
const selectedModuleInfos = computed(() => {
  const infos: {
    id: string
    columnIndex: number
    moduleIndex: number
    columnWidth: number
    module: FurnitureModule
  }[] = []
  if (selectedIdSet.value.size === 0) return infos
  columns.value.forEach((col, columnIndex) => {
    col.modules.forEach((module, moduleIndex) => {
      if (selectedIdSet.value.has(module.id)) {
        infos.push({ id: module.id, columnIndex, moduleIndex, columnWidth: col.width, module })
      }
    })
  })
  return infos
})
const selectedCount = computed(() => selectedModuleInfos.value.length)
const inspectorIssues = computed<DesignerIssue[]>(() => validateFurnitureDocIssues(snapshot.value))
const visibleIssues = computed(() => {
  if (selectedCount.value === 0) return inspectorIssues.value.filter(issue => issue.moduleId == null)
  const ids = new Set(selectedModuleInfos.value.map(info => info.id))
  return inspectorIssues.value.filter(issue => issue.moduleId != null && ids.has(issue.moduleId))
})

// --- Selection helpers ---
function setSelection(ids: string[]) {
  internalSelectedIds.value = ids
  emit('update:selectedModules', ids.map(id => ({ id })))
}

function toggleModuleSelection(moduleId: string, shiftKey: boolean) {
  if (shiftKey) {
    const set = new Set(selectedIds.value)
    if (set.has(moduleId)) set.delete(moduleId)
    else set.add(moduleId)
    setSelection([...set])
  }
  else {
    setSelection([moduleId])
  }
}

function clearSelection() {
  setSelection([])
}

// --- Snapping (numeric clamp only — no snap lines) ---
function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  const upper = max >= min ? max : min
  return Math.min(upper, Math.max(min, value))
}

function clampColumnWidth(w: number): number {
  return clampNumber(w, config.value.minColumnWidth, config.value.maxColumnWidth)
}

function clampDrawerCount(drawerCount: number): number {
  return Math.max(DRAWER_COUNT_MIN, Math.min(DRAWER_COUNT_MAX, Math.round(drawerCount)))
}

function drawerCountForHeight(module: FurnitureModule, height: number): number {
  const current = clampDrawerCount(module.drawerCount ?? DEFAULT_DRAWER_COUNT)
  if (module.type !== 'drawer' || !Number.isFinite(height) || height <= 0) return current
  const maxDrawerBandHeight = Math.max(config.value.minDrawerHeight, config.value.maxDrawerHeight)
  if (!Number.isFinite(maxDrawerBandHeight) || maxDrawerBandHeight <= 0) return current
  return clampDrawerCount(Math.max(current, Math.ceil(height / maxDrawerBandHeight - 1e-9)))
}

function clampModuleHeight(module: FurnitureModule, h: number): number {
  let min = config.value.minModuleHeight
  let max = config.value.maxModuleHeight
  if (max < min) max = min
  if (module.type === 'drawer') {
    const drawerCount = clampDrawerCount(module.drawerCount ?? DEFAULT_DRAWER_COUNT)
    const minDrawerHeight = drawerCount * config.value.minDrawerHeight
    const maxDrawerHeight = drawerCount * config.value.maxDrawerHeight
    min = Math.max(min, minDrawerHeight)
    max = Math.min(max, Math.max(minDrawerHeight, maxDrawerHeight))
  }
  return clampNumber(h, min, max)
}

function setModuleHeightWithDrawerClamp(columnIndex: number, moduleIndex: number, module: FurnitureModule, height: number) {
  let nextModule = module
  if (module.type === 'drawer') {
    const drawerCount = drawerCountForHeight(module, height)
    if (drawerCount !== (module.drawerCount ?? DEFAULT_DRAWER_COUNT)) {
      setDrawerCount(props.ydoc, columnIndex, moduleIndex, drawerCount)
      nextModule = { ...module, drawerCount }
    }
  }
  setModuleHeight(props.ydoc, columnIndex, moduleIndex, clampModuleHeight(nextModule, height))
}

// --- Module / column mutations ---
function defaultColumnWidth(): number {
  return DEFAULT_COLUMN_WIDTH
}

function keepInsertedColumnToDefaultShelf(index: number) {
  let moduleCount = readFurnitureDoc(props.ydoc).columns[index]?.modules.length ?? 0
  while (moduleCount > 1) {
    removeModule(props.ydoc, index, moduleCount - 1)
    moduleCount--
  }
}

function addColumnLeft() {
  insertColumn(props.ydoc, 0, defaultColumnWidth())
  keepInsertedColumnToDefaultShelf(0)
}

function addColumnRight() {
  const index = columns.value.length
  insertColumn(props.ydoc, index, defaultColumnWidth())
  keepInsertedColumnToDefaultShelf(index)
}

function removeColumnAt(index: number) {
  const removed = columns.value[index]
  removeColumn(props.ydoc, index)
  if (!removed) return
  const removedIds = new Set(removed.modules.map(m => m.id))
  setSelection(selectedIds.value.filter(id => !removedIds.has(id)))
}

function addModuleTop(columnIndex: number) {
  const col = columns.value[columnIndex]
  if (!col) return
  insertModule(props.ydoc, columnIndex, col.modules.length, 'shelf')
}

function setColumnWidthAt(columnIndex: number, w: number) {
  setColumnWidth(props.ydoc, columnIndex, clampColumnWidth(w))
}

function setModuleHeightAt(columnIndex: number, moduleIndex: number, h: number) {
  const module = columns.value[columnIndex]?.modules[moduleIndex]
  if (!module) return
  setModuleHeightWithDrawerClamp(columnIndex, moduleIndex, module, h)
}

function removeSelectedModule(columnIndex: number, moduleIndex: number) {
  const col = columns.value[columnIndex]
  const removed = col?.modules[moduleIndex]
  if (!col || !removed) return
  if (col.modules.length === 1) removeColumnAt(columnIndex)
  else {
    removeModule(props.ydoc, columnIndex, moduleIndex)
    setSelection(selectedIds.value.filter(id => id !== removed.id))
  }
}

function updateSelectedModulesType(type: ModuleType) {
  for (const info of selectedModuleInfos.value) {
    setModuleType(props.ydoc, info.columnIndex, info.moduleIndex, type)
    const module = readFurnitureDoc(props.ydoc).columns[info.columnIndex]?.modules[info.moduleIndex]
    if (module) setModuleHeightWithDrawerClamp(info.columnIndex, info.moduleIndex, module, module.height)
  }
}

function updateSelectedModulesColumnWidth(width: number) {
  const next = clampColumnWidth(width)
  const seen = new Set<number>()
  for (const info of selectedModuleInfos.value) {
    if (seen.has(info.columnIndex)) continue
    seen.add(info.columnIndex)
    setColumnWidth(props.ydoc, info.columnIndex, next)
  }
}

function updateSelectedModulesHeight(height: number) {
  for (const info of selectedModuleInfos.value) {
    setModuleHeightWithDrawerClamp(info.columnIndex, info.moduleIndex, info.module, height)
  }
}

function updateSelectedModulesDrawerCount(drawerCount: number) {
  const next = clampDrawerCount(drawerCount)
  for (const info of selectedModuleInfos.value) {
    if (info.module.type === 'drawer') {
      setDrawerCount(props.ydoc, info.columnIndex, info.moduleIndex, next)
      setModuleHeightWithDrawerClamp(info.columnIndex, info.moduleIndex, { ...info.module, drawerCount: next }, info.module.height)
    }
  }
}

function clampShelfCount(shelfCount: number): number {
  return Math.max(SHELF_COUNT_MIN, Math.min(SHELF_COUNT_MAX, Math.round(shelfCount)))
}

function updateSelectedModulesShelfCount(shelfCount: number) {
  const next = clampShelfCount(shelfCount)
  for (const info of selectedModuleInfos.value) {
    if (info.module.type === 'shelves') {
      setShelfCount(props.ydoc, info.columnIndex, info.moduleIndex, next)
    }
  }
}

function clampDividerCount(dividerCount: number): number {
  return Math.max(DIVIDER_COUNT_MIN, Math.min(DIVIDER_COUNT_MAX, Math.round(dividerCount)))
}

function updateSelectedModulesDividerCount(dividerCount: number) {
  const next = clampDividerCount(dividerCount)
  for (const info of selectedModuleInfos.value) {
    if (info.module.type === 'dividers') {
      setDividerCount(props.ydoc, info.columnIndex, info.moduleIndex, next)
    }
  }
}

// --- Column-resize drag (multi-target aware) ---
const Al = 220
const pxPerMeter = computed<number>(() => Al * (clampedZoomPercent.value / 100))

interface ColumnResizeState {
  startX: number
  direction: 1 | -1
  targets: { columnIndex: number, startWidth: number }[]
}
const columnResize = ref<ColumnResizeState | null>(null)

function onColumnResizeStart(columnIndex: number, direction: 1 | -1, ev: PointerEvent) {
  if (!columns.value[columnIndex]) return
  ev.preventDefault()
  cancelColumnResize()

  // Multi-target: if more than one column has at least one selected module,
  // drag all those columns at once.
  const selectedColumnIndices = new Set<number>()
  for (const id of selectedIds.value) {
    columns.value.forEach((col, ci) => {
      if (col.modules.some(m => m.id === id)) selectedColumnIndices.add(ci)
    })
  }

  let targets: { columnIndex: number, startWidth: number }[]
  if (selectedColumnIndices.size > 1) {
    targets = [...selectedColumnIndices].map(ci => ({
      columnIndex: ci,
      startWidth: columns.value[ci]?.width ?? 0,
    }))
  }
  else {
    targets = [{ columnIndex, startWidth: columns.value[columnIndex]?.width ?? 0 }]
  }

  columnResize.value = { startX: ev.clientX, direction, targets }
  if (import.meta.client) {
    window.addEventListener('pointermove', onColumnResizeMove)
    window.addEventListener('pointerup', cancelColumnResize)
    window.addEventListener('pointercancel', cancelColumnResize)
  }
}

function onColumnResizeMove(ev: PointerEvent) {
  const state = columnResize.value
  if (!state) return
  const dx = ev.clientX - state.startX
  const deltaMeters = (state.direction * dx) / pxPerMeter.value
  for (const t of state.targets) {
    setColumnWidth(props.ydoc, t.columnIndex, clampColumnWidth(t.startWidth + deltaMeters))
  }
}

function cancelColumnResize() {
  columnResize.value = null
  if (import.meta.client) {
    window.removeEventListener('pointermove', onColumnResizeMove)
    window.removeEventListener('pointerup', cancelColumnResize)
    window.removeEventListener('pointercancel', cancelColumnResize)
  }
}

if (getCurrentScope()) onScopeDispose(cancelColumnResize)

// --- Inspector / settings ---
interface DesignerIssue {
  code: string
  message: string
  severity: 'warning' | 'error'
  moduleId?: string | null
}

interface ConfigField {
  key: string
  label: string
  unit: 'm' | 'mm'
  help: string
}

const configFieldLabels: Record<string, { label: string, unit: 'm' | 'mm', help: string }> = {
  depth: { label: 'Depth', unit: 'm', help: 'Overall front-to-back depth of the furniture piece.' },
  panelThickness: { label: 'Panel thickness', unit: 'mm', help: 'Thickness of structural panels (sides, decks, dividers).' },
  backPanelThickness: { label: 'Back panel thickness', unit: 'mm', help: 'Thickness of the back panel, typically thinner than structural panels.' },
  panelJointClearance: { label: 'Panel joint clearance', unit: 'mm', help: 'Small fit allowance at carcass joints and vertical gap above/below each drawer (same value subtracted at top and bottom of the drawer band).' },
  frontClearance: { label: 'Front clearance', unit: 'mm', help: 'Visible/functional gap around drawer and door fronts so they open without binding.' },
  sidePanelOverhang: { label: 'Side panel overhang', unit: 'mm', help: 'Extra height of the vertical side panels beyond the stacked module heights.' },
  pullHoleDiameter: { label: 'Pull hole diameter', unit: 'mm', help: 'Diameter of the circular finger-pull hole used to open drawers and doors.' },
  pullHoleEdgeInset: { label: 'Pull hole edge inset', unit: 'mm', help: 'Distance from the front edges to the center of each pull hole.' },
  pullHolePairGap: { label: 'Pull hole pair gap', unit: 'mm', help: 'Center-to-center distance between two pull holes when a module uses a pair.' },
  backPanelGrooveClearance: { label: 'Back panel groove clearance', unit: 'mm', help: 'Extra width on back-panel grooves beyond back panel thickness so the panel slides without binding.' },
  drawerBottomInset: { label: 'Drawer box vertical inset', unit: 'mm', help: 'Symmetric vertical inset for drawer side/back panels and the bottom board.' },
  drawerSlidesReserve: { label: 'Drawer slides reserve', unit: 'mm', help: 'Rear depth reserve for slide return, wiring, and related hardware.' },
  backPanelInset: { label: 'Back panel inset (rear hardware reserve)', unit: 'mm', help: 'Distance from the cabinet rear to the outer face of the carcass back panel.' },
  minColumnWidth: { label: 'Min column width', unit: 'm', help: 'Minimum width of a column when editing (meters). Values below this are clamped on commit.' },
  maxColumnWidth: { label: 'Max column width', unit: 'm', help: 'Maximum width of a column when editing (meters). Values above this are clamped on commit.' },
  minModuleHeight: { label: 'Min module height', unit: 'm', help: 'Minimum height of any module stack segment (meters).' },
  maxModuleHeight: { label: 'Max module height', unit: 'm', help: 'Maximum height of any module stack segment (meters).' },
  minDrawerHeight: { label: 'Min drawer band height', unit: 'm', help: 'Minimum height per drawer inside a drawer module (module height / drawer count).' },
  maxDrawerHeight: { label: 'Max drawer band height', unit: 'm', help: 'Maximum height per drawer inside a drawer module (module height / drawer count).' },
}

const projectDesignerConfigFields: ConfigField[] = FURNITURE_CONFIG_WRITABLE_KEYS.map((key) => {
  const meta = configFieldLabels[key]
  return {
    key,
    label: meta?.label ?? key,
    unit: meta?.unit ?? 'mm',
    help: meta?.help ?? key,
  }
})

const summaryConfigFields = projectDesignerConfigFields.filter(field =>
  field.key === 'depth' || field.key === 'panelThickness' || field.key === 'sidePanelOverhang',
)

const settingsOpen = ref(false)
const copiedConfig = ref(false)
let copiedConfigTimer: ReturnType<typeof setTimeout> | undefined

// ---------------------------------------------------------------------------
// Units & reporting (magicSettings / getDimensions)
// ---------------------------------------------------------------------------

const projectSettings = computed(() => snapshot.value.settings)

const COST_BASIS_OPTIONS = [
  { value: 'volume' as const, label: 'Per cubic metre (timber)' },
  { value: 'area' as const, label: 'Per square metre (sheet goods)' },
]

/** One row per preference, rendered as a labelled select in the settings dialog. */
const settingsSelectFields = computed(() => [
  { key: 'lengthUnit' as const, label: 'Dimension units', items: LENGTH_UNITS, help: 'Unit used for panel dimensions in the inspector, cutlist, and exports.' },
  { key: 'edgeUnit' as const, label: 'Edge units', items: LENGTH_UNITS, help: 'Unit used for edge lengths and banding runs.' },
  { key: 'areaUnit' as const, label: 'Area units', items: AREA_UNITS, help: 'Unit used for sheet and face-area totals.' },
  { key: 'volumeUnit' as const, label: 'Volume units', items: VOLUME_UNITS, help: 'Unit used for timber volume totals. Board feet is the trade unit for rough lumber.' },
  { key: 'weightUnit' as const, label: 'Weight units', items: WEIGHT_UNITS, help: 'Unit used for the wood weight rollup.' },
  { key: 'costBasis' as const, label: 'Cost basis', items: COST_BASIS_OPTIONS, help: 'Price against timber volume (m³) or sheet-goods face area (m²).' },
])

const settingsToggleFields = [
  { key: 'reportWeight' as const, label: 'Report weight', help: 'Show a weight column and total in the cutlist and exports.' },
  { key: 'reportCost' as const, label: 'Report cost', help: 'Show a material cost column and total in the cutlist and exports.' },
  { key: 'reportOperations' as const, label: 'Report operations', help: 'Include the machining-operations section in exports.' },
]

const fractionDenominatorItems = FRACTION_DENOMINATORS.map(d => ({ value: d, label: `1/${d}"` }))

/** Fractional inches replace decimal places with a denominator choice. */
const showsFractionDenominator = computed(() =>
  projectSettings.value.lengthUnit === 'fraction' || projectSettings.value.edgeUnit === 'fraction',
)

function updateSetting<K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) {
  setSettingValue(props.ydoc, key, value)
}

function commitPrecision(key: 'lengthPrecision' | 'edgePrecision' | 'areaPrecision', event: Event) {
  const input = event.target as HTMLInputElement
  const parsed = Number(input.value)
  if (Number.isFinite(parsed)) updateSetting(key, parsed)
  input.value = String(projectSettings.value[key])
}

// ---------------------------------------------------------------------------
// Grain & edge banding (grainH/V/X, bandApply/bandRemove)
// ---------------------------------------------------------------------------

const grainOpen = ref(false)

/** Sentinel for "no tape" — USelect can't round-trip a null value key. */
const BARE_EDGE_VALUE = 'none'

const edgeBandItems = [
  { value: BARE_EDGE_VALUE, label: 'Bare' },
  ...EDGE_BAND_LIBRARY.map(band => ({ value: band.id, label: band.label })),
]

function panelAttributesFor(role: PanelRole) {
  return attributesForRole(snapshot.value.panelAttributes, role)
}

function setGrain(role: PanelRole, grain: GrainDirection) {
  setPanelAttributes(props.ydoc, role, { grain })
}

function setBand(role: PanelRole, edge: PanelEdge, bandId: string) {
  const bands = { ...panelAttributesFor(role).bands, [edge]: bandId === BARE_EDGE_VALUE ? null : bandId }
  setPanelAttributes(props.ydoc, role, { bands })
}

// --- Face frame (panel2frame) ---
function sharedFrameValue(key: 'frameRailCount' | 'frameStileCount'): string {
  const values = selectedModuleInfos.value
    .filter(info => info.module.type === 'frame')
    .map(info => info.module[key] ?? 0)
  if (values.length === 0) return ''
  return values.every(value => value === values[0]) ? String(values[0]) : ''
}

const selectedFrameRailValue = computed(() => sharedFrameValue('frameRailCount'))
const selectedFrameStileValue = computed(() => sharedFrameValue('frameStileCount'))

function onSelectedFrameMemberCommit(key: 'frameRailCount' | 'frameStileCount', event: Event) {
  const input = event.target as HTMLInputElement
  const parsed = Number(input.value)
  if (Number.isFinite(parsed)) {
    for (const info of selectedModuleInfos.value) {
      if (info.module.type !== 'frame') continue
      setFrameMemberCount(props.ydoc, info.columnIndex, info.moduleIndex, key, parsed)
    }
  }
  input.value = sharedFrameValue(key)
}

// ---------------------------------------------------------------------------
// Panel outlines (panelSide*, panelBackOut, panelCoverXY, roundCurve, sketch2pad)
// ---------------------------------------------------------------------------

const outlineShapes = OUTLINE_SHAPES

function outlineFor(role: PanelRole): PanelOutline {
  return snapshot.value.outlines[role] ?? defaultOutline()
}

function commitOutlineAmount(role: PanelRole, event: Event) {
  const input = event.target as HTMLInputElement
  const percent = Number(input.value)
  if (Number.isFinite(percent)) setPanelOutline(props.ydoc, role, { amount: percent / 100 })
  input.value = String(Math.round(outlineFor(role).amount * 100))
}

// ---------------------------------------------------------------------------
// Free panels (start / move & copy / resize / face / between / location tools)
// ---------------------------------------------------------------------------

const freePanelsOpen = ref(false)
const selectedFreePanelIds = ref<string[]>([])

const freePanels = computed(() => snapshot.value.freePanels)
const panelPlanes = PANEL_PLANES
const freePanelRoleItems = ALL_PANEL_ROLES.map(role => ({ value: role, label: PANEL_ROLE_LABEL[role] }))
const moveAxes: { axis: WorldAxis, label: string }[] = [
  { axis: 'x', label: 'X' },
  { axis: 'y', label: 'Y' },
  { axis: 'z', label: 'Z' },
]

/** Selection is by id, so it survives reordering and stale ids self-heal. */
const selectedFreePanels = computed(() =>
  freePanels.value.filter(panel => selectedFreePanelIds.value.includes(panel.id)),
)
const singleSelectedFreePanel = computed(() =>
  selectedFreePanels.value.length === 1 ? selectedFreePanels.value[0] : null,
)

watch(freePanels, (panels) => {
  const live = new Set(panels.map(panel => panel.id))
  const pruned = selectedFreePanelIds.value.filter(id => live.has(id))
  if (pruned.length !== selectedFreePanelIds.value.length) selectedFreePanelIds.value = pruned
})

function toggleFreePanelSelection(id: string, additive: boolean) {
  const current = new Set(selectedFreePanelIds.value)
  if (additive) {
    if (current.has(id)) current.delete(id)
    else current.add(id)
    selectedFreePanelIds.value = [...current]
  }
  else {
    selectedFreePanelIds.value = current.size === 1 && current.has(id) ? [] : [id]
  }
}

function createFreePanel(plane: PanelPlane) {
  selectedFreePanelIds.value = [addFreePanel(props.ydoc, plane)]
}

function deleteSelectedFreePanels() {
  removeFreePanels(props.ydoc, selectedFreePanelIds.value)
  selectedFreePanelIds.value = []
}

function commitFreePanelMetric(
  panel: FreePanel,
  group: 'size' | 'position',
  axis: WorldAxis,
  event: Event,
) {
  const input = event.target as HTMLInputElement
  const mm = Number(input.value)
  if (Number.isFinite(mm)) {
    updateFreePanel(props.ydoc, panel.id, { [group]: { [axis]: mm / 1000 } } as never)
  }
  const current = freePanels.value.find(p => p.id === panel.id)
  if (current) input.value = toMm(current[group][axis])
}

/** Resize step: one panel thickness, the same unit the nudge tools use. */
const RESIZE_STEP = 0.018

// ---------------------------------------------------------------------------
// Joinery (magicJoints and the joint-cutting tools)
// ---------------------------------------------------------------------------

const joinery = computed(() => snapshot.value.joinery)
const jointStyles = JOINT_STYLES

const joineryStyleHint = computed(() =>
  JOINT_STYLES.find(style => style.value === joinery.value.style)?.hint ?? '',
)

interface JoineryField {
  key: 'fastenersPerJoint' | 'fastenerDiameter' | 'fastenerDepth' | 'endInset'
  label: string
  unit: 'mm' | 'per joint'
}

const joineryNumberFields: JoineryField[] = [
  { key: 'fastenersPerJoint', label: 'Fasteners per joint', unit: 'per joint' },
  { key: 'fastenerDiameter', label: 'Fastener diameter', unit: 'mm' },
  { key: 'fastenerDepth', label: 'Fastener depth', unit: 'mm' },
  { key: 'endInset', label: 'End inset', unit: 'mm' },
]

function commitJoineryField(field: JoineryField, event: Event) {
  const input = event.target as HTMLInputElement
  const parsed = Number(input.value)
  if (Number.isFinite(parsed) && parsed >= 0) {
    setJoineryValue(props.ydoc, field.key, field.unit === 'mm' ? parsed / 1000 : Math.round(parsed))
  }
  const current = joinery.value[field.key]
  input.value = field.unit === 'mm' ? toMm(current) : String(current)
}

// ---------------------------------------------------------------------------
// Router edge profiles (routerCove / RoundOver / Straight / Chamfer, multiPocket)
// ---------------------------------------------------------------------------

const routerProfileKinds = ROUTER_PROFILES

function routerProfileFor(role: PanelRole): RouterProfile {
  return snapshot.value.routerProfiles[role] ?? defaultRouterProfile()
}

function setProfileKind(role: PanelRole, kind: RouterProfileKind) {
  // Picking a profile with no edges selected would be a no-op; default to all
  // four, which is what the routerX4 tools do.
  const current = routerProfileFor(role)
  const hasEdges = PANEL_EDGES.some(edge => current.edges[edge])
  setRouterProfile(props.ydoc, role, {
    kind,
    edges: kind !== 'none' && !hasEdges ? { ...ALL_PROFILE_EDGES } : undefined,
  })
}

function toggleProfileEdge(role: PanelRole, edge: PanelEdge, on: boolean) {
  setRouterProfile(props.ydoc, role, { edges: { [edge]: on } as never })
}

function commitProfileBitSize(role: PanelRole, event: Event) {
  const input = event.target as HTMLInputElement
  const mm = Number(input.value)
  if (Number.isFinite(mm) && mm > 0) setRouterProfile(props.ydoc, role, { bitSize: mm / 1000 })
  input.value = toMm(routerProfileFor(role).bitSize)
}

/** Edges that carry tape a profile would rout straight off. */
function profileBandConflicts(role: PanelRole): PanelEdge[] {
  return conflictingEdges(routerProfileFor(role), panelAttributesFor(role).bands)
}

// ---------------------------------------------------------------------------
// Drilling (magicDriller, drillHoles, drillCountersinks, drillCounterbores)
// ---------------------------------------------------------------------------

const drillingOpen = ref(false)

/** Sentinel for "no hardware" — USelect can't round-trip a null value key. */
const NO_HARDWARE_VALUE = 'none'

const drillOperationTypes = DRILL_OPERATION_TYPES
const patternKinds = PATTERN_KINDS
const patternAnchors = PATTERN_ANCHORS
const drillFaces = [
  { value: 'front' as const, label: 'Front face' },
  { value: 'back' as const, label: 'Back face' },
]
const drillHardwareItems = [
  { value: NO_HARDWARE_VALUE, label: 'None' },
  ...HARDWARE_CATALOG.map(item => ({ value: item.code, label: `${item.code} — ${item.name}` })),
]

function drillingRulesFor(role: PanelRole): DrillingRule[] {
  return snapshot.value.drilling[role] ?? []
}

/** Enabled rules across every role — shown as a count on the trigger button. */
const activeDrillingRuleCount = computed(() =>
  ALL_PANEL_ROLES.reduce((sum, role) => sum + drillingRulesFor(role).filter(rule => rule.enabled).length, 0),
)

function updateRule(role: PanelRole, ruleId: string, patch: Partial<DrillingRule>) {
  updateDrillingRule(props.ydoc, role, ruleId, patch)
}

function updateRulePattern(role: PanelRole, ruleId: string, patch: Partial<DrillingRule['pattern']>) {
  updateDrillingRule(props.ydoc, role, ruleId, { pattern: patch as DrillingRule['pattern'] })
}

/** Read a millimetre input and store it as metres. */
function commitRuleMm(role: PanelRole, ruleId: string, key: 'diameter' | 'depth' | 'headDiameter' | 'headDepth', event: Event) {
  const input = event.target as HTMLInputElement
  const mm = Number(input.value)
  if (Number.isFinite(mm) && mm >= 0) updateRule(role, ruleId, { [key]: mm / 1000 })
  const rule = drillingRulesFor(role).find(r => r.id === ruleId)
  if (rule) input.value = toMm(rule[key])
}

function commitPatternMm(role: PanelRole, ruleId: string, key: 'spacing' | 'inset' | 'offset', event: Event) {
  const input = event.target as HTMLInputElement
  const mm = Number(input.value)
  if (Number.isFinite(mm)) updateRulePattern(role, ruleId, { [key]: mm / 1000 })
  const rule = drillingRulesFor(role).find(r => r.id === ruleId)
  if (rule) input.value = toMm(rule.pattern[key] ?? 0)
}

function commitPatternCount(role: PanelRole, ruleId: string, key: 'count' | 'rows', event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (Number.isFinite(value)) updateRulePattern(role, ruleId, { [key]: Math.round(value) })
  const rule = drillingRulesFor(role).find(r => r.id === ruleId)
  if (rule) input.value = String(rule.pattern[key] ?? 1)
}

function toMm(metres: number): string {
  return String(Math.round(metres * 10000) / 10)
}

function commitCurrency(event: Event) {
  const input = event.target as HTMLInputElement
  updateSetting('currency', input.value.trim().toUpperCase())
  input.value = projectSettings.value.currency
}

const aiBuildOpen = ref(false)
const aiPrompt = ref('')
const aiLoading = ref(false)
const aiError = ref('')
const aiDraft = ref<AiFurnitureDraft | null>(null)
const aiPromptInputRef = ref<HTMLTextAreaElement | null>(null)
let aiRequestSeq = 0
let aiAbortController: AbortController | null = null

const aiPromptLength = computed(() => aiPrompt.value.trim().length)
const aiDraftColumnCount = computed(() => aiDraft.value?.doc.columns.length ?? 0)
const aiDraftModuleCount = computed(() =>
  aiDraft.value?.doc.columns.reduce((sum, column) => sum + column.modules.length, 0) ?? 0,
)
const aiPromptOverLimit = computed(() => aiPromptLength.value > AI_FURNITURE_PROMPT_MAX_LENGTH)
const aiCanGenerate = computed(() =>
  aiPromptLength.value > 0
  && !aiPromptOverLimit.value
  && !aiLoading.value,
)
const aiPromptExamples = [
  {
    label: 'Media console',
    prompt: 'A 1.8m wide media console with 6 modules, doors on both sides, and drawers in the middle.',
  },
  {
    label: 'Bookshelf',
    prompt: 'A tall bookshelf with 4 even columns, mostly open shelves, and two lower drawers.',
  },
  {
    label: 'Wardrobe',
    prompt: 'A wardrobe with 3 wide columns, full-height doors on the sides, and stacked drawers in the center.',
  },
]

watch(selectedCount, (count) => {
  if (count === 0) return
  settingsOpen.value = false
  copiedConfig.value = false
  if (copiedConfigTimer !== undefined) {
    clearTimeout(copiedConfigTimer)
    copiedConfigTimer = undefined
  }
})

const selectedTypeValue = computed(() => {
  if (selectedModuleInfos.value.length === 0) return ''
  const first = selectedModuleInfos.value[0]?.module.type
  return first && selectedModuleInfos.value.every(info => info.module.type === first) ? first : '__multiple__'
})

const selectedColumnWidthValue = computed(() => {
  if (selectedModuleInfos.value.length === 0) return ''
  const first = selectedModuleInfos.value[0]?.columnWidth
  return typeof first === 'number' && selectedModuleInfos.value.every(info => info.columnWidth === first) ? String(first) : ''
})

const selectedHeightValue = computed(() => {
  if (selectedModuleInfos.value.length === 0) return ''
  const first = selectedModuleInfos.value[0]?.module.height
  return typeof first === 'number' && selectedModuleInfos.value.every(info => info.module.height === first) ? String(first) : ''
})

const selectedDrawerCountValue = computed(() => {
  if (selectedTypeValue.value !== 'drawer') return ''
  const first = selectedModuleInfos.value[0]?.module.drawerCount
  return typeof first === 'number' && selectedModuleInfos.value.every(info => info.module.type === 'drawer' && info.module.drawerCount === first) ? String(first) : ''
})

const selectedShelfCountValue = computed(() => {
  if (selectedTypeValue.value !== 'shelves') return ''
  const first = selectedModuleInfos.value[0]?.module.shelfCount
  return typeof first === 'number' && selectedModuleInfos.value.every(info => info.module.type === 'shelves' && info.module.shelfCount === first) ? String(first) : ''
})

const selectedDividerCountValue = computed(() => {
  if (selectedTypeValue.value !== 'dividers') return ''
  const first = selectedModuleInfos.value[0]?.module.dividerCount
  return typeof first === 'number' && selectedModuleInfos.value.every(info => info.module.type === 'dividers' && info.module.dividerCount === first) ? String(first) : ''
})

const selectedTypeItems = computed(() => [
  { value: '__multiple__', label: 'multiple' },
  ...MODULE_TYPES.map(type => ({ value: type, label: type })),
])

function parsePositiveMetric(value: string): number | null {
  const next = Number(value.trim().replace(',', '.'))
  return Number.isFinite(next) && next > 0 ? next : null
}

function parseNonNegativeMetric(value: string): number | null {
  if (value.trim() === '') return null
  const next = Number(value.trim().replace(',', '.'))
  return Number.isFinite(next) && next >= 0 ? next : null
}

function formatConfigValue(field: ConfigField) {
  const key = field.key as keyof FurnitureConfig
  const value = effectiveConfig.value[key] ?? DEFAULT_FURNITURE_CONFIG[key]
  if (!Number.isFinite(value)) return ''
  return field.unit === 'mm' ? String(Math.round(value * 1000)) : String(value)
}

function summaryLabel(field: ConfigField) {
  if (field.key === 'panelThickness') return 'Thickness'
  if (field.key === 'sidePanelOverhang') return 'Overhang'
  return field.label
}

function updateConfigValue(key: string, value: number) {
  setConfigValue(props.ydoc, key as keyof FurnitureConfig, value as FurnitureConfig[keyof FurnitureConfig])
}

function commitConfigField(field: ConfigField, event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const parsed = parseNonNegativeMetric(input.value)
  if (parsed == null) {
    input.value = formatConfigValue(field)
    return
  }
  updateConfigValue(field.key, field.unit === 'mm' ? parsed / 1000 : parsed)
  input.value = formatConfigValue(field)
}

function resetConfig() {
  for (const k of FURNITURE_CONFIG_WRITABLE_KEYS) {
    setConfigValue(props.ydoc, k, DEFAULT_FURNITURE_CONFIG[k])
  }
  // The dialog covers units and reporting too, so Reset clears both sections.
  resetSettings(props.ydoc)
}

function configJson() {
  const values = projectDesignerConfigFields.reduce<Record<string, number>>((acc, field) => {
    const key = field.key as keyof FurnitureConfig
    acc[field.key] = effectiveConfig.value[key] ?? DEFAULT_FURNITURE_CONFIG[key]
    return acc
  }, {})
  return JSON.stringify({ ...values, settings: projectSettings.value }, null, 2)
}

async function openAiBuilder() {
  aiError.value = ''
  aiDraft.value = null
  aiBuildOpen.value = true
  await nextTick()
  aiPromptInputRef.value?.focus()
}

async function useAiPromptExample(prompt: string) {
  if (aiLoading.value) return
  aiPrompt.value = prompt
  aiError.value = ''
  aiDraft.value = null
  await nextTick()
  aiPromptInputRef.value?.focus()
}

function abortAiGeneration() {
  aiRequestSeq++
  aiAbortController?.abort()
  aiAbortController = null
  aiLoading.value = false
}

watch(aiBuildOpen, (open) => {
  if (!open) abortAiGeneration()
})

function aiFetchErrorMessage(err: unknown): string {
  const error = err as {
    statusMessage?: string
    message?: string
    data?: { statusMessage?: string, message?: string }
  } | null
  return error?.data?.statusMessage
    || error?.statusMessage
    || error?.data?.message
    || error?.message
    || 'Could not generate furniture.'
}

async function generateAiFurniture() {
  const prompt = aiPrompt.value.trim()
  aiError.value = ''
  if (!prompt) {
    aiError.value = 'Enter a prompt.'
    return
  }
  if (prompt.length > AI_FURNITURE_PROMPT_MAX_LENGTH) {
    aiError.value = `Prompt must be ${AI_FURNITURE_PROMPT_MAX_LENGTH} characters or fewer.`
    return
  }
  aiAbortController?.abort()
  const requestSeq = ++aiRequestSeq
  const controller = new AbortController()
  aiAbortController = controller
  aiDraft.value = null
  aiLoading.value = true
  try {
    const response = await $fetch<AiFurnitureGenerateResponse>('/api/ai/furniture/generate', {
      method: 'POST',
      signal: controller.signal,
      body: {
        prompt,
        current: readFurnitureDoc(props.ydoc),
        mode: 'replace',
      },
    })
    if (requestSeq !== aiRequestSeq) return
    aiDraft.value = response.draft
  }
  catch (err: unknown) {
    if (requestSeq !== aiRequestSeq || controller.signal.aborted) return
    aiDraft.value = null
    aiError.value = aiFetchErrorMessage(err)
  }
  finally {
    if (requestSeq === aiRequestSeq) {
      aiLoading.value = false
      aiAbortController = null
    }
  }
}

function applyAiFurnitureDraft() {
  if (!aiDraft.value) return
  replaceFurnitureDoc(props.ydoc, aiDraft.value.doc)
  setSelection([])
  aiBuildOpen.value = false
  aiDraft.value = null
  aiError.value = ''
}

async function copyConfigJson() {
  const json = configJson()
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(json)
  }
  else {
    const textarea = document.createElement('textarea')
    textarea.value = json
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
  copiedConfig.value = true
  if (copiedConfigTimer) clearTimeout(copiedConfigTimer)
  copiedConfigTimer = setTimeout(() => {
    copiedConfig.value = false
    copiedConfigTimer = undefined
  }, 1200)
}

function onSelectedTypeChange(value: string) {
  if (value && value !== '__multiple__' && MODULE_TYPES.includes(value as ModuleType)) {
    updateSelectedModulesType(value as ModuleType)
  }
}

function onSelectedColumnWidthCommit(event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const value = parsePositiveMetric(input.value)
  if (value == null) input.value = selectedColumnWidthValue.value
  else updateSelectedModulesColumnWidth(value)
}

function onSelectedHeightCommit(event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const value = parsePositiveMetric(input.value)
  if (value == null) input.value = selectedHeightValue.value
  else updateSelectedModulesHeight(value)
}

function onSelectedDrawerCountCommit(event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const value = Number(input.value.trim())
  const next = Math.round(value)
  if (!Number.isFinite(value) || next < DRAWER_COUNT_MIN || next > DRAWER_COUNT_MAX) {
    input.value = selectedDrawerCountValue.value
    return
  }
  updateSelectedModulesDrawerCount(next)
  input.value = String(next)
}

function onSelectedShelfCountCommit(event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const value = Number(input.value.trim())
  const next = Math.round(value)
  if (!Number.isFinite(value) || next < SHELF_COUNT_MIN || next > SHELF_COUNT_MAX) {
    input.value = selectedShelfCountValue.value
    return
  }
  updateSelectedModulesShelfCount(next)
  input.value = String(next)
}

function onSelectedDividerCountCommit(event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const value = Number(input.value.trim())
  const next = Math.round(value)
  if (!Number.isFinite(value) || next < DIVIDER_COUNT_MIN || next > DIVIDER_COUNT_MAX) {
    input.value = selectedDividerCountValue.value
    return
  }
  updateSelectedModulesDividerCount(next)
  input.value = String(next)
}

if (getCurrentScope()) {
  onScopeDispose(() => {
    abortAiGeneration()
    if (copiedConfigTimer) clearTimeout(copiedConfigTimer)
  })
}
</script>

<template>
  <div class="designer-root relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg shadow-sm ring-1 ring-default/60">
    <ProjectDesignerFrontView
      :columns="columns"
      :config="config"
      :selected-module-ids="selectedIds"
      :zoom-percent="clampedZoomPercent"
      class="relative z-0 min-h-0 w-full flex-1"
      @add-column-left="addColumnLeft"
      @add-column-right="addColumnRight"
      @clear-module-selection="clearSelection"
      @remove-column="removeColumnAt"
      @add-module-top="addModuleTop"
      @toggle-module-selection="toggleModuleSelection"
      @column-resize-start="onColumnResizeStart"
      @set-column-width="setColumnWidthAt"
      @set-module-height="setModuleHeightAt"
      @update:zoom-percent="(v: number) => emit('update:zoomPercent', v)"
    />

    <div class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-4 sm:px-3 sm:pb-3 sm:pt-10">
      <div
        class="pointer-events-auto flex w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-xl bg-elevated shadow-lg ring-1 ring-default/60"
        :class="selectedCount > 0 ? 'max-h-[min(11rem,30dvh)] sm:max-h-[min(16rem,42vh)]' : 'max-h-[min(10rem,28dvh)] sm:max-h-[min(18rem,46vh)]'"
      >
        <div class="inspector-root grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-muted">
          <div
            v-if="visibleIssues.length > 0"
            class="px-3 py-3 sm:px-4"
          >
            <div class="grid auto-rows-auto gap-2">
              <div
                v-for="issue in visibleIssues"
                :key="issue.moduleId != null ? `${issue.moduleId}:${issue.code}` : issue.code"
                class="text-pretty rounded-lg px-3 py-2 text-xs shadow-sm ring-1"
                :class="issue.severity === 'error' ? 'bg-error/10 text-error ring-error/20' : 'bg-elevated text-default ring-default/60'"
              >
                {{ issue.message }}
              </div>
            </div>
          </div>

          <div class="min-h-0 overflow-auto p-3 sm:p-4">
            <div
              v-if="selectedCount > 0"
              class="grid gap-3"
            >
              <article class="grid gap-3 rounded-lg bg-default p-3 text-sm shadow-sm">
                <div class="flex min-w-0 items-center justify-between gap-2">
                  <h2 class="min-w-0 text-balance font-medium text-highlighted tabular-nums">
                    {{ selectedCount }} selected
                  </h2>
                  <UButton
                    v-if="aiFurnitureEnabled"
                    color="primary"
                    icon="i-lucide-sparkles"
                    label="AI build"
                    size="xs"
                    variant="solid"
                    class="min-h-8 shrink-0 rounded-full px-3 shadow-sm transition-transform duration-150 active:scale-[0.97]"
                    @click="openAiBuilder"
                  />
                </div>

                <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
                  <dt class="self-center text-muted">
                    Type
                  </dt>
                  <dd class="min-w-0">
                    <USelect
                      :model-value="selectedTypeValue || '__multiple__'"
                      :items="selectedTypeItems"
                      value-key="value"
                      class="w-full"
                      size="xs"
                      @update:model-value="onSelectedTypeChange"
                    />
                  </dd>

                  <dt class="self-center text-muted">
                    Width
                  </dt>
                  <dd class="min-w-0">
                    <div class="flex items-center gap-1">
                      <input
                        :value="selectedColumnWidthValue"
                        type="text"
                        inputmode="decimal"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                        placeholder="mixed"
                        aria-label="Column width for selected modules in meters"
                        @keydown.enter.prevent="onSelectedColumnWidthCommit"
                        @blur="onSelectedColumnWidthCommit"
                      >
                      <span class="shrink-0 text-muted">m</span>
                    </div>
                  </dd>

                  <dt class="self-center text-muted">
                    Height
                  </dt>
                  <dd class="min-w-0">
                    <div class="flex items-center gap-1">
                      <input
                        :value="selectedHeightValue"
                        type="text"
                        inputmode="decimal"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                        placeholder="mixed"
                        aria-label="Selected modules height in meters"
                        @keydown.enter.prevent="onSelectedHeightCommit"
                        @blur="onSelectedHeightCommit"
                      >
                      <span class="shrink-0 text-muted">m</span>
                    </div>
                  </dd>

                  <template v-if="selectedTypeValue === 'drawer'">
                    <dt class="self-center text-muted">
                      Drawers
                    </dt>
                    <dd class="min-w-0">
                      <input
                        :value="selectedDrawerCountValue"
                        type="text"
                        inputmode="numeric"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                        placeholder="mixed"
                        aria-label="Number of drawers in selected modules"
                        @keydown.enter.prevent="onSelectedDrawerCountCommit"
                        @blur="onSelectedDrawerCountCommit"
                      >
                    </dd>
                  </template>

                  <template v-if="selectedTypeValue === 'shelves'">
                    <dt class="self-center text-muted">
                      Shelves
                    </dt>
                    <dd class="min-w-0">
                      <input
                        :value="selectedShelfCountValue"
                        type="text"
                        inputmode="numeric"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                        placeholder="mixed"
                        aria-label="Number of internal shelves in selected modules"
                        @keydown.enter.prevent="onSelectedShelfCountCommit"
                        @blur="onSelectedShelfCountCommit"
                      >
                    </dd>
                  </template>

                  <template v-if="selectedTypeValue === 'frame'">
                    <label class="contents">
                      <span class="self-center text-[0.7rem] text-muted">Rails</span>
                      <input
                        :value="selectedFrameRailValue"
                        type="text"
                        inputmode="numeric"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                        aria-label="Extra horizontal rails inside the frame"
                        @keydown.enter.prevent="onSelectedFrameMemberCommit('frameRailCount', $event)"
                        @blur="onSelectedFrameMemberCommit('frameRailCount', $event)"
                      >
                    </label>
                    <label class="contents">
                      <span class="self-center text-[0.7rem] text-muted">Stiles</span>
                      <input
                        :value="selectedFrameStileValue"
                        type="text"
                        inputmode="numeric"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                        aria-label="Extra vertical stiles inside the frame"
                        @keydown.enter.prevent="onSelectedFrameMemberCommit('frameStileCount', $event)"
                        @blur="onSelectedFrameMemberCommit('frameStileCount', $event)"
                      >
                    </label>
                  </template>

                  <template v-if="selectedTypeValue === 'dividers'">
                    <dt class="self-center text-muted">
                      Dividers
                    </dt>
                    <dd class="min-w-0">
                      <input
                        :value="selectedDividerCountValue"
                        type="text"
                        inputmode="numeric"
                        class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                        placeholder="mixed"
                        aria-label="Number of vertical dividers in selected modules"
                        @keydown.enter.prevent="onSelectedDividerCountCommit"
                        @blur="onSelectedDividerCountCommit"
                      >
                    </dd>
                  </template>
                </dl>

                <UButton
                  v-if="selectedModuleInfos[0]"
                  block
                  color="error"
                  icon="i-lucide-trash-2"
                  label="Delete module"
                  size="xs"
                  variant="soft"
                  class="justify-self-stretch active:scale-[0.97] transition-transform duration-150"
                  @click="removeSelectedModule(selectedModuleInfos[0].columnIndex, selectedModuleInfos[0].moduleIndex)"
                />
              </article>
            </div>

            <div
              v-else
              class="grid min-h-0 min-w-0 gap-2"
            >
              <button
                v-if="aiFurnitureEnabled"
                type="button"
                class="group flex min-h-10 w-full min-w-0 items-center gap-2 rounded-xl bg-primary px-2.5 py-1.5 text-left text-inverted shadow-md shadow-primary/20 ring-1 ring-inset ring-white/10 transition-[transform,box-shadow,filter] duration-150 ease-out hover:shadow-lg hover:shadow-primary/25 active:scale-[0.97] sm:min-h-14 sm:gap-3 sm:px-3 sm:py-2.5"
                aria-label="Build furniture with AI"
                @click="openAiBuilder"
              >
                <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-black/15 sm:size-9">
                  <UIcon
                    name="i-lucide-sparkles"
                    class="size-4 transition-transform duration-150 ease-out group-hover:scale-110 sm:size-5"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-xs font-semibold leading-4 text-pretty sm:text-sm sm:leading-5">Build with AI</span>
                  <span class="hidden truncate text-xs leading-4 opacity-80 sm:block">Describe the cabinet and preview it before applying.</span>
                </span>
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-3.5 shrink-0 opacity-80 transition-transform duration-150 ease-out group-hover:translate-x-0.5 sm:size-4"
                />
              </button>

              <div
                class="relative min-h-0 min-w-0 cursor-pointer transition-transform duration-150 active:scale-[0.97]"
                @click="settingsOpen = true"
              >
                <div class="grid h-12 min-w-0 grid-cols-3 gap-1.5 pt-0.5 sm:h-40 sm:gap-2 sm:pt-1">
                  <article
                    v-for="field in summaryConfigFields"
                    :key="field.key"
                    class="flex min-w-0 flex-col rounded-lg bg-default px-1.5 py-1 shadow-sm sm:px-3 sm:py-2.5"
                  >
                    <div class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-0.5 sm:gap-2 sm:p-2">
                      <h3 class="min-w-0 text-[0.55rem] font-medium leading-tight text-muted sm:text-balance sm:text-[0.7rem] sm:leading-snug">
                        {{ summaryLabel(field) }} ({{ field.unit }})
                      </h3>
                      <div class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0 sm:pb-2">
                        <span class="min-w-0 text-sm font-extralight leading-none tracking-normal tabular-nums text-highlighted sm:text-[2.75rem]">
                          {{ formatConfigValue(field) }}
                        </span>
                      </div>
                    </div>
                  </article>
                </div>

                <AppDialog
                  v-model:open="settingsOpen"
                  title="Project settings"
                  description="All values apply to the assembly preview and cutlist."
                >
                  <div class="flex flex-wrap items-center justify-end gap-1 border-b border-default pb-3">
                    <UButton
                      icon="i-lucide-rotate-ccw"
                      label="Reset"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      aria-label="Reset project settings to defaults"
                      class="active:scale-[0.97] transition-transform duration-150"
                      @click="resetConfig"
                    />
                    <UButton
                      :icon="copiedConfig ? 'i-lucide-check' : 'i-lucide-copy'"
                      :label="copiedConfig ? 'Copied' : 'Copy JSON'"
                      size="xs"
                      color="neutral"
                      variant="soft"
                      aria-label="Copy project settings as JSON"
                      class="active:scale-[0.97] transition-transform duration-150"
                      @click="copyConfigJson"
                    />
                  </div>

                  <dl class="grid max-h-[min(24rem,55vh)] grid-cols-[1fr_auto] gap-x-3 gap-y-2 overflow-y-auto pr-1 text-xs">
                    <dt class="col-span-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                      Units &amp; reporting
                    </dt>

                    <template
                      v-for="field in settingsSelectFields"
                      :key="field.key"
                    >
                      <dt class="flex min-w-0 items-center gap-1 self-center text-muted">
                        <span class="truncate">{{ field.label }}</span>
                        <UTooltip
                          :text="field.help"
                          :delay-duration="100"
                          :content="{ side: 'left', sideOffset: 6 }"
                        >
                          <button
                            type="button"
                            class="config-help-icon active:scale-[0.97] transition-transform duration-150"
                            :aria-label="`${field.label} help`"
                          >
                            <UIcon
                              name="i-lucide-circle-help"
                              class="size-3.5"
                            />
                          </button>
                        </UTooltip>
                      </dt>
                      <dd>
                        <USelect
                          :model-value="projectSettings[field.key]"
                          :items="field.items"
                          value-key="value"
                          label-key="label"
                          size="xs"
                          class="w-52"
                          :aria-label="field.label"
                          @update:model-value="updateSetting(field.key, $event as never)"
                        />
                      </dd>
                    </template>

                    <template v-if="showsFractionDenominator">
                      <dt class="flex min-w-0 items-center self-center text-muted">
                        <span class="truncate">Fraction size</span>
                      </dt>
                      <dd>
                        <USelect
                          :model-value="projectSettings.fractionDenominator"
                          :items="fractionDenominatorItems"
                          value-key="value"
                          label-key="label"
                          size="xs"
                          class="w-52"
                          aria-label="Smallest fraction shown for fractional inches"
                          @update:model-value="updateSetting('fractionDenominator', $event as never)"
                        />
                      </dd>
                    </template>

                    <template v-else>
                      <dt class="flex min-w-0 items-center self-center text-muted">
                        <span class="truncate">Decimal places</span>
                      </dt>
                      <dd>
                        <div class="flex items-center gap-1">
                          <input
                            :value="projectSettings.lengthPrecision"
                            type="text"
                            inputmode="numeric"
                            class="w-20 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                            aria-label="Decimal places for dimensions"
                            @keydown.enter.prevent="commitPrecision('lengthPrecision', $event)"
                            @blur="commitPrecision('lengthPrecision', $event)"
                          >
                          <span class="text-muted lowercase">dp</span>
                        </div>
                      </dd>
                    </template>

                    <dt class="flex min-w-0 items-center self-center text-muted">
                      <span class="truncate">Currency</span>
                    </dt>
                    <dd>
                      <div class="flex items-center gap-1">
                        <input
                          :value="projectSettings.currency"
                          type="text"
                          maxlength="3"
                          class="w-20 rounded-md bg-muted px-2 py-1 text-right text-xs uppercase tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                          aria-label="Currency code used for material cost"
                          @keydown.enter.prevent="commitCurrency($event)"
                          @blur="commitCurrency($event)"
                        >
                        <span class="text-muted lowercase">iso</span>
                      </div>
                    </dd>

                    <template
                      v-for="field in settingsToggleFields"
                      :key="field.key"
                    >
                      <dt class="flex min-w-0 items-center gap-1 self-center text-muted">
                        <span class="truncate">{{ field.label }}</span>
                        <UTooltip
                          :text="field.help"
                          :delay-duration="100"
                          :content="{ side: 'left', sideOffset: 6 }"
                        >
                          <button
                            type="button"
                            class="config-help-icon active:scale-[0.97] transition-transform duration-150"
                            :aria-label="`${field.label} help`"
                          >
                            <UIcon
                              name="i-lucide-circle-help"
                              class="size-3.5"
                            />
                          </button>
                        </UTooltip>
                      </dt>
                      <dd class="flex justify-end">
                        <USwitch
                          :model-value="projectSettings[field.key]"
                          size="sm"
                          :aria-label="field.label"
                          @update:model-value="updateSetting(field.key, $event)"
                        />
                      </dd>
                    </template>

                    <dt class="col-span-2 pt-3 text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                      Joinery
                    </dt>

                    <dt class="flex min-w-0 items-center gap-1 self-center text-muted">
                      <span class="truncate">Joint style</span>
                      <UTooltip
                        :text="joineryStyleHint"
                        :delay-duration="100"
                        :content="{ side: 'left', sideOffset: 6 }"
                      >
                        <button
                          type="button"
                          class="config-help-icon active:scale-[0.97] transition-transform duration-150"
                          aria-label="Joint style help"
                        >
                          <UIcon
                            name="i-lucide-circle-help"
                            class="size-3.5"
                          />
                        </button>
                      </UTooltip>
                    </dt>
                    <dd>
                      <USelect
                        :model-value="joinery.style"
                        :items="jointStyles"
                        value-key="value"
                        label-key="label"
                        size="xs"
                        class="w-52"
                        aria-label="Joint style applied at every panel contact"
                        @update:model-value="setJoineryValue(props.ydoc, 'style', $event as never)"
                      />
                    </dd>

                    <template v-if="joinery.style !== 'butt'">
                      <template
                        v-for="field in joineryNumberFields"
                        :key="field.key"
                      >
                        <dt class="flex min-w-0 items-center self-center text-muted">
                          <span class="truncate">{{ field.label }}</span>
                        </dt>
                        <dd>
                          <div class="flex items-center gap-1">
                            <input
                              :value="field.unit === 'mm' ? toMm(joinery[field.key]) : joinery[field.key]"
                              type="text"
                              inputmode="decimal"
                              class="w-20 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                              :aria-label="`${field.label} (${field.unit})`"
                              @keydown.enter.prevent="commitJoineryField(field, $event)"
                              @blur="commitJoineryField(field, $event)"
                            >
                            <span class="text-muted lowercase">{{ field.unit }}</span>
                          </div>
                        </dd>
                      </template>
                    </template>

                    <dt class="col-span-2 pt-3 text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                      Construction
                    </dt>

                    <template
                      v-for="field in projectDesignerConfigFields"
                      :key="field.key"
                    >
                      <dt class="flex min-w-0 items-center gap-1 self-center text-muted">
                        <span class="truncate">{{ field.label }}</span>
                        <UTooltip
                          :text="field.help"
                          :delay-duration="100"
                          :content="{ side: 'left', sideOffset: 6 }"
                        >
                          <button
                            type="button"
                            class="config-help-icon active:scale-[0.97] transition-transform duration-150"
                            :aria-label="`${field.label} help`"
                          >
                            <UIcon
                              name="i-lucide-circle-help"
                              class="size-3.5"
                            />
                          </button>
                        </UTooltip>
                      </dt>
                      <dd>
                        <div class="flex items-center gap-1">
                          <input
                            :value="formatConfigValue(field)"
                            type="text"
                            inputmode="decimal"
                            class="w-20 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none ring-0 transition-colors duration-150 focus:bg-elevated"
                            :aria-label="`${field.label} (${field.unit})`"
                            @keydown.enter.prevent="commitConfigField(field, $event)"
                            @blur="commitConfigField(field, $event)"
                          >
                          <span class="text-muted lowercase">{{ field.unit }}</span>
                        </div>
                      </dd>
                    </template>
                  </dl>

                  <template #footer="{ close }">
                    <UButton
                      label="Done"
                      color="neutral"
                      variant="outline"
                      class="w-full min-w-0 justify-center active:scale-[0.97] transition-transform duration-150"
                      @click="close()"
                    />
                  </template>
                </AppDialog>

                <AppDialog
                  v-model:open="grainOpen"
                  title="Edges &amp; grain"
                  description="Outline, grain direction, router edge profiles, and edge banding per panel role. Feeds the 3D preview, cutlist, and tape report."
                >
                  <div class="flex flex-wrap items-center justify-end gap-1 border-b border-default pb-3">
                    <UButton
                      icon="i-lucide-rotate-ccw"
                      label="Clear all"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      aria-label="Reset outlines, grain, router profiles, and edge banding"
                      class="active:scale-[0.97] transition-transform duration-150"
                      @click="resetPanelAttributes(props.ydoc); resetRouterProfiles(props.ydoc); resetPanelOutlines(props.ydoc)"
                    />
                  </div>

                  <div class="max-h-[min(26rem,60vh)] space-y-3 overflow-y-auto pr-1 text-xs">
                    <section
                      v-for="role in ALL_PANEL_ROLES"
                      :key="role"
                      class="rounded-lg bg-muted/40 p-2.5"
                    >
                      <h4 class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                        {{ PANEL_ROLE_LABEL[role] }}
                      </h4>
                      <div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                        <span class="text-muted">Grain</span>
                        <USelect
                          :model-value="panelAttributesFor(role).grain"
                          :items="GRAIN_DIRECTIONS"
                          value-key="value"
                          label-key="label"
                          size="xs"
                          :aria-label="`Grain direction for ${PANEL_ROLE_LABEL[role]}`"
                          @update:model-value="setGrain(role, $event as never)"
                        />

                        <span class="text-muted">Shape</span>
                        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                          <USelect
                            :model-value="outlineFor(role).shape"
                            :items="outlineShapes"
                            value-key="value"
                            label-key="label"
                            size="xs"
                            class="min-w-32 flex-1"
                            :aria-label="`Panel outline for ${PANEL_ROLE_LABEL[role]}`"
                            @update:model-value="setPanelOutline(props.ydoc, role, { shape: $event as never })"
                          />
                          <span
                            v-if="outlineFor(role).shape !== 'rectangle' && outlineFor(role).shape !== 'custom'"
                            class="flex items-center gap-1"
                          >
                            <input
                              :value="Math.round(outlineFor(role).amount * 100)"
                              type="text"
                              inputmode="numeric"
                              class="w-14 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                              :aria-label="`Shape amount for ${PANEL_ROLE_LABEL[role]}`"
                              @keydown.enter.prevent="commitOutlineAmount(role, $event)"
                              @blur="commitOutlineAmount(role, $event)"
                            >
                            <span class="text-dimmed">%</span>
                          </span>
                        </div>

                        <span class="text-muted">Edge profile</span>
                        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                          <USelect
                            :model-value="routerProfileFor(role).kind"
                            :items="routerProfileKinds"
                            value-key="value"
                            label-key="label"
                            size="xs"
                            class="min-w-32 flex-1"
                            :aria-label="`Router edge profile for ${PANEL_ROLE_LABEL[role]}`"
                            @update:model-value="setProfileKind(role, $event as never)"
                          />
                          <span
                            v-if="routerProfileFor(role).kind !== 'none'"
                            class="flex items-center gap-1"
                          >
                            <input
                              :value="toMm(routerProfileFor(role).bitSize)"
                              type="text"
                              inputmode="decimal"
                              class="w-14 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                              :aria-label="`Router bit size for ${PANEL_ROLE_LABEL[role]}`"
                              @keydown.enter.prevent="commitProfileBitSize(role, $event)"
                              @blur="commitProfileBitSize(role, $event)"
                            >
                            <span class="text-dimmed">mm</span>
                          </span>
                        </div>

                        <template v-if="routerProfileFor(role).kind !== 'none'">
                          <span class="self-start pt-1 text-muted">Routed edges</span>
                          <div class="flex flex-wrap gap-x-3 gap-y-1">
                            <label
                              v-for="edge in PANEL_EDGES"
                              :key="edge"
                              class="flex items-center gap-1.5"
                            >
                              <UCheckbox
                                :model-value="routerProfileFor(role).edges[edge]"
                                size="sm"
                                :aria-label="`Rout the ${PANEL_EDGE_LABEL[edge].toLowerCase()} edge of ${PANEL_ROLE_LABEL[role]}`"
                                @update:model-value="toggleProfileEdge(role, edge, $event === true)"
                              />
                              <span class="text-dimmed">{{ PANEL_EDGE_LABEL[edge] }}</span>
                            </label>
                          </div>
                        </template>

                        <template v-if="profileBandConflicts(role).length > 0">
                          <span />
                          <p class="text-warning">
                            Routing would cut the tape off the
                            {{ profileBandConflicts(role).map(e => PANEL_EDGE_LABEL[e].toLowerCase()).join(', ') }}
                            edge{{ profileBandConflicts(role).length > 1 ? 's' : '' }}.
                          </p>
                        </template>

                        <span class="self-start pt-1 text-muted">Banding</span>
                        <div class="grid grid-cols-2 gap-1.5">
                          <label
                            v-for="edge in PANEL_EDGES"
                            :key="edge"
                            class="flex min-w-0 items-center gap-1.5"
                          >
                            <span class="w-12 shrink-0 text-dimmed">{{ PANEL_EDGE_LABEL[edge] }}</span>
                            <USelect
                              :model-value="panelAttributesFor(role).bands[edge] ?? BARE_EDGE_VALUE"
                              :items="edgeBandItems"
                              value-key="value"
                              label-key="label"
                              size="xs"
                              class="min-w-0 flex-1"
                              :aria-label="`${PANEL_EDGE_LABEL[edge]} edge band for ${PANEL_ROLE_LABEL[role]}`"
                              @update:model-value="setBand(role, edge, $event as string)"
                            />
                          </label>
                        </div>
                      </div>
                    </section>
                  </div>

                  <template #footer="{ close }">
                    <UButton
                      label="Done"
                      color="neutral"
                      variant="outline"
                      class="w-full min-w-0 justify-center active:scale-[0.97] transition-transform duration-150"
                      @click="close()"
                    />
                  </template>
                </AppDialog>
              </div>

              <UButton
                icon="i-lucide-layers"
                label="Edges &amp; grain"
                size="xs"
                color="neutral"
                variant="soft"
                block
                class="justify-center active:scale-[0.97] transition-transform duration-150"
                aria-label="Open edges and grain settings"
                @click="grainOpen = true"
              />

              <UButton
                icon="i-lucide-square-stack"
                :label="freePanels.length > 0 ? `Free panels (${freePanels.length})` : 'Free panels'"
                size="xs"
                color="neutral"
                variant="soft"
                block
                class="justify-center active:scale-[0.97] transition-transform duration-150"
                aria-label="Open free panels"
                @click="freePanelsOpen = true"
              />

              <AppDialog
                v-model:open="freePanelsOpen"
                title="Free panels"
                description="Boards placed outside the column structure. They join the same cutlist, costing, joinery, and 3D preview."
              >
                <div class="space-y-3 text-xs">
                  <section>
                    <h4 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                      Add on plane
                    </h4>
                    <div class="grid grid-cols-3 gap-1.5">
                      <UButton
                        v-for="plane in panelPlanes"
                        :key="plane.value"
                        :label="plane.value"
                        size="xs"
                        color="neutral"
                        variant="soft"
                        class="justify-center active:scale-[0.97] transition-transform duration-150"
                        :aria-label="`Add a panel on the ${plane.value} plane`"
                        :title="plane.hint"
                        @click="createFreePanel(plane.value)"
                      />
                    </div>
                  </section>

                  <section v-if="freePanels.length > 0">
                    <h4 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                      Panels
                    </h4>
                    <ul class="max-h-40 space-y-1 overflow-y-auto pr-1">
                      <li
                        v-for="panel in freePanels"
                        :key="panel.id"
                      >
                        <button
                          type="button"
                          :class="[
                            'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors duration-150',
                            selectedFreePanelIds.includes(panel.id) ? 'bg-primary/15 text-highlighted' : 'bg-muted/40 text-default hover:bg-elevated',
                          ]"
                          :aria-pressed="selectedFreePanelIds.includes(panel.id)"
                          :aria-label="`Select ${panel.label}`"
                          @click="toggleFreePanelSelection(panel.id, $event.shiftKey)"
                        >
                          <span class="truncate">{{ panel.label }}</span>
                          <span class="shrink-0 tabular-nums text-dimmed">
                            {{ toMm(panel.size.x) }}×{{ toMm(panel.size.y) }}×{{ toMm(panel.size.z) }}
                          </span>
                        </button>
                      </li>
                    </ul>
                  </section>

                  <section v-if="selectedFreePanels.length > 0">
                    <h4 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                      Move &amp; resize
                    </h4>
                    <div class="space-y-1.5">
                      <div
                        v-for="axis in moveAxes"
                        :key="axis.axis"
                        class="flex items-center gap-1.5"
                      >
                        <span class="w-4 shrink-0 text-muted">{{ axis.label }}</span>
                        <UButton
                          icon="i-lucide-minus"
                          size="xs"
                          color="neutral"
                          variant="soft"
                          :aria-label="`Move selection back along ${axis.label}`"
                          class="active:scale-[0.97] transition-transform duration-150"
                          @click="nudgeFreePanels(props.ydoc, selectedFreePanelIds, axis.axis, -1)"
                        />
                        <UButton
                          icon="i-lucide-plus"
                          size="xs"
                          color="neutral"
                          variant="soft"
                          :aria-label="`Move selection forward along ${axis.label}`"
                          class="active:scale-[0.97] transition-transform duration-150"
                          @click="nudgeFreePanels(props.ydoc, selectedFreePanelIds, axis.axis, 1)"
                        />
                        <span class="ml-2 w-10 shrink-0 text-dimmed">size</span>
                        <UButton
                          icon="i-lucide-chevrons-left-right"
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          :aria-label="`Shrink selection along ${axis.label}`"
                          class="active:scale-[0.97] transition-transform duration-150"
                          @click="resizeFreePanels(props.ydoc, selectedFreePanelIds, axis.axis, -RESIZE_STEP)"
                        />
                        <UButton
                          icon="i-lucide-chevrons-right-left"
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          :aria-label="`Grow selection along ${axis.label}`"
                          class="active:scale-[0.97] transition-transform duration-150"
                          @click="resizeFreePanels(props.ydoc, selectedFreePanelIds, axis.axis, RESIZE_STEP)"
                        />
                      </div>
                    </div>
                  </section>

                  <section v-if="selectedFreePanels.length > 0">
                    <h4 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                      Derive &amp; place
                    </h4>
                    <div class="flex flex-wrap gap-1.5">
                      <UButton
                        v-if="singleSelectedFreePanel"
                        icon="i-lucide-copy-plus"
                        label="From face"
                        size="xs"
                        color="neutral"
                        variant="soft"
                        class="active:scale-[0.97] transition-transform duration-150"
                        aria-label="Add a panel covering the selected panel's face"
                        @click="addPanelFromFace(props.ydoc, singleSelectedFreePanel.id)"
                      />
                      <UButton
                        v-if="selectedFreePanels.length === 2"
                        icon="i-lucide-between-horizontal-start"
                        label="Fill between"
                        size="xs"
                        color="neutral"
                        variant="soft"
                        class="active:scale-[0.97] transition-transform duration-150"
                        aria-label="Add a panel filling the gap between the two selected panels"
                        @click="addPanelBetween(props.ydoc, selectedFreePanelIds[0], selectedFreePanelIds[1])"
                      />
                      <UButton
                        icon="i-lucide-align-center"
                        label="Centre"
                        size="xs"
                        color="neutral"
                        variant="soft"
                        class="active:scale-[0.97] transition-transform duration-150"
                        aria-label="Centre the selection on the other panels"
                        @click="centerFreePanels(props.ydoc, selectedFreePanelIds)"
                      />
                      <UButton
                        v-if="selectedFreePanels.length >= 3"
                        icon="i-lucide-align-vertical-space-around"
                        label="Space evenly"
                        size="xs"
                        color="neutral"
                        variant="soft"
                        class="active:scale-[0.97] transition-transform duration-150"
                        aria-label="Distribute the selected panels evenly in height"
                        @click="spaceFreePanelsEqually(props.ydoc, selectedFreePanelIds, 'y')"
                      />
                    </div>
                    <div
                      v-if="singleSelectedFreePanel"
                      class="mt-1.5 flex flex-wrap items-center gap-1.5"
                    >
                      <span class="text-dimmed">Copy to</span>
                      <UButton
                        v-for="plane in panelPlanes"
                        :key="plane.value"
                        :label="plane.value"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        class="active:scale-[0.97] transition-transform duration-150"
                        :aria-label="`Copy the selected panel onto the ${plane.value} plane`"
                        @click="duplicateFreePanelToPlane(props.ydoc, singleSelectedFreePanel.id, plane.value)"
                      />
                    </div>
                  </section>

                  <section
                    v-if="singleSelectedFreePanel"
                    class="rounded-lg bg-muted/40 p-2.5"
                  >
                    <h4 class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                      {{ singleSelectedFreePanel.label }}
                    </h4>
                    <div class="grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1.5">
                      <span />
                      <span class="text-center text-dimmed">Size (mm)</span>
                      <span class="text-center text-dimmed">Centre (mm)</span>
                      <template
                        v-for="axis in moveAxes"
                        :key="axis.axis"
                      >
                        <span class="text-muted">{{ axis.label }}</span>
                        <input
                          :value="toMm(singleSelectedFreePanel.size[axis.axis])"
                          type="text"
                          inputmode="decimal"
                          class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                          :aria-label="`Panel size along ${axis.label} in millimetres`"
                          @keydown.enter.prevent="commitFreePanelMetric(singleSelectedFreePanel, 'size', axis.axis, $event)"
                          @blur="commitFreePanelMetric(singleSelectedFreePanel, 'size', axis.axis, $event)"
                        >
                        <input
                          :value="toMm(singleSelectedFreePanel.position[axis.axis])"
                          type="text"
                          inputmode="decimal"
                          class="w-full min-w-0 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                          :aria-label="`Panel centre along ${axis.label} in millimetres`"
                          @keydown.enter.prevent="commitFreePanelMetric(singleSelectedFreePanel, 'position', axis.axis, $event)"
                          @blur="commitFreePanelMetric(singleSelectedFreePanel, 'position', axis.axis, $event)"
                        >
                      </template>
                      <span class="text-muted">Part</span>
                      <USelect
                        :model-value="singleSelectedFreePanel.role"
                        :items="freePanelRoleItems"
                        value-key="value"
                        label-key="label"
                        size="xs"
                        class="col-span-2 min-w-0"
                        aria-label="Panel role, which drives its material, grain, banding, and drilling"
                        @update:model-value="updateFreePanel(props.ydoc, singleSelectedFreePanel.id, { role: $event as never })"
                      />
                    </div>
                  </section>

                  <UButton
                    v-if="selectedFreePanels.length > 0"
                    icon="i-lucide-trash-2"
                    :label="`Delete ${selectedFreePanels.length} panel${selectedFreePanels.length > 1 ? 's' : ''}`"
                    size="xs"
                    color="error"
                    variant="soft"
                    block
                    class="justify-center active:scale-[0.97] transition-transform duration-150"
                    aria-label="Delete the selected free panels"
                    @click="deleteSelectedFreePanels"
                  />

                  <p
                    v-if="freePanels.length === 0"
                    class="text-dimmed"
                  >
                    No free panels yet. Add one on a plane above — it will appear in the 3D preview and the cutlist.
                  </p>
                </div>

                <template #footer="{ close }">
                  <UButton
                    label="Done"
                    color="neutral"
                    variant="outline"
                    class="w-full min-w-0 justify-center active:scale-[0.97] transition-transform duration-150"
                    @click="close()"
                  />
                </template>
              </AppDialog>

              <UButton
                icon="i-lucide-drill"
                :label="activeDrillingRuleCount > 0 ? `Drilling (${activeDrillingRuleCount})` : 'Drilling'"
                size="xs"
                color="neutral"
                variant="soft"
                block
                class="justify-center active:scale-[0.97] transition-transform duration-150"
                aria-label="Open drilling settings"
                @click="drillingOpen = true"
              />

              <AppDialog
                v-model:open="drillingOpen"
                title="Drilling"
                description="Hole patterns re-applied to every panel of a role on each compile, so they follow the design as it changes."
              >
                <div class="flex flex-wrap items-center justify-end gap-1 border-b border-default pb-3">
                  <UButton
                    icon="i-lucide-rotate-ccw"
                    label="Clear all"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    aria-label="Remove every drilling rule"
                    class="active:scale-[0.97] transition-transform duration-150"
                    @click="resetDrilling(props.ydoc)"
                  />
                </div>

                <div class="max-h-[min(28rem,62vh)] space-y-3 overflow-y-auto pr-1 text-xs">
                  <section
                    v-for="role in ALL_PANEL_ROLES"
                    :key="role"
                    class="rounded-lg bg-muted/40 p-2.5"
                  >
                    <div class="mb-2 flex items-center justify-between gap-2">
                      <h4 class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                        {{ PANEL_ROLE_LABEL[role] }}
                      </h4>
                      <UButton
                        icon="i-lucide-plus"
                        label="Add pattern"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        :aria-label="`Add a drilling pattern to ${PANEL_ROLE_LABEL[role]}`"
                        class="active:scale-[0.97] transition-transform duration-150"
                        @click="addDrillingRule(props.ydoc, role)"
                      />
                    </div>

                    <p
                      v-if="drillingRulesFor(role).length === 0"
                      class="text-dimmed"
                    >
                      No drilling on this part.
                    </p>

                    <article
                      v-for="rule in drillingRulesFor(role)"
                      :key="rule.id"
                      class="mb-2 space-y-2 rounded-md bg-default p-2 last:mb-0"
                    >
                      <div class="flex flex-wrap items-center gap-2">
                        <USwitch
                          :model-value="rule.enabled"
                          size="sm"
                          :aria-label="`Enable this drilling pattern on ${PANEL_ROLE_LABEL[role]}`"
                          @update:model-value="updateRule(role, rule.id, { enabled: $event })"
                        />
                        <USelect
                          :model-value="rule.operationType"
                          :items="drillOperationTypes"
                          value-key="value"
                          label-key="label"
                          size="xs"
                          class="min-w-36 flex-1"
                          aria-label="Hole type"
                          @update:model-value="updateRule(role, rule.id, { operationType: $event as never })"
                        />
                        <UButton
                          icon="i-lucide-trash-2"
                          size="xs"
                          color="error"
                          variant="ghost"
                          aria-label="Remove this drilling pattern"
                          class="active:scale-[0.97] transition-transform duration-150"
                          @click="removeDrillingRule(props.ydoc, role, rule.id)"
                        />
                      </div>

                      <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <label class="flex items-center justify-between gap-2">
                          <span class="text-muted">Ø</span>
                          <span class="flex items-center gap-1">
                            <input
                              :value="toMm(rule.diameter)"
                              type="text"
                              inputmode="decimal"
                              class="w-16 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                              aria-label="Hole diameter in millimetres"
                              @keydown.enter.prevent="commitRuleMm(role, rule.id, 'diameter', $event)"
                              @blur="commitRuleMm(role, rule.id, 'diameter', $event)"
                            >
                            <span class="text-dimmed">mm</span>
                          </span>
                        </label>

                        <label
                          v-if="rule.operationType !== 'through-hole'"
                          class="flex items-center justify-between gap-2"
                        >
                          <span class="text-muted">Depth</span>
                          <span class="flex items-center gap-1">
                            <input
                              :value="toMm(rule.depth)"
                              type="text"
                              inputmode="decimal"
                              class="w-16 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                              aria-label="Hole depth in millimetres"
                              @keydown.enter.prevent="commitRuleMm(role, rule.id, 'depth', $event)"
                              @blur="commitRuleMm(role, rule.id, 'depth', $event)"
                            >
                            <span class="text-dimmed">mm</span>
                          </span>
                        </label>

                        <template v-if="rule.operationType === 'countersink' || rule.operationType === 'counterbore'">
                          <label class="flex items-center justify-between gap-2">
                            <span class="text-muted">Head Ø</span>
                            <span class="flex items-center gap-1">
                              <input
                                :value="toMm(rule.headDiameter)"
                                type="text"
                                inputmode="decimal"
                                class="w-16 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                                aria-label="Head recess diameter in millimetres"
                                @keydown.enter.prevent="commitRuleMm(role, rule.id, 'headDiameter', $event)"
                                @blur="commitRuleMm(role, rule.id, 'headDiameter', $event)"
                              >
                              <span class="text-dimmed">mm</span>
                            </span>
                          </label>
                          <label
                            v-if="rule.operationType === 'counterbore'"
                            class="flex items-center justify-between gap-2"
                          >
                            <span class="text-muted">Head depth</span>
                            <span class="flex items-center gap-1">
                              <input
                                :value="toMm(rule.headDepth)"
                                type="text"
                                inputmode="decimal"
                                class="w-16 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                                aria-label="Head recess depth in millimetres"
                                @keydown.enter.prevent="commitRuleMm(role, rule.id, 'headDepth', $event)"
                                @blur="commitRuleMm(role, rule.id, 'headDepth', $event)"
                              >
                              <span class="text-dimmed">mm</span>
                            </span>
                          </label>
                        </template>
                      </div>

                      <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <USelect
                          :model-value="rule.pattern.kind"
                          :items="patternKinds"
                          value-key="value"
                          label-key="label"
                          size="xs"
                          aria-label="Pattern kind"
                          @update:model-value="updateRulePattern(role, rule.id, { kind: $event as never })"
                        />
                        <USelect
                          :model-value="rule.pattern.anchor"
                          :items="patternAnchors"
                          value-key="value"
                          label-key="label"
                          size="xs"
                          aria-label="Pattern anchor edge"
                          @update:model-value="updateRulePattern(role, rule.id, { anchor: $event as never })"
                        />
                        <USelect
                          :model-value="rule.face"
                          :items="drillFaces"
                          value-key="value"
                          label-key="label"
                          size="xs"
                          aria-label="Face drilled from"
                          @update:model-value="updateRule(role, rule.id, { face: $event as never })"
                        />
                        <USelect
                          :model-value="rule.hardwareCode ?? NO_HARDWARE_VALUE"
                          :items="drillHardwareItems"
                          value-key="value"
                          label-key="label"
                          size="xs"
                          aria-label="Hardware seated by this drilling"
                          @update:model-value="updateRule(role, rule.id, { hardwareCode: $event === NO_HARDWARE_VALUE ? null : String($event) })"
                        />
                      </div>

                      <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <label class="flex items-center justify-between gap-2">
                          <span class="text-muted">Count</span>
                          <input
                            :value="rule.pattern.count"
                            type="text"
                            inputmode="numeric"
                            class="w-16 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                            aria-label="Holes along the pattern"
                            @keydown.enter.prevent="commitPatternCount(role, rule.id, 'count', $event)"
                            @blur="commitPatternCount(role, rule.id, 'count', $event)"
                          >
                        </label>
                        <label
                          v-if="rule.pattern.kind === 'grid'"
                          class="flex items-center justify-between gap-2"
                        >
                          <span class="text-muted">Rows</span>
                          <input
                            :value="rule.pattern.rows"
                            type="text"
                            inputmode="numeric"
                            class="w-16 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                            aria-label="Rows of holes"
                            @keydown.enter.prevent="commitPatternCount(role, rule.id, 'rows', $event)"
                            @blur="commitPatternCount(role, rule.id, 'rows', $event)"
                          >
                        </label>
                        <label class="flex items-center justify-between gap-2">
                          <span class="text-muted">Spacing</span>
                          <span class="flex items-center gap-1">
                            <input
                              :value="toMm(rule.pattern.spacing)"
                              type="text"
                              inputmode="decimal"
                              class="w-16 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                              aria-label="Centre-to-centre spacing in millimetres"
                              @keydown.enter.prevent="commitPatternMm(role, rule.id, 'spacing', $event)"
                              @blur="commitPatternMm(role, rule.id, 'spacing', $event)"
                            >
                            <span class="text-dimmed">mm</span>
                          </span>
                        </label>
                        <label class="flex items-center justify-between gap-2">
                          <span class="text-muted">Inset</span>
                          <span class="flex items-center gap-1">
                            <input
                              :value="toMm(rule.pattern.inset)"
                              type="text"
                              inputmode="decimal"
                              class="w-16 rounded-md bg-muted px-2 py-1 text-right text-xs tabular-nums text-highlighted shadow-sm outline-none transition-colors duration-150 focus:bg-elevated"
                              aria-label="Inset from the anchor edge in millimetres"
                              @keydown.enter.prevent="commitPatternMm(role, rule.id, 'inset', $event)"
                              @blur="commitPatternMm(role, rule.id, 'inset', $event)"
                            >
                            <span class="text-dimmed">mm</span>
                          </span>
                        </label>
                      </div>
                    </article>
                  </section>
                </div>

                <template #footer="{ close }">
                  <UButton
                    label="Done"
                    color="neutral"
                    variant="outline"
                    class="w-full min-w-0 justify-center active:scale-[0.97] transition-transform duration-150"
                    @click="close()"
                  />
                </template>
              </AppDialog>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AppDialog
      v-model:open="aiBuildOpen"
      title="Build with AI"
      description="Describe the cabinet you want. You can preview the layout before it replaces the current design."
      size="lg"
    >
      <div class="grid gap-4">
        <div class="grid gap-3 rounded-xl bg-muted p-3 shadow-sm ring-1 ring-default/60">
          <div class="flex min-w-0 items-center justify-between gap-3">
            <label
              for="ai-build-prompt"
              class="text-sm font-medium text-highlighted"
            >
              Prompt
            </label>
            <span
              class="text-[11px] tabular-nums"
              :class="aiPromptOverLimit ? 'text-error' : 'text-muted'"
            >
              {{ aiPromptLength }} / {{ AI_FURNITURE_PROMPT_MAX_LENGTH }}
            </span>
          </div>
          <textarea
            id="ai-build-prompt"
            ref="aiPromptInputRef"
            v-model="aiPrompt"
            rows="5"
            :maxlength="AI_FURNITURE_PROMPT_MAX_LENGTH"
            placeholder="e.g. 1.8m wide media console, three columns, drawers in the middle, doors on both sides"
            :disabled="aiLoading"
            class="block min-h-36 w-full resize-y rounded-lg bg-default px-3 py-3 text-sm leading-6 text-highlighted shadow-sm outline-none ring-1 ring-default/70 transition-[background-color,box-shadow] duration-150 placeholder:text-muted focus:bg-elevated focus:ring-2 focus:ring-primary/70 disabled:cursor-not-allowed disabled:opacity-60"
            @keydown.meta.enter.prevent="generateAiFurniture"
            @keydown.ctrl.enter.prevent="generateAiFurniture"
          />

          <div class="flex min-w-0 flex-wrap gap-1.5">
            <button
              v-for="example in aiPromptExamples"
              :key="example.label"
              type="button"
              class="min-h-8 rounded-full bg-elevated px-3 text-xs font-medium text-toned shadow-sm ring-1 ring-default/60 transition-[transform,background-color,color] duration-150 hover:bg-accented hover:text-highlighted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="aiLoading"
              @click="useAiPromptExample(example.prompt)"
            >
              {{ example.label }}
            </button>
          </div>
        </div>
      </div>

      <UAlert
        v-if="aiError"
        color="error"
        variant="soft"
        :title="aiError"
      />

      <div
        v-if="aiLoading"
        class="flex min-h-28 items-center gap-3 rounded-xl bg-muted p-4 shadow-sm ring-1 ring-default/60"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 shrink-0 animate-spin text-primary"
        />
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">
            Generating layout
          </p>
          <p class="text-pretty text-xs text-muted">
            Checking dimensions, modules, and hardware clearances.
          </p>
        </div>
      </div>

      <div
        v-if="aiDraft"
        class="grid gap-3 rounded-xl bg-default p-3 shadow-sm ring-1 ring-default/60 sm:grid-cols-[minmax(0,1.1fr)_minmax(12rem,0.9fr)]"
      >
        <div class="min-w-0 overflow-hidden rounded-lg bg-muted p-2 ring-1 ring-default/50">
          <ProjectPreview
            :columns="aiDraft.doc.columns"
            :config="aiDraft.doc.config"
          />
        </div>
        <div class="grid gap-2 text-xs">
          <p class="text-[11px] font-semibold uppercase tracking-normal text-muted">
            Preview summary
          </p>
          <p class="text-pretty text-highlighted">
            {{ aiDraft.summary }}
          </p>
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              color="neutral"
              variant="soft"
              size="sm"
            >
              {{ aiDraftColumnCount }} columns
            </UBadge>
            <UBadge
              color="neutral"
              variant="soft"
              size="sm"
            >
              {{ aiDraftModuleCount }} modules
            </UBadge>
          </div>
          <ul
            v-if="aiDraft.warnings.length > 0"
            class="grid gap-1 rounded-lg bg-muted p-2 text-muted"
          >
            <li
              v-for="warning in aiDraft.warnings"
              :key="warning"
              class="text-pretty"
            >
              {{ warning }}
            </li>
          </ul>
        </div>
      </div>

      <template #footer="{ close }">
        <div class="grid w-full grid-cols-2 gap-2">
          <UButton
            :label="aiDraft ? 'Close' : 'Cancel'"
            color="neutral"
            variant="outline"
            class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
            :disabled="aiLoading"
            @click="close()"
          />
          <UButton
            v-if="!aiDraft"
            label="Generate layout"
            icon="i-lucide-sparkles"
            class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
            :loading="aiLoading"
            :disabled="!aiCanGenerate"
            @click="generateAiFurniture"
          />
          <UButton
            v-else
            label="Apply"
            icon="i-lucide-check"
            class="w-full min-h-10 min-w-0 justify-center transition-transform active:scale-[0.97]"
            :disabled="aiLoading"
            @click="applyAiFurnitureDraft"
          />
        </div>
        <UButton
          v-if="aiDraft"
          block
          label="Regenerate"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="soft"
          class="mt-2 min-h-10 justify-center transition-transform active:scale-[0.97]"
          :loading="aiLoading"
          @click="generateAiFurniture"
        />
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.designer-root {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
}
.config-help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  border-radius: 9999px;
  outline: none;
  cursor: help;
  transition: color 0.15s;
}
.config-help-icon:hover,
.config-help-icon:focus-visible {
  color: var(--ui-text-highlighted);
}
</style>
