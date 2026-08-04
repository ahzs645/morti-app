/**
 * Free-standing panels — the Morti home for Woodworking's free-form panel
 * toolbars, which have no equivalent in a purely parametric model:
 *
 *   start        panelDefaultXY/YX/XZ/ZX/YZ/ZY, magicStart
 *   move & copy  panelMoveXp/Xm/Yp/Ym/Zp/Zm, magicMove, magicAngle
 *   resize       panelResize1..6, magicResizer
 *   face         panelFaceXY/YX/XZ/ZX/YZ/ZY
 *   between      panelBetweenXY/YX/XZ/ZX/YZ/ZY
 *   location     panelMove2Anchor/Center/Face, mapPosition, shelvesEqual
 *   convert      panelCopyXY/YX/XZ/ZX/YZ/ZY, panel2pad
 *
 * A free panel is stored as a **world-space box**: three dimensions and a
 * centre. That is how a woodworker describes a board, and it means the six
 * `panelDefault*` planes are presets rather than six separate stored forms —
 * the plane is recovered from whichever dimension is thinnest.
 *
 * Free panels flow into the same `CompiledAssembly` as the parametric ones, so
 * cutlist, costing, joinery, 3D, and `.morti` export pick them up unchanged.
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

import type { CompiledPanel, PanelRole } from './types'

/** The six construction planes Woodworking's `panelDefault*` tools offer.
 *  The first letter is the panel's length axis, the second its width axis;
 *  the remaining axis carries the thickness. */
export type PanelPlane = 'XY' | 'YX' | 'XZ' | 'ZX' | 'YZ' | 'ZY'

export const PANEL_PLANES: { value: PanelPlane, label: string, hint: string }[] = [
  { value: 'XY', label: 'XY — front', hint: 'Faces front/back. Length across, width up.' },
  { value: 'YX', label: 'YX — front, turned', hint: 'Faces front/back. Length up, width across.' },
  { value: 'XZ', label: 'XZ — horizontal', hint: 'Faces up/down. Length across, width front-to-back.' },
  { value: 'ZX', label: 'ZX — horizontal, turned', hint: 'Faces up/down. Length front-to-back, width across.' },
  { value: 'YZ', label: 'YZ — side', hint: 'Faces left/right. Length up, width front-to-back.' },
  { value: 'ZY', label: 'ZY — side, turned', hint: 'Faces left/right. Length front-to-back, width up.' },
]

export type WorldAxis = 'x' | 'y' | 'z'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface FreePanel {
  id: string
  label: string
  /** World-space dimensions, metres. */
  size: Vec3
  /** World-space centre, metres. */
  position: Vec3
  /** Drives material, grain, banding, drilling, and router profile lookup. */
  role: PanelRole
  /** Grouping for visibility and assembly tools. `null` = ungrouped. */
  groupId: string | null
}

export const DEFAULT_FREE_PANEL_SIZE = { length: 0.6, width: 0.3, thickness: 0.018 }
export const MAX_FREE_PANELS = 512
const MIN_DIMENSION = 0.001
const MAX_DIMENSION = 20
const MAX_COORDINATE = 100

// ---------------------------------------------------------------------------
// Plane ↔ axis mapping
// ---------------------------------------------------------------------------

const PLANE_AXES: Record<PanelPlane, { length: WorldAxis, width: WorldAxis, thickness: WorldAxis }> = {
  XY: { length: 'x', width: 'y', thickness: 'z' },
  YX: { length: 'y', width: 'x', thickness: 'z' },
  XZ: { length: 'x', width: 'z', thickness: 'y' },
  ZX: { length: 'z', width: 'x', thickness: 'y' },
  YZ: { length: 'y', width: 'z', thickness: 'x' },
  ZY: { length: 'z', width: 'y', thickness: 'x' },
}

export function planeAxes(plane: PanelPlane) {
  return PLANE_AXES[plane]
}

/** The axis a panel's thickness runs along — its thinnest dimension. */
export function thicknessAxis(size: Vec3): WorldAxis {
  if (size.x <= size.y && size.x <= size.z) return 'x'
  if (size.y <= size.x && size.y <= size.z) return 'y'
  return 'z'
}

/**
 * Recover the construction plane of a panel from its proportions: the thinnest
 * axis is the thickness, and of the remaining two the larger is the length.
 */
export function panelPlane(size: Vec3): PanelPlane {
  const thickness = thicknessAxis(size)
  const rest: WorldAxis[] = (['x', 'y', 'z'] as WorldAxis[]).filter(axis => axis !== thickness)
  const [a, b] = rest
  const length = size[a] >= size[b] ? a : b
  const width = length === a ? b : a
  const found = (Object.keys(PLANE_AXES) as PanelPlane[]).find((plane) => {
    const axes = PLANE_AXES[plane]
    return axes.thickness === thickness && axes.length === length && axes.width === width
  })
  return found ?? 'XY'
}

/** Build a board lying on the given plane, centred at `position`. */
export function makeFreePanel(args: {
  id: string
  plane: PanelPlane
  position?: Partial<Vec3>
  length?: number
  width?: number
  thickness?: number
  role?: PanelRole
  label?: string
}): FreePanel {
  const axes = PLANE_AXES[args.plane]
  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[axes.length] = args.length ?? DEFAULT_FREE_PANEL_SIZE.length
  size[axes.width] = args.width ?? DEFAULT_FREE_PANEL_SIZE.width
  size[axes.thickness] = args.thickness ?? DEFAULT_FREE_PANEL_SIZE.thickness
  return {
    id: args.id,
    label: args.label ?? `Panel ${args.plane}`,
    size,
    position: { x: 0, y: 0, z: 0, ...args.position },
    role: args.role ?? 'vertical-side',
    groupId: null,
  }
}

// ---------------------------------------------------------------------------
// Sanitizing
// ---------------------------------------------------------------------------

function dimension(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(value * 1_000_000) / 1_000_000))
}

function coordinate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.min(MAX_COORDINATE, Math.max(-MAX_COORDINATE, Math.round(value * 1_000_000) / 1_000_000))
}

const VALID_ROLES = new Set<string>([
  'vertical-side', 'horizontal-deck', 'internal-shelf', 'vertical-divider', 'back-panel',
  'door-front', 'drawer-front', 'drawer-side', 'drawer-back', 'drawer-bottom',
  'frame-rail', 'frame-stile', 'corner-block', 'corner-brace',
])

export function sanitizeFreePanel(input: unknown, fallbackId: string): FreePanel {
  const source = (input ?? {}) as Partial<FreePanel>
  const size = (source.size ?? {}) as Partial<Vec3>
  const position = (source.position ?? {}) as Partial<Vec3>
  return {
    id: typeof source.id === 'string' && source.id.length > 0 ? source.id : fallbackId,
    label: typeof source.label === 'string' && source.label.trim().length > 0
      ? source.label.trim().slice(0, 60)
      : 'Panel',
    size: {
      x: dimension(size.x, DEFAULT_FREE_PANEL_SIZE.length),
      y: dimension(size.y, DEFAULT_FREE_PANEL_SIZE.width),
      z: dimension(size.z, DEFAULT_FREE_PANEL_SIZE.thickness),
    },
    position: {
      x: coordinate(position.x),
      y: coordinate(position.y),
      z: coordinate(position.z),
    },
    role: typeof source.role === 'string' && VALID_ROLES.has(source.role) ? source.role as PanelRole : 'vertical-side',
    groupId: typeof source.groupId === 'string' && source.groupId.length > 0 ? source.groupId : null,
  }
}

export function sanitizeFreePanels(input: unknown): FreePanel[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, MAX_FREE_PANELS).map((panel, index) => sanitizeFreePanel(panel, `free-${index}`))
}

// ---------------------------------------------------------------------------
// Compiling
// ---------------------------------------------------------------------------

/** Rotation and width/height mapping for each thickness axis, matching the
 *  parametric compiler's `panelRotation`. */
const ORIENTATION_FOR_THICKNESS: Record<WorldAxis, {
  orientation: NonNullable<CompiledPanel['orientation']>
  rotation: [number, number, number]
  widthAxis: WorldAxis
  heightAxis: WorldAxis
}> = {
  z: { orientation: 'vertical-xy', rotation: [0, 0, 0], widthAxis: 'x', heightAxis: 'y' },
  y: { orientation: 'horizontal-xz', rotation: [-Math.PI / 2, 0, 0], widthAxis: 'x', heightAxis: 'z' },
  x: { orientation: 'vertical-yz', rotation: [0, Math.PI / 2, 0], widthAxis: 'z', heightAxis: 'y' },
}

/**
 * Turn free panels into compiled panels.
 *
 * Keys are namespaced `free:<id>` so they can never collide with the
 * `column-module-role` keys the parametric compiler mints.
 */
export function compileFreePanels(panels: FreePanel[]): CompiledPanel[] {
  return panels.map((panel) => {
    const axis = thicknessAxis(panel.size)
    const mapping = ORIENTATION_FOR_THICKNESS[axis]
    return {
      key: `free:${panel.id}`,
      role: panel.role,
      width: Math.max(MIN_DIMENSION, panel.size[mapping.widthAxis]),
      height: Math.max(MIN_DIMENSION, panel.size[mapping.heightAxis]),
      thickness: Math.max(MIN_DIMENSION, panel.size[axis]),
      position: [panel.position.x, panel.position.y, panel.position.z] as [number, number, number],
      rotation: mapping.rotation,
      operations: [],
      orientation: mapping.orientation,
    }
  })
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface Bounds {
  min: Vec3
  max: Vec3
}

export function panelBounds(panel: FreePanel): Bounds {
  return {
    min: {
      x: panel.position.x - panel.size.x / 2,
      y: panel.position.y - panel.size.y / 2,
      z: panel.position.z - panel.size.z / 2,
    },
    max: {
      x: panel.position.x + panel.size.x / 2,
      y: panel.position.y + panel.size.y / 2,
      z: panel.position.z + panel.size.z / 2,
    },
  }
}

/** Bounding box of a set of panels. `null` when the set is empty. */
export function combinedBounds(panels: FreePanel[]): Bounds | null {
  if (panels.length === 0) return null
  const first = panelBounds(panels[0])
  const bounds: Bounds = { min: { ...first.min }, max: { ...first.max } }
  for (const panel of panels.slice(1)) {
    const box = panelBounds(panel)
    for (const axis of ['x', 'y', 'z'] as WorldAxis[]) {
      bounds.min[axis] = Math.min(bounds.min[axis], box.min[axis])
      bounds.max[axis] = Math.max(bounds.max[axis], box.max[axis])
    }
  }
  return bounds
}

/** `panelMoveXp` and friends: nudge by the panel's own thickness. */
export function movedByThickness(panel: FreePanel, axis: WorldAxis, direction: 1 | -1): FreePanel {
  const step = panel.size[thicknessAxis(panel.size)]
  return {
    ...panel,
    position: { ...panel.position, [axis]: coordinate(panel.position[axis] + step * direction) },
  }
}

/** Move by an explicit distance — the `magicMove` case. */
export function movedBy(panel: FreePanel, delta: Partial<Vec3>): FreePanel {
  return {
    ...panel,
    position: {
      x: coordinate(panel.position.x + (delta.x ?? 0)),
      y: coordinate(panel.position.y + (delta.y ?? 0)),
      z: coordinate(panel.position.z + (delta.z ?? 0)),
    },
  }
}

/**
 * `panelResize1..6`: grow or shrink one axis, keeping the opposite face fixed
 * so the panel appears to extend rather than expand about its centre.
 */
export function resizedOnAxis(panel: FreePanel, axis: WorldAxis, delta: number): FreePanel {
  const next = Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, panel.size[axis] + delta))
  const applied = next - panel.size[axis]
  return {
    ...panel,
    size: { ...panel.size, [axis]: next },
    position: { ...panel.position, [axis]: coordinate(panel.position[axis] + applied / 2) },
  }
}

/** `panelFaceXY` and friends: a new panel covering one face of an existing one. */
export function panelFromFace(panel: FreePanel, id: string, thickness?: number): FreePanel {
  const axis = thicknessAxis(panel.size)
  const tape = thickness ?? panel.size[axis]
  const bounds = panelBounds(panel)
  return {
    ...panel,
    id,
    label: `${panel.label} face`,
    size: { ...panel.size, [axis]: tape },
    // Seated against the panel's positive face.
    position: { ...panel.position, [axis]: coordinate(bounds.max[axis] + tape / 2) },
    groupId: panel.groupId,
  }
}

/**
 * `panelBetweenXY` and friends: fill the gap between two panels.
 *
 * The gap is measured on the axis where the two are furthest apart; the new
 * panel spans it and takes the overlap of the other two axes. Returns `null`
 * when the panels overlap on every axis, leaving no gap to fill.
 */
export function panelBetween(a: FreePanel, b: FreePanel, id: string): FreePanel | null {
  const boxA = panelBounds(a)
  const boxB = panelBounds(b)

  let gapAxis: WorldAxis | null = null
  let gapSize = 0
  for (const axis of ['x', 'y', 'z'] as WorldAxis[]) {
    const gap = Math.max(boxA.min[axis] - boxB.max[axis], boxB.min[axis] - boxA.max[axis])
    if (gap > gapSize) {
      gapSize = gap
      gapAxis = axis
    }
  }
  if (!gapAxis || gapSize < MIN_DIMENSION) return null

  const size: Vec3 = { x: 0, y: 0, z: 0 }
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  for (const axis of ['x', 'y', 'z'] as WorldAxis[]) {
    if (axis === gapAxis) {
      const low = Math.max(Math.min(boxA.max[axis], boxB.max[axis]), Math.min(boxA.min[axis], boxB.min[axis]))
      const high = Math.min(Math.max(boxA.min[axis], boxB.min[axis]), Math.max(boxA.max[axis], boxB.max[axis]))
      size[axis] = Math.max(MIN_DIMENSION, high - low)
      position[axis] = coordinate((low + high) / 2)
    }
    else {
      const min = Math.max(boxA.min[axis], boxB.min[axis])
      const max = Math.min(boxA.max[axis], boxB.max[axis])
      // No overlap on this axis — fall back to the union so the panel still
      // reaches both, rather than collapsing to nothing.
      const useUnion = max - min < MIN_DIMENSION
      const low = useUnion ? Math.min(boxA.min[axis], boxB.min[axis]) : min
      const high = useUnion ? Math.max(boxA.max[axis], boxB.max[axis]) : max
      size[axis] = Math.max(MIN_DIMENSION, high - low)
      position[axis] = coordinate((low + high) / 2)
    }
  }

  return { id, label: 'Panel between', size, position, role: a.role, groupId: a.groupId }
}

/** `panelCopyXY` and friends: duplicate, re-oriented onto another plane. */
export function copiedToPlane(panel: FreePanel, id: string, plane: PanelPlane): FreePanel {
  const axis = thicknessAxis(panel.size)
  const rest = (['x', 'y', 'z'] as WorldAxis[]).filter(a => a !== axis)
  const [a, b] = rest
  const length = Math.max(panel.size[a], panel.size[b])
  const width = Math.min(panel.size[a], panel.size[b])
  return makeFreePanel({
    id,
    plane,
    position: panel.position,
    length,
    width,
    thickness: panel.size[axis],
    role: panel.role,
    label: `${panel.label} copy`,
  })
}

/** `panelMove2Center`: centre a panel on a set of others. */
export function centeredOn(panel: FreePanel, others: FreePanel[]): FreePanel {
  const bounds = combinedBounds(others)
  if (!bounds) return panel
  return {
    ...panel,
    position: {
      x: coordinate((bounds.min.x + bounds.max.x) / 2),
      y: coordinate((bounds.min.y + bounds.max.y) / 2),
      z: coordinate((bounds.min.z + bounds.max.z) / 2),
    },
  }
}

/**
 * `shelvesEqual`: distribute panels evenly along an axis between the outermost
 * two, which stay put. Fewer than three panels have nothing to distribute.
 */
export function equallySpaced(panels: FreePanel[], axis: WorldAxis): FreePanel[] {
  if (panels.length < 3) return panels
  const ordered = [...panels].sort((a, b) => a.position[axis] - b.position[axis])
  const first = ordered[0].position[axis]
  const last = ordered[ordered.length - 1].position[axis]
  const step = (last - first) / (ordered.length - 1)
  const byId = new Map(
    ordered.map((panel, index) => [
      panel.id,
      index === 0 || index === ordered.length - 1
        ? panel
        : { ...panel, position: { ...panel.position, [axis]: coordinate(first + step * index) } },
    ]),
  )
  // Return in the caller's original order so selection indices stay valid.
  return panels.map(panel => byId.get(panel.id) ?? panel)
}
