/**
 * Occupied space and transport fit — the Morti analogue of Woodworking's
 * `showOccupiedSpace`, plus the transport width/length check `magicSettings`
 * configures.
 *
 * Answers the two questions you ask before building: how much room does the
 * finished piece take up, and will it go through the door / fit in the van?
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

import type { CompiledPanel } from './types'
import { panelAabb } from './joinery'

export interface OccupiedSpace {
  /** Overall size of the assembled piece, metres. */
  size: { x: number, y: number, z: number }
  /** Centre of the bounding box, metres. */
  center: { x: number, y: number, z: number }
  /** Bounding-box volume, m³ — not the solid volume, which costing reports. */
  boundingVolumeM3: number
  /** Footprint on the floor, m². */
  footprintM2: number
  panelCount: number
}

const EMPTY: OccupiedSpace = {
  size: { x: 0, y: 0, z: 0 },
  center: { x: 0, y: 0, z: 0 },
  boundingVolumeM3: 0,
  footprintM2: 0,
  panelCount: 0,
}

export function computeOccupiedSpace(panels: CompiledPanel[]): OccupiedSpace {
  if (panels.length === 0) return { ...EMPTY }

  const first = panelAabb(panels[0])
  const min = [...first.min] as [number, number, number]
  const max = [...first.max] as [number, number, number]

  for (const panel of panels.slice(1)) {
    const box = panelAabb(panel)
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], box.min[axis])
      max[axis] = Math.max(max[axis], box.max[axis])
    }
  }

  const size = { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] }
  return {
    size,
    center: {
      x: (min[0] + max[0]) / 2,
      y: (min[1] + max[1]) / 2,
      z: (min[2] + max[2]) / 2,
    },
    boundingVolumeM3: size.x * size.y * size.z,
    footprintM2: size.x * size.z,
    panelCount: panels.length,
  }
}

export interface TransportLimits {
  /** Maximum opening width, metres. 0 disables the check. */
  width: number
  /** Maximum opening height, metres. 0 disables the check. */
  height: number
  /** Maximum load length, metres. 0 disables the check. */
  length: number
}

export const DEFAULT_TRANSPORT_LIMITS: TransportLimits = { width: 0, height: 0, length: 0 }

export interface TransportFit {
  /** True when the assembled piece passes every enabled limit. */
  fitsAssembled: boolean
  /** Limits that the assembled piece exceeds. */
  exceeded: ('width' | 'height' | 'length')[]
  /** True when no limit is set, so nothing was actually checked. */
  unchecked: boolean
}

/**
 * Check the assembled piece against transport limits.
 *
 * `width` and `height` describe a two-dimensional **opening** — a doorway, a
 * lift, a tailgate. What has to pass through it is the piece's cross-section,
 * so the check uses its two *smallest* dimensions and lets it be turned either
 * way round. The longest dimension slides through the opening lengthwise and
 * is unconstrained by it; that is exactly how a wardrobe goes through a door.
 *
 * `length` is a separate one-dimensional limit on the load bed, so it
 * constrains the piece's longest dimension.
 */
export function checkTransportFit(space: OccupiedSpace, limits: TransportLimits): TransportFit {
  const enabled = (['width', 'height', 'length'] as const).filter(key => limits[key] > 0)
  if (enabled.length === 0) return { fitsAssembled: true, exceeded: [], unchecked: true }

  const [smallest, middle, longest] = [space.size.x, space.size.y, space.size.z].sort((a, b) => a - b)
  const exceeded: ('width' | 'height' | 'length')[] = []

  if (limits.width > 0 || limits.height > 0) {
    const maxWidth = limits.width > 0 ? limits.width : Number.POSITIVE_INFINITY
    const maxHeight = limits.height > 0 ? limits.height : Number.POSITIVE_INFINITY
    const upright = smallest <= maxWidth && middle <= maxHeight
    const turned = middle <= maxWidth && smallest <= maxHeight
    if (!upright && !turned) {
      if (limits.width > 0) exceeded.push('width')
      if (limits.height > 0) exceeded.push('height')
    }
  }

  if (limits.length > 0 && longest > limits.length) exceeded.push('length')

  return { fitsAssembled: exceeded.length === 0, exceeded, unchecked: false }
}
