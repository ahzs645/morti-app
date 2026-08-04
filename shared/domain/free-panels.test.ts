import { describe, expect, it } from 'vitest'
import {
  type FreePanel,
  centeredOn,
  combinedBounds,
  compileFreePanels,
  copiedToPlane,
  equallySpaced,
  makeFreePanel,
  movedBy,
  movedByThickness,
  panelBetween,
  panelBounds,
  panelFromFace,
  panelPlane,
  resizedOnAxis,
  sanitizeFreePanel,
  sanitizeFreePanels,
  thicknessAxis,
} from './free-panels'

describe('planes', () => {
  it('builds a board on each plane with the thickness on the right axis', () => {
    expect(makeFreePanel({ id: 'a', plane: 'XY' }).size.z).toBeCloseTo(0.018, 10)
    expect(makeFreePanel({ id: 'a', plane: 'XZ' }).size.y).toBeCloseTo(0.018, 10)
    expect(makeFreePanel({ id: 'a', plane: 'YZ' }).size.x).toBeCloseTo(0.018, 10)
  })

  it('puts length and width on the axes the plane names', () => {
    const xy = makeFreePanel({ id: 'a', plane: 'XY', length: 0.8, width: 0.3 })
    expect(xy.size.x).toBeCloseTo(0.8, 10)
    expect(xy.size.y).toBeCloseTo(0.3, 10)

    const yx = makeFreePanel({ id: 'a', plane: 'YX', length: 0.8, width: 0.3 })
    expect(yx.size.y).toBeCloseTo(0.8, 10)
    expect(yx.size.x).toBeCloseTo(0.3, 10)
  })

  it('recovers the plane from the panel proportions', () => {
    for (const plane of ['XY', 'YX', 'XZ', 'ZX', 'YZ', 'ZY'] as const) {
      const panel = makeFreePanel({ id: 'a', plane, length: 0.8, width: 0.3, thickness: 0.018 })
      expect(panelPlane(panel.size), plane).toBe(plane)
    }
  })

  it('calls the thinnest axis the thickness', () => {
    expect(thicknessAxis({ x: 0.5, y: 0.4, z: 0.018 })).toBe('z')
    expect(thicknessAxis({ x: 0.018, y: 0.4, z: 0.5 })).toBe('x')
  })
})

describe('sanitize', () => {
  it('rejects non-positive dimensions', () => {
    const panel = sanitizeFreePanel({ size: { x: 0, y: -1, z: 0.018 } }, 'id')
    expect(panel.size.x).toBeGreaterThan(0)
    expect(panel.size.y).toBeGreaterThan(0)
  })

  it('keeps a negative position, which is a legitimate placement', () => {
    expect(sanitizeFreePanel({ position: { x: -0.5, y: 0, z: 0 } }, 'id').position.x).toBeCloseTo(-0.5, 10)
  })

  it('falls back to a known role', () => {
    expect(sanitizeFreePanel({ role: 'not-a-role' }, 'id').role).toBe('vertical-side')
    expect(sanitizeFreePanel({ role: 'back-panel' }, 'id').role).toBe('back-panel')
  })

  it('treats a non-array as no panels', () => {
    expect(sanitizeFreePanels(null)).toEqual([])
    expect(sanitizeFreePanels('nope')).toEqual([])
  })

  it('caps the panel count', () => {
    expect(sanitizeFreePanels(Array.from({ length: 5000 }, () => ({}))).length).toBeLessThanOrEqual(512)
  })
})

describe('compileFreePanels', () => {
  it('namespaces keys so they cannot collide with parametric panels', () => {
    const [compiled] = compileFreePanels([makeFreePanel({ id: 'abc', plane: 'XY' })])
    expect(compiled.key).toBe('free:abc')
  })

  it('maps each plane to the matching orientation and rotation', () => {
    const cases = [
      { plane: 'XY' as const, orientation: 'vertical-xy' },
      { plane: 'XZ' as const, orientation: 'horizontal-xz' },
      { plane: 'YZ' as const, orientation: 'vertical-yz' },
    ]
    for (const { plane, orientation } of cases) {
      const [compiled] = compileFreePanels([makeFreePanel({ id: 'a', plane })])
      expect(compiled.orientation, plane).toBe(orientation)
    }
  })

  it('keeps the panel in world coordinates', () => {
    const panel = makeFreePanel({ id: 'a', plane: 'XY', position: { x: 1, y: 2, z: 3 } })
    expect(compileFreePanels([panel])[0].position).toEqual([1, 2, 3])
  })

  it('reports the thickness as the thinnest dimension', () => {
    const [compiled] = compileFreePanels([makeFreePanel({ id: 'a', plane: 'XZ', length: 0.8, width: 0.4, thickness: 0.02 })])
    expect(compiled.thickness).toBeCloseTo(0.02, 10)
    expect(compiled.width).toBeCloseTo(0.8, 10)
    expect(compiled.height).toBeCloseTo(0.4, 10)
  })
})

describe('move and resize', () => {
  const panel = makeFreePanel({ id: 'a', plane: 'XY', length: 0.6, width: 0.3, thickness: 0.018 })

  it('nudges by the panel’s own thickness', () => {
    expect(movedByThickness(panel, 'x', 1).position.x).toBeCloseTo(0.018, 10)
    expect(movedByThickness(panel, 'x', -1).position.x).toBeCloseTo(-0.018, 10)
  })

  it('moves by an explicit delta', () => {
    const moved = movedBy(panel, { x: 0.1, z: -0.05 })
    expect(moved.position.x).toBeCloseTo(0.1, 10)
    expect(moved.position.z).toBeCloseTo(-0.05, 10)
    expect(moved.position.y).toBeCloseTo(0, 10)
  })

  it('keeps the opposite face fixed when resizing', () => {
    const before = panelBounds(panel)
    const grown = resizedOnAxis(panel, 'x', 0.2)
    const after = panelBounds(grown)
    expect(grown.size.x).toBeCloseTo(0.8, 10)
    expect(after.min.x).toBeCloseTo(before.min.x, 9)
    expect(after.max.x).toBeCloseTo(before.max.x + 0.2, 9)
  })

  it('never shrinks a panel to nothing', () => {
    expect(resizedOnAxis(panel, 'x', -10).size.x).toBeGreaterThan(0)
  })
})

describe('derived panels', () => {
  const panel = makeFreePanel({ id: 'a', plane: 'XY', length: 0.6, width: 0.3, thickness: 0.018 })

  it('seats a face panel against the source face', () => {
    const face = panelFromFace(panel, 'b')
    expect(face.id).toBe('b')
    expect(face.position.z).toBeCloseTo(0.018, 9)
    expect(face.size.x).toBeCloseTo(panel.size.x, 10)
  })

  it('re-orients a copy onto another plane, keeping its proportions', () => {
    const copy = copiedToPlane(panel, 'b', 'YZ')
    expect(panelPlane(copy.size)).toBe('YZ')
    expect(copy.size.x).toBeCloseTo(0.018, 10)
    expect(Math.max(copy.size.y, copy.size.z)).toBeCloseTo(0.6, 10)
  })

  it('fills the gap between two separated panels', () => {
    const left = makeFreePanel({ id: 'l', plane: 'YZ', position: { x: -0.3 } })
    const right = makeFreePanel({ id: 'r', plane: 'YZ', position: { x: 0.3 } })
    const between = panelBetween(left, right, 'b')!
    expect(between).not.toBeNull()
    // Spans the clear gap between the two inner faces.
    expect(between.size.x).toBeCloseTo(0.6 - 0.018, 6)
    expect(between.position.x).toBeCloseTo(0, 9)
  })

  it('returns nothing when the panels already touch', () => {
    const a = makeFreePanel({ id: 'a', plane: 'XY', position: { z: 0 } })
    const b = makeFreePanel({ id: 'b', plane: 'XY', position: { z: 0.018 } })
    expect(panelBetween(a, b, 'c')).toBeNull()
  })
})

describe('location tools', () => {
  const at = (id: string, x: number): FreePanel =>
    makeFreePanel({ id, plane: 'YZ', position: { x } })

  it('centres a panel on the others', () => {
    const others = [at('a', -1), at('b', 3)]
    const moving = at('m', 99)
    expect(centeredOn(moving, others).position.x).toBeCloseTo(1, 9)
  })

  it('leaves a panel alone when there is nothing to centre on', () => {
    const moving = at('m', 5)
    expect(centeredOn(moving, []).position.x).toBeCloseTo(5, 10)
  })

  it('distributes panels evenly, keeping the outermost two put', () => {
    const panels = [at('a', 0), at('b', 0.1), at('c', 0.15), at('d', 1)]
    const spaced = equallySpaced(panels, 'x')
    const xs = spaced.map(p => p.position.x)
    expect(xs[0]).toBeCloseTo(0, 9)
    expect(xs[3]).toBeCloseTo(1, 9)
    expect(xs[1]).toBeCloseTo(1 / 3, 6)
    expect(xs[2]).toBeCloseTo(2 / 3, 6)
  })

  it('preserves the caller’s ordering', () => {
    const panels = [at('a', 1), at('b', 0), at('c', 0.5)]
    expect(equallySpaced(panels, 'x').map(p => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('has nothing to distribute below three panels', () => {
    const panels = [at('a', 0), at('b', 1)]
    expect(equallySpaced(panels, 'x')).toEqual(panels)
  })
})

describe('bounds', () => {
  it('unions a set of panels', () => {
    const bounds = combinedBounds([
      makeFreePanel({ id: 'a', plane: 'XY', position: { x: -1 } }),
      makeFreePanel({ id: 'b', plane: 'XY', position: { x: 1 } }),
    ])!
    expect(bounds.min.x).toBeCloseTo(-1.3, 9)
    expect(bounds.max.x).toBeCloseTo(1.3, 9)
  })

  it('is null for an empty set', () => {
    expect(combinedBounds([])).toBeNull()
  })
})
