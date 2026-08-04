/**
 * Router edge profiles — the Morti analogue of Woodworking's router toolbar
 * (`routerCove`, `routerRoundOver`, `routerStraight`, `routerChamfer`, and
 * `multiPocket`, each in 1-, 2-, and 4-edge variants).
 *
 * Upstream a profile is a parametric FreeCAD sketch driven by one bit size,
 * swept along the selected edges. Here a profile is a **declaration** on a
 * panel role — profile kind, bit size, and which edges — that the compiler
 * turns into CSG cutters on every rebuild. The 1/2/4-edge variants collapse
 * into an edge set, which is strictly more expressive than the fixed trio.
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

import { type EdgeBandAssignment, PANEL_EDGES, type PanelEdge } from './edgeband'
import type { PanelRole } from './types'
import { ALL_PANEL_ROLES } from './panel-attributes'

export type RouterProfileKind = 'none' | 'chamfer' | 'round-over' | 'cove' | 'straight' | 'multi-pocket'

export const ROUTER_PROFILES: { value: RouterProfileKind, label: string, hint: string }[] = [
  { value: 'none', label: 'Square edge', hint: 'No routing — the panel keeps its sawn edge.' },
  { value: 'chamfer', label: 'Chamfer', hint: '45° bevel along the edge (routerChamfer).' },
  { value: 'round-over', label: 'Round over', hint: 'Edge rounded to the bit radius (routerRoundOver).' },
  { value: 'cove', label: 'Cove', hint: 'Concave scoop cut into the edge (routerCove).' },
  { value: 'straight', label: 'Straight rebate', hint: 'Square-shouldered slot, twice the bit wide and one bit deep (routerStraight).' },
  { value: 'multi-pocket', label: 'Multi-pocket', hint: 'A run of evenly spaced pockets along the edge (multiPocket).' },
]

/** Which edges a profile is cut on. Mirrors the edge keys used by banding. */
export type ProfileEdgeSelection = Record<PanelEdge, boolean>

export const NO_PROFILE_EDGES: ProfileEdgeSelection = {
  top: false,
  bottom: false,
  left: false,
  right: false,
}

export const ALL_PROFILE_EDGES: ProfileEdgeSelection = {
  top: true,
  bottom: true,
  left: true,
  right: true,
}

export interface RouterProfile {
  kind: RouterProfileKind
  /** Bit radius / bevel size, metres. */
  bitSize: number
  edges: ProfileEdgeSelection
  /** Pockets per edge. `multi-pocket` only. */
  pocketCount: number
}

export type RouterProfileMap = Record<PanelRole, RouterProfile>

export const DEFAULT_BIT_SIZE = 0.006
export const MAX_BIT_SIZE = 0.05

export function defaultRouterProfile(): RouterProfile {
  return { kind: 'none', bitSize: DEFAULT_BIT_SIZE, edges: { ...NO_PROFILE_EDGES }, pocketCount: 3 }
}

export function defaultRouterProfileMap(): RouterProfileMap {
  const map = {} as RouterProfileMap
  for (const role of ALL_PANEL_ROLES) map[role] = defaultRouterProfile()
  return map
}

const PROFILE_KINDS = ROUTER_PROFILES.map(p => p.value)

export function sanitizeRouterProfile(input: Partial<RouterProfile> | null | undefined): RouterProfile {
  const source = input ?? {}
  const base = defaultRouterProfile()
  const edges = { ...NO_PROFILE_EDGES }
  for (const edge of PANEL_EDGES) edges[edge] = source.edges?.[edge] === true
  return {
    kind: typeof source.kind === 'string' && PROFILE_KINDS.includes(source.kind as RouterProfileKind)
      ? source.kind as RouterProfileKind
      : base.kind,
    bitSize: typeof source.bitSize === 'number' && Number.isFinite(source.bitSize) && source.bitSize > 0
      ? Math.min(MAX_BIT_SIZE, Math.round(source.bitSize * 1_000_000) / 1_000_000)
      : base.bitSize,
    edges,
    pocketCount: typeof source.pocketCount === 'number' && Number.isFinite(source.pocketCount)
      ? Math.max(1, Math.min(32, Math.round(source.pocketCount)))
      : base.pocketCount,
  }
}

export function sanitizeRouterProfileMap(input: Partial<Record<string, unknown>> | null | undefined): RouterProfileMap {
  const source = input ?? {}
  const map = {} as RouterProfileMap
  for (const role of ALL_PANEL_ROLES) {
    map[role] = sanitizeRouterProfile(source[role] as Partial<RouterProfile> | undefined)
  }
  return map
}

/** Whether this profile actually removes anything. */
export function profileIsActive(profile: RouterProfile): boolean {
  return profile.kind !== 'none'
    && profile.bitSize > 0
    && PANEL_EDGES.some(edge => profile.edges[edge])
}

export function selectedProfileEdges(profile: RouterProfile): PanelEdge[] {
  return PANEL_EDGES.filter(edge => profile.edges[edge])
}

/** Compact cutlist note, e.g. `chamfer 6 mm T/B`. `—` when square. */
export function routerProfileSummary(profile: RouterProfile): string {
  if (!profileIsActive(profile)) return '—'
  const label = ROUTER_PROFILES.find(p => p.value === profile.kind)?.label ?? profile.kind
  const edges = selectedProfileEdges(profile).map(edge => edge[0].toUpperCase()).join('/')
  return `${label} ${Math.round(profile.bitSize * 1000)} mm ${edges}`
}

// ---------------------------------------------------------------------------
// Cutter placement
// ---------------------------------------------------------------------------

export interface PanelFace {
  width: number
  height: number
  thickness: number
}

/**
 * A cutter to subtract from a panel, in panel-local metres.
 *
 * `box` and `wedge` are subtracted directly. `rounded` is a box with a
 * cylinder removed from it first, which is what turns a square corner into a
 * round-over rather than a cove.
 */
export interface ProfileCutter {
  shape: 'box' | 'wedge' | 'cylinder' | 'rounded'
  /** Centre in panel-local coordinates; z is measured from the panel centre. */
  position: { x: number, y: number, z: number }
  size: { x: number, y: number, z: number }
  /** Rotation about the edge's own axis, radians. `wedge` only. */
  rotation: number
  /** Cylinder radius, for `cylinder` and `rounded`. */
  radius: number
  /** Axis the cylinder runs along, for `cylinder` and `rounded`. */
  axis: 'x' | 'y'
}

/** Length and midpoint of an edge in panel-local coordinates. */
function edgeGeometry(panel: PanelFace, edge: PanelEdge) {
  const halfW = panel.width / 2
  const halfH = panel.height / 2
  const horizontal = edge === 'top' || edge === 'bottom'
  return {
    horizontal,
    length: horizontal ? panel.width : panel.height,
    x: edge === 'left' ? -halfW : edge === 'right' ? halfW : 0,
    y: edge === 'bottom' ? -halfH : edge === 'top' ? halfH : 0,
    /** +1 when the edge is on the positive side of its axis. */
    sign: edge === 'right' || edge === 'top' ? 1 : -1,
  }
}

/**
 * Expand a profile into cutters, one or more per selected edge.
 *
 * Every cutter is clamped so it cannot eat more than the bit size into the
 * panel, and profiles wider than half the panel are skipped rather than
 * cutting the board in two.
 */
export function profileCutters(panel: PanelFace, profile: RouterProfile): ProfileCutter[] {
  if (!profileIsActive(profile)) return []
  const bit = Math.min(profile.bitSize, panel.width / 2, panel.height / 2, MAX_BIT_SIZE)
  if (!(bit > 0)) return []

  const cutters: ProfileCutter[] = []
  const t = panel.thickness

  for (const edge of selectedProfileEdges(profile)) {
    const geometry = edgeGeometry(panel, edge)
    const axis: 'x' | 'y' = geometry.horizontal ? 'x' : 'y'
    // Cutters overrun the edge slightly so the boolean stays watertight.
    const runLength = geometry.length + bit * 2

    const along = (size: number) => (geometry.horizontal
      ? { x: runLength, y: size, z: size }
      : { x: size, y: runLength, z: size })

    const at = (inset: number, z: number) => ({
      x: geometry.horizontal ? 0 : geometry.x - geometry.sign * inset,
      y: geometry.horizontal ? geometry.y - geometry.sign * inset : 0,
      z,
    })

    if (profile.kind === 'chamfer') {
      // A square rotated 45° removes exactly the bevel, as upstream's
      // regular-polygon sketch does.
      const size = bit * Math.SQRT2
      cutters.push({
        shape: 'wedge',
        position: at(0, t / 2),
        size: along(size),
        rotation: Math.PI / 4,
        radius: 0,
        axis,
      })
    }
    else if (profile.kind === 'cove') {
      // A cylinder tangent to the face scoops the edge concave.
      cutters.push({
        shape: 'cylinder',
        position: at(-bit / 2, t / 2),
        size: along(bit * 2),
        rotation: 0,
        radius: bit,
        axis,
      })
    }
    else if (profile.kind === 'round-over') {
      // Corner box minus a quarter cylinder: what remains is the round-over.
      cutters.push({
        shape: 'rounded',
        position: at(bit / 2, t / 2 - bit / 2),
        size: along(bit),
        rotation: 0,
        radius: bit,
        axis,
      })
    }
    else if (profile.kind === 'straight') {
      // Twice the bit wide, one bit deep — upstream's Straight datum pair.
      const slotWidth = bit * 2
      cutters.push({
        shape: 'box',
        position: at(slotWidth / 2 - bit, t / 2 - bit / 2),
        size: geometry.horizontal
          ? { x: runLength, y: slotWidth, z: bit }
          : { x: slotWidth, y: runLength, z: bit },
        rotation: 0,
        radius: 0,
        axis,
      })
    }
    else if (profile.kind === 'multi-pocket') {
      const count = Math.max(1, Math.min(32, Math.round(profile.pocketCount)))
      const pocket = bit * 2
      const span = geometry.length - pocket
      for (let index = 0; index < count; index++) {
        const t01 = count === 1 ? 0.5 : index / (count - 1)
        const offset = -span / 2 + span * t01
        const base = at(pocket / 2, t / 2 - bit / 2)
        cutters.push({
          shape: 'box',
          position: {
            x: geometry.horizontal ? offset : base.x,
            y: geometry.horizontal ? base.y : offset,
            z: base.z,
          },
          size: { x: pocket, y: pocket, z: bit },
          rotation: 0,
          radius: 0,
          axis,
        })
      }
    }
  }

  return cutters
}

/** Edges that carry both banding and a profile — the tape would be cut away. */
export function conflictingEdges(profile: RouterProfile, bands: EdgeBandAssignment): PanelEdge[] {
  if (!profileIsActive(profile)) return []
  return selectedProfileEdges(profile).filter(edge => bands[edge] != null)
}
