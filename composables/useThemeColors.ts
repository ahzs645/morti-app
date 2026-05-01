import * as THREE from 'three'
import { computed, onMounted, shallowRef, watch, type ShallowRef } from 'vue'

// ---------------------------------------------------------------------------
// Token catalog
// ---------------------------------------------------------------------------

export type ThemeTokenName =
  | 'backgroundDefault'
  | 'backgroundMuted'
  | 'backgroundElevated'
  | 'borderDefault'
  | 'textDefault'
  | 'uiPrimary'
  | 'primary500'
  | 'neutral500'
  | 'success500'

export interface ThemeColor {
  rgbCss: string
  hex: number
}

export interface TokenSnapshot {
  generation: number
  backgroundDefault: ThemeColor
  backgroundMuted: ThemeColor
  backgroundElevated: ThemeColor
  borderDefault: ThemeColor
  textDefault: ThemeColor
  uiPrimary: ThemeColor
  primary500: ThemeColor
  neutral500: ThemeColor
  success500: ThemeColor
}

export interface ThemeTokenInfo {
  name: ThemeTokenName
  group: string
  cssVar: string
  current: ThemeColor
}

// CSS variable mapping (1:1 from xpmfTx8z.js lines 3-13)
const CSS_VARS: Record<ThemeTokenName, string> = {
  backgroundDefault: '--background-color-default',
  backgroundMuted: '--background-color-muted',
  backgroundElevated: '--background-color-elevated',
  borderDefault: '--border-color-default',
  textDefault: '--text-color-default',
  uiPrimary: '--ui-primary',
  primary500: '--color-primary-500',
  neutral500: '--color-neutral-500',
  success500: '--color-success-500',
}

// Fallback default values (Madera dark theme; xpmfTx8z.js lines 14-24)
const DEFAULTS: Record<ThemeTokenName, ThemeColor> = {
  backgroundDefault: { rgbCss: 'rgb(28, 25, 23)', hex: 0x1c1917 },
  backgroundMuted: { rgbCss: 'rgb(41, 37, 36)', hex: 0x292524 },
  backgroundElevated: { rgbCss: 'rgb(41, 37, 36)', hex: 0x292524 },
  borderDefault: { rgbCss: 'rgb(68, 64, 60)', hex: 0x44403c },
  textDefault: { rgbCss: 'rgb(231, 229, 228)', hex: 0xe7e5e4 },
  uiPrimary: { rgbCss: 'rgb(245, 158, 11)', hex: 0xf59e0b },
  primary500: { rgbCss: 'rgb(245, 158, 11)', hex: 0xf59e0b },
  neutral500: { rgbCss: 'rgb(120, 113, 108)', hex: 0x78716c },
  success500: { rgbCss: 'rgb(87, 134, 95)', hex: 0x57865f },
}

// Group/order for the developer catalog (used by /design page).
const TOKEN_GROUPS: Array<{ name: ThemeTokenName, group: string }> = [
  { name: 'backgroundDefault', group: 'Background' },
  { name: 'backgroundMuted', group: 'Background' },
  { name: 'backgroundElevated', group: 'Background' },
  { name: 'borderDefault', group: 'Border' },
  { name: 'textDefault', group: 'Text' },
  { name: 'uiPrimary', group: 'Brand' },
  { name: 'primary500', group: 'Brand' },
  { name: 'neutral500', group: 'Brand' },
  { name: 'success500', group: 'Brand' },
]

// ---------------------------------------------------------------------------
// Resolution pipeline
// ---------------------------------------------------------------------------

// (a) Cache key: `${className}\0${dataTheme || ''}`
function cacheKeyFor(el: Element): string {
  return `${(el as HTMLElement).className}\0${el.getAttribute('data-theme') ?? ''}`
}

// (b) Recursive var() unwrap, capped at 12 hops.
function unwrapVar(raw: string, el: Element): string {
  let value = raw
  let hops = 0
  while (value.startsWith('var(') && hops < 12) {
    const innerVar = value.slice(4).replace(/\)$/, '').split(',')[0]?.trim() ?? ''
    if (!innerVar) return ''
    value = getComputedStyle(el as HTMLElement).getPropertyValue(innerVar).trim()
    if (!value) return ''
    hops++
  }
  return value
}

// (c) Canvas-based color normalizer. Produces an `rgb(R,G,B)` string for any
// modern CSS color value (oklch, color(), color-mix, hex, named, etc.).
let normCanvas: HTMLCanvasElement | null = null
let normCtx: CanvasRenderingContext2D | null = null

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (normCtx) return normCtx
  normCanvas = document.createElement('canvas')
  normCanvas.width = 1
  normCanvas.height = 1
  normCtx = normCanvas.getContext('2d', { willReadFrequently: true })
  return normCtx
}

function normalizeColor(raw: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  if (!raw || raw === 'transparent') return fallback
  try {
    const ctx = ensureCanvas()
    if (!ctx) return fallback
    // Sentinel + assignment: if the browser parses it, fillStyle reflects normalized value.
    ctx.fillStyle = '#010101'
    ctx.fillStyle = raw
    const parsed = ctx.fillStyle as string
    if (typeof parsed === 'string') {
      if (parsed.startsWith('rgb(') || parsed.startsWith('rgba(')) {
        return parsed.replace(/\s+/g, ' ')
      }
      if (parsed.startsWith('#')) {
        // Convert hex (#rgb / #rrggbb / #rrggbbaa) to rgb() via canvas paint round-trip below.
      }
    }
    // Paint a 1x1 pixel and read back, which forces resolution of any modern color function.
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = raw
    ctx.fillRect(0, 0, 1, 1)
    const data = ctx.getImageData(0, 0, 1, 1).data
    if (data[3] === 0) return fallback
    return `rgb(${data[0]},${data[1]},${data[2]})`
  } catch {
    return fallback
  }
}

// Per-token resolver: read computed style → unwrap var chain → normalize → THREE.Color.getHex.
function resolveToken(el: Element, token: ThemeTokenName): ThemeColor {
  const fallback = DEFAULTS[token]
  const raw = getComputedStyle(el as HTMLElement).getPropertyValue(CSS_VARS[token]).trim()
  const inner = raw ? unwrapVar(raw, el) : ''
  const css = normalizeColor(inner || raw, fallback.rgbCss)
  const c = new THREE.Color()
  try {
    c.setStyle(css)
  } catch {
    return { ...fallback }
  }
  return { rgbCss: css, hex: c.getHex() }
}

// ---------------------------------------------------------------------------
// Snapshot builders + cache
// ---------------------------------------------------------------------------

let cachedKey: string | null = null
let cachedSnapshot: TokenSnapshot | null = null
let generationCounter = 0

function defaultsSnapshot(): TokenSnapshot {
  return {
    generation: 0,
    backgroundDefault: { ...DEFAULTS.backgroundDefault },
    backgroundMuted: { ...DEFAULTS.backgroundMuted },
    backgroundElevated: { ...DEFAULTS.backgroundElevated },
    borderDefault: { ...DEFAULTS.borderDefault },
    textDefault: { ...DEFAULTS.textDefault },
    uiPrimary: { ...DEFAULTS.uiPrimary },
    primary500: { ...DEFAULTS.primary500 },
    neutral500: { ...DEFAULTS.neutral500 },
    success500: { ...DEFAULTS.success500 },
  }
}

function snapshotFromDom(el: Element): TokenSnapshot {
  if (typeof document === 'undefined') return defaultsSnapshot()
  const key = cacheKeyFor(el)
  if (cachedSnapshot && cachedKey === key) return cachedSnapshot
  generationCounter++
  cachedKey = key
  cachedSnapshot = {
    generation: generationCounter,
    backgroundDefault: resolveToken(el, 'backgroundDefault'),
    backgroundMuted: resolveToken(el, 'backgroundMuted'),
    backgroundElevated: resolveToken(el, 'backgroundElevated'),
    borderDefault: resolveToken(el, 'borderDefault'),
    textDefault: resolveToken(el, 'textDefault'),
    uiPrimary: resolveToken(el, 'uiPrimary'),
    primary500: resolveToken(el, 'primary500'),
    neutral500: resolveToken(el, 'neutral500'),
    success500: resolveToken(el, 'success500'),
  }
  return cachedSnapshot
}

function invalidateCache(): void {
  cachedKey = null
  cachedSnapshot = null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reactive theme-color composable. Returns a `shallowRef` snapshot of all 9
 * tokens; re-resolves whenever the Nuxt color-mode flips.
 */
export function useThemeColors(): {
  colors: ShallowRef<TokenSnapshot>
  refresh: () => void
} {
  const colors = shallowRef<TokenSnapshot>(
    typeof document === 'undefined'
      ? defaultsSnapshot()
      : snapshotFromDom(document.documentElement),
  )

  function refresh() {
    if (typeof document === 'undefined') return
    invalidateCache()
    colors.value = snapshotFromDom(document.documentElement)
  }

  onMounted(() => {
    refresh()
    const colorMode = useColorMode()
    watch(
      () => [colorMode.value, colorMode.preference],
      () => {
        refresh()
      },
    )
  })

  return { colors, refresh }
}

/** Ad-hoc resolver: returns the current value of a token (no reactivity). */
export function getThemeColor(token: ThemeTokenName): ThemeColor {
  if (typeof document === 'undefined') return { ...DEFAULTS[token] }
  return resolveToken(document.documentElement, token)
}

/** Returns a fresh THREE.Color built from the current value of a token. */
export function tokenToThreeColor(token: ThemeTokenName): THREE.Color {
  const { rgbCss } = getThemeColor(token)
  return new THREE.Color().setStyle(rgbCss)
}

/**
 * Developer catalog: returns the full `[name, group, cssVar, current]` table
 * for the in-app design page (theme inspector).
 */
export function getThemeColorTokens(): ThemeTokenInfo[] {
  return TOKEN_GROUPS.map(({ name, group }) => ({
    name,
    group,
    cssVar: CSS_VARS[name],
    current: getThemeColor(name),
  }))
}

// Re-export for consumers that want to declare a `computed` dep on snapshot generation.
export const _useThemeColorsGenerationDep = (snapshot: ShallowRef<TokenSnapshot>) =>
  computed(() => snapshot.value.generation)
