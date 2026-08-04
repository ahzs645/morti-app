<script setup lang="ts">
import type { FurnitureColumn, FurnitureConfig, FurnitureModule } from '~~/shared/domain/types'
import type { FreePanel } from '~~/shared/domain/free-panels'
import { type OutlineMap, outlineProfile } from '~~/shared/domain/outline'
import { FRAME_MEMBER_WIDTH } from '~~/shared/domain/defaults'
import { frameMemberOffsets } from '~~/shared/domain/frame'

interface Props {
  columns: FurnitureColumn[]
  config: FurnitureConfig
  selectedModuleIds: string[]
  zoomPercent: number
  /** Drawn as an elevation overlay so the flat view matches the 3D. */
  freePanels?: FreePanel[]
  /** Front-facing outlines are clipped onto door fronts. */
  outlines?: OutlineMap
}

const props = withDefaults(defineProps<Props>(), {
  freePanels: () => [],
  outlines: undefined,
})

const emit = defineEmits<{
  (e: 'add-column-left'): void
  (e: 'add-column-right'): void
  (e: 'clear-module-selection'): void
  (e: 'remove-column', columnIndex: number): void
  (e: 'add-module-top', columnIndex: number): void
  (e: 'update:zoom-percent', value: number): void
  (e: 'toggle-module-selection', moduleId: string, shiftKey: boolean): void
  (e: 'column-resize-start', columnIndex: number, direction: 1 | -1, event: PointerEvent): void
  (e: 'set-column-width', columnIndex: number, width: number): void
  (e: 'set-module-height', columnIndex: number, moduleIndex: number, height: number): void
}>()

// --- Layout / drag-handle constants (verbatim from spec 04 §4.3) ---
const Al = 220 // base px-per-meter at 100% zoom
const Vl = 28 // column-add buttons width/height
const Kl = 28 // column meta footer offset
const Bt = 10 // gap above the top-of-column "+" button
const qt = 4 // column outer padding
const Ke = 4 // column-resize divider lateral margin
const We = 4 // column-resize divider width
const zt = 6 // module-boundary drag-handle height
const ALLOWED_ZOOMS = [100, 75, 50, 25] as const
const OUTER_RAIL_GAP = 12 // gap-3 between side add buttons and the rail
const VIEWPORT_INLINE_PADDING = 32 // p-4 on the scroll content
const MIN_FIT_PX_PER_METER = 64

const clampedZoom = computed<number>(() => {
  const z = props.zoomPercent
  return ALLOWED_ZOOMS.includes(z as typeof ALLOWED_ZOOMS[number]) ? z : 100
})

const viewportRef = ref<HTMLElement | null>(null)
const viewportWidth = ref(0)
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!viewportRef.value) return
  resizeObserver = new ResizeObserver(([entry]) => {
    viewportWidth.value = entry?.contentRect.width ?? 0
  })
  resizeObserver.observe(viewportRef.value)
  viewportWidth.value = viewportRef.value.getBoundingClientRect().width
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

const basePxPerMeter = computed<number>(() => Al * (clampedZoom.value / 100))
const totalColumnWidthMeters = computed<number>(() =>
  props.columns.reduce((sum, col) => sum + Math.max(0, col.width), 0),
)
const fitPxPerMeter = computed<number>(() => {
  const meters = totalColumnWidthMeters.value
  const available = viewportWidth.value - VIEWPORT_INLINE_PADDING
  if (props.columns.length === 0 || meters <= 0 || available <= 0) return basePxPerMeter.value

  const staticWidth = 2 * Vl + 2 * OUTER_RAIL_GAP + (props.columns.length + 1) * (We + Ke)
  const fitted = (available - staticWidth) / meters
  if (!Number.isFinite(fitted) || fitted <= 0) {
    return Math.min(basePxPerMeter.value, MIN_FIT_PX_PER_METER)
  }

  return Math.max(MIN_FIT_PX_PER_METER, Math.min(basePxPerMeter.value, fitted))
})

// pixels per metre at the current zoom, auto-fitted when the rail is wider than the viewport
const pxPerMeter = computed<number>(() => fitPxPerMeter.value)

const selectedSet = computed<Set<string>>(() => new Set(props.selectedModuleIds))
const anySelected = computed<boolean>(() => selectedSet.value.size > 0)
const selectedFillClass = computed<string>(() => anySelected.value ? 'bg-inverted opacity-30' : 'bg-primary')

function isSelected(moduleId: string): boolean {
  return selectedSet.value.has(moduleId)
}

/**
 * Module types with no front panel. They are open bays you can see into, so
 * they render as an outline with their internal boards drawn on top — the same
 * treatment `shelf` always had. Filling them solid makes shelves and dividers
 * read as drawer and door fronts, which is the wrong part entirely.
 */
function isOpenBay(mod: FurnitureModule): boolean {
  return mod.type === 'shelf' || mod.type === 'shelves' || mod.type === 'dividers' || mod.type === 'frame'
}

function frontClass(mod: FurnitureModule): string {
  if (!anySelected.value || isSelected(mod.id)) return 'bg-primary'
  return 'bg-inverted opacity-10 ring ring-default/60 hover:opacity-10'
}

function moduleClass(mod: FurnitureModule): string {
  const moduleIsSelected = isSelected(mod.id)
  if (isOpenBay(mod)) {
    if (anySelected.value && !moduleIsSelected) return 'module-shelf module-shelf-dim'
    if (moduleIsSelected) return 'module-shelf module-shelf-selected'
    return 'module-shelf'
  }
  // A double-door module is two panels, and the compiler shapes each one; the
  // module rectangle is not a front, so it carries no fill of its own.
  if (mod.type === 'doors') return ''
  return frontClass(mod)
}

/** Fill for a board drawn inside an open bay — a real panel, so it is solid. */
function boardClass(mod: FurnitureModule): string {
  return !anySelected.value || isSelected(mod.id) ? 'bg-primary' : 'bg-inverted opacity-25'
}

/** A board's drawn thickness in px, never thinner than a hairline. */
function boardThicknessPx(): string {
  return `${Math.max(2, Math.round(props.config.panelThickness * pxPerMeter.value))}px`
}

function meterToPx(m: number): number {
  if (!Number.isFinite(m) || m <= 0) return 0
  return Math.round(m * pxPerMeter.value)
}

function px(m: number): string {
  return `${meterToPx(m)}px`
}

function formatMeasurement(n: number): string {
  return Number.isFinite(n) ? String(n) : ''
}

function pullHoleEdgeInset(): number {
  return props.config.pullHoleEdgeInset
}

function pullDiameterPx(): number {
  return Math.max(3, Math.round(props.config.pullHoleDiameter * pxPerMeter.value))
}

function pullEdgeInsetPx(): number {
  return Math.round(pullHoleEdgeInset() * pxPerMeter.value)
}

function pullPairHalfGapPx(): number {
  return Math.round((props.config.pullHolePairGap / 2) * pxPerMeter.value)
}

function visualBgClass(): string {
  return 'bg-[var(--ui-bg-muted)]'
}

function leftDoorPullStyle(): Record<string, string> {
  const d = pullDiameterPx()
  const r = d / 2
  const inset = pullEdgeInsetPx()
  return {
    width: `${d}px`,
    height: `${d}px`,
    top: `${inset - r}px`,
    right: `${inset - r}px`,
  }
}

function rightDoorPullStyle(): Record<string, string> {
  const d = pullDiameterPx()
  const r = d / 2
  const inset = pullEdgeInsetPx()
  return {
    width: `${d}px`,
    height: `${d}px`,
    top: `${inset - r}px`,
    left: `${inset - r}px`,
  }
}

function doorsPullStyle(side: 'left' | 'right'): Record<string, string> {
  const d = pullDiameterPx()
  const r = d / 2
  const inset = pullEdgeInsetPx()
  const halfGap = pullPairHalfGapPx()
  const offset = side === 'left' ? -halfGap : halfGap
  return {
    width: `${d}px`,
    height: `${d}px`,
    top: `${inset - r}px`,
    left: `calc(50% + ${offset - r}px)`,
  }
}

/**
 * One leaf of a double-door module. They are drawn as two elements rather than
 * one fill with a line down it so that a shaped outline clips each leaf, the
 * way the compiler shapes each of the two door panels — a single arch spanning
 * the pair is a different piece of furniture.
 */
function doorLeafStyle(side: 'left' | 'right'): Record<string, string> {
  const halfGap = 1
  return {
    top: '0',
    bottom: '0',
    [side]: '0',
    width: `calc(50% - ${halfGap}px)`,
    ...(doorClipPath.value ? { clipPath: doorClipPath.value } : {}),
  }
}

function drawerPullStyle(mod: FurnitureModule, drawerIndex: number, side: 'left' | 'right'): Record<string, string> {
  const d = pullDiameterPx()
  const r = d / 2
  const total = drawerCount(mod)
  const topM = (drawerIndex / total) * mod.height
  const bottomM = ((drawerIndex - 1) / total) * mod.height
  let centreM = topM - pullHoleEdgeInset()
  const minCentre = bottomM + props.config.pullHoleDiameter / 2
  const maxCentre = topM - props.config.pullHoleDiameter / 2
  if (centreM < minCentre) centreM = minCentre
  if (centreM > maxCentre) centreM = maxCentre
  const pct = (centreM / mod.height) * 100
  const halfGap = pullPairHalfGapPx()
  const offset = side === 'left' ? -halfGap : halfGap
  return {
    width: `${d}px`,
    height: `${d}px`,
    left: `calc(50% + ${offset - r}px)`,
    bottom: `calc(${pct}% - ${r}px)`,
  }
}

function drawerCount(mod: FurnitureModule): number {
  return mod.drawerCount as number
}

function shelfCount(mod: FurnitureModule): number {
  return Math.max(1, Math.min(16, Math.round((mod.shelfCount as number) || 1)))
}

function dividerCount(mod: FurnitureModule): number {
  return Math.max(1, Math.min(16, Math.round((mod.dividerCount as number) || 1)))
}

// --- Front-panel outlines -------------------------------------------------
//
// An outline lives in its panel's own width x height plane. Only the roles the
// compiler emits as `vertical-xy` — door and drawer fronts — have that plane
// facing the viewer, so only those can show in a front elevation. A shaped
// side panel is arched across its *depth*, which this view genuinely cannot
// represent, and shouldn't pretend to.

/** CSS `polygon()` for an outline, or null when the front is rectangular. */
function frontClipPath(role: 'door-front'): string | null {
  const profile = outlineProfile(props.outlines?.[role])
  if (!profile || profile.length < 3) return null
  // Normalized (-0.5..0.5, +y up) to CSS percentages (+y down).
  const points = profile
    .map(p => `${((p.x + 0.5) * 100).toFixed(3)}% ${((0.5 - p.y) * 100).toFixed(3)}%`)
    .join(', ')
  return `polygon(${points})`
}

const doorClipPath = computed(() => frontClipPath('door-front'))

/**
 * True only for single-door modules, where the module rectangle *is* the front
 * panel, so clipping it is exact. A double-door module clips its two leaves
 * individually instead — see `doorLeafStyle`.
 *
 * Open shelves, dividers, and frames have no front at all. Drawers do, but a
 * drawer module holds N stacked fronts and the bands here are drawn as
 * separators over a single fill — clipping the module would cut only the top
 * drawer and leave the rest square, which reads as a design rather than a
 * limitation. Until the bands are real elements, drawer-front outlines are
 * left out of this view; see docs/woodworking-port.md.
 */
function hasFrontOutline(mod: FurnitureModule): boolean {
  return (mod.type === 'left-door' || mod.type === 'right-door') && doorClipPath.value !== null
}

/** Applied to a module whose front carries a shaped outline. */
function frontClipStyle(mod: FurnitureModule): Record<string, string> {
  return hasFrontOutline(mod) && doorClipPath.value ? { clipPath: doorClipPath.value } : {}
}

// --- Face frame (mirrors `compileFrame` in shared/domain/assembly.ts) ---

function frameRailCount(mod: FurnitureModule): number {
  return Math.max(0, Math.min(8, Math.round((mod.frameRailCount as number) || 0)))
}

function frameStileCount(mod: FurnitureModule): number {
  return Math.max(0, Math.min(8, Math.round((mod.frameStileCount as number) || 0)))
}

/** Member size in metres, clamped the same way the compiler clamps it. */
function frameMemberMeters(columnWidth: number, mod: FurnitureModule): number {
  return Math.min(FRAME_MEMBER_WIDTH, Math.max(0.001, Math.min(columnWidth, mod.height) / 3))
}

/** Member width in px, clamped the same way the compiler clamps it. */
function frameMemberPx(columnWidth: number, mod: FurnitureModule): number {
  return Math.max(1, Math.round(frameMemberMeters(columnWidth, mod) * pxPerMeter.value))
}

/**
 * The module button carries the column's padding, so its width is not the
 * column width. Positions are therefore expressed as a fraction of the
 * button's own box — which is exactly what a CSS percentage resolves against —
 * rather than converted through a pixel width the button does not have.
 */
function frameOffsetFractions(span: number, member: number, interior: number): number[] {
  return frameMemberOffsets(1, span > 0 ? member / span : 0, interior)
}

/** Outer stiles hug the sides; interior ones leave equal openings between them. */
function frameStileStyle(columnWidth: number, mod: FurnitureModule, index: number): Record<string, string> {
  const member = frameMemberPx(columnWidth, mod)
  if (index === 0) return { left: '0px', width: `${member}px` }
  if (index === 1) return { right: '0px', width: `${member}px` }
  const buttonWidth = Math.max(0.001, columnWidth - (2 * qt) / pxPerMeter.value)
  const fractions = frameOffsetFractions(buttonWidth, frameMemberMeters(columnWidth, mod), frameStileCount(mod))
  const fraction = fractions[index - 1] ?? 0.5
  return { left: `calc(${fraction * 100}% - ${member / 2}px)`, width: `${member}px` }
}

/** Rails span between the outer stiles, so the frame reads as a joined grid. */
function frameRailStyle(columnWidth: number, mod: FurnitureModule, index: number): Record<string, string> {
  const member = frameMemberPx(columnWidth, mod)
  const inset = { left: `${member}px`, right: `${member}px` }
  if (index === 0) return { ...inset, bottom: '0px', height: `${member}px` }
  if (index === 1) return { ...inset, top: '0px', height: `${member}px` }
  const fractions = frameOffsetFractions(mod.height, frameMemberMeters(columnWidth, mod), frameRailCount(mod))
  const fraction = fractions[index - 1] ?? 0.5
  return { ...inset, bottom: `calc(${fraction * 100}% - ${member / 2}px)`, height: `${member}px` }
}

function spacerStyle(axis: 'width' | 'height'): Record<string, string> {
  return axis === 'width' ? { width: `${We}px` } : { height: `${We}px` }
}

function columnResizeMarginStyle(): Record<string, string> {
  const margin = Ke / 2
  return {
    marginLeft: `${margin}px`,
    marginRight: `${margin}px`,
  }
}

function metaGap(): string {
  return `${We + Ke}px`
}

function columnLetter(index: number): string {
  let n = index
  let s = ''
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
    if (n < 0) break
  }
  return s
}

// --- Module-boundary drag (resize a module's height) ---
interface BoundaryDragState {
  columnIndex: number
  boundaryIndex: number
  startY: number
  targets: { columnIndex: number, moduleIndex: number, startHeight: number }[]
}

const boundaryDrag = ref<BoundaryDragState | null>(null)

function onBoundaryPointerDown(columnIndex: number, boundaryIndex: number, ev: PointerEvent) {
  const col = props.columns[columnIndex]
  if (!col || col.modules.length === 0) return
  ev.preventDefault()
  ev.stopPropagation()
  cancelBoundaryDrag()

  // Identify the module just below the boundary
  const adjacentIndex = boundaryIndex - 1
  if (boundaryIndex < 0 || boundaryIndex > col.modules.length) return
  const adjacentModule = col.modules[adjacentIndex]

  // Multi-target rule: if the adjacent module is in the selection AND multiple
  // modules are selected → drag heights for all selected modules. Otherwise
  // just the one adjacent module.
  let targets: { columnIndex: number, moduleIndex: number, startHeight: number }[]
  if (selectedSet.value.size > 1 && adjacentModule != null && selectedSet.value.has(adjacentModule.id)) {
    targets = []
    props.columns.forEach((c, ci) => {
      c.modules.forEach((m, mi) => {
        if (selectedSet.value.has(m.id)) {
          targets.push({ columnIndex: ci, moduleIndex: mi, startHeight: m.height })
        }
      })
    })
  }
  else if (adjacentModule != null) {
    targets = [{ columnIndex, moduleIndex: adjacentIndex, startHeight: adjacentModule.height }]
  }
  else {
    targets = []
  }

  boundaryDrag.value = {
    columnIndex,
    boundaryIndex,
    startY: ev.clientY,
    targets,
  }

  window.addEventListener('pointermove', onBoundaryPointerMove)
  window.addEventListener('pointerup', cancelBoundaryDrag)
  window.addEventListener('pointercancel', cancelBoundaryDrag)
}

function onBoundaryPointerMove(ev: PointerEvent) {
  const drag = boundaryDrag.value
  if (!drag) return
  const dy = ev.clientY - drag.startY
  // Negative dy → bigger module height (the boundary moved up).
  const deltaMeters = -dy / pxPerMeter.value
  for (const t of drag.targets) {
    emit('set-module-height', t.columnIndex, t.moduleIndex, t.startHeight + deltaMeters)
  }
}

function cancelBoundaryDrag() {
  boundaryDrag.value = null
  window.removeEventListener('pointermove', onBoundaryPointerMove)
  window.removeEventListener('pointerup', cancelBoundaryDrag)
  window.removeEventListener('pointercancel', cancelBoundaryDrag)
}

onBeforeUnmount(cancelBoundaryDrag)

// --- Click handlers ---
function onModuleClick(ev: MouseEvent, moduleId: string) {
  emit('toggle-module-selection', moduleId, ev.shiftKey)
}

function onColumnResizePointerDown(columnIndex: number, direction: 1 | -1, ev: PointerEvent) {
  emit('column-resize-start', columnIndex, direction, ev)
}

function columnTotalHeight(col: FurnitureColumn): number {
  return col.modules.reduce((sum, mod) => sum + mod.height, 0)
}

/**
 * The module stack is exactly as tall as the modules in it. Decks and boundary
 * handles are drawn over the boundaries rather than laid out between them:
 * when they took layout space, a column split into two modules came out taller
 * than a column holding one module of the same height, and the drawing said
 * the two pieces were different sizes when the 3D said they were not.
 */
function columnStackHeight(col: FurnitureColumn): number {
  if (col.modules.length === 0) return 0
  return col.modules.reduce((sum, mod) => sum + meterToPx(mod.height), 0)
}

function columnRenderedHeight(col: FurnitureColumn): number {
  const height = columnStackHeight(col)
  return height > 0 ? height + qt * 2 : 0
}

/**
 * Pixels from the stack's bottom edge to boundary `index` — 0 is the floor,
 * and boundary k is the top of module k−1. The compiler puts a deck on every
 * one of them.
 */
function boundaryOffsetPx(col: FurnitureColumn, index: number): number {
  let offset = 0
  for (let i = 0; i < index; i++) offset += meterToPx(col.modules[i]?.height ?? 0)
  return offset
}

function boundaryHandleStyle(col: FurnitureColumn, index: number): Record<string, string> {
  return { bottom: `${boundaryOffsetPx(col, index) - zt / 2}px`, height: `${zt}px` }
}

/** A carcass deck's drawn thickness in px, never thinner than a hairline. */
function deckThicknessPx(): number {
  return Math.max(2, Math.round(props.config.panelThickness * pxPerMeter.value))
}

/**
 * A deck straddles its boundary the way the compiler places it, and carries a
 * hairline of background either side. That seam is what makes it read as a
 * separate board: a drawer front and the deck above it are both drawn in the
 * primary fill, so without it the two run together into one slab.
 */
const DECK_SEAM_PX = 1

function deckBandStyle(col: FurnitureColumn, index: number): Record<string, string> {
  const band = deckThicknessPx() + 2 * DECK_SEAM_PX
  return { bottom: `${boundaryOffsetPx(col, index) - band / 2}px`, height: `${band}px` }
}

function boundaryHeight(boundaryIndex: number): number {
  const previous = props.columns[boundaryIndex - 1]
  const next = props.columns[boundaryIndex]
  return Math.max(previous ? columnRenderedHeight(previous) : 0, next ? columnRenderedHeight(next) : 0)
}

const railBodyHeight = computed<number>(() => {
  return props.columns.reduce((maxHeight, col) => Math.max(maxHeight, columnRenderedHeight(col)), 0) + Kl + Bt
})

const railBodyHeightPx = computed<string>(() => `${railBodyHeight.value}px`)

function boundaryHeightPx(boundaryIndex: number): string {
  return `${boundaryHeight(boundaryIndex)}px`
}

// --- Free panels as an elevation overlay ----------------------------------
//
// The rail interleaves a resize divider with every column, so world X cannot
// be scaled straight to pixels. Walking the same accumulation the flex layout
// produces keeps the overlay locked to the columns at any zoom.

/**
 * Where world Y = 0 lands, in pixels above the rail body's bottom edge: the
 * stack is bottom-aligned inside the column's padding, and its bottom edge is
 * the floor the compiler measures from.
 */
const FLOOR_OFFSET_PX = qt

/** Pixels from the rail body's left edge for a world X, in metres (0 = centre). */
function pxForWorldX(x: number): number {
  const half = totalColumnWidthMeters.value / 2
  let cursorMeters = -half
  let cursorPx = We + Ke
  for (const col of props.columns) {
    const next = cursorMeters + Math.max(0, col.width)
    if (x <= next) return cursorPx + (x - cursorMeters) * pxPerMeter.value
    cursorMeters = next
    cursorPx += Math.round(Math.max(0, col.width) * pxPerMeter.value) + We + Ke
  }
  // Past the last column — keep extending at scale so the panel still lands.
  return cursorPx + (x - cursorMeters) * pxPerMeter.value
}

/**
 * A front elevation shows each panel's X and Y extent, whichever axis carries
 * its thickness — so a side panel correctly reads as a narrow vertical strip.
 */
function freePanelStyle(panel: FreePanel): Record<string, string> {
  const left = pxForWorldX(panel.position.x - panel.size.x / 2)
  const right = pxForWorldX(panel.position.x + panel.size.x / 2)
  const bottom = FLOOR_OFFSET_PX + (panel.position.y - panel.size.y / 2) * pxPerMeter.value
  return {
    left: `${Math.round(left)}px`,
    width: `${Math.max(1, Math.round(right - left))}px`,
    bottom: `${Math.round(bottom)}px`,
    height: `${Math.max(3, Math.round(panel.size.y * pxPerMeter.value))}px`,
  }
}

function addButtonMarginTop(boundaryIndex: number): string {
  const adjacentHeight = boundaryHeight(boundaryIndex)
  const top = railBodyHeight.value - adjacentHeight / 2
  return `${Math.max(0, top - Vl / 2)}px`
}
</script>

<template>
  <div
    class="relative flex h-full min-w-0 flex-col overflow-hidden"
    data-v-b07ba140
    @click="emit('clear-module-selection')"
  >
    <div
      ref="viewportRef"
      class="h-full overflow-auto overscroll-contain"
    >
      <div class="flex min-h-full min-w-full items-center justify-center p-4 pb-32 sm:pb-44">
        <div class="flex w-max items-start justify-center gap-3">
          <button
            type="button"
            aria-label="Add column on the left"
            class="editor-touch-target flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-inverted shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :style="columns.length > 0 ? { marginTop: addButtonMarginTop(0) } : undefined"
            @click.stop="emit('add-column-left')"
          >
            <UIcon
              name="i-lucide-plus"
              class="size-3.5"
            />
          </button>

          <div class="shrink-0 rounded-lg">
            <div
              class="relative flex w-max items-end"
              :style="{ height: railBodyHeightPx }"
            >
              <!-- Free panels sit outside the column grid, so they are drawn
                   as an elevation overlay rather than as modules. They are real
                   boards in the 3D, so they read as solid boards here too. -->
              <div
                v-for="panel in freePanels"
                :key="`free-${panel.id}`"
                class="pointer-events-none absolute z-0 rounded-[2px] bg-primary shadow-sm"
                :style="freePanelStyle(panel)"
                :aria-label="`Free panel ${panel.label}`"
              />
              <div
                v-if="columns.length > 0"
                class="column-resize-hit shrink-0 cursor-col-resize touch-none transition-opacity hover:opacity-75"
                :class="selectedFillClass"
                :style="{ ...spacerStyle('width'), ...columnResizeMarginStyle(), height: boundaryHeightPx(0) }"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize column 1"
                @pointerdown="onColumnResizePointerDown(0, -1, $event)"
              />

              <template
                v-for="(col, ci) in columns"
                :key="ci"
              >
                <div
                  class="flex h-full shrink-0 flex-col justify-end"
                  :style="{ width: px(col.width) }"
                >
                  <div
                    class="flex flex-col items-stretch"
                    :style="{ padding: `${qt}px` }"
                  >
                    <button
                      type="button"
                      class="editor-touch-target self-center flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-inverted shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      :style="{ marginBottom: `${Bt}px` }"
                      :aria-label="`Add module on top of column ${ci + 1}`"
                      @click.stop="emit('add-module-top', ci)"
                    >
                      <UIcon
                        name="i-lucide-plus"
                        class="size-3.5"
                      />
                    </button>

                    <div
                      class="relative flex flex-col-reverse items-stretch"
                      :aria-label="`Column ${ci + 1}, width ${formatMeasurement(col.width)} meters`"
                    >
                      <template
                        v-for="(mod, mi) in col.modules"
                        :key="mod.id"
                      >
                        <button
                          type="button"
                          class="relative block w-full shrink-0 text-left outline-none transition-[opacity,transform,background-color] duration-150 hover:opacity-90 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-default"
                          :class="moduleClass(mod)"
                          :style="{ height: px(mod.height), ...frontClipStyle(mod) }"
                          :aria-label="`${mod.type} module, height ${formatMeasurement(mod.height)} meters`"
                          @click.stop="onModuleClick($event, mod.id)"
                        >
                          <template v-if="mod.type === 'drawer'">
                            <div
                              v-for="i in drawerCount(mod) - 1"
                              :key="`${mod.id}-drawer-sep-${i}`"
                              class="absolute left-0 right-0 bg-[var(--ui-bg-muted)]"
                              :style="{ height: '2px', bottom: `${(i / drawerCount(mod)) * 100}%` }"
                              aria-hidden="true"
                            />
                            <template
                              v-for="i in drawerCount(mod)"
                              :key="`${mod.id}-dr-${i}`"
                            >
                              <div
                                class="absolute rounded-full"
                                :class="visualBgClass()"
                                :style="drawerPullStyle(mod, i, 'left')"
                              />
                              <div
                                class="absolute rounded-full"
                                :class="visualBgClass()"
                                :style="drawerPullStyle(mod, i, 'right')"
                              />
                            </template>
                          </template>

                          <div
                            v-else-if="mod.type === 'left-door'"
                            class="absolute rounded-full"
                            :class="visualBgClass()"
                            :style="leftDoorPullStyle()"
                          />

                          <div
                            v-else-if="mod.type === 'right-door'"
                            class="absolute rounded-full"
                            :class="visualBgClass()"
                            :style="rightDoorPullStyle()"
                          />

                          <template v-else-if="mod.type === 'doors'">
                            <div
                              v-for="side in (['left', 'right'] as const)"
                              :key="`${mod.id}-leaf-${side}`"
                              class="absolute"
                              :class="frontClass(mod)"
                              :style="doorLeafStyle(side)"
                              aria-hidden="true"
                            />
                            <div
                              class="absolute rounded-full"
                              :class="visualBgClass()"
                              :style="doorsPullStyle('left')"
                            />
                            <div
                              class="absolute rounded-full"
                              :class="visualBgClass()"
                              :style="doorsPullStyle('right')"
                            />
                          </template>

                          <template v-else-if="mod.type === 'shelves'">
                            <div
                              v-for="i in shelfCount(mod)"
                              :key="`${mod.id}-shelf-${i}`"
                              class="absolute left-0 right-0"
                              :class="boardClass(mod)"
                              :style="{
                                height: boardThicknessPx(),
                                bottom: `calc(${(i / (shelfCount(mod) + 1)) * 100}% - ${boardThicknessPx()} / 2)`,
                              }"
                              aria-hidden="true"
                            />
                          </template>

                          <template v-else-if="mod.type === 'frame'">
                            <!-- Two outer stiles and two outer rails always,
                                 plus the interior members, matching the 3D. -->
                            <div
                              v-for="i in frameStileCount(mod) + 2"
                              :key="`${mod.id}-stile-${i}`"
                              class="absolute top-0 bottom-0"
                              :class="boardClass(mod)"
                              :style="frameStileStyle(col.width, mod, i - 1)"
                              aria-hidden="true"
                            />
                            <div
                              v-for="i in frameRailCount(mod) + 2"
                              :key="`${mod.id}-rail-${i}`"
                              class="absolute"
                              :class="boardClass(mod)"
                              :style="frameRailStyle(col.width, mod, i - 1)"
                              aria-hidden="true"
                            />
                          </template>

                          <template v-else-if="mod.type === 'dividers'">
                            <div
                              v-for="i in dividerCount(mod)"
                              :key="`${mod.id}-divider-${i}`"
                              class="absolute top-0 bottom-0"
                              :class="boardClass(mod)"
                              :style="{
                                width: boardThicknessPx(),
                                left: `calc(${(i / (dividerCount(mod) + 1)) * 100}% - ${boardThicknessPx()} / 2)`,
                              }"
                              aria-hidden="true"
                            />
                          </template>
                        </button>
                      </template>

                      <!-- Decks and handles are drawn over the boundaries, not
                           laid out between them, so the stack stays exactly as
                           tall as its modules. One deck at the floor, one on
                           top of every module — the same boundaries the
                           compiler puts a `horizontal-deck` panel on. -->
                      <div
                        v-for="bi in col.modules.length + 1"
                        :key="`deck-${bi - 1}`"
                        class="pointer-events-none absolute inset-x-0 z-10 bg-default"
                        :style="deckBandStyle(col, bi - 1)"
                        aria-hidden="true"
                      >
                        <span
                          class="absolute inset-x-0 top-1/2 block -translate-y-1/2"
                          :class="selectedFillClass"
                          :style="{ height: `${deckThicknessPx()}px` }"
                        />
                      </div>

                      <!-- The positioning lives on this wrapper because
                           `.boundary-resize-hit` sets `position: relative`. -->
                      <div
                        v-for="(mod, mi) in col.modules"
                        :key="`${mod.id}-boundary`"
                        class="absolute inset-x-0 z-20"
                        :style="boundaryHandleStyle(col, mi + 1)"
                      >
                        <button
                          type="button"
                          class="boundary-resize-hit block size-full cursor-row-resize"
                          :aria-label="`Resize module boundary ${mi + 1} in column ${ci + 1}`"
                          @pointerdown="onBoundaryPointerDown(ci, mi + 1, $event)"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  class="column-resize-hit shrink-0 cursor-col-resize touch-none transition-opacity hover:opacity-75"
                  :class="selectedFillClass"
                  :style="{ ...spacerStyle('width'), ...columnResizeMarginStyle(), height: boundaryHeightPx(ci + 1) }"
                  role="separator"
                  aria-orientation="vertical"
                  :aria-label="`Resize column ${ci + 1}`"
                  @pointerdown="onColumnResizePointerDown(ci, 1, $event)"
                />
              </template>

              <div
                v-if="columns.length === 0"
                class="flex h-full w-52 items-center justify-center text-sm text-muted"
              >
                No columns yet
              </div>
            </div>

            <div
              v-if="columns.length > 0"
              class="mt-2 flex w-max items-center border-t border-muted pt-2"
              :style="{ columnGap: metaGap(), paddingLeft: metaGap(), paddingRight: metaGap() }"
            >
              <div
                v-for="(col, ci) in columns"
                :key="`meta-${ci}`"
                class="flex shrink-0 flex-col items-center justify-start gap-2"
                :style="{ width: px(col.width) }"
              >
                <button
                  type="button"
                  class="editor-touch-target group relative inline-flex items-center text-xs text-muted transition-transform active:scale-[0.97]"
                  :aria-label="`Remove column ${columnLetter(ci)}`"
                  @click.stop="emit('remove-column', ci)"
                >
                  <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accented text-xs font-bold text-inverted transition-colors group-hover:bg-elevated">
                    <span class="group-hover:hidden">{{ columnLetter(ci) }}</span>
                    <UIcon
                      name="i-lucide-trash-2"
                      class="hidden size-3.5 group-hover:block"
                    />
                  </span>
                </button>
                <p class="text-xs font-semibold tabular-nums text-muted">
                  {{ formatMeasurement(col.width) }} m
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Add column on the right"
            class="editor-touch-target flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-inverted shadow-sm transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :style="columns.length > 0 ? { marginTop: addButtonMarginTop(columns.length) } : undefined"
            @click.stop="emit('add-column-right')"
          >
            <UIcon
              name="i-lucide-plus"
              class="size-3.5"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.module-shelf {
  background-color: transparent;
  border: 1px solid var(--ui-primary);
}
.module-shelf-dim {
  background-image: none;
  border-color: var(--ui-border-muted);
}
.module-shelf-selected,
.module-shelf:hover {
  background-image: repeating-linear-gradient(
    135deg,
    var(--ui-primary) 0,
    var(--ui-primary) 6px,
    transparent 6px,
    transparent 12px
  );
}
.module-shelf-dim:hover {
  background-image: repeating-linear-gradient(
    135deg,
    var(--ui-border-muted),
    var(--ui-border-muted) 6px,
    transparent 0,
    transparent 12px
  );
}
.editor-touch-target,
.column-resize-hit,
.boundary-resize-hit {
  position: relative;
}
.editor-touch-target::after {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: 9999px;
}
.column-resize-hit::after {
  content: "";
  position: absolute;
  inset: 0 -10px;
}
.boundary-resize-hit::after {
  content: "";
  position: absolute;
  inset: -10px 0;
}
</style>
