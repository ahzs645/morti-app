/**
 * Per-role panel attributes — grain direction and edge banding.
 *
 * Woodworking applies `grainH` / `grainV` / `grainX` and `bandApply` to
 * individually selected objects. Morti's carcass panels are *generated* by the
 * compiler, so a panel has no stable hand-picked identity: its key changes as
 * soon as a column is inserted. What is stable is its **role**
 * (`vertical-side`, `internal-shelf`, …), so that is what attributes key off.
 *
 * Free-standing panels added in the free-panel layer carry their own overrides;
 * this module is the fallback every compiled panel resolves through.
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

import type { PanelRole } from './types'
import { type EdgeBandAssignment, NO_EDGE_BANDS, sanitizeEdgeBandAssignment } from './edgeband'

/**
 * Grain orientation relative to the panel face.
 *
 * Maps Woodworking's grain toolbar: `grainH` → `length` (grain runs along the
 * panel's long axis, the default for solid wood), `grainV` → `width` (grain
 * runs across it), `grainX` → `none` (no directional grain — the right answer
 * for MDF, particleboard, and painted panels).
 */
export type GrainDirection = 'length' | 'width' | 'none'

export const GRAIN_DIRECTIONS: { value: GrainDirection, label: string, hint: string }[] = [
  { value: 'length', label: 'Along length', hint: 'Grain runs with the panel’s longer edge (grainH).' },
  { value: 'width', label: 'Across width', hint: 'Grain runs across the panel (grainV).' },
  { value: 'none', label: 'No grain', hint: 'Non-directional sheet goods — MDF, particleboard, paint (grainX).' },
]

export const GRAIN_DIRECTION_CODE: Record<GrainDirection, string> = {
  length: 'L',
  width: 'W',
  none: '—',
}

/** Radians to rotate the triplanar grain sample by, per direction. */
export const GRAIN_DIRECTION_ROTATION: Record<GrainDirection, number> = {
  length: 0,
  width: Math.PI / 2,
  none: 0,
}

export interface PanelAttributes {
  grain: GrainDirection
  bands: EdgeBandAssignment
}

export type PanelAttributeMap = Record<PanelRole, PanelAttributes>

export const ALL_PANEL_ROLES: PanelRole[] = [
  'vertical-side',
  'horizontal-deck',
  'internal-shelf',
  'vertical-divider',
  'back-panel',
  'door-front',
  'drawer-front',
  'drawer-side',
  'drawer-back',
  'drawer-bottom',
  'frame-rail',
  'frame-stile',
  'corner-block',
  'corner-brace',
]

export const PANEL_ROLE_LABEL: Record<PanelRole, string> = {
  'vertical-side': 'Vertical side',
  'horizontal-deck': 'Horizontal deck',
  'internal-shelf': 'Internal shelf',
  'vertical-divider': 'Vertical divider',
  'back-panel': 'Back panel',
  'door-front': 'Door front',
  'drawer-front': 'Drawer front',
  'drawer-side': 'Drawer side',
  'drawer-back': 'Drawer back',
  'drawer-bottom': 'Drawer bottom',
  'frame-rail': 'Frame rail',
  'frame-stile': 'Frame stile',
  'corner-block': 'Corner block',
  'corner-brace': 'Corner brace',
}

export function defaultPanelAttributes(): PanelAttributes {
  // `length` matches how a panel would be cut from a sheet by default, and is
  // inert for the lacquer/custom materials that carry no grain texture anyway.
  return { grain: 'length', bands: { ...NO_EDGE_BANDS } }
}

export function defaultPanelAttributeMap(): PanelAttributeMap {
  const map = {} as PanelAttributeMap
  for (const role of ALL_PANEL_ROLES) map[role] = defaultPanelAttributes()
  return map
}

function sanitizeGrain(value: unknown): GrainDirection {
  return value === 'length' || value === 'width' || value === 'none' ? value : 'length'
}

export function sanitizePanelAttributes(input: Partial<PanelAttributes> | null | undefined): PanelAttributes {
  return {
    grain: sanitizeGrain(input?.grain),
    bands: sanitizeEdgeBandAssignment(input?.bands),
  }
}

export function sanitizePanelAttributeMap(input: Partial<Record<string, unknown>> | null | undefined): PanelAttributeMap {
  const source = input ?? {}
  const map = {} as PanelAttributeMap
  for (const role of ALL_PANEL_ROLES) {
    map[role] = sanitizePanelAttributes(source[role] as Partial<PanelAttributes> | undefined)
  }
  return map
}

/** Attributes for a role, falling back to the defaults for unknown roles. */
export function attributesForRole(map: PanelAttributeMap, role: PanelRole): PanelAttributes {
  return map[role] ?? defaultPanelAttributes()
}

/**
 * Whether the grain texture should be drawn at all. `none` suppresses it even
 * when the assigned material has a grain pattern, which is what `grainX` does.
 */
export function grainVisible(attributes: PanelAttributes): boolean {
  return attributes.grain !== 'none'
}

/**
 * Rotation for the triplanar grain sampler. Panels taller than they are wide
 * have their "length" running vertically, so the along-length direction has to
 * flip to keep the grain following the long edge in both orientations.
 */
export function grainRotationFor(attributes: PanelAttributes, panel: { width: number, height: number }): number {
  if (attributes.grain === 'none') return 0
  const portrait = panel.height > panel.width
  const base = GRAIN_DIRECTION_ROTATION[attributes.grain]
  return portrait ? base + Math.PI / 2 : base
}
