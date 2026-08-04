import { describe, expect, it } from 'vitest'
import {
  type CostingInputRow,
  type CostingRate,
  computeCosting,
  computePanelCosting,
  costingInputsFromGroups,
  panelEdgeLengthM,
  panelFaceAreaM2,
  panelVolumeM3,
  rateForPanel,
} from './costing'
import { DEFAULT_PUBLIC_STYLE } from './defaults'
import { FALLBACK_DENSITY_KG_M3, MATERIAL_PRESETS } from './materials'
import type { CompiledPanel, PublicStyle } from './types'

// 600 × 400 × 18 mm — a plausible shelf board.
const board = { width: 0.6, height: 0.4, thickness: 0.018 }
const rate: CostingRate = { densityKgM3: 700, pricePerM3: 1000, pricePerM2: 50 }

describe('panel geometry', () => {
  it('computes volume, face area, and perimeter', () => {
    expect(panelVolumeM3(board)).toBeCloseTo(0.00432, 10)
    expect(panelFaceAreaM2(board)).toBeCloseTo(0.24, 10)
    expect(panelEdgeLengthM(board)).toBeCloseTo(2, 10)
  })

  it('treats negative or non-finite dimensions as zero', () => {
    expect(panelVolumeM3({ width: -1, height: 0.4, thickness: 0.018 })).toBe(0)
    expect(panelFaceAreaM2({ width: Number.NaN, height: 0.4, thickness: 0.018 })).toBe(0)
  })
})

describe('computePanelCosting', () => {
  it('weighs a panel by its solid volume', () => {
    expect(computePanelCosting(board, rate, 'volume').weightKg).toBeCloseTo(0.00432 * 700, 10)
  })

  it('prices per cubic metre on the volume basis', () => {
    expect(computePanelCosting(board, rate, 'volume').cost).toBeCloseTo(0.00432 * 1000, 10)
  })

  it('prices per square metre of face on the area basis', () => {
    expect(computePanelCosting(board, rate, 'area').cost).toBeCloseTo(0.24 * 50, 10)
  })

  it('reports the same weight regardless of cost basis', () => {
    const byVolume = computePanelCosting(board, rate, 'volume')
    const byArea = computePanelCosting(board, rate, 'area')
    expect(byArea.weightKg).toBeCloseTo(byVolume.weightKg, 10)
  })
})

describe('computeCosting', () => {
  const inputs: CostingInputRow[] = [
    { panelKey: 'a', role: 'internal-shelf', ...board, quantity: 4, rate, materialLabel: 'Oak' },
    { panelKey: 'b', role: 'vertical-side', width: 1.8, height: 0.4, thickness: 0.018, quantity: 2, rate, materialLabel: 'Oak' },
  ]

  it('multiplies each row by its quantity', () => {
    const { rows } = computeCosting(inputs, 'area')
    expect(rows[0].totalFaceAreaM2).toBeCloseTo(0.24 * 4, 10)
    expect(rows[0].totalCost).toBeCloseTo(0.24 * 50 * 4, 10)
  })

  it('sums totals across rows', () => {
    const { totals } = computeCosting(inputs, 'area')
    expect(totals.panelCount).toBe(6)
    expect(totals.faceAreaM2).toBeCloseTo(0.24 * 4 + 0.72 * 2, 10)
    expect(totals.cost).toBeCloseTo((0.24 * 4 + 0.72 * 2) * 50, 10)
  })

  it('returns zeroed totals for no input', () => {
    const { rows, totals } = computeCosting([], 'volume')
    expect(rows).toEqual([])
    expect(totals).toEqual({ panelCount: 0, volumeM3: 0, faceAreaM2: 0, edgeLengthM: 0, weightKg: 0, cost: 0 })
  })

  it('ignores rows with a non-positive quantity', () => {
    const { totals } = computeCosting([{ ...inputs[0], quantity: 0 }], 'area')
    expect(totals.panelCount).toBe(0)
    expect(totals.cost).toBe(0)
  })
})

describe('style bridge', () => {
  const panel = { role: 'vertical-side' } as Pick<CompiledPanel, 'role'>

  it('falls back to generic rates for a custom hex', () => {
    // The default style leaves every part on a custom debug colour.
    expect(rateForPanel(panel, DEFAULT_PUBLIC_STYLE).densityKgM3).toBe(FALLBACK_DENSITY_KG_M3)
  })

  it('picks up the density of an assigned preset', () => {
    const oak = MATERIAL_PRESETS.find(p => p.id === 'white-oak')!
    const style: PublicStyle = {
      ...DEFAULT_PUBLIC_STYLE,
      rendered: {
        ...DEFAULT_PUBLIC_STYLE.rendered,
        materials: {
          ...DEFAULT_PUBLIC_STYLE.rendered.materials,
          sides: { presetId: 'white-oak', customColor: '#000000' },
        },
      },
    }
    const resolved = rateForPanel(panel, style)
    expect(resolved.densityKgM3).toBe(oak.densityKgM3)
    expect(resolved.label).toBe(oak.label)
  })

  it('builds costing inputs from grouped cutlist rows', () => {
    const representative = { key: 'k', role: 'internal-shelf', ...board } as CompiledPanel
    const [input] = costingInputsFromGroups([{ representative, quantity: 3 }], DEFAULT_PUBLIC_STYLE)
    expect(input).toMatchObject({ panelKey: 'k', role: 'internal-shelf', quantity: 3 })
    expect(input.rate.densityKgM3).toBe(FALLBACK_DENSITY_KG_M3)
  })
})
