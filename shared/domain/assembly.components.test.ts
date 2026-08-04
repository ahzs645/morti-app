import { describe, expect, it, vi } from 'vitest'

// compileAssembly only does parametric panel layout; the CSG geometry path
// (the sole user of three-bvh-csg) is not exercised here. Stub it so the heavy
// three-mesh-bvh UMD bundle doesn't need to load under the node test runner.
vi.mock('three-bvh-csg', () => ({
  Brush: class {},
  Evaluator: class { evaluate() { return { geometry: {} } } },
  SUBTRACTION: 0,
}))

import { compileAssembly } from './assembly'
import { panelRoleCode } from './cutlist'
import { DEFAULT_DIVIDER_COUNT, DEFAULT_FURNITURE_CONFIG, DEFAULT_PROJECT_SETTINGS, DEFAULT_SHELF_COUNT, defaultModule } from './defaults'
import { defaultPanelAttributeMap } from './panel-attributes'
import type { FurnitureDoc, ModuleType } from './types'
import { DESIGN_SCHEMA_VERSION } from './types'

function docWithSingleModule(type: ModuleType, extra: Record<string, unknown> = {}): FurnitureDoc {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    lastAppliedMigrationId: null,
    config: { ...DEFAULT_FURNITURE_CONFIG },
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    panelAttributes: defaultPanelAttributeMap(),
    columns: [
      { width: 0.5, modules: [{ id: 'm1', type, height: 1.2, ...extra }] },
    ],
  }
}

const internalShelves = (doc: FurnitureDoc) =>
  compileAssembly(doc).panels.filter(p => p.role === 'internal-shelf')

const verticalDividers = (doc: FurnitureDoc) =>
  compileAssembly(doc).panels.filter(p => p.role === 'vertical-divider')

describe('shelves component compiler', () => {
  it('emits one internal-shelf panel per shelfCount', () => {
    for (const count of [1, 2, 4, 8]) {
      const panels = internalShelves(docWithSingleModule('shelves', { shelfCount: count }))
      expect(panels).toHaveLength(count)
    }
  })

  it('lays internal shelves out as horizontal boards sourced from the module', () => {
    const panels = internalShelves(docWithSingleModule('shelves', { shelfCount: 3 }))
    for (const p of panels) {
      expect(p.orientation).toBe('horizontal-xz')
      expect(p.sourceModuleId).toBe('m1')
      expect(p.width).toBeGreaterThan(0)
      expect(p.height).toBeGreaterThan(0)
    }
    // Boards are vertically distinct (evenly spaced, not stacked at one Y).
    const ys = panels.map(p => p.position[1]).sort((a, b) => a - b)
    expect(new Set(ys).size).toBe(3)
  })

  it('floors a missing shelfCount to one board, and an empty `shelf` emits none', () => {
    // The model layer (defaultModule/persistence) seeds shelfCount=DEFAULT_SHELF_COUNT,
    // but the compiler itself floors a missing value to 1 — same as compileDrawer's `?? 1`.
    expect(internalShelves(docWithSingleModule('shelves'))).toHaveLength(1)
    expect(internalShelves(docWithSingleModule('shelf'))).toHaveLength(0)
  })

  it('does not regress the existing module types', () => {
    // drawer still produces drawer panels; doors still produce door fronts.
    const drawer = compileAssembly(docWithSingleModule('drawer', { drawerCount: 2 })).panels
    expect(drawer.some(p => p.role === 'drawer-front')).toBe(true)
    expect(drawer.some(p => p.role === 'internal-shelf')).toBe(false)

    const doors = compileAssembly(docWithSingleModule('doors')).panels
    expect(doors.filter(p => p.role === 'door-front')).toHaveLength(2)
  })

  it('gives the internal-shelf role a stable cutlist code', () => {
    expect(panelRoleCode('internal-shelf')).toBe('I')
  })

  it('seeds shelfCount in defaultModule for shelves only', () => {
    expect(defaultModule('shelves').shelfCount).toBe(DEFAULT_SHELF_COUNT)
    expect(defaultModule('shelf').shelfCount).toBeUndefined()
  })
})

describe('dividers component compiler', () => {
  it('emits one vertical-divider panel per dividerCount', () => {
    for (const count of [1, 2, 4, 8]) {
      const panels = verticalDividers(docWithSingleModule('dividers', { dividerCount: count }))
      expect(panels).toHaveLength(count)
    }
  })

  it('lays dividers out as vertical boards at distinct x positions', () => {
    const panels = verticalDividers(docWithSingleModule('dividers', { dividerCount: 3 }))
    for (const p of panels) {
      expect(p.orientation).toBe('vertical-yz')
      expect(p.sourceModuleId).toBe('m1')
      expect(p.width).toBeGreaterThan(0)
      expect(p.height).toBeGreaterThan(0)
    }
    const xs = panels.map(p => p.position[0]).sort((a, b) => a - b)
    expect(new Set(xs).size).toBe(3)
  })

  it('floors a missing dividerCount to one board; other types emit none', () => {
    expect(verticalDividers(docWithSingleModule('dividers'))).toHaveLength(1)
    expect(verticalDividers(docWithSingleModule('shelf'))).toHaveLength(0)
    expect(verticalDividers(docWithSingleModule('shelves', { shelfCount: 4 }))).toHaveLength(0)
  })

  it('gives the vertical-divider role a stable cutlist code', () => {
    expect(panelRoleCode('vertical-divider')).toBe('V')
  })

  it('seeds dividerCount in defaultModule for dividers only', () => {
    expect(defaultModule('dividers').dividerCount).toBe(DEFAULT_DIVIDER_COUNT)
    expect(defaultModule('shelf').dividerCount).toBeUndefined()
  })
})
