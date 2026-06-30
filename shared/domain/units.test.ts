import { describe, expect, it } from 'vitest'
import { convertFromMeters, formatLength, isLengthUnit } from './units'

describe('length units', () => {
  it('converts metres to each unit at the right precision', () => {
    expect(convertFromMeters(0.45, 'mm')).toBe(450)
    expect(convertFromMeters(0.45, 'cm')).toBe(45)
    expect(convertFromMeters(0.45, 'm')).toBe(0.45)
    expect(convertFromMeters(0.45, 'in')).toBe(17.72) // 0.45 / 0.0254 = 17.7165…
    expect(convertFromMeters(0.018, 'mm')).toBe(18)
  })

  it('formats with trimmed trailing zeros and em dash for empty', () => {
    expect(formatLength(0.45, 'mm')).toBe('450')
    expect(formatLength(0.45, 'm')).toBe('0.45')
    expect(formatLength(0.018, 'mm')).toBe('18')
    expect(formatLength(0.1, 'cm')).toBe('10')
    expect(formatLength(null, 'mm')).toBe('—')
    expect(formatLength(Number.NaN, 'm')).toBe('—')
  })

  it('guards the unit type', () => {
    expect(isLengthUnit('mm')).toBe(true)
    expect(isLengthUnit('in')).toBe(true)
    expect(isLengthUnit('furlong')).toBe(false)
    expect(isLengthUnit(null)).toBe(false)
  })
})
