/**
 * Machining operation builders and hole-pattern generators — the pure core
 * behind Woodworking's drilling toolbar (`magicDriller`, `drillHoles`,
 * `drillCountersinks`, `drillCounterbores`, `drillCounterbores2x`, `cutDowels`,
 * `magicCNC`) and its dowel/fixture tools (`magicDowels`, `magicFixture`,
 * `edge2dowel`, `edge2drillbit`, `sketch2dowel`).
 *
 * Coordinates are **panel-local metres**, with the origin at the panel's
 * centre: `x` runs along the panel width, `y` along its height. That is the
 * same frame `compilePartGeometry` cuts in, so a generated pattern needs no
 * further transformation.
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

import type { OperationType, PanelOperation } from './types'

/** Minimum meaningful feature size — anything smaller is dropped. */
export const MIN_FEATURE_SIZE = 5e-4

export interface PanelBox {
  width: number
  height: number
  thickness: number
}

/** Which edge a pattern is measured from. */
export type PatternAnchor = 'top' | 'bottom' | 'left' | 'right' | 'center'

export const PATTERN_ANCHORS: { value: PatternAnchor, label: string }[] = [
  { value: 'top', label: 'Top edge' },
  { value: 'bottom', label: 'Bottom edge' },
  { value: 'left', label: 'Left edge' },
  { value: 'right', label: 'Right edge' },
  { value: 'center', label: 'Centre' },
]

export type PatternKind = 'single' | 'row' | 'grid' | 'edge'

export const PATTERN_KINDS: { value: PatternKind, label: string, hint: string }[] = [
  { value: 'single', label: 'Single', hint: 'One hole at the given offset.' },
  { value: 'row', label: 'Row', hint: 'Evenly spaced holes along one axis.' },
  { value: 'grid', label: 'Grid', hint: 'Rows × columns of holes.' },
  { value: 'edge', label: 'Edge', hint: 'Holes inset from the chosen edge — the usual dowel/confirmat layout.' },
]

export interface HolePatternSpec {
  kind: PatternKind
  anchor: PatternAnchor
  /** Holes along the primary axis. */
  count: number
  /** Holes along the secondary axis. `grid` only. */
  rows?: number
  /** Centre-to-centre spacing along the primary axis, metres. */
  spacing: number
  /** Centre-to-centre spacing along the secondary axis, metres. `grid` only. */
  rowSpacing?: number
  /** Distance from the anchor edge to the first hole centre, metres. */
  inset: number
  /** Offset along the anchor edge, metres. Shifts the whole pattern. */
  offset?: number
}

export interface Point2 {
  x: number
  y: number
}

function clampCount(value: number | undefined, fallback = 1): number {
  if (!Number.isFinite(value) || value == null) return fallback
  return Math.max(1, Math.min(64, Math.round(value)))
}

function finite(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) && value != null ? value : fallback
}

/**
 * Centre of the first hole, given an anchor edge and an inset.
 * Anchors along the vertical edges (`left` / `right`) inset in x; the
 * horizontal ones inset in y; `center` starts at the panel centre.
 */
function anchorOrigin(panel: PanelBox, anchor: PatternAnchor, inset: number, offset: number): Point2 {
  const halfW = panel.width / 2
  const halfH = panel.height / 2
  switch (anchor) {
    case 'left':
      return { x: -halfW + inset, y: offset }
    case 'right':
      return { x: halfW - inset, y: offset }
    case 'top':
      return { x: offset, y: halfH - inset }
    case 'bottom':
      return { x: offset, y: -halfH + inset }
    case 'center':
      return { x: offset, y: inset }
  }
}

/** Unit step along the pattern's primary axis for a given anchor. */
function primaryAxis(anchor: PatternAnchor): Point2 {
  // Patterns run *along* the anchor edge: down a side, across a top.
  return anchor === 'left' || anchor === 'right' ? { x: 0, y: -1 } : { x: 1, y: 0 }
}

/** Unit step along the secondary axis (into the panel from the anchor edge). */
function secondaryAxis(anchor: PatternAnchor): Point2 {
  switch (anchor) {
    case 'left':
      return { x: 1, y: 0 }
    case 'right':
      return { x: -1, y: 0 }
    case 'top':
      return { x: 0, y: -1 }
    case 'bottom':
      return { x: 0, y: 1 }
    case 'center':
      return { x: 0, y: 1 }
  }
}

/**
 * Expand a pattern spec into hole centres, in panel-local metres.
 * Centres outside the panel are dropped rather than clamped — a pattern that
 * overruns the board should lose holes, not stack them on the edge.
 */
export function holePatternPoints(panel: PanelBox, spec: HolePatternSpec): Point2[] {
  const count = clampCount(spec.count)
  const rows = spec.kind === 'grid' ? clampCount(spec.rows, 1) : 1
  const spacing = finite(spec.spacing)
  const rowSpacing = finite(spec.rowSpacing, spacing)
  const inset = finite(spec.inset)
  const offset = finite(spec.offset)

  const origin = anchorOrigin(panel, spec.anchor, inset, offset)
  const primary = primaryAxis(spec.anchor)
  const secondary = secondaryAxis(spec.anchor)

  const primaryCount = spec.kind === 'single' ? 1 : count
  // Centre the run on the anchor origin so a row reads as symmetric.
  const primaryStart = -((primaryCount - 1) * spacing) / 2
  const points: Point2[] = []

  for (let row = 0; row < rows; row++) {
    for (let index = 0; index < primaryCount; index++) {
      const along = primaryStart + index * spacing
      const into = row * rowSpacing
      points.push({
        x: origin.x + primary.x * along + secondary.x * into,
        y: origin.y + primary.y * along + secondary.y * into,
      })
    }
  }

  const halfW = panel.width / 2
  const halfH = panel.height / 2
  return points.filter(p => Math.abs(p.x) <= halfW && Math.abs(p.y) <= halfH)
}

// ---------------------------------------------------------------------------
// Operation builders
// ---------------------------------------------------------------------------

export interface HoleOperationSpec {
  operationType: Extract<OperationType, 'through-hole' | 'dowel-hole' | 'countersink' | 'counterbore'>
  diameter: number
  /** Blind depth, metres. Ignored when `through` is set. */
  depth?: number
  through?: boolean
  face?: 'front' | 'back'
  /** Head recess diameter for countersinks and counterbores. */
  headDiameter?: number
  /** Head recess depth for counterbores. */
  headDepth?: number
  hardwareCode?: string
}

/** Stable id so repeated compiles produce the same operation keys. */
function operationId(panelKey: string, kind: string, index: number): string {
  return `${panelKey}:${kind}:${index}`
}

/** Build one operation per pattern point. */
export function buildHoleOperations(
  panelKey: string,
  panel: PanelBox,
  pattern: HolePatternSpec,
  hole: HoleOperationSpec,
): PanelOperation[] {
  // Guard the *requested* diameter — clamping first would turn 0 into the
  // minimum feature size and silently drill a hole nobody asked for.
  const requested = finite(hole.diameter)
  if (requested < MIN_FEATURE_SIZE) return []
  const diameter = requested

  return holePatternPoints(panel, pattern).map((point, index) => {
    const op: PanelOperation = {
      id: operationId(panelKey, hole.operationType, index),
      operationType: hole.operationType,
      targetPanelKey: panelKey,
      face: hole.face ?? 'front',
      center: { x: point.x, y: point.y },
      cx: point.x,
      cy: point.y,
      diameter,
      through: hole.operationType === 'through-hole' ? true : Boolean(hole.through),
    }
    if (!op.through) op.depth = Math.max(MIN_FEATURE_SIZE, finite(hole.depth, panel.thickness / 2))
    if (hole.operationType === 'countersink' || hole.operationType === 'counterbore') {
      op.headDiameter = Math.max(diameter, finite(hole.headDiameter, diameter * 2))
    }
    if (hole.operationType === 'counterbore') {
      op.headDepth = Math.max(MIN_FEATURE_SIZE, finite(hole.headDepth, diameter))
    }
    if (hole.hardwareCode) op.hardwareCode = hole.hardwareCode
    return op
  })
}

export interface SlotOperationSpec {
  operationType: Extract<OperationType, 'pocket' | 'groove' | 'dado' | 'rabbet'>
  /** Centre of the slot in panel-local metres. */
  x: number
  y: number
  width: number
  height: number
  /** Cut depth into the panel, metres. */
  depth: number
  face?: 'front' | 'back'
  rotation?: number
}

export function buildSlotOperation(panelKey: string, spec: SlotOperationSpec, index = 0): PanelOperation | null {
  const width = finite(spec.width)
  const height = finite(spec.height)
  const depth = finite(spec.depth)
  if (width < MIN_FEATURE_SIZE || height < MIN_FEATURE_SIZE || depth < MIN_FEATURE_SIZE) return null
  return {
    id: operationId(panelKey, spec.operationType, index),
    operationType: spec.operationType,
    targetPanelKey: panelKey,
    face: spec.face ?? 'front',
    center: { x: finite(spec.x), y: finite(spec.y) },
    x: finite(spec.x),
    y: finite(spec.y),
    width,
    height,
    depth,
    rotation: finite(spec.rotation),
  }
}

/**
 * A rabbet runs the full length of one edge, so it is expressed as an edge +
 * depth + width rather than a free rectangle. Returns the equivalent slot.
 */
export function buildRabbetOperation(
  panelKey: string,
  panel: PanelBox,
  edge: 'top' | 'bottom' | 'left' | 'right',
  rabbetWidth: number,
  depth: number,
  index = 0,
): PanelOperation | null {
  const w = finite(rabbetWidth)
  if (w < MIN_FEATURE_SIZE) return null
  const horizontal = edge === 'top' || edge === 'bottom'
  const spec: SlotOperationSpec = horizontal
    ? {
        operationType: 'rabbet',
        x: 0,
        y: edge === 'top' ? panel.height / 2 - w / 2 : -panel.height / 2 + w / 2,
        width: panel.width,
        height: w,
        depth,
      }
    : {
        operationType: 'rabbet',
        x: edge === 'left' ? -panel.width / 2 + w / 2 : panel.width / 2 - w / 2,
        y: 0,
        width: w,
        height: panel.height,
        depth,
      }
  return buildSlotOperation(panelKey, spec, index)
}

// ---------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------

/** Operations that remove a cylinder of material. */
export function isHoleOperation(op: PanelOperation): boolean {
  return op.operationType === 'through-hole'
    || op.operationType === 'dowel-hole'
    || op.operationType === 'countersink'
    || op.operationType === 'counterbore'
}

/** Operations that remove a rectangular prism. */
export function isSlotOperation(op: PanelOperation): boolean {
  return op.operationType === 'pocket'
    || op.operationType === 'groove'
    || op.operationType === 'dado'
    || op.operationType === 'rabbet'
    || op.operationType === 'rail-cut'
}

/** Depth a blind operation reaches, clamped to the panel. `null` = through. */
export function effectiveDepth(op: PanelOperation, thickness: number): number | null {
  if (op.through) return null
  const depth = finite(op.depth, thickness / 2)
  return Math.max(MIN_FEATURE_SIZE, Math.min(thickness, depth))
}
