// Length unit conversion + display formatting for the cutlist. The domain stores
// everything in metres (snapped to a 1 mm grid); this is a presentation layer that
// lets the cutlist + export render in mm / cm / m / inches — the Morti analogue of
// Woodworking's multi-unit support.

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in'

export const LENGTH_UNITS: { unit: LengthUnit, label: string }[] = [
  { unit: 'mm', label: 'mm' },
  { unit: 'cm', label: 'cm' },
  { unit: 'm', label: 'm' },
  { unit: 'in', label: 'in' },
]

export const DEFAULT_LENGTH_UNIT: LengthUnit = 'mm'

// Metres per one of each unit.
const METERS_PER_UNIT: Record<LengthUnit, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
}

// Decimal places used when formatting each unit for display/export.
const UNIT_DECIMALS: Record<LengthUnit, number> = {
  mm: 0,
  cm: 1,
  m: 3,
  in: 2,
}

export function isLengthUnit(value: unknown): value is LengthUnit {
  return value === 'mm' || value === 'cm' || value === 'm' || value === 'in'
}

/** Convert metres to the given unit, rounded to that unit's display precision. */
export function convertFromMeters(meters: number, unit: LengthUnit): number {
  const raw = meters / METERS_PER_UNIT[unit]
  const factor = 10 ** UNIT_DECIMALS[unit]
  return Math.round(raw * factor) / factor
}

/**
 * Format a metre value for display in the chosen unit, without a unit suffix.
 * Trailing zeros are trimmed (e.g. 0.450 m -> "0.45", 18 mm -> "18"). Returns the
 * em dash for null/non-finite input.
 */
export function formatLength(meters: number | null | undefined, unit: LengthUnit): string {
  if (meters == null || !Number.isFinite(meters)) return '—'
  const value = convertFromMeters(meters, unit)
  const fixed = value.toFixed(UNIT_DECIMALS[unit])
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

export function unitSuffix(unit: LengthUnit): string {
  return unit
}
