/**
 * Non-rectangular panel outlines — the Morti analogue of Woodworking's
 * irregular-shapes toolbar (`panelSideLeft`, `panelSideRight`,
 * `panelSideLeftUP`, `panelSideRightUP`, `panelBackOut`, `panelCoverXY`,
 * `sketch2pad`, `wires2pad`, `magicManager`) and the curve tools
 * (`roundCurve`, `align2Curve`).
 *
 * Upstream these build a FreeCAD sketch and pad it. Here an outline is a
 * **2D profile in panel-local, normalized coordinates** that the compiler
 * extrudes to the panel's thickness. Normalized means the outline is
 * expressed in the unit square (-0.5 … +0.5 on each axis) and scales with the
 * panel, so a shaped side keeps its shape as the design is resized.
 *
 * Rectangular panels — the overwhelming majority — carry no outline at all and
 * stay on the compiler's fast box path.
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

import type { PanelRole } from './types'
import { ALL_PANEL_ROLES } from './panel-attributes'

/** Point in normalized panel-local space: -0.5 … +0.5 on both axes. */
export interface OutlinePoint {
  x: number
  y: number
  /** Corner radius as a fraction of the shorter panel side. 0 = sharp. */
  radius?: number
}

export type OutlineShape =
  | 'rectangle'
  | 'cut-top-left'
  | 'cut-top-right'
  | 'cut-bottom-left'
  | 'cut-bottom-right'
  | 'taper-top'
  | 'taper-bottom'
  | 'arch-top'
  | 'notch-back'
  | 'rounded'
  | 'custom'

export const OUTLINE_SHAPES: { value: OutlineShape, label: string, hint: string }[] = [
  { value: 'rectangle', label: 'Rectangle', hint: 'Plain rectangular panel — the fast path.' },
  { value: 'cut-top-left', label: 'Cut top-left', hint: 'Corner cut away (panelSideLeftUP).' },
  { value: 'cut-top-right', label: 'Cut top-right', hint: 'Corner cut away (panelSideRightUP).' },
  { value: 'cut-bottom-left', label: 'Cut bottom-left', hint: 'Corner cut away (panelSideLeft).' },
  { value: 'cut-bottom-right', label: 'Cut bottom-right', hint: 'Corner cut away (panelSideRight).' },
  { value: 'taper-top', label: 'Taper to top', hint: 'Narrows towards the top (panel2taper).' },
  { value: 'taper-bottom', label: 'Taper to bottom', hint: 'Narrows towards the bottom (panel2taper).' },
  { value: 'arch-top', label: 'Arched top', hint: 'Curved top edge (roundCurve / align2Curve).' },
  { value: 'notch-back', label: 'Back notch', hint: 'Notch cut from the back edge for a skirting or pipe (panelBackOut).' },
  { value: 'rounded', label: 'Rounded corners', hint: 'All four corners rounded (panelCoverXY).' },
  { value: 'custom', label: 'Custom outline', hint: 'Hand-placed points (sketch2pad / wires2pad).' },
]

export interface PanelOutline {
  shape: OutlineShape
  /** How much of the panel the shape consumes, 0…1 of the shorter side. */
  amount: number
  /** Points for `custom`, in normalized coordinates. */
  points: OutlinePoint[]
}

export type OutlineMap = Record<PanelRole, PanelOutline>

export const DEFAULT_OUTLINE_AMOUNT = 0.25
const MAX_CUSTOM_POINTS = 64
/** Segments used to approximate an arc. Enough to read as a curve in 3D. */
const ARC_SEGMENTS = 16

export function defaultOutline(): PanelOutline {
  return { shape: 'rectangle', amount: DEFAULT_OUTLINE_AMOUNT, points: [] }
}

export function defaultOutlineMap(): OutlineMap {
  const map = {} as OutlineMap
  for (const role of ALL_PANEL_ROLES) map[role] = defaultOutline()
  return map
}

const SHAPE_VALUES = OUTLINE_SHAPES.map(s => s.value)

function normalizedCoordinate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(-0.5, Math.min(0.5, Math.round(value * 1_000_000) / 1_000_000))
}

export function sanitizeOutline(input: Partial<PanelOutline> | null | undefined): PanelOutline {
  const source = input ?? {}
  const base = defaultOutline()
  const points = Array.isArray(source.points)
    ? source.points.slice(0, MAX_CUSTOM_POINTS).map(point => ({
        x: normalizedCoordinate((point as OutlinePoint)?.x),
        y: normalizedCoordinate((point as OutlinePoint)?.y),
      }))
    : []
  return {
    shape: typeof source.shape === 'string' && SHAPE_VALUES.includes(source.shape as OutlineShape)
      ? source.shape as OutlineShape
      : base.shape,
    amount: typeof source.amount === 'number' && Number.isFinite(source.amount)
      ? Math.max(0.01, Math.min(0.95, Math.round(source.amount * 10_000) / 10_000))
      : base.amount,
    points,
  }
}

export function sanitizeOutlineMap(input: Partial<Record<string, unknown>> | null | undefined): OutlineMap {
  const source = input ?? {}
  const map = {} as OutlineMap
  for (const role of ALL_PANEL_ROLES) {
    map[role] = sanitizeOutline(source[role] as Partial<PanelOutline> | undefined)
  }
  return map
}

/**
 * Whether this outline actually departs from a rectangle. Rectangular panels
 * skip extrusion entirely, which keeps the common case on the fast path.
 */
export function outlineIsShaped(outline: PanelOutline | undefined): boolean {
  if (!outline || outline.shape === 'rectangle') return false
  if (outline.shape === 'custom') return outline.points.length >= 3
  return true
}

/** Compact cutlist note, e.g. `Arched top 25%`. `—` when rectangular. */
export function outlineSummary(outline: PanelOutline | undefined): string {
  if (!outlineIsShaped(outline)) return '—'
  const label = OUTLINE_SHAPES.find(s => s.value === outline!.shape)?.label ?? outline!.shape
  if (outline!.shape === 'custom') return `${label} (${outline!.points.length} pts)`
  return `${label} ${Math.round(outline!.amount * 100)}%`
}

// ---------------------------------------------------------------------------
// Profile generation
// ---------------------------------------------------------------------------

const CORNERS = {
  bottomLeft: { x: -0.5, y: -0.5 },
  bottomRight: { x: 0.5, y: -0.5 },
  topRight: { x: 0.5, y: 0.5 },
  topLeft: { x: -0.5, y: 0.5 },
}

function arcPoints(
  centre: OutlinePoint,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments = ARC_SEGMENTS,
): OutlinePoint[] {
  const points: OutlinePoint[] = []
  for (let index = 0; index <= segments; index++) {
    const angle = startAngle + (endAngle - startAngle) * (index / segments)
    points.push({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius })
  }
  return points
}

/**
 * The outline as a closed ring of normalized points, counter-clockwise.
 * Returns `null` for a plain rectangle so callers can take the fast path.
 */
export function outlineProfile(outline: PanelOutline | undefined): OutlinePoint[] | null {
  if (!outlineIsShaped(outline)) return null
  const { shape, amount, points } = outline!
  const a = Math.max(0.01, Math.min(0.95, amount))

  switch (shape) {
    case 'custom':
      return points.map(point => ({ x: point.x, y: point.y }))

    case 'cut-bottom-left':
      return [
        { x: -0.5 + a, y: -0.5 },
        CORNERS.bottomRight,
        CORNERS.topRight,
        CORNERS.topLeft,
        { x: -0.5, y: -0.5 + a },
      ]

    case 'cut-bottom-right':
      return [
        CORNERS.bottomLeft,
        { x: 0.5 - a, y: -0.5 },
        { x: 0.5, y: -0.5 + a },
        CORNERS.topRight,
        CORNERS.topLeft,
      ]

    case 'cut-top-right':
      return [
        CORNERS.bottomLeft,
        CORNERS.bottomRight,
        { x: 0.5, y: 0.5 - a },
        { x: 0.5 - a, y: 0.5 },
        CORNERS.topLeft,
      ]

    case 'cut-top-left':
      return [
        CORNERS.bottomLeft,
        CORNERS.bottomRight,
        CORNERS.topRight,
        { x: -0.5 + a, y: 0.5 },
        { x: -0.5, y: 0.5 - a },
      ]

    case 'taper-top':
      return [
        CORNERS.bottomLeft,
        CORNERS.bottomRight,
        { x: 0.5 - a, y: 0.5 },
        { x: -0.5 + a, y: 0.5 },
      ]

    case 'taper-bottom':
      return [
        { x: -0.5 + a, y: -0.5 },
        { x: 0.5 - a, y: -0.5 },
        CORNERS.topRight,
        CORNERS.topLeft,
      ]

    case 'arch-top': {
      // Straight sides up to the springing line, then a semi-ellipse over.
      const springY = 0.5 - a
      return [
        CORNERS.bottomLeft,
        CORNERS.bottomRight,
        { x: 0.5, y: springY },
        ...arcPoints({ x: 0, y: springY }, 0.5, 0, Math.PI).map(point => ({
          x: point.x,
          // Squash the circle into the arch height so `amount` controls rise.
          y: springY + (point.y - springY) * (a / 0.5),
        })),
        { x: -0.5, y: springY },
      ]
    }

    case 'notch-back': {
      // A rectangular bite out of the bottom-right (the "back" of a side panel).
      const depth = a
      return [
        CORNERS.bottomLeft,
        { x: 0.5 - depth, y: -0.5 },
        { x: 0.5 - depth, y: -0.5 + depth },
        { x: 0.5, y: -0.5 + depth },
        CORNERS.topRight,
        CORNERS.topLeft,
      ]
    }

    case 'rounded': {
      const r = Math.min(a, 0.49)
      return [
        ...arcPoints({ x: -0.5 + r, y: -0.5 + r }, r, Math.PI, Math.PI * 1.5, 6),
        ...arcPoints({ x: 0.5 - r, y: -0.5 + r }, r, Math.PI * 1.5, Math.PI * 2, 6),
        ...arcPoints({ x: 0.5 - r, y: 0.5 - r }, r, 0, Math.PI * 0.5, 6),
        ...arcPoints({ x: -0.5 + r, y: 0.5 - r }, r, Math.PI * 0.5, Math.PI, 6),
      ]
    }

    default:
      return null
  }
}

/** The profile scaled to a panel's real width and height, in metres. */
export function outlineProfileForPanel(
  outline: PanelOutline | undefined,
  panel: { width: number, height: number },
): OutlinePoint[] | null {
  const profile = outlineProfile(outline)
  if (!profile) return null
  return profile.map(point => ({ x: point.x * panel.width, y: point.y * panel.height }))
}

/**
 * Signed area of the profile, in normalized units. Positive means
 * counter-clockwise. Used to check winding before extruding, and to report how
 * much material a shape removes.
 */
export function profileSignedArea(profile: OutlinePoint[]): number {
  let sum = 0
  for (let index = 0; index < profile.length; index++) {
    const current = profile[index]
    const next = profile[(index + 1) % profile.length]
    sum += current.x * next.y - next.x * current.y
  }
  return sum / 2
}

/** Fraction of the panel's rectangle the outline keeps, 0…1. */
export function outlineAreaFraction(outline: PanelOutline | undefined): number {
  const profile = outlineProfile(outline)
  if (!profile) return 1
  return Math.min(1, Math.abs(profileSignedArea(profile)))
}
