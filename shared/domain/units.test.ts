import { describe, expect, it } from 'vitest'
import {
  CUBIC_METRES_PER_BOARD_FOOT,
  convertArea,
  convertLength,
  convertVolume,
  convertWeight,
  formatFractionalInches,
  formatLength,
  formatMoney,
  parseLength,
  toMetres,
} from './units'

describe('length conversion', () => {
  it('round-trips every unit through metres', () => {
    for (const unit of ['mm', 'cm', 'm', 'in', 'ft', 'fraction'] as const) {
      const metres = 1.234
      expect(toMetres(convertLength(metres, unit), unit)).toBeCloseTo(metres, 10)
    }
  })

  it('converts the anchors a woodworker would check', () => {
    expect(convertLength(0.45, 'mm')).toBeCloseTo(450, 10)
    expect(convertLength(1, 'cm')).toBeCloseTo(100, 10)
    expect(convertLength(0.0254, 'in')).toBeCloseTo(1, 10)
    expect(convertLength(0.3048, 'ft')).toBeCloseTo(1, 10)
  })

  it('formats with per-unit default precision', () => {
    expect(formatLength(0.45, 'mm')).toBe('450')
    expect(formatLength(0.45, 'cm')).toBe('45.0')
    expect(formatLength(0.45, 'm')).toBe('0.450')
  })

  it('appends the unit symbol on request', () => {
    expect(formatLength(0.018, 'mm', { withSymbol: true })).toBe('18 mm')
    // Fractional inches report as inches, not as a unit of their own.
    expect(formatLength(0.0254, 'fraction', { withSymbol: true })).toBe('1 in')
  })
})

describe('fractional inches', () => {
  it('reduces to the lowest terms', () => {
    expect(formatFractionalInches(0.5)).toBe('1/2')
    expect(formatFractionalInches(0.75)).toBe('3/4')
    expect(formatFractionalInches(0.25)).toBe('1/4')
  })

  it('splits whole and fractional parts', () => {
    expect(formatFractionalInches(29.5)).toBe('29 1/2')
    expect(formatFractionalInches(12)).toBe('12')
  })

  it('rounds to the chosen denominator', () => {
    expect(formatFractionalInches(0.51, 2)).toBe('1/2')
    expect(formatFractionalInches(0.1, 8)).toBe('1/8')
    // Below half a tick it rounds away entirely; 1/16 exists on its own grid.
    expect(formatFractionalInches(0.05, 8)).toBe('0')
    expect(formatFractionalInches(0.0625, 16)).toBe('1/16')
    // Exactly half a tick rounds up, as a shop rule would.
    expect(formatFractionalInches(0.0625, 8)).toBe('1/8')
  })

  it('keeps the sign on negatives', () => {
    expect(formatFractionalInches(-2.25)).toBe('-2 1/4')
    expect(formatFractionalInches(-0.5)).toBe('-1/2')
  })

  it('formats metres as fractional inches end to end', () => {
    // 0.4572 m is exactly 18".
    expect(formatLength(0.4572, 'fraction')).toBe('18')
  })
})

describe('parseLength', () => {
  it('reads decimals in the active unit', () => {
    expect(parseLength('450', 'mm')).toBeCloseTo(0.45, 10)
    expect(parseLength('1.5', 'm')).toBeCloseTo(1.5, 10)
    expect(parseLength('12', 'in')).toBeCloseTo(0.3048, 10)
  })

  it('reads bare and mixed fractions', () => {
    expect(parseLength('3/4', 'in')).toBeCloseTo(0.0254 * 0.75, 10)
    expect(parseLength('29 1/2', 'in')).toBeCloseTo(0.0254 * 29.5, 10)
    expect(parseLength('-2 1/4', 'in')).toBeCloseTo(0.0254 * -2.25, 10)
  })

  it('tolerates quote marks and surrounding space', () => {
    expect(parseLength('  18"  ', 'in')).toBeCloseTo(0.4572, 10)
  })

  it('returns null rather than guessing', () => {
    expect(parseLength('', 'mm')).toBeNull()
    expect(parseLength('wide', 'mm')).toBeNull()
    expect(parseLength('1/0', 'in')).toBeNull()
  })
})

describe('area, volume, and weight', () => {
  it('converts area', () => {
    expect(convertArea(1, 'mm2')).toBeCloseTo(1e6, 4)
    expect(convertArea(1, 'ft2')).toBeCloseTo(10.7639, 3)
  })

  it('treats a board foot as 1/12 cubic foot', () => {
    expect(CUBIC_METRES_PER_BOARD_FOOT).toBeCloseTo(0.002359737, 9)
    expect(convertVolume(CUBIC_METRES_PER_BOARD_FOOT, 'boardfoot')).toBeCloseTo(1, 10)
  })

  it('converts weight', () => {
    expect(convertWeight(1, 'g')).toBeCloseTo(1000, 10)
    expect(convertWeight(1, 'lb')).toBeCloseTo(2.20462, 4)
  })
})

describe('formatMoney', () => {
  it('formats a known currency', () => {
    expect(formatMoney(12.5, 'EUR')).toContain('12.50')
  })

  it('falls back to a suffixed code for an unknown currency', () => {
    expect(formatMoney(12.5, 'ZZZZ')).toBe('12.50 ZZZZ')
  })
})
