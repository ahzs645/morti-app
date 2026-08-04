import * as Y from 'yjs'
import {
  DEFAULT_FURNITURE_CONFIG,
  defaultModule,
  defaultColumn,
  cryptoRandomId,
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_SHELF_HEIGHT,
  DEFAULT_DRAWER_COUNT,
  DRAWER_COUNT_MAX,
  DRAWER_COUNT_MIN,
  DEFAULT_SHELF_COUNT,
  SHELF_COUNT_MAX,
  SHELF_COUNT_MIN,
  DEFAULT_DIVIDER_COUNT,
  DIVIDER_COUNT_MAX,
  DIVIDER_COUNT_MIN,
  DEFAULT_FRAME_RAIL_COUNT,
  DEFAULT_FRAME_STILE_COUNT,
  FRAME_MEMBER_COUNT_MAX,
  FRAME_MEMBER_COUNT_MIN,
  FURNITURE_CONFIG_WRITABLE_KEYS,
  DEFAULT_PROJECT_SETTINGS,
  sanitizeProjectSettings,
} from '~~/shared/domain/defaults'
import {
  ALL_PANEL_ROLES,
  type PanelAttributeMap,
  type PanelAttributes,
  defaultPanelAttributeMap,
  sanitizePanelAttributeMap,
  sanitizePanelAttributes,
} from '~~/shared/domain/panel-attributes'
import { PANEL_EDGES } from '~~/shared/domain/edgeband'
import {
  type DrillingMap,
  type DrillingRule,
  defaultDrillingMap,
  defaultDrillingRule,
  sanitizeDrillingMap,
} from '~~/shared/domain/drilling'
import {
  DEFAULT_JOINERY_SETTINGS,
  JOINT_STYLES,
  type JoinerySettings,
} from '~~/shared/domain/joinery'
import {
  DESIGN_SCHEMA_VERSION,
  PROJECT_SETTINGS_KEYS,
  type FurnitureColumn,
  type FurnitureConfig,
  type FurnitureDoc,
  type FurnitureModule,
  type ModuleType,
  type ProjectSettings,
} from '~~/shared/domain/types'

// Migrations table — each entry mutates the doc in place. Run once, in id order.
export const MIGRATIONS: { id: string, run(map: Y.Map<unknown>): void }[] = [
  {
    id: '1740000001000_legacy_furniture_config_keys',
    run(map) {
      const cfg = map.get('config') as Y.Map<unknown> | undefined
      if (!cfg) return
      const renames: [string, string][] = [
        ['frontReveal', 'frontClearance'],
        ['drawerDepthInset', 'drawerSlidesReserve'],
      ]
      for (const [from, to] of renames) {
        if (cfg.has(from)) {
          if (!cfg.has(to)) cfg.set(to, cfg.get(from))
          cfg.delete(from)
        }
      }
      cfg.delete('drawerInnerInset')
    },
  },
]

const ROOT_KEY = 'furniture'
const METRIC_STEP = 0.001
const METRIC_SCALE = Math.round(1 / METRIC_STEP)

function snapMetric(value: number): number {
  return Number.isFinite(value) ? Math.round(value * METRIC_SCALE) / METRIC_SCALE : 0
}

function sanitizeConfigValue<K extends keyof FurnitureConfig>(key: K, value: unknown): FurnitureConfig[K] {
  return (typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? snapMetric(value)
    : DEFAULT_FURNITURE_CONFIG[key]) as FurnitureConfig[K]
}

/** Read the `panelAttributes` branch as a POJO, filling any gap with defaults. */
function readPanelAttributesMap(map: Y.Map<unknown>): PanelAttributeMap {
  const attributes = map.get('panelAttributes') as Y.Map<unknown> | undefined
  if (!attributes) return defaultPanelAttributeMap()
  const raw: Record<string, unknown> = {}
  for (const role of ALL_PANEL_ROLES) {
    const entry = attributes.get(role) as Y.Map<unknown> | undefined
    if (!entry) continue
    const bands = entry.get('bands') as Y.Map<unknown> | undefined
    raw[role] = {
      grain: entry.get('grain'),
      bands: bands
        ? Object.fromEntries(PANEL_EDGES.map(edge => [edge, bands.get(edge)]))
        : undefined,
    }
  }
  return sanitizePanelAttributeMap(raw)
}

function writePanelAttributes(target: Y.Map<unknown>, role: string, value: PanelAttributes) {
  let entry = target.get(role) as Y.Map<unknown> | undefined
  if (!entry) {
    entry = new Y.Map<unknown>()
    target.set(role, entry)
  }
  entry.set('grain', value.grain)
  let bands = entry.get('bands') as Y.Map<unknown> | undefined
  if (!bands) {
    bands = new Y.Map<unknown>()
    entry.set('bands', bands)
  }
  for (const edge of PANEL_EDGES) bands.set(edge, value.bands[edge])
}

/**
 * Read the `drilling` branch as a POJO. Rules are stored as plain JSON inside
 * a Y.Array per role: they are edited as a whole (add / remove / retune), never
 * field-by-field by two people at once, so per-field CRDT merge buys nothing.
 */
function readDrillingMap(map: Y.Map<unknown>): DrillingMap {
  const drilling = map.get('drilling') as Y.Map<unknown> | undefined
  if (!drilling) return defaultDrillingMap()
  const raw: Record<string, unknown> = {}
  for (const role of ALL_PANEL_ROLES) {
    const rules = drilling.get(role) as Y.Array<unknown> | undefined
    if (rules) raw[role] = rules.toArray()
  }
  return sanitizeDrillingMap(raw)
}

function writeDrillingRules(target: Y.Map<unknown>, role: string, rules: DrillingRule[]) {
  let array = target.get(role) as Y.Array<unknown> | undefined
  if (!array) {
    array = new Y.Array<unknown>()
    target.set(role, array)
  }
  if (array.length > 0) array.delete(0, array.length)
  if (rules.length > 0) array.insert(0, rules.map(rule => JSON.parse(JSON.stringify(rule)) as unknown))
}

const JOINERY_KEYS: (keyof JoinerySettings)[] = [
  'style',
  'fastenersPerJoint',
  'fastenerDiameter',
  'fastenerDepth',
  'endInset',
]

const JOINT_STYLE_VALUES = JOINT_STYLES.map(s => s.value)

function sanitizeJoinery(input: Partial<JoinerySettings> | null | undefined): JoinerySettings {
  const source = input ?? {}
  const positive = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.min(1, Math.round(value * 1_000_000) / 1_000_000)
      : fallback
  return {
    style: typeof source.style === 'string' && JOINT_STYLE_VALUES.includes(source.style as never)
      ? source.style
      : DEFAULT_JOINERY_SETTINGS.style,
    fastenersPerJoint: typeof source.fastenersPerJoint === 'number' && Number.isFinite(source.fastenersPerJoint)
      ? Math.max(1, Math.min(16, Math.round(source.fastenersPerJoint)))
      : DEFAULT_JOINERY_SETTINGS.fastenersPerJoint,
    fastenerDiameter: positive(source.fastenerDiameter, DEFAULT_JOINERY_SETTINGS.fastenerDiameter),
    fastenerDepth: positive(source.fastenerDepth, DEFAULT_JOINERY_SETTINGS.fastenerDepth),
    endInset: positive(source.endInset, DEFAULT_JOINERY_SETTINGS.endInset),
  }
}

function readJoinery(map: Y.Map<unknown>): JoinerySettings {
  const joinery = map.get('joinery') as Y.Map<unknown> | undefined
  if (!joinery) return { ...DEFAULT_JOINERY_SETTINGS }
  const raw: Record<string, unknown> = {}
  for (const key of JOINERY_KEYS) raw[key] = joinery.get(key)
  return sanitizeJoinery(raw as Partial<JoinerySettings>)
}

/** Read the `settings` branch as a POJO, filling any gap with the default. */
function readSettingsMap(map: Y.Map<unknown>): ProjectSettings {
  const settings = map.get('settings') as Y.Map<unknown> | undefined
  if (!settings) return { ...DEFAULT_PROJECT_SETTINGS }
  const raw: Record<string, unknown> = {}
  for (const key of PROJECT_SETTINGS_KEYS) raw[key] = settings.get(key)
  return sanitizeProjectSettings(raw as Partial<ProjectSettings>)
}

export function getFurnitureMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(ROOT_KEY)
}

export function ensureInitialized(doc: Y.Doc) {
  doc.transact(() => {
    const map = getFurnitureMap(doc)
    if (map.get('schemaVersion') !== DESIGN_SCHEMA_VERSION) map.set('schemaVersion', DESIGN_SCHEMA_VERSION)
    if (!map.has('lastAppliedMigrationId')) map.set('lastAppliedMigrationId', null)
    if (!map.has('config')) {
      const cfg = new Y.Map<unknown>()
      for (const k of FURNITURE_CONFIG_WRITABLE_KEYS) cfg.set(k, DEFAULT_FURNITURE_CONFIG[k])
      map.set('config', cfg)
    }
    else {
      const cfg = map.get('config') as Y.Map<unknown>
      for (const k of FURNITURE_CONFIG_WRITABLE_KEYS) {
        const value = cfg.get(k)
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          cfg.set(k, DEFAULT_FURNITURE_CONFIG[k])
        }
      }
    }
    // `settings` is presentation-only, so a doc written before it existed is
    // simply seeded with the defaults — no schema bump or migration needed.
    if (!map.has('settings')) {
      const settings = new Y.Map<unknown>()
      for (const key of PROJECT_SETTINGS_KEYS) settings.set(key, DEFAULT_PROJECT_SETTINGS[key])
      map.set('settings', settings)
    }
    else {
      const settings = map.get('settings') as Y.Map<unknown>
      const raw: Record<string, unknown> = {}
      for (const key of PROJECT_SETTINGS_KEYS) raw[key] = settings.get(key)
      const clean = sanitizeProjectSettings(raw as Partial<ProjectSettings>)
      for (const key of PROJECT_SETTINGS_KEYS) {
        if (settings.get(key) !== clean[key]) settings.set(key, clean[key])
      }
    }
    // Like `settings`, panel attributes are additive — old docs simply seed
    // the defaults (grain along length, no banding), so no schema bump.
    if (!map.has('panelAttributes')) {
      const attributes = new Y.Map<unknown>()
      map.set('panelAttributes', attributes)
      const defaults = defaultPanelAttributeMap()
      for (const role of ALL_PANEL_ROLES) writePanelAttributes(attributes, role, defaults[role])
    }
    else {
      const attributes = map.get('panelAttributes') as Y.Map<unknown>
      const clean = readPanelAttributesMap(map)
      for (const role of ALL_PANEL_ROLES) writePanelAttributes(attributes, role, clean[role])
    }
    // Drilling is additive too — an old doc starts with no rules, which
    // compiles to exactly the panels it produced before.
    if (!map.has('drilling')) {
      const drilling = new Y.Map<unknown>()
      map.set('drilling', drilling)
      for (const role of ALL_PANEL_ROLES) writeDrillingRules(drilling, role, [])
    }
    else {
      const drilling = map.get('drilling') as Y.Map<unknown>
      const clean = readDrillingMap(map)
      for (const role of ALL_PANEL_ROLES) writeDrillingRules(drilling, role, clean[role])
    }
    // Joinery defaults to `butt`, which emits nothing — so an old doc compiles
    // to exactly the panels it did before.
    if (!map.has('joinery')) {
      const joinery = new Y.Map<unknown>()
      for (const key of JOINERY_KEYS) joinery.set(key, DEFAULT_JOINERY_SETTINGS[key])
      map.set('joinery', joinery)
    }
    else {
      const joinery = map.get('joinery') as Y.Map<unknown>
      const clean = readJoinery(map)
      for (const key of JOINERY_KEYS) {
        if (joinery.get(key) !== clean[key]) joinery.set(key, clean[key])
      }
    }
    runPendingMigrations(doc)
    if (!map.has('columns')) {
      const cols = new Y.Array<Y.Map<unknown>>()
      map.set('columns', cols)
    }
    const cols = map.get('columns') as Y.Array<Y.Map<unknown>>
    cols.forEach((col) => {
      const width = col.get('width')
      if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
        col.set('width', DEFAULT_COLUMN_WIDTH)
      }
      let modules = col.get('modules') as Y.Array<Y.Map<unknown>> | undefined
      if (!modules) {
        modules = new Y.Array<Y.Map<unknown>>()
        col.set('modules', modules)
      }
      if (modules.length === 0) modules.push([toYModule(defaultModule('shelf'))])
      modules.forEach((module) => {
        if (typeof module.get('id') !== 'string' || (module.get('id') as string).length === 0) {
          module.set('id', cryptoRandomId())
        }
        const rawType = module.get('type')
        const type = rawType === 'drawers' ? 'drawer' : rawType
        if (type !== 'shelf' && type !== 'shelves' && type !== 'dividers' && type !== 'frame' && type !== 'drawer' && type !== 'doors' && type !== 'left-door' && type !== 'right-door') {
          module.set('type', 'shelf')
        }
        else if (type !== rawType) {
          module.set('type', type)
        }
        const height = module.get('height')
        if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
          module.set('height', DEFAULT_SHELF_HEIGHT)
        }
        if (module.get('type') === 'drawer') {
          const drawerCount = module.get('drawerCount')
          if (typeof drawerCount !== 'number' || !Number.isFinite(drawerCount)) {
            module.set('drawerCount', DEFAULT_DRAWER_COUNT)
          }
          else {
            module.set('drawerCount', Math.max(DRAWER_COUNT_MIN, Math.min(DRAWER_COUNT_MAX, Math.round(drawerCount))))
          }
        }
        else if (module.has('drawerCount')) {
          module.delete('drawerCount')
        }
        if (module.get('type') === 'shelves') {
          const shelfCount = module.get('shelfCount')
          if (typeof shelfCount !== 'number' || !Number.isFinite(shelfCount)) {
            module.set('shelfCount', DEFAULT_SHELF_COUNT)
          }
          else {
            module.set('shelfCount', Math.max(SHELF_COUNT_MIN, Math.min(SHELF_COUNT_MAX, Math.round(shelfCount))))
          }
        }
        else if (module.has('shelfCount')) {
          module.delete('shelfCount')
        }
        if (module.get('type') === 'dividers') {
          const dividerCount = module.get('dividerCount')
          if (typeof dividerCount !== 'number' || !Number.isFinite(dividerCount)) {
            module.set('dividerCount', DEFAULT_DIVIDER_COUNT)
          }
          else {
            module.set('dividerCount', Math.max(DIVIDER_COUNT_MIN, Math.min(DIVIDER_COUNT_MAX, Math.round(dividerCount))))
          }
        }
        else if (module.has('dividerCount')) {
          module.delete('dividerCount')
        }
        if (module.get('type') === 'frame') {
          for (const [key, fallback] of [['frameRailCount', DEFAULT_FRAME_RAIL_COUNT], ['frameStileCount', DEFAULT_FRAME_STILE_COUNT]] as const) {
            const value = module.get(key)
            module.set(key, typeof value === 'number' && Number.isFinite(value)
              ? Math.max(FRAME_MEMBER_COUNT_MIN, Math.min(FRAME_MEMBER_COUNT_MAX, Math.round(value)))
              : fallback)
          }
        }
        else {
          if (module.has('frameRailCount')) module.delete('frameRailCount')
          if (module.has('frameStileCount')) module.delete('frameStileCount')
        }
      })
    })
  }, 'init')
}

export function runPendingMigrations(doc: Y.Doc) {
  const map = getFurnitureMap(doc)
  const last = (map.get('lastAppliedMigrationId') as string | null) ?? null
  let started = last === null
  for (const m of MIGRATIONS) {
    if (!started) {
      if (m.id === last) started = true
      continue
    }
    m.run(map)
    map.set('lastAppliedMigrationId', m.id)
  }
}

// ---------------- Pojo readers ----------------
export function readFurnitureDoc(doc: Y.Doc): FurnitureDoc {
  const map = getFurnitureMap(doc)
  const cfg = map.get('config') as Y.Map<unknown>
  const cols = map.get('columns') as Y.Array<Y.Map<unknown>>
  const config = { ...DEFAULT_FURNITURE_CONFIG } as FurnitureConfig
  for (const k of FURNITURE_CONFIG_WRITABLE_KEYS) {
    const v = cfg?.get(k)
    config[k] = sanitizeConfigValue(k, v)
  }
  const columns: FurnitureColumn[] = []
  cols?.forEach((cm) => {
    const rawWidth = cm.get('width')
    const width = typeof rawWidth === 'number' && Number.isFinite(rawWidth) && rawWidth > 0 ? snapMetric(rawWidth) : DEFAULT_COLUMN_WIDTH
    const ms = cm.get('modules') as Y.Array<Y.Map<unknown>> | undefined
    const modules: FurnitureModule[] = []
    ms?.forEach((mm) => {
      const id = (mm.get('id') as string) ?? cryptoRandomId()
      const rawType = mm.get('type')
      const type: ModuleType = rawType === 'drawer' || rawType === 'doors' || rawType === 'left-door' || rawType === 'right-door' || rawType === 'shelf' || rawType === 'shelves' || rawType === 'dividers' || rawType === 'frame' ? rawType : 'shelf'
      const rawHeight = mm.get('height')
      const height = typeof rawHeight === 'number' && Number.isFinite(rawHeight) && rawHeight > 0 ? snapMetric(rawHeight) : DEFAULT_SHELF_HEIGHT
      const drawerCount = mm.get('drawerCount') as number | undefined
      const shelfCount = mm.get('shelfCount') as number | undefined
      const dividerCount = mm.get('dividerCount') as number | undefined
      const m: FurnitureModule = { id, type, height }
      if (type === 'drawer' && typeof drawerCount === 'number' && Number.isFinite(drawerCount)) {
        m.drawerCount = Math.max(DRAWER_COUNT_MIN, Math.min(DRAWER_COUNT_MAX, Math.round(drawerCount)))
      }
      if (type === 'shelves' && typeof shelfCount === 'number' && Number.isFinite(shelfCount)) {
        m.shelfCount = Math.max(SHELF_COUNT_MIN, Math.min(SHELF_COUNT_MAX, Math.round(shelfCount)))
      }
      if (type === 'dividers' && typeof dividerCount === 'number' && Number.isFinite(dividerCount)) {
        m.dividerCount = Math.max(DIVIDER_COUNT_MIN, Math.min(DIVIDER_COUNT_MAX, Math.round(dividerCount)))
      }
      if (type === 'frame') {
        const railCount = mm.get('frameRailCount')
        const stileCount = mm.get('frameStileCount')
        m.frameRailCount = typeof railCount === 'number' && Number.isFinite(railCount)
          ? Math.max(FRAME_MEMBER_COUNT_MIN, Math.min(FRAME_MEMBER_COUNT_MAX, Math.round(railCount)))
          : DEFAULT_FRAME_RAIL_COUNT
        m.frameStileCount = typeof stileCount === 'number' && Number.isFinite(stileCount)
          ? Math.max(FRAME_MEMBER_COUNT_MIN, Math.min(FRAME_MEMBER_COUNT_MAX, Math.round(stileCount)))
          : DEFAULT_FRAME_STILE_COUNT
      }
      modules.push(m)
    })
    columns.push({ width, modules })
  })
  return {
    schemaVersion: (map.get('schemaVersion') as number) ?? DESIGN_SCHEMA_VERSION,
    lastAppliedMigrationId: (map.get('lastAppliedMigrationId') as string | null) ?? null,
    config,
    settings: readSettingsMap(map),
    panelAttributes: readPanelAttributesMap(map),
    drilling: readDrillingMap(map),
    joinery: readJoinery(map),
    columns,
  }
}

// ---------------- Y converters ----------------
export function toYModule(m: FurnitureModule): Y.Map<unknown> {
  const y = new Y.Map<unknown>()
  y.set('id', m.id)
  y.set('type', m.type)
  y.set('height', m.height)
  if (typeof m.drawerCount === 'number') y.set('drawerCount', m.drawerCount)
  if (typeof m.shelfCount === 'number') y.set('shelfCount', m.shelfCount)
  if (typeof m.dividerCount === 'number') y.set('dividerCount', m.dividerCount)
  if (typeof m.frameRailCount === 'number') y.set('frameRailCount', m.frameRailCount)
  if (typeof m.frameStileCount === 'number') y.set('frameStileCount', m.frameStileCount)
  return y
}

export function toYColumn(c: FurnitureColumn): Y.Map<unknown> {
  const y = new Y.Map<unknown>()
  y.set('width', c.width)
  const arr = new Y.Array<Y.Map<unknown>>()
  arr.push(c.modules.map(toYModule))
  y.set('modules', arr)
  return y
}

// ---------------- Mutators ----------------
export function insertColumn(doc: Y.Doc, atIndex: number, width = DEFAULT_COLUMN_WIDTH) {
  doc.transact(() => {
    const cols = getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>
    cols.insert(atIndex, [toYColumn(defaultColumn(width))])
  }, 'insertColumn')
}

export function removeColumn(doc: Y.Doc, index: number) {
  doc.transact(() => {
    const cols = getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>
    cols.delete(index, 1)
  }, 'removeColumn')
}

export function setColumnWidth(doc: Y.Doc, index: number, width: number) {
  doc.transact(() => {
    const cols = getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>
    const col = cols.get(index)
    col?.set('width', typeof width === 'number' && Number.isFinite(width) && width > 0 ? snapMetric(width) : DEFAULT_COLUMN_WIDTH)
  }, 'setColumnWidth')
}

export function insertModule(doc: Y.Doc, columnIndex: number, atIndex: number, type: ModuleType) {
  doc.transact(() => {
    const cols = getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>
    const col = cols.get(columnIndex)
    const ms = col?.get('modules') as Y.Array<Y.Map<unknown>>
    const m: FurnitureModule = { id: cryptoRandomId(), type, height: DEFAULT_SHELF_HEIGHT }
    if (type === 'drawer') m.drawerCount = DEFAULT_DRAWER_COUNT
    if (type === 'shelves') m.shelfCount = DEFAULT_SHELF_COUNT
    if (type === 'dividers') m.dividerCount = DEFAULT_DIVIDER_COUNT
    if (type === 'frame') {
      m.frameRailCount = DEFAULT_FRAME_RAIL_COUNT
      m.frameStileCount = DEFAULT_FRAME_STILE_COUNT
    }
    ms.insert(atIndex, [toYModule(m)])
  }, 'insertModule')
}

export function removeModule(doc: Y.Doc, columnIndex: number, moduleIndex: number) {
  doc.transact(() => {
    const cols = getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>
    const ms = cols.get(columnIndex)?.get('modules') as Y.Array<Y.Map<unknown>>
    if (ms && moduleIndex >= 0 && moduleIndex < ms.length) ms.delete(moduleIndex, 1)
  }, 'removeModule')
}

export function setModuleType(doc: Y.Doc, columnIndex: number, moduleIndex: number, type: ModuleType) {
  doc.transact(() => {
    const ms = (getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>).get(columnIndex)?.get('modules') as Y.Array<Y.Map<unknown>>
    const m = ms.get(moduleIndex)
    m.set('type', type)
    if (type === 'drawer' && !m.has('drawerCount')) m.set('drawerCount', DEFAULT_DRAWER_COUNT)
    if (type !== 'drawer' && m.has('drawerCount')) m.delete('drawerCount')
    if (type === 'shelves' && !m.has('shelfCount')) m.set('shelfCount', DEFAULT_SHELF_COUNT)
    if (type !== 'shelves' && m.has('shelfCount')) m.delete('shelfCount')
    if (type === 'dividers' && !m.has('dividerCount')) m.set('dividerCount', DEFAULT_DIVIDER_COUNT)
    if (type !== 'dividers' && m.has('dividerCount')) m.delete('dividerCount')
    if (type === 'frame') {
      if (!m.has('frameRailCount')) m.set('frameRailCount', DEFAULT_FRAME_RAIL_COUNT)
      if (!m.has('frameStileCount')) m.set('frameStileCount', DEFAULT_FRAME_STILE_COUNT)
    }
    else {
      if (m.has('frameRailCount')) m.delete('frameRailCount')
      if (m.has('frameStileCount')) m.delete('frameStileCount')
    }
  }, 'setModuleType')
}

export function setModuleHeight(doc: Y.Doc, columnIndex: number, moduleIndex: number, height: number) {
  doc.transact(() => {
    const ms = (getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>).get(columnIndex)?.get('modules') as Y.Array<Y.Map<unknown>>
    ms.get(moduleIndex)?.set('height', typeof height === 'number' && Number.isFinite(height) && height > 0 ? snapMetric(height) : 0.1)
  }, 'setModuleHeight')
}

export function setDrawerCount(doc: Y.Doc, columnIndex: number, moduleIndex: number, drawerCount: number) {
  doc.transact(() => {
    const ms = (getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>).get(columnIndex)?.get('modules') as Y.Array<Y.Map<unknown>>
    const m = ms.get(moduleIndex)
    if (!m) return
    m.set('drawerCount', Math.max(DRAWER_COUNT_MIN, Math.min(DRAWER_COUNT_MAX, Math.round(drawerCount))))
  }, 'setDrawerCount')
}

export function setShelfCount(doc: Y.Doc, columnIndex: number, moduleIndex: number, shelfCount: number) {
  doc.transact(() => {
    const ms = (getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>).get(columnIndex)?.get('modules') as Y.Array<Y.Map<unknown>>
    const m = ms.get(moduleIndex)
    if (!m) return
    m.set('shelfCount', Math.max(SHELF_COUNT_MIN, Math.min(SHELF_COUNT_MAX, Math.round(shelfCount))))
  }, 'setShelfCount')
}

export function setDividerCount(doc: Y.Doc, columnIndex: number, moduleIndex: number, dividerCount: number) {
  doc.transact(() => {
    const ms = (getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>).get(columnIndex)?.get('modules') as Y.Array<Y.Map<unknown>>
    const m = ms.get(moduleIndex)
    if (!m) return
    m.set('dividerCount', Math.max(DIVIDER_COUNT_MIN, Math.min(DIVIDER_COUNT_MAX, Math.round(dividerCount))))
  }, 'setDividerCount')
}

export function setFrameMemberCount(doc: Y.Doc, columnIndex: number, moduleIndex: number, key: 'frameRailCount' | 'frameStileCount', value: number) {
  doc.transact(() => {
    const ms = (getFurnitureMap(doc).get('columns') as Y.Array<Y.Map<unknown>>).get(columnIndex)?.get('modules') as Y.Array<Y.Map<unknown>>
    const m = ms?.get(moduleIndex)
    if (!m) return
    m.set(key, Math.max(FRAME_MEMBER_COUNT_MIN, Math.min(FRAME_MEMBER_COUNT_MAX, Math.round(value))))
  }, 'setFrameMemberCount')
}

export function setConfigValue<K extends keyof FurnitureConfig>(doc: Y.Doc, key: K, value: FurnitureConfig[K]) {
  doc.transact(() => {
    const cfg = getFurnitureMap(doc).get('config') as Y.Map<unknown>
    cfg?.set(key as string, sanitizeConfigValue(key, value))
  }, 'setConfigValue')
}

export function setSettingValue<K extends keyof ProjectSettings>(doc: Y.Doc, key: K, value: ProjectSettings[K]) {
  doc.transact(() => {
    const map = getFurnitureMap(doc)
    let settings = map.get('settings') as Y.Map<unknown> | undefined
    if (!settings) {
      settings = new Y.Map<unknown>()
      for (const k of PROJECT_SETTINGS_KEYS) settings.set(k, DEFAULT_PROJECT_SETTINGS[k])
      map.set('settings', settings)
    }
    const current = readSettingsMap(map)
    const clean = sanitizeProjectSettings({ ...current, [key]: value })
    settings.set(key as string, clean[key])
  }, 'setSettingValue')
}

export function setPanelAttributes(doc: Y.Doc, role: string, value: Partial<PanelAttributes>) {
  doc.transact(() => {
    const map = getFurnitureMap(doc)
    let attributes = map.get('panelAttributes') as Y.Map<unknown> | undefined
    if (!attributes) {
      attributes = new Y.Map<unknown>()
      map.set('panelAttributes', attributes)
    }
    const current = readPanelAttributesMap(map)[role as keyof PanelAttributeMap]
    writePanelAttributes(attributes, role, sanitizePanelAttributes({ ...current, ...value }))
  }, 'setPanelAttributes')
}

function drillingMapFor(doc: Y.Doc): { map: Y.Map<unknown>, drilling: Y.Map<unknown> } {
  const map = getFurnitureMap(doc)
  let drilling = map.get('drilling') as Y.Map<unknown> | undefined
  if (!drilling) {
    drilling = new Y.Map<unknown>()
    map.set('drilling', drilling)
  }
  return { map, drilling }
}

export function addDrillingRule(doc: Y.Doc, role: string) {
  doc.transact(() => {
    const { map, drilling } = drillingMapFor(doc)
    const rules = readDrillingMap(map)[role as keyof DrillingMap] ?? []
    const next = [...rules, defaultDrillingRule(`${role}-${cryptoRandomId()}`)]
    writeDrillingRules(drilling, role, next)
  }, 'addDrillingRule')
}

export function removeDrillingRule(doc: Y.Doc, role: string, ruleId: string) {
  doc.transact(() => {
    const { map, drilling } = drillingMapFor(doc)
    const rules = readDrillingMap(map)[role as keyof DrillingMap] ?? []
    writeDrillingRules(drilling, role, rules.filter(rule => rule.id !== ruleId))
  }, 'removeDrillingRule')
}

export function updateDrillingRule(doc: Y.Doc, role: string, ruleId: string, patch: Partial<DrillingRule>) {
  doc.transact(() => {
    const { map, drilling } = drillingMapFor(doc)
    const rules = readDrillingMap(map)[role as keyof DrillingMap] ?? []
    const next = rules.map(rule =>
      rule.id === ruleId
        ? { ...rule, ...patch, pattern: { ...rule.pattern, ...(patch.pattern ?? {}) } }
        : rule,
    )
    writeDrillingRules(drilling, role, sanitizeDrillingMap({ [role]: next })[role as keyof DrillingMap])
  }, 'updateDrillingRule')
}

export function setJoineryValue<K extends keyof JoinerySettings>(doc: Y.Doc, key: K, value: JoinerySettings[K]) {
  doc.transact(() => {
    const map = getFurnitureMap(doc)
    let joinery = map.get('joinery') as Y.Map<unknown> | undefined
    if (!joinery) {
      joinery = new Y.Map<unknown>()
      for (const k of JOINERY_KEYS) joinery.set(k, DEFAULT_JOINERY_SETTINGS[k])
      map.set('joinery', joinery)
    }
    const clean = sanitizeJoinery({ ...readJoinery(map), [key]: value })
    joinery.set(key as string, clean[key])
  }, 'setJoineryValue')
}

export function resetDrilling(doc: Y.Doc) {
  doc.transact(() => {
    const { drilling } = drillingMapFor(doc)
    for (const role of ALL_PANEL_ROLES) writeDrillingRules(drilling, role, [])
  }, 'resetDrilling')
}

export function resetPanelAttributes(doc: Y.Doc) {
  doc.transact(() => {
    const map = getFurnitureMap(doc)
    let attributes = map.get('panelAttributes') as Y.Map<unknown> | undefined
    if (!attributes) {
      attributes = new Y.Map<unknown>()
      map.set('panelAttributes', attributes)
    }
    const defaults = defaultPanelAttributeMap()
    for (const role of ALL_PANEL_ROLES) writePanelAttributes(attributes, role, defaults[role])
  }, 'resetPanelAttributes')
}

export function resetSettings(doc: Y.Doc) {
  doc.transact(() => {
    const map = getFurnitureMap(doc)
    let settings = map.get('settings') as Y.Map<unknown> | undefined
    if (!settings) {
      settings = new Y.Map<unknown>()
      map.set('settings', settings)
    }
    for (const key of PROJECT_SETTINGS_KEYS) settings.set(key, DEFAULT_PROJECT_SETTINGS[key])
  }, 'resetSettings')
}

export function replaceFurnitureDoc(doc: Y.Doc, next: Pick<FurnitureDoc, 'config' | 'columns'> & Partial<Pick<FurnitureDoc, 'settings'>>) {
  doc.transact(() => {
    const map = getFurnitureMap(doc)
    map.set('schemaVersion', DESIGN_SCHEMA_VERSION)
    if (next.settings) {
      let settings = map.get('settings') as Y.Map<unknown> | undefined
      if (!settings) {
        settings = new Y.Map<unknown>()
        map.set('settings', settings)
      }
      const clean = sanitizeProjectSettings(next.settings)
      for (const key of PROJECT_SETTINGS_KEYS) settings.set(key, clean[key])
    }
    let cfg = map.get('config') as Y.Map<unknown> | undefined
    if (!cfg) {
      cfg = new Y.Map<unknown>()
      map.set('config', cfg)
    }
    for (const key of FURNITURE_CONFIG_WRITABLE_KEYS) {
      cfg.set(key, sanitizeConfigValue(key, next.config[key]))
    }

    let cols = map.get('columns') as Y.Array<Y.Map<unknown>> | undefined
    if (!cols) {
      cols = new Y.Array<Y.Map<unknown>>()
      map.set('columns', cols)
    }
    if (cols.length > 0) cols.delete(0, cols.length)
    cols.insert(0, next.columns.map(toYColumn))
  })
}
