/**
 * Material preset registry — what a cabinetmaker would call a real spec.
 * Each preset bundles a hex color, a `MeshStandardMaterial` roughness/metalness,
 * and human-readable "species + sheen" labels. CSS grain/sheen recipes are
 * exported separately for the 2D picker chips.
 */

export type MaterialCategory = 'Solid wood' | 'Engineered' | 'Painted' | 'Treated'
export type MaterialGrain =
  | 'oak'
  | 'walnut'
  | 'maple'
  | 'birch'
  | 'ebonized'
  | 'cherry'
  | 'lacquer-white'
  | 'lacquer-charcoal'
  | 'custom'
export type MaterialSheen = 'matte' | 'satin' | 'semigloss' | 'gloss'

export interface MaterialPreset {
  id: string
  label: string
  category: MaterialCategory
  sheenLabel: string
  hex: string
  roughness: number
  metalness: number
  grain: MaterialGrain
  sheen: MaterialSheen
}

export const CUSTOM_MATERIAL_ID = 'custom'

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: 'white-oak',        label: 'White Oak — Natural', category: 'Solid wood', sheenLabel: 'Satin oil',     hex: '#c8a877', roughness: 0.62, metalness: 0.05, grain: 'oak',              sheen: 'satin' },
  { id: 'walnut-oiled',     label: 'Walnut — Oiled',      category: 'Solid wood', sheenLabel: 'Hand-rubbed',   hex: '#5b3e2b', roughness: 0.55, metalness: 0.06, grain: 'walnut',           sheen: 'satin' },
  { id: 'hard-maple',       label: 'Hard Maple',          category: 'Solid wood', sheenLabel: 'Satin lacquer', hex: '#e6cfa8', roughness: 0.45, metalness: 0.05, grain: 'maple',            sheen: 'satin' },
  { id: 'cherry-aged',      label: 'Cherry — Aged',       category: 'Solid wood', sheenLabel: 'Warm satin',    hex: '#8a4a32', roughness: 0.40, metalness: 0.06, grain: 'cherry',           sheen: 'satin' },
  { id: 'baltic-birch',     label: 'Baltic Birch Ply',    category: 'Engineered', sheenLabel: 'Light wax',     hex: '#dcc18a', roughness: 0.50, metalness: 0.04, grain: 'birch',            sheen: 'satin' },
  { id: 'ebonized-oak',     label: 'Ebonized Oak',        category: 'Treated',    sheenLabel: 'Open pore',     hex: '#1f1a17', roughness: 0.58, metalness: 0.06, grain: 'ebonized',         sheen: 'matte' },
  { id: 'white-lacquer',    label: 'White Lacquer',       category: 'Painted',    sheenLabel: 'Semi-gloss',    hex: '#efece6', roughness: 0.18, metalness: 0.02, grain: 'lacquer-white',    sheen: 'semigloss' },
  { id: 'charcoal-lacquer', label: 'Charcoal Lacquer',    category: 'Painted',    sheenLabel: 'Semi-gloss',    hex: '#2a2826', roughness: 0.22, metalness: 0.04, grain: 'lacquer-charcoal', sheen: 'semigloss' },
]

export const MATERIAL_CATEGORY_ORDER: MaterialCategory[] = [
  'Solid wood',
  'Engineered',
  'Painted',
  'Treated',
]

export type CabinetPart = 'carcass' | 'sides' | 'deck' | 'fronts'

export const CABINET_PARTS: { key: CabinetPart, label: string, hint: string }[] = [
  { key: 'carcass', label: 'Carcass', hint: 'Default for unspecified panels' },
  { key: 'sides',   label: 'Sides',   hint: 'Vertical panels' },
  { key: 'deck',    label: 'Deck',    hint: 'Horizontal shelves and tops' },
  { key: 'fronts',  label: 'Fronts',  hint: 'Doors and drawer faces' },
]

/** Default per-part assignment. Initial state matches the original Morti
 *  debug palette (gray/blue/green/yellow) via `custom` hex overrides — users
 *  see the familiar baseline until they pick a real wood preset. */
export const DEFAULT_MATERIAL_ASSIGNMENTS: Record<CabinetPart, { presetId: string, customColor: string }> = {
  carcass: { presetId: CUSTOM_MATERIAL_ID, customColor: '#aaaaaa' },
  sides:   { presetId: CUSTOM_MATERIAL_ID, customColor: '#2d8ed1' },
  deck:    { presetId: CUSTOM_MATERIAL_ID, customColor: '#26bf67' },
  fronts:  { presetId: CUSTOM_MATERIAL_ID, customColor: '#ffc21c' },
}

export function findPreset(id: string | null | undefined): MaterialPreset | null {
  if (!id) return null
  return MATERIAL_PRESETS.find(p => p.id === id) ?? null
}

/**
 * Resolve any preset-or-custom assignment into a concrete material spec.
 * `presetId` may be a known preset id, `'custom'`, or null/empty.
 * `customColor` is the hex used when the preset is `'custom'` (or unknown).
 * `fallbackHex` keeps the legacy `defaultPanel` / `verticalSide` colors flowing
 * for projects that haven't been migrated yet.
 */
export interface ResolvedMaterial {
  hex: string
  roughness: number
  metalness: number
  presetId: string
  label: string
  sheenLabel: string
  /** Grain pattern for the 3D triplanar shader. Lacquer/custom = no grain. */
  grain: MaterialGrain
}

/** Verbatim Morti baseline (Dt_x5Iy5.js panel material defaults).
 *  Custom and unknown presets render at this PBR setting so a fresh project
 *  with the legacy debug palette looks identical to pre-material-picker builds. */
const BASELINE_ROUGHNESS = 0.62
const BASELINE_METALNESS = 0.08

export function resolveMaterial(
  presetId: string | null | undefined,
  customColor: string,
  fallbackHex: string,
): ResolvedMaterial {
  const preset = findPreset(presetId)
  if (preset) {
    return {
      hex: preset.hex,
      roughness: preset.roughness,
      metalness: preset.metalness,
      presetId: preset.id,
      label: preset.label,
      sheenLabel: preset.sheenLabel,
      grain: preset.grain,
    }
  }
  if (presetId === CUSTOM_MATERIAL_ID) {
    return {
      hex: customColor || fallbackHex,
      roughness: BASELINE_ROUGHNESS,
      metalness: BASELINE_METALNESS,
      presetId: CUSTOM_MATERIAL_ID,
      label: 'Custom',
      sheenLabel: 'Hex override',
      grain: 'custom',
    }
  }
  return {
    hex: fallbackHex,
    roughness: BASELINE_ROUGHNESS,
    metalness: BASELINE_METALNESS,
    presetId: CUSTOM_MATERIAL_ID,
    label: 'Custom',
    sheenLabel: 'Hex override',
    grain: 'custom',
  }
}

// ---------------------------------------------------------------------------
// CSS recipes for the 2D picker — grain + sheen per species.
// Layered backgrounds: `backgroundImage` is the grain pattern; `sheenStyle`
// is rendered on a sibling absolute element so it can blend over the grain.
// ---------------------------------------------------------------------------

const STRIPE = (a: number) => `rgba(0,0,0,${a})`
const LIGHT = (a: number) => `rgba(255,255,255,${a})`

/** Grain pattern as a `background-image` value (gradient only, no color stop).
 *  The base hex must be applied separately via `background-color`. */
const GRAIN_PATTERNS: Record<MaterialGrain, string> = {
  oak: `repeating-linear-gradient(92deg,
      transparent 0 11px,
      ${STRIPE(0.10)} 11px 12px,
      transparent 12px 22px,
      ${STRIPE(0.06)} 22px 23px,
      transparent 23px 38px,
      ${LIGHT(0.05)} 38px 39px,
      transparent 39px 60px)`,
  walnut: `repeating-linear-gradient(88deg,
      transparent 0 6px,
      ${STRIPE(0.18)} 6px 7px,
      transparent 7px 14px,
      ${STRIPE(0.10)} 14px 15px,
      transparent 15px 24px,
      ${LIGHT(0.04)} 24px 25px,
      transparent 25px 36px)`,
  maple: `repeating-linear-gradient(90deg,
      transparent 0 2px,
      ${STRIPE(0.045)} 2px 3px,
      transparent 3px 5px)`,
  birch: `repeating-linear-gradient(0deg,
      transparent 0 9px,
      ${STRIPE(0.10)} 9px 10px,
      ${LIGHT(0.18)} 10px 11px,
      transparent 11px 20px)`,
  ebonized: `repeating-linear-gradient(91deg,
      transparent 0 3px,
      ${LIGHT(0.04)} 3px 4px,
      transparent 4px 8px,
      ${STRIPE(0.30)} 8px 9px,
      transparent 9px 18px)`,
  cherry: `repeating-linear-gradient(89deg,
      transparent 0 8px,
      ${STRIPE(0.09)} 8px 9px,
      transparent 9px 19px,
      ${LIGHT(0.05)} 19px 20px,
      transparent 20px 32px)`,
  'lacquer-white': 'none',
  'lacquer-charcoal': 'none',
  custom: 'none',
}

const SHEEN_RECIPES: Record<MaterialSheen, string> = {
  gloss:     'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 6%, rgba(255,255,255,0) 14%, rgba(0,0,0,0.10) 92%)',
  semigloss: 'linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.08) 12%, rgba(255,255,255,0) 26%, rgba(0,0,0,0.12) 92%)',
  satin:     'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 22%, rgba(255,255,255,0) 42%, rgba(0,0,0,0.10) 92%)',
  matte:     'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0)  35%, rgba(0,0,0,0.08) 92%)',
}

/** Combined style block — `backgroundColor` is the base hex, `backgroundImage`
 *  is the grain gradient (or `none` for lacquers/custom). */
export function chipBackgroundStyle(grain: MaterialGrain, hex: string): Record<string, string> {
  return {
    backgroundColor: hex,
    backgroundImage: GRAIN_PATTERNS[grain],
  }
}

export function sheenOverlay(sheen: MaterialSheen): string {
  return SHEEN_RECIPES[sheen]
}

/** Custom card uses a conic of the warm wood-tone palette so it reads as
 *  "anything goes" without screaming rainbow. */
export const CUSTOM_GRADIENT =
  'conic-gradient(from 210deg at 50% 50%, #c8a877, #b65a3a, #7a3a26, #2a2925, #dcc18a, #c8a877)'
