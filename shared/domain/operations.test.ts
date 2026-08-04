import { describe, expect, it } from 'vitest'
import {
  type HolePatternSpec,
  buildHoleOperations,
  buildRabbetOperation,
  buildSlotOperation,
  effectiveDepth,
  holePatternPoints,
  isHoleOperation,
  isSlotOperation,
} from './operations'
import type { PanelOperation } from './types'

// 600 x 400 x 18 mm side panel.
const panel = { width: 0.6, height: 0.4, thickness: 0.018 }

function pattern(overrides: Partial<HolePatternSpec> = {}): HolePatternSpec {
  return { kind: 'row', anchor: 'left', count: 3, spacing: 0.1, inset: 0.05, ...overrides }
}

describe('holePatternPoints', () => {
  it('places a single hole at the anchor inset', () => {
    const [p] = holePatternPoints(panel, pattern({ kind: 'single', anchor: 'left', inset: 0.05 }))
    expect(p.x).toBeCloseTo(-0.3 + 0.05, 10)
    expect(p.y).toBeCloseTo(0, 10)
  })

  it('insets from each edge in the right direction', () => {
    const at = (anchor: HolePatternSpec['anchor']) =>
      holePatternPoints(panel, pattern({ kind: 'single', anchor, inset: 0.05 }))[0]
    expect(at('left').x).toBeCloseTo(-0.25, 10)
    expect(at('right').x).toBeCloseTo(0.25, 10)
    expect(at('top').y).toBeCloseTo(0.15, 10)
    expect(at('bottom').y).toBeCloseTo(-0.15, 10)
  })

  it('runs a row along the anchor edge and centres it', () => {
    // Left edge → the row runs vertically, centred on y = 0.
    const points = holePatternPoints(panel, pattern({ anchor: 'left', count: 3, spacing: 0.1 }))
    expect(points).toHaveLength(3)
    expect(points.map(p => p.y)).toEqual([0.1, 0, -0.1])
    expect(new Set(points.map(p => p.x.toFixed(6))).size).toBe(1)
  })

  it('runs a top-edge row horizontally', () => {
    const points = holePatternPoints(panel, pattern({ anchor: 'top', count: 3, spacing: 0.1 }))
    expect(points.map(p => p.x)).toEqual([-0.1, 0, 0.1])
    expect(new Set(points.map(p => p.y.toFixed(6))).size).toBe(1)
  })

  it('expands a grid into rows stepping into the panel', () => {
    const points = holePatternPoints(panel, pattern({
      kind: 'grid', anchor: 'left', count: 2, rows: 3, spacing: 0.1, rowSpacing: 0.05, inset: 0.05,
    }))
    expect(points).toHaveLength(6)
    // Rows march inward from the left edge.
    expect([...new Set(points.map(p => Number(p.x.toFixed(6))))]).toEqual([-0.25, -0.2, -0.15])
  })

  it('drops holes that fall outside the panel rather than clamping them', () => {
    // 8 holes at 100 mm spacing span 700 mm on a 400 mm-tall panel.
    const points = holePatternPoints(panel, pattern({ anchor: 'left', count: 8, spacing: 0.1 }))
    expect(points.length).toBeLessThan(8)
    for (const p of points) expect(Math.abs(p.y)).toBeLessThanOrEqual(0.2 + 1e-9)
  })

  it('shifts the whole pattern by the offset', () => {
    const base = holePatternPoints(panel, pattern({ kind: 'single', anchor: 'left', inset: 0.05 }))[0]
    const shifted = holePatternPoints(panel, pattern({ kind: 'single', anchor: 'left', inset: 0.05, offset: 0.1 }))[0]
    expect(shifted.y - base.y).toBeCloseTo(0.1, 10)
  })

  it('clamps absurd counts instead of exploding', () => {
    expect(holePatternPoints(panel, pattern({ count: 100000, spacing: 0.001 })).length).toBeLessThanOrEqual(64)
    expect(holePatternPoints(panel, pattern({ count: 0 })).length).toBeGreaterThan(0)
  })
})

describe('buildHoleOperations', () => {
  it('emits one operation per pattern point, with stable ids', () => {
    const ops = buildHoleOperations('p1', panel, pattern({ count: 3 }), {
      operationType: 'dowel-hole', diameter: 0.008, depth: 0.012,
    })
    expect(ops).toHaveLength(3)
    expect(ops.map(o => o.id)).toEqual(['p1:dowel-hole:0', 'p1:dowel-hole:1', 'p1:dowel-hole:2'])
    expect(new Set(ops.map(o => o.targetPanelKey))).toEqual(new Set(['p1']))
  })

  it('forces through-holes through and keeps blind holes blind', () => {
    const [through] = buildHoleOperations('p1', panel, pattern({ kind: 'single' }), {
      operationType: 'through-hole', diameter: 0.008, depth: 0.005,
    })
    expect(through.through).toBe(true)
    expect(through.depth).toBeUndefined()

    const [blind] = buildHoleOperations('p1', panel, pattern({ kind: 'single' }), {
      operationType: 'dowel-hole', diameter: 0.008, depth: 0.012,
    })
    expect(blind.through).toBe(false)
    expect(blind.depth).toBeCloseTo(0.012, 10)
  })

  it('defaults a blind depth to half the panel thickness', () => {
    const [op] = buildHoleOperations('p1', panel, pattern({ kind: 'single' }), {
      operationType: 'dowel-hole', diameter: 0.008,
    })
    expect(op.depth).toBeCloseTo(panel.thickness / 2, 10)
  })

  it('gives a countersink a head diameter and a counterbore a head depth', () => {
    const [csk] = buildHoleOperations('p1', panel, pattern({ kind: 'single' }), {
      operationType: 'countersink', diameter: 0.004, headDiameter: 0.009,
    })
    expect(csk.headDiameter).toBeCloseTo(0.009, 10)
    expect(csk.headDepth).toBeUndefined()

    const [cbore] = buildHoleOperations('p1', panel, pattern({ kind: 'single' }), {
      operationType: 'counterbore', diameter: 0.005, headDiameter: 0.010, headDepth: 0.006,
    })
    expect(cbore.headDiameter).toBeCloseTo(0.010, 10)
    expect(cbore.headDepth).toBeCloseTo(0.006, 10)
  })

  it('never lets a head recess be narrower than the hole it serves', () => {
    const [op] = buildHoleOperations('p1', panel, pattern({ kind: 'single' }), {
      operationType: 'counterbore', diameter: 0.010, headDiameter: 0.004, headDepth: 0.003,
    })
    expect(op.headDiameter).toBeGreaterThanOrEqual(0.010)
  })

  it('carries a hardware code through for the BOM', () => {
    const [op] = buildHoleOperations('p1', panel, pattern({ kind: 'single' }), {
      operationType: 'dowel-hole', diameter: 0.008, hardwareCode: 'A2',
    })
    expect(op.hardwareCode).toBe('A2')
  })

  it('emits nothing for a zero diameter', () => {
    expect(buildHoleOperations('p1', panel, pattern(), { operationType: 'dowel-hole', diameter: 0 })).toEqual([])
  })
})

describe('slots', () => {
  it('builds a pocket from a centre and size', () => {
    const op = buildSlotOperation('p1', {
      operationType: 'pocket', x: 0.1, y: -0.05, width: 0.08, height: 0.04, depth: 0.006,
    })
    expect(op).toMatchObject({ operationType: 'pocket', width: 0.08, height: 0.04, depth: 0.006 })
    expect(op?.center).toEqual({ x: 0.1, y: -0.05 })
  })

  it('rejects features below the minimum size', () => {
    expect(buildSlotOperation('p1', { operationType: 'groove', x: 0, y: 0, width: 0, height: 0.04, depth: 0.006 })).toBeNull()
    expect(buildSlotOperation('p1', { operationType: 'groove', x: 0, y: 0, width: 0.04, height: 0.04, depth: 0 })).toBeNull()
  })

  it('runs a rabbet the full length of its edge', () => {
    const top = buildRabbetOperation('p1', panel, 'top', 0.012, 0.009)!
    expect(top.width).toBeCloseTo(panel.width, 10)
    expect(top.height).toBeCloseTo(0.012, 10)
    // Seated against the top edge.
    expect(top.y).toBeCloseTo(panel.height / 2 - 0.006, 10)

    const left = buildRabbetOperation('p1', panel, 'left', 0.012, 0.009)!
    expect(left.height).toBeCloseTo(panel.height, 10)
    expect(left.x).toBeCloseTo(-panel.width / 2 + 0.006, 10)
  })
})

describe('introspection', () => {
  const op = (operationType: PanelOperation['operationType']): PanelOperation =>
    ({ id: 'x', operationType, targetPanelKey: 'p' })

  it('classifies holes and slots', () => {
    for (const t of ['through-hole', 'dowel-hole', 'countersink', 'counterbore'] as const) {
      expect(isHoleOperation(op(t))).toBe(true)
      expect(isSlotOperation(op(t))).toBe(false)
    }
    for (const t of ['pocket', 'groove', 'dado', 'rabbet', 'rail-cut'] as const) {
      expect(isSlotOperation(op(t))).toBe(true)
      expect(isHoleOperation(op(t))).toBe(false)
    }
  })

  it('reports null depth for through features', () => {
    expect(effectiveDepth({ ...op('through-hole'), through: true }, 0.018)).toBeNull()
  })

  it('clamps a blind depth to the panel thickness', () => {
    expect(effectiveDepth({ ...op('dowel-hole'), depth: 5 }, 0.018)).toBeCloseTo(0.018, 10)
    expect(effectiveDepth({ ...op('dowel-hole'), depth: 0.01 }, 0.018)).toBeCloseTo(0.01, 10)
  })

  it('falls back to half thickness when no depth is given', () => {
    expect(effectiveDepth(op('dowel-hole'), 0.018)).toBeCloseTo(0.009, 10)
  })
})
