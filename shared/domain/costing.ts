/**
 * Wood weight and material cost rollups — the Morti analogue of the weight and
 * cost columns Woodworking's `getDimensions` produces from the density and
 * price rates configured in `magicSettings`.
 *
 * Everything here is metric SI internally (metres, m², m³, kg) and is rendered
 * through `shared/domain/units.ts` at the presentation layer, so the numbers
 * stay stable regardless of the unit the user has selected.
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

import type { CompiledPanel, CostBasis, PublicStyle } from './types'
import { cabinetPartForRole, resolveMaterial } from './materials'

export type { CostBasis }

export interface CostingRate {
  densityKgM3: number
  pricePerM3: number
  pricePerM2: number
}

export interface PanelCosting {
  /** Solid volume of one panel, m³. */
  volumeM3: number
  /** Face area of one panel counting a single face, m². */
  faceAreaM2: number
  /** Perimeter of one panel, m — the edge length banding is billed against. */
  edgeLengthM: number
  /** Weight of one panel, kg. */
  weightKg: number
  /** Material cost of one panel, in the project currency. */
  cost: number
}

export interface CostingRow extends PanelCosting {
  panelKey: string
  role: string
  quantity: number
  materialLabel: string
  /** Per-panel values multiplied by `quantity`. */
  totalVolumeM3: number
  totalFaceAreaM2: number
  totalEdgeLengthM: number
  totalWeightKg: number
  totalCost: number
}

export interface CostingTotals {
  panelCount: number
  volumeM3: number
  faceAreaM2: number
  edgeLengthM: number
  weightKg: number
  cost: number
}

export interface CostingReport {
  rows: CostingRow[]
  totals: CostingTotals
  basis: CostBasis
}

// ---------------------------------------------------------------------------
// Per-panel geometry
// ---------------------------------------------------------------------------

interface PanelDimensions {
  width: number
  height: number
  thickness: number
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function panelVolumeM3(panel: PanelDimensions): number {
  return nonNegative(panel.width) * nonNegative(panel.height) * nonNegative(panel.thickness)
}

export function panelFaceAreaM2(panel: PanelDimensions): number {
  return nonNegative(panel.width) * nonNegative(panel.height)
}

export function panelEdgeLengthM(panel: PanelDimensions): number {
  return 2 * (nonNegative(panel.width) + nonNegative(panel.height))
}

export function computePanelCosting(panel: PanelDimensions, rate: CostingRate, basis: CostBasis): PanelCosting {
  const volumeM3 = panelVolumeM3(panel)
  const faceAreaM2 = panelFaceAreaM2(panel)
  return {
    volumeM3,
    faceAreaM2,
    edgeLengthM: panelEdgeLengthM(panel),
    weightKg: volumeM3 * nonNegative(rate.densityKgM3),
    cost: basis === 'area'
      ? faceAreaM2 * nonNegative(rate.pricePerM2)
      : volumeM3 * nonNegative(rate.pricePerM3),
  }
}

// ---------------------------------------------------------------------------
// Rollup
// ---------------------------------------------------------------------------

export interface CostingInputRow {
  panelKey: string
  role: string
  width: number
  height: number
  thickness: number
  quantity: number
  rate: CostingRate
  materialLabel: string
}

const EMPTY_TOTALS: CostingTotals = {
  panelCount: 0,
  volumeM3: 0,
  faceAreaM2: 0,
  edgeLengthM: 0,
  weightKg: 0,
  cost: 0,
}

export function computeCosting(inputs: CostingInputRow[], basis: CostBasis): CostingReport {
  const rows: CostingRow[] = []
  const totals: CostingTotals = { ...EMPTY_TOTALS }

  for (const input of inputs) {
    const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? Math.round(input.quantity) : 0
    const per = computePanelCosting(input, input.rate, basis)
    const row: CostingRow = {
      ...per,
      panelKey: input.panelKey,
      role: input.role,
      quantity,
      materialLabel: input.materialLabel,
      totalVolumeM3: per.volumeM3 * quantity,
      totalFaceAreaM2: per.faceAreaM2 * quantity,
      totalEdgeLengthM: per.edgeLengthM * quantity,
      totalWeightKg: per.weightKg * quantity,
      totalCost: per.cost * quantity,
    }
    rows.push(row)
    totals.panelCount += quantity
    totals.volumeM3 += row.totalVolumeM3
    totals.faceAreaM2 += row.totalFaceAreaM2
    totals.edgeLengthM += row.totalEdgeLengthM
    totals.weightKg += row.totalWeightKg
    totals.cost += row.totalCost
  }

  return { rows, totals, basis }
}

// ---------------------------------------------------------------------------
// Style bridge
// ---------------------------------------------------------------------------

/**
 * Look up the rate a compiled panel prices against, by resolving the material
 * assigned to its cabinet part in the project's `PublicStyle`. Panels the user
 * has left on a custom hex fall back to the generic rates in `materials.ts`.
 */
export function rateForPanel(panel: Pick<CompiledPanel, 'role'>, style: PublicStyle): CostingRate & { label: string } {
  const part = cabinetPartForRole(panel.role)
  const assignment = style.rendered.materials[part]
  const fallbackHex = style.rendered.colors.defaultPanel
  const resolved = resolveMaterial(assignment?.presetId, assignment?.customColor ?? '', fallbackHex)
  return {
    densityKgM3: resolved.densityKgM3,
    pricePerM3: resolved.pricePerM3,
    pricePerM2: resolved.pricePerM2,
    label: resolved.label,
  }
}

/**
 * Build costing inputs straight from grouped cutlist rows. `groups` carries one
 * representative panel plus a quantity, matching how `ProjectCutlist.vue`
 * already collapses identical panels.
 */
export function costingInputsFromGroups(
  groups: { representative: CompiledPanel, quantity: number }[],
  style: PublicStyle,
): CostingInputRow[] {
  return groups.map(({ representative, quantity }) => {
    const rate = rateForPanel(representative, style)
    return {
      panelKey: representative.key,
      role: representative.role,
      width: representative.width,
      height: representative.height,
      thickness: representative.thickness,
      quantity,
      rate,
      materialLabel: rate.label,
    }
  })
}
