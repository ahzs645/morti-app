import { describe, expect, it } from 'vitest'
import { frameMemberOffsets, frameOpeningSize } from './frame'

/** The clear gaps between neighbouring members, given their centres. */
function openings(offsets: number[], member: number): number[] {
  const gaps: number[] = []
  for (let i = 1; i < offsets.length; i++) {
    gaps.push((offsets[i] - member / 2) - (offsets[i - 1] + member / 2))
  }
  return gaps
}

describe('frameMemberOffsets', () => {
  it('places just the two outer members when there are no interior ones', () => {
    const offsets = frameMemberOffsets(0.5, 0.05, 0)
    expect(offsets).toHaveLength(2)
    expect(offsets[0]).toBeCloseTo(0.025, 10)
    expect(offsets[1]).toBeCloseTo(0.475, 10)
  })

  it('keeps the outer members flush with the span', () => {
    const member = 0.05
    const offsets = frameMemberOffsets(1.2, member, 3)
    expect(offsets[0] - member / 2).toBeCloseTo(0, 10)
    expect(offsets.at(-1)! + member / 2).toBeCloseTo(1.2, 10)
  })

  it('leaves every opening the same size', () => {
    // Regression: spacing the centres evenly made the two end openings half a
    // member taller than the ones in between, which is what showed up as an
    // uneven frame in both the 3D and the flat view.
    const member = 0.05
    for (const interior of [1, 2, 3, 5]) {
      const gaps = openings(frameMemberOffsets(1.2, member, interior), member)
      expect(gaps).toHaveLength(interior + 1)
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 9)
    }
  })

  it('agrees with the reported opening size', () => {
    const member = 0.05
    const gaps = openings(frameMemberOffsets(1.2, member, 2), member)
    expect(gaps[0]).toBeCloseTo(frameOpeningSize(1.2, member, 2), 10)
  })

  it('returns one centre per member', () => {
    expect(frameMemberOffsets(1.2, 0.05, 4)).toHaveLength(6)
  })

  it('stays inside the span even when the members barely fit', () => {
    const member = 0.05
    const offsets = frameMemberOffsets(0.3, member, 4)
    for (const offset of offsets) {
      expect(offset - member / 2).toBeGreaterThanOrEqual(-1e-9)
      expect(offset + member / 2).toBeLessThanOrEqual(0.3 + 1e-9)
    }
  })

  it('spreads evenly rather than inverting when they do not fit', () => {
    const offsets = frameMemberOffsets(0.1, 0.05, 4)
    expect(offsets).toHaveLength(6)
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]).toBeGreaterThan(offsets[i - 1])
  })

  it('gives nothing for a degenerate span', () => {
    expect(frameMemberOffsets(0, 0.05, 2)).toEqual([])
    expect(frameMemberOffsets(1, 0, 2)).toEqual([])
  })
})

describe('frameOpeningSize', () => {
  it('shrinks as members are added', () => {
    const a = frameOpeningSize(1.2, 0.05, 1)
    const b = frameOpeningSize(1.2, 0.05, 3)
    expect(b).toBeLessThan(a)
  })

  it('never reports a negative opening', () => {
    expect(frameOpeningSize(0.1, 0.05, 6)).toBe(0)
  })
})
