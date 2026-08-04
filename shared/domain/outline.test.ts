import { describe, expect, it } from 'vitest'
import {
  OUTLINE_SHAPES,
  type PanelOutline,
  defaultOutline,
  defaultOutlineMap,
  outlineAreaFraction,
  outlineIsShaped,
  outlineProfile,
  outlineProfileForPanel,
  outlineSummary,
  profileSignedArea,
  sanitizeOutline,
} from './outline'
import { ALL_PANEL_ROLES } from './panel-attributes'

function outline(over: Partial<PanelOutline> = {}): PanelOutline {
  return { ...defaultOutline(), ...over }
}

const SHAPED = OUTLINE_SHAPES.map(s => s.value).filter(v => v !== 'rectangle' && v !== 'custom')

describe('defaults', () => {
  it('starts every role rectangular', () => {
    const map = defaultOutlineMap()
    for (const role of ALL_PANEL_ROLES) {
      expect(map[role].shape).toBe('rectangle')
      expect(outlineIsShaped(map[role])).toBe(false)
    }
  })
})

describe('sanitize', () => {
  it('rejects an unknown shape', () => {
    expect(sanitizeOutline({ shape: 'trapezoid' as never }).shape).toBe('rectangle')
  })

  it('clamps the amount into a usable range', () => {
    expect(sanitizeOutline({ amount: 5 }).amount).toBeLessThanOrEqual(0.95)
    expect(sanitizeOutline({ amount: -1 }).amount).toBeGreaterThanOrEqual(0.01)
  })

  it('clamps custom points into the unit square', () => {
    const clean = sanitizeOutline({ shape: 'custom', points: [{ x: 9, y: -9 }] })
    expect(clean.points[0]).toEqual({ x: 0.5, y: -0.5 })
  })

  it('caps the number of custom points', () => {
    const many = Array.from({ length: 500 }, () => ({ x: 0, y: 0 }))
    expect(sanitizeOutline({ shape: 'custom', points: many }).points.length).toBeLessThanOrEqual(64)
  })
})

describe('outlineIsShaped', () => {
  it('is false for a rectangle and for an undefined outline', () => {
    expect(outlineIsShaped(undefined)).toBe(false)
    expect(outlineIsShaped(outline())).toBe(false)
  })

  it('is true for every preset shape', () => {
    for (const shape of SHAPED) expect(outlineIsShaped(outline({ shape })), shape).toBe(true)
  })

  it('needs at least three points to count a custom outline as shaped', () => {
    expect(outlineIsShaped(outline({ shape: 'custom', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }))).toBe(false)
    expect(outlineIsShaped(outline({ shape: 'custom', points: [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0, y: 0.5 }] }))).toBe(true)
  })
})

describe('outlineProfile', () => {
  it('returns null for a rectangle so callers keep the box fast path', () => {
    expect(outlineProfile(outline())).toBeNull()
  })

  it('produces a closed ring of at least three points for every shape', () => {
    for (const shape of SHAPED) {
      const profile = outlineProfile(outline({ shape }))!
      expect(profile, shape).not.toBeNull()
      expect(profile.length, shape).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps every point inside the unit square', () => {
    for (const shape of SHAPED) {
      for (const point of outlineProfile(outline({ shape, amount: 0.4 }))!) {
        expect(Math.abs(point.x), shape).toBeLessThanOrEqual(0.5 + 1e-9)
        expect(Math.abs(point.y), shape).toBeLessThanOrEqual(0.5 + 1e-9)
      }
    }
  })

  it('winds counter-clockwise, as THREE.Shape expects', () => {
    for (const shape of SHAPED) {
      expect(profileSignedArea(outlineProfile(outline({ shape }))!), shape).toBeGreaterThan(0)
    }
  })

  it('removes material — every shape covers less than the full rectangle', () => {
    for (const shape of SHAPED) {
      const fraction = outlineAreaFraction(outline({ shape, amount: 0.3 }))
      expect(fraction, shape).toBeLessThan(1)
      expect(fraction, shape).toBeGreaterThan(0)
    }
  })

  it('removes more as the amount grows', () => {
    const small = outlineAreaFraction(outline({ shape: 'cut-top-left', amount: 0.1 }))
    const large = outlineAreaFraction(outline({ shape: 'cut-top-left', amount: 0.5 }))
    expect(large).toBeLessThan(small)
  })

  it('reports a full rectangle as covering everything', () => {
    expect(outlineAreaFraction(outline())).toBe(1)
  })
})

describe('outlineProfileForPanel', () => {
  it('scales the normalized profile to the panel size', () => {
    const points = outlineProfileForPanel(outline({ shape: 'cut-top-left', amount: 0.25 }), { width: 1.2, height: 0.8 })!
    for (const point of points) {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(0.6 + 1e-9)
      expect(Math.abs(point.y)).toBeLessThanOrEqual(0.4 + 1e-9)
    }
  })

  it('is null for a rectangle', () => {
    expect(outlineProfileForPanel(outline(), { width: 1, height: 1 })).toBeNull()
  })
})

describe('outlineSummary', () => {
  it('is a dash for rectangles', () => {
    expect(outlineSummary(outline())).toBe('—')
    expect(outlineSummary(undefined)).toBe('—')
  })

  it('names the shape and its amount', () => {
    expect(outlineSummary(outline({ shape: 'arch-top', amount: 0.25 }))).toBe('Arched top 25%')
  })

  it('counts points for a custom outline', () => {
    const custom = outline({ shape: 'custom', points: [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0, y: 0.5 }] })
    expect(outlineSummary(custom)).toBe('Custom outline (3 pts)')
  })
})
