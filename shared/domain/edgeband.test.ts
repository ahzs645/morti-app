import { describe, expect, it } from 'vitest'
import {
  EDGE_BAND_LIBRARY,
  type EdgeBandAssignment,
  NO_EDGE_BANDS,
  computeBandList,
  edgeBandSummary,
  edgeLengthM,
  findEdgeBand,
  hasAnyBand,
  sanitizeEdgeBandAssignment,
} from './edgeband'

const abs1 = 'abs-1-22'
const abs2 = 'abs-2-22'

function bands(partial: Partial<EdgeBandAssignment>): EdgeBandAssignment {
  return { ...NO_EDGE_BANDS, ...partial }
}

describe('band library', () => {
  it('finds bands by id and rejects unknown ones', () => {
    expect(findEdgeBand(abs1)?.thicknessMm).toBe(1)
    expect(findEdgeBand('nope')).toBeNull()
    expect(findEdgeBand(null)).toBeNull()
  })

  it('gives every stock band a positive price and size', () => {
    for (const band of EDGE_BAND_LIBRARY) {
      expect(band.thicknessMm).toBeGreaterThan(0)
      expect(band.widthMm).toBeGreaterThan(0)
      expect(band.pricePerM).toBeGreaterThan(0)
    }
  })
})

describe('assignments', () => {
  it('drops unknown band ids on sanitize', () => {
    const clean = sanitizeEdgeBandAssignment({ top: abs1, bottom: 'bogus', left: null })
    expect(clean).toEqual({ top: abs1, bottom: null, left: null, right: null })
  })

  it('treats a missing assignment as bare', () => {
    expect(sanitizeEdgeBandAssignment(null)).toEqual(NO_EDGE_BANDS)
    expect(hasAnyBand(NO_EDGE_BANDS)).toBe(false)
    expect(hasAnyBand(bands({ right: abs1 }))).toBe(true)
  })

  it('summarises banded edges in a stable order', () => {
    expect(edgeBandSummary(NO_EDGE_BANDS)).toBe('—')
    expect(edgeBandSummary(bands({ top: abs1, left: abs1 }))).toBe('T/L')
    expect(edgeBandSummary(bands({ right: abs1, bottom: abs1, top: abs1, left: abs1 }))).toBe('T/B/L/R')
  })
})

describe('edge lengths', () => {
  const panel = { width: 0.6, height: 0.4 }

  it('maps top and bottom to width, left and right to height', () => {
    expect(edgeLengthM(panel, 'top')).toBe(0.6)
    expect(edgeLengthM(panel, 'bottom')).toBe(0.6)
    expect(edgeLengthM(panel, 'left')).toBe(0.4)
    expect(edgeLengthM(panel, 'right')).toBe(0.4)
  })
})

describe('computeBandList', () => {
  const shelf = { width: 0.6, height: 0.4, thickness: 0.018 }

  it('returns nothing for bare panels', () => {
    const report = computeBandList([{ ...shelf, quantity: 4, bands: NO_EDGE_BANDS }])
    expect(report.rows).toEqual([])
    expect(report.totalLengthM).toBe(0)
    expect(report.totalCost).toBe(0)
  })

  it('sums tape length per banded edge and quantity', () => {
    const report = computeBandList([{ ...shelf, quantity: 3, bands: bands({ top: abs1, left: abs1 }) }])
    // (0.6 top + 0.4 left) x 3 panels
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].lengthM).toBeCloseTo(3, 10)
    expect(report.rows[0].edgeCount).toBe(6)
  })

  it('prices tape at its per-metre rate', () => {
    const band = findEdgeBand(abs1)!
    const report = computeBandList([{ ...shelf, quantity: 1, bands: bands({ top: abs1 }) }])
    expect(report.rows[0].cost).toBeCloseTo(0.6 * band.pricePerM, 10)
    expect(report.totalCost).toBeCloseTo(0.6 * band.pricePerM, 10)
  })

  it('keeps separate bands on separate rows, in library order', () => {
    const report = computeBandList([
      { ...shelf, quantity: 1, bands: bands({ top: abs2 }) },
      { ...shelf, quantity: 1, bands: bands({ left: abs1 }) },
    ])
    expect(report.rows.map(r => r.band.id)).toEqual([abs1, abs2])
  })

  it('flags tape narrower than the panel it covers', () => {
    // 22 mm tape on a 30 mm panel leaves the edge partly exposed.
    const thick = { width: 0.6, height: 0.4, thickness: 0.03 }
    const report = computeBandList([{ ...thick, quantity: 1, bands: bands({ top: abs1 }) }])
    expect(report.rows[0].tooNarrow).toBe(true)
  })

  it('does not flag tape that covers the panel', () => {
    const report = computeBandList([{ ...shelf, quantity: 1, bands: bands({ top: abs1 }) }])
    expect(report.rows[0].tooNarrow).toBe(false)
  })

  it('ignores panels with no quantity', () => {
    const report = computeBandList([{ ...shelf, quantity: 0, bands: bands({ top: abs1 }) }])
    expect(report.rows).toEqual([])
  })
})
