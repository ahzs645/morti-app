import { describe, expect, it } from 'vitest'
import { checkTransportFit, computeOccupiedSpace } from './occupied-space'
import type { CompiledPanel } from './types'

function panel(over: Partial<CompiledPanel> & Pick<CompiledPanel, 'key'>): CompiledPanel {
  return {
    role: 'vertical-side',
    width: 0.5,
    height: 1.2,
    thickness: 0.018,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    operations: [],
    orientation: 'vertical-xy',
    ...over,
  }
}

describe('computeOccupiedSpace', () => {
  it('is all zeros for an empty assembly', () => {
    const space = computeOccupiedSpace([])
    expect(space.size).toEqual({ x: 0, y: 0, z: 0 })
    expect(space.panelCount).toBe(0)
  })

  it('measures a single panel', () => {
    const space = computeOccupiedSpace([panel({ key: 'a' })])
    expect(space.size.x).toBeCloseTo(0.5, 10)
    expect(space.size.y).toBeCloseTo(1.2, 10)
    expect(space.size.z).toBeCloseTo(0.018, 10)
    expect(space.panelCount).toBe(1)
  })

  it('unions panels spread across space', () => {
    const space = computeOccupiedSpace([
      panel({ key: 'a', position: [-1, 0, 0] }),
      panel({ key: 'b', position: [1, 0, 0] }),
    ])
    expect(space.size.x).toBeCloseTo(2.5, 9)
    expect(space.center.x).toBeCloseTo(0, 9)
  })

  it('reports the footprint on the floor, not the face area', () => {
    const space = computeOccupiedSpace([panel({ key: 'a' })])
    expect(space.footprintM2).toBeCloseTo(0.5 * 0.018, 10)
  })

  it('reports bounding volume, which exceeds the solid volume of a hollow piece', () => {
    const space = computeOccupiedSpace([
      panel({ key: 'l', orientation: 'vertical-yz', position: [-0.5, 0, 0] }),
      panel({ key: 'r', orientation: 'vertical-yz', position: [0.5, 0, 0] }),
    ])
    expect(space.boundingVolumeM3).toBeGreaterThan(0)
  })
})

describe('checkTransportFit', () => {
  const space = computeOccupiedSpace([panel({ key: 'a', width: 2, height: 1, thickness: 0.5 })])

  it('reports unchecked when no limit is set', () => {
    const fit = checkTransportFit(space, { width: 0, height: 0, length: 0 })
    expect(fit.unchecked).toBe(true)
    expect(fit.fitsAssembled).toBe(true)
  })

  it('passes a piece that fits', () => {
    const fit = checkTransportFit(space, { width: 3, height: 2, length: 3 })
    expect(fit.fitsAssembled).toBe(true)
    expect(fit.exceeded).toEqual([])
  })

  it('fails a piece whose cross-section will not pass the opening', () => {
    // 2.0 x 1.0 x 0.5 through a 400 x 600 hatch: neither way round fits.
    const fit = checkTransportFit(space, { width: 0.4, height: 0.6, length: 0 })
    expect(fit.fitsAssembled).toBe(false)
    expect(fit.exceeded).toContain('width')
  })

  it('slides the longest dimension through the opening', () => {
    // 2.0 x 1.0 x 0.5 through a 0.9-wide, 2.5-tall doorway: the 2 m length
    // goes through lengthwise, so only the 0.5 x 1.0 cross-section matters.
    const fit = checkTransportFit(space, { width: 0.9, height: 2.5, length: 0 })
    expect(fit.fitsAssembled).toBe(true)
  })

  it('turns the cross-section either way round', () => {
    // 1.0 needs the tall side and 0.5 the narrow one.
    expect(checkTransportFit(space, { width: 0.6, height: 1.2, length: 0 }).fitsAssembled).toBe(true)
    expect(checkTransportFit(space, { width: 1.2, height: 0.6, length: 0 }).fitsAssembled).toBe(true)
  })

  it('only checks the limits that are set', () => {
    const fit = checkTransportFit(space, { width: 0, height: 0, length: 1.5 })
    expect(fit.fitsAssembled).toBe(false)
    expect(fit.exceeded).toEqual(['length'])
  })
})
