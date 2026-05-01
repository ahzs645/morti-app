import type { CameraState, FurnitureColumn, FurnitureConfig, FurnitureModule, ModuleType, PublicStyle } from './types'

// Default furniture config (Qe in compiled). All values in metres.
export const DEFAULT_FURNITURE_CONFIG: FurnitureConfig = {
  depth: 0.45,
  panelThickness: 0.018,
  backPanelThickness: 0.02,
  panelJointClearance: 0.002,
  frontClearance: 0.002,
  sidePanelOverhang: 0.02,
  pullHoleDiameter: 0.025,
  pullHoleEdgeInset: 0.04,
  pullHolePairGap: 0.06,
  backPanelGrooveClearance: 0.001,
  drawerBottomInset: 0.02,
  drawerSlidesReserve: 0.01,
  backPanelInset: 0.01,
  minColumnWidth: 0.12,
  maxColumnWidth: 1.2,
  minModuleHeight: 0.08,
  maxModuleHeight: 1.2,
  minDrawerHeight: 0.08,
  maxDrawerHeight: 0.25,
}

export const FURNITURE_CONFIG_WRITABLE_KEYS: (keyof FurnitureConfig)[] = [
  'depth',
  'panelThickness',
  'backPanelThickness',
  'panelJointClearance',
  'frontClearance',
  'sidePanelOverhang',
  'pullHoleDiameter',
  'pullHoleEdgeInset',
  'pullHolePairGap',
  'backPanelGrooveClearance',
  'drawerBottomInset',
  'drawerSlidesReserve',
  'backPanelInset',
  'minColumnWidth',
  'maxColumnWidth',
  'minModuleHeight',
  'maxModuleHeight',
  'minDrawerHeight',
  'maxDrawerHeight',
]

export const MODULE_TYPES: ModuleType[] = ['shelf', 'drawer', 'doors', 'left-door', 'right-door']

export const DEFAULT_COLUMN_WIDTH = 0.45
export const DEFAULT_SHELF_HEIGHT = 0.3
export const DEFAULT_DRAWER_COUNT = 1
export const DRAWER_COUNT_MIN = 1
export const DRAWER_COUNT_MAX = 32

export function snapConfig(c: Partial<FurnitureConfig>): FurnitureConfig {
  const r = { ...DEFAULT_FURNITURE_CONFIG, ...c }
  // round each metric to 1 mm to mirror the compiled Y.Doc metric grid
  for (const k of FURNITURE_CONFIG_WRITABLE_KEYS) {
    r[k] = Math.round(r[k] * 1_000) / 1_000
  }
  return r
}

export function defaultModule(type: ModuleType): FurnitureModule {
  const m: FurnitureModule = { id: cryptoRandomId(), type, height: DEFAULT_SHELF_HEIGHT }
  if (type === 'drawer') m.drawerCount = DEFAULT_DRAWER_COUNT
  return m
}

export function defaultColumn(width = DEFAULT_COLUMN_WIDTH): FurnitureColumn {
  return {
    width,
    modules: [
      { id: cryptoRandomId(), type: 'shelf', height: 0.3 },
    ],
  }
}

export const DEFAULT_PUBLIC_STYLE: PublicStyle = {
  renderStyle: 'rendered',
  technical: {
    colors: {
      background: '#1c1917',
      grid: '#78716c',
      outlines: '#f59e0b',
      fills: '#1c1917',
    },
  },
  rendered: {
    colors: {
      background: '#4d4a49',
      grid: '#a8a29e',
      defaultPanel: '#aaaaaa',
      verticalSide: '#2d8ed1',
      horizontalDeck: '#26bf67',
      moduleFront: '#ffc21c',
    },
  },
}

export const DEFAULT_CAMERA_STATE: CameraState = {
  position: [2.2, 1.8, 2.2],
  quaternion: [0, 0, 0, 1],
  target: [0, 0, 0],
}

const HEX_COLOR_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

type PublicStyleInput = Partial<PublicStyle> & { renderMode?: unknown }

export function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const match = HEX_COLOR_RE.exec(value.trim())
  if (!match) return fallback
  const hex = match[1].toLowerCase()
  return hex.length === 3
    ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
    : `#${hex}`
}

export function hexColorToNumber(value: unknown, fallback: number): number {
  const fallbackHex = `#${(fallback >>> 0).toString(16).padStart(6, '0').slice(-6)}`
  return Number.parseInt(normalizeHexColor(value, fallbackHex).slice(1), 16)
}

function normalizeTechnicalColors(input: unknown): PublicStyle['technical']['colors'] {
  const source = input && typeof input === 'object' ? input as Partial<PublicStyle['technical']['colors']> : {}
  const fallback = DEFAULT_PUBLIC_STYLE.technical.colors
  return {
    background: normalizeHexColor(source.background, fallback.background),
    grid: normalizeHexColor(source.grid, fallback.grid),
    outlines: normalizeHexColor(source.outlines, fallback.outlines),
    fills: normalizeHexColor(source.fills, fallback.fills),
  }
}

function normalizeRenderedColors(input: unknown): PublicStyle['rendered']['colors'] {
  const source = input && typeof input === 'object' ? input as Partial<PublicStyle['rendered']['colors']> : {}
  const fallback = DEFAULT_PUBLIC_STYLE.rendered.colors
  return {
    background: normalizeHexColor(source.background, fallback.background),
    grid: normalizeHexColor(source.grid, fallback.grid),
    defaultPanel: normalizeHexColor(source.defaultPanel, fallback.defaultPanel),
    verticalSide: normalizeHexColor(source.verticalSide, fallback.verticalSide),
    horizontalDeck: normalizeHexColor(source.horizontalDeck, fallback.horizontalDeck),
    moduleFront: normalizeHexColor(source.moduleFront, fallback.moduleFront),
  }
}

export function normalizePublicStyle(input?: PublicStyleInput | null): PublicStyle {
  const source = input && typeof input === 'object' ? input : null
  return {
    renderStyle: source?.renderStyle === 'technical' || source?.renderMode === 'technical' ? 'technical' : 'rendered',
    technical: {
      colors: normalizeTechnicalColors(source?.technical?.colors),
    },
    rendered: {
      colors: normalizeRenderedColors(source?.rendered?.colors),
    },
  }
}

export function cryptoRandomId(): string {
  // 22-char URL-safe id (~128 bits)
  const buf = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf)
  }
  else {
    for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256)
  }
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
