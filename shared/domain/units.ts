/**
 * Unit conversion and formatting — the Morti analogue of Woodworking's
 * multi-unit support (`magicSettings` + the Dimensions / Edge / Area unit
 * selectors in `getDimensions`).
 *
 * Morti's document model is **metric and unit-less internally**: every stored
 * length is metres snapped to the 1 mm grid (see `snapMetric` in
 * `shared/yjs/doc.ts`). This module is a *presentation* layer — it never
 * changes what is stored, only how a number is shown or how typed input is
 * read back. That keeps the compiler, cutlist, and `.morti` format stable no
 * matter which unit the user prefers.
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

// ---------------------------------------------------------------------------
// Length
// ---------------------------------------------------------------------------

/** `fraction` is fractional inches (e.g. `29 1/2"`); every other member is decimal. */
export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'fraction'

/** Denominator for fractional-inch display. Woodworking offers the same ladder. */
export type FractionDenominator = 2 | 4 | 8 | 16 | 32 | 64

export const METRES_PER_LENGTH_UNIT: Record<LengthUnit, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048,
  fraction: 0.0254,
}

export const LENGTH_UNIT_SYMBOL: Record<LengthUnit, string> = {
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  in: 'in',
  ft: 'ft',
  fraction: 'in',
}

/** Sensible decimal places per unit, used when settings don't pin one. */
export const DEFAULT_LENGTH_PRECISION: Record<LengthUnit, number> = {
  mm: 0,
  cm: 1,
  m: 3,
  in: 2,
  ft: 3,
  fraction: 0,
}

export const LENGTH_UNITS: { value: LengthUnit, label: string }[] = [
  { value: 'mm', label: 'Millimetres (mm)' },
  { value: 'cm', label: 'Centimetres (cm)' },
  { value: 'm', label: 'Metres (m)' },
  { value: 'in', label: 'Inches (in)' },
  { value: 'ft', label: 'Feet (ft)' },
  { value: 'fraction', label: 'Fractional inches (1/16")' },
]

export const FRACTION_DENOMINATORS: FractionDenominator[] = [2, 4, 8, 16, 32, 64]

/** Metres → the given unit's numeric value. Fractional inches return inches. */
export function convertLength(metres: number, unit: LengthUnit): number {
  if (!Number.isFinite(metres)) return 0
  return metres / METRES_PER_LENGTH_UNIT[unit]
}

/** The given unit's numeric value → metres. Fractional inches expect inches. */
export function toMetres(value: number, unit: LengthUnit): number {
  if (!Number.isFinite(value)) return 0
  return value * METRES_PER_LENGTH_UNIT[unit]
}

function reduceFraction(numerator: number, denominator: number): [number, number] {
  let a = numerator
  let b = denominator
  while (b !== 0) {
    const t = b
    b = a % b
    a = t
  }
  const divisor = a || 1
  return [numerator / divisor, denominator / divisor]
}

/**
 * Format decimal inches as a shop-readable fraction — `29 1/2`, `3/4`, `12`.
 * Rounds to the nearest 1/`denominator` and reduces the result.
 */
export function formatFractionalInches(inches: number, denominator: FractionDenominator = 16): string {
  if (!Number.isFinite(inches)) return '0'
  const sign = inches < 0 ? '-' : ''
  const abs = Math.abs(inches)
  const ticks = Math.round(abs * denominator)
  const whole = Math.floor(ticks / denominator)
  const rest = ticks - whole * denominator
  if (rest === 0) return `${sign}${whole}`
  const [n, d] = reduceFraction(rest, denominator)
  return whole === 0 ? `${sign}${n}/${d}` : `${sign}${whole} ${n}/${d}`
}

export interface LengthFormatOptions {
  /** Decimal places. Ignored for `fraction`. Defaults per unit. */
  precision?: number
  /** Fractional-inch denominator. Only used by `fraction`. */
  denominator?: FractionDenominator
  /** Append the unit symbol (`450 mm`). Off by default so tables stay tidy. */
  withSymbol?: boolean
}

/** Metres → display string in the requested unit. */
export function formatLength(metres: number, unit: LengthUnit, options: LengthFormatOptions = {}): string {
  const value = convertLength(metres, unit)
  const body = unit === 'fraction'
    ? formatFractionalInches(value, options.denominator ?? 16)
    : value.toFixed(options.precision ?? DEFAULT_LENGTH_PRECISION[unit])
  return options.withSymbol ? `${body} ${LENGTH_UNIT_SYMBOL[unit]}` : body
}

/**
 * Parse user input back to metres. Accepts decimals (`12.5`), bare fractions
 * (`3/4`), and mixed numbers (`29 1/2`) regardless of the active unit, so a
 * shop habit of typing fractions works even when the unit is `in`.
 * Returns `null` for anything unparseable — callers decide the fallback.
 */
export function parseLength(text: string, unit: LengthUnit): number | null {
  const trimmed = text.trim().replace(/["']/g, '')
  if (!trimmed) return null

  const mixed = trimmed.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const whole = Number(mixed[1])
    const numerator = Number(mixed[2])
    const denominator = Number(mixed[3])
    if (!denominator) return null
    const magnitude = Math.abs(whole) + numerator / denominator
    return toMetres(whole < 0 ? -magnitude : magnitude, unit)
  }

  const fraction = trimmed.match(/^(-?\d+)\s*\/\s*(\d+)$/)
  if (fraction) {
    const denominator = Number(fraction[2])
    if (!denominator) return null
    return toMetres(Number(fraction[1]) / denominator, unit)
  }

  const decimal = Number(trimmed)
  return Number.isFinite(decimal) ? toMetres(decimal, unit) : null
}

// ---------------------------------------------------------------------------
// Area
// ---------------------------------------------------------------------------

export type AreaUnit = 'mm2' | 'cm2' | 'm2' | 'in2' | 'ft2'

export const SQUARE_METRES_PER_AREA_UNIT: Record<AreaUnit, number> = {
  mm2: 1e-6,
  cm2: 1e-4,
  m2: 1,
  in2: 0.0254 * 0.0254,
  ft2: 0.3048 * 0.3048,
}

export const AREA_UNIT_SYMBOL: Record<AreaUnit, string> = {
  mm2: 'mm²',
  cm2: 'cm²',
  m2: 'm²',
  in2: 'in²',
  ft2: 'ft²',
}

export const DEFAULT_AREA_PRECISION: Record<AreaUnit, number> = {
  mm2: 0,
  cm2: 1,
  m2: 3,
  in2: 2,
  ft2: 2,
}

export const AREA_UNITS: { value: AreaUnit, label: string }[] = [
  { value: 'mm2', label: 'Square millimetres (mm²)' },
  { value: 'cm2', label: 'Square centimetres (cm²)' },
  { value: 'm2', label: 'Square metres (m²)' },
  { value: 'in2', label: 'Square inches (in²)' },
  { value: 'ft2', label: 'Square feet (ft²)' },
]

export function convertArea(squareMetres: number, unit: AreaUnit): number {
  if (!Number.isFinite(squareMetres)) return 0
  return squareMetres / SQUARE_METRES_PER_AREA_UNIT[unit]
}

export function formatArea(squareMetres: number, unit: AreaUnit, precision?: number, withSymbol = false): string {
  const body = convertArea(squareMetres, unit).toFixed(precision ?? DEFAULT_AREA_PRECISION[unit])
  return withSymbol ? `${body} ${AREA_UNIT_SYMBOL[unit]}` : body
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

export type VolumeUnit = 'm3' | 'cm3' | 'in3' | 'boardfoot'

/** A board foot is 1/12 ft³ — the timber-trade volume unit Woodworking prices in. */
export const CUBIC_METRES_PER_BOARD_FOOT = (0.3048 ** 3) / 12

export const CUBIC_METRES_PER_VOLUME_UNIT: Record<VolumeUnit, number> = {
  m3: 1,
  cm3: 1e-6,
  in3: 0.0254 ** 3,
  boardfoot: CUBIC_METRES_PER_BOARD_FOOT,
}

export const VOLUME_UNIT_SYMBOL: Record<VolumeUnit, string> = {
  m3: 'm³',
  cm3: 'cm³',
  in3: 'in³',
  boardfoot: 'bd ft',
}

export const DEFAULT_VOLUME_PRECISION: Record<VolumeUnit, number> = {
  m3: 4,
  cm3: 0,
  in3: 2,
  boardfoot: 2,
}

export const VOLUME_UNITS: { value: VolumeUnit, label: string }[] = [
  { value: 'm3', label: 'Cubic metres (m³)' },
  { value: 'cm3', label: 'Cubic centimetres (cm³)' },
  { value: 'in3', label: 'Cubic inches (in³)' },
  { value: 'boardfoot', label: 'Board feet (bd ft)' },
]

export function convertVolume(cubicMetres: number, unit: VolumeUnit): number {
  if (!Number.isFinite(cubicMetres)) return 0
  return cubicMetres / CUBIC_METRES_PER_VOLUME_UNIT[unit]
}

export function formatVolume(cubicMetres: number, unit: VolumeUnit, precision?: number, withSymbol = false): string {
  const body = convertVolume(cubicMetres, unit).toFixed(precision ?? DEFAULT_VOLUME_PRECISION[unit])
  return withSymbol ? `${body} ${VOLUME_UNIT_SYMBOL[unit]}` : body
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export type WeightUnit = 'g' | 'kg' | 'lb'

export const KILOGRAMS_PER_WEIGHT_UNIT: Record<WeightUnit, number> = {
  g: 0.001,
  kg: 1,
  lb: 0.45359237,
}

export const WEIGHT_UNIT_SYMBOL: Record<WeightUnit, string> = {
  g: 'g',
  kg: 'kg',
  lb: 'lb',
}

export const DEFAULT_WEIGHT_PRECISION: Record<WeightUnit, number> = {
  g: 0,
  kg: 2,
  lb: 2,
}

export const WEIGHT_UNITS: { value: WeightUnit, label: string }[] = [
  { value: 'g', label: 'Grams (g)' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'lb', label: 'Pounds (lb)' },
]

export function convertWeight(kilograms: number, unit: WeightUnit): number {
  if (!Number.isFinite(kilograms)) return 0
  return kilograms / KILOGRAMS_PER_WEIGHT_UNIT[unit]
}

export function formatWeight(kilograms: number, unit: WeightUnit, precision?: number, withSymbol = false): string {
  const body = convertWeight(kilograms, unit).toFixed(precision ?? DEFAULT_WEIGHT_PRECISION[unit])
  return withSymbol ? `${body} ${WEIGHT_UNIT_SYMBOL[unit]}` : body
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Format a bare number as currency. Falls back to a suffixed code if the
 *  runtime rejects the currency (Intl throws on unknown ISO codes). */
export function formatMoney(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(value)
  }
  catch {
    return `${value.toFixed(2)} ${currency}`
  }
}
