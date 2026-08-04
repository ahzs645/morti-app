import { describe, expect, it } from 'vitest'
import {
  ALL_PANEL_ROLES,
  attributesForRole,
  defaultPanelAttributeMap,
  defaultPanelAttributes,
  grainRotationFor,
  grainVisible,
  sanitizePanelAttributeMap,
  sanitizePanelAttributes,
} from './panel-attributes'
import { NO_EDGE_BANDS } from './edgeband'

describe('defaults', () => {
  it('starts every role bare, with grain along the length', () => {
    const map = defaultPanelAttributeMap()
    for (const role of ALL_PANEL_ROLES) {
      expect(map[role]).toEqual({ grain: 'length', bands: NO_EDGE_BANDS })
    }
  })

  it('covers every role the compiler can emit', () => {
    expect(new Set(ALL_PANEL_ROLES).size).toBe(ALL_PANEL_ROLES.length)
    expect(Object.keys(defaultPanelAttributeMap())).toHaveLength(ALL_PANEL_ROLES.length)
  })
})

describe('sanitize', () => {
  it('falls back to `length` for an unknown grain', () => {
    expect(sanitizePanelAttributes({ grain: 'diagonal' as never }).grain).toBe('length')
    expect(sanitizePanelAttributes(null)).toEqual(defaultPanelAttributes())
  })

  it('keeps valid grain values', () => {
    for (const grain of ['length', 'width', 'none'] as const) {
      expect(sanitizePanelAttributes({ grain }).grain).toBe(grain)
    }
  })

  it('fills missing roles from a partial map', () => {
    const map = sanitizePanelAttributeMap({ 'back-panel': { grain: 'none' } })
    expect(map['back-panel'].grain).toBe('none')
    expect(map['vertical-side'].grain).toBe('length')
  })
})

describe('grain visibility and rotation', () => {
  const landscape = { width: 0.6, height: 0.4 }
  const portrait = { width: 0.4, height: 1.8 }

  it('suppresses the pattern only for `none`', () => {
    expect(grainVisible({ grain: 'none', bands: NO_EDGE_BANDS })).toBe(false)
    expect(grainVisible({ grain: 'length', bands: NO_EDGE_BANDS })).toBe(true)
    expect(grainVisible({ grain: 'width', bands: NO_EDGE_BANDS })).toBe(true)
  })

  it('leaves a landscape panel unrotated when grain runs along its length', () => {
    expect(grainRotationFor({ grain: 'length', bands: NO_EDGE_BANDS }, landscape)).toBeCloseTo(0, 10)
  })

  it('rotates a portrait panel so the grain still follows the long edge', () => {
    expect(grainRotationFor({ grain: 'length', bands: NO_EDGE_BANDS }, portrait)).toBeCloseTo(Math.PI / 2, 10)
  })

  it('crosses the grain a quarter turn from `length` in both orientations', () => {
    const across = grainRotationFor({ grain: 'width', bands: NO_EDGE_BANDS }, landscape)
    const along = grainRotationFor({ grain: 'length', bands: NO_EDGE_BANDS }, landscape)
    expect(Math.abs(across - along)).toBeCloseTo(Math.PI / 2, 10)
  })

  it('reports no rotation when there is no grain to rotate', () => {
    expect(grainRotationFor({ grain: 'none', bands: NO_EDGE_BANDS }, portrait)).toBe(0)
  })
})

describe('attributesForRole', () => {
  it('falls back to defaults for a role missing from the map', () => {
    expect(attributesForRole({} as never, 'vertical-side')).toEqual(defaultPanelAttributes())
  })
})
