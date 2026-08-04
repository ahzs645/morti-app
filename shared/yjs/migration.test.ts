// Guards the schema 3 → 4 bump that introduced the free-panel layer: a
// document written before the bump must still load, and must compile to
// exactly the panels it did before.

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { ensureInitialized, getFurnitureMap, readFurnitureDoc } from './doc'
import { DESIGN_SCHEMA_VERSION } from '~~/shared/domain/types'

/** Build a Y.Doc shaped the way a pre-free-panel (schema 3) document was:
 *  schemaVersion, config, and columns — and nothing else. */
function legacyDoc(): Y.Doc {
  const doc = new Y.Doc()
  const map = doc.getMap('furniture')
  doc.transact(() => {
    map.set('schemaVersion', 3)
    map.set('lastAppliedMigrationId', '1740000001000_legacy_furniture_config_keys')

    const config = new Y.Map<unknown>()
    config.set('depth', 0.45)
    config.set('panelThickness', 0.018)
    map.set('config', config)

    const module = new Y.Map<unknown>()
    module.set('id', 'm1')
    module.set('type', 'shelves')
    module.set('height', 1.2)
    module.set('shelfCount', 3)

    const modules = new Y.Array<Y.Map<unknown>>()
    modules.push([module])

    const column = new Y.Map<unknown>()
    column.set('width', 0.5)
    column.set('modules', modules)

    const columns = new Y.Array<Y.Map<unknown>>()
    columns.push([column])
    map.set('columns', columns)
  })
  return doc
}

describe('schema 3 → 4 migration', () => {
  it('loads a pre-free-panel document without throwing', () => {
    const doc = legacyDoc()
    expect(() => ensureInitialized(doc)).not.toThrow()
  })

  it('upgrades the stored schema version', () => {
    const doc = legacyDoc()
    ensureInitialized(doc)
    expect(getFurnitureMap(doc).get('schemaVersion')).toBe(DESIGN_SCHEMA_VERSION)
  })

  it('preserves the existing design', () => {
    const doc = legacyDoc()
    ensureInitialized(doc)
    const data = readFurnitureDoc(doc)
    expect(data.columns).toHaveLength(1)
    expect(data.columns[0].width).toBeCloseTo(0.5, 10)
    expect(data.columns[0].modules[0]).toMatchObject({ id: 'm1', type: 'shelves', shelfCount: 3 })
    expect(data.config.depth).toBeCloseTo(0.45, 10)
  })

  it('starts the new branches empty, so nothing is added to the design', () => {
    const doc = legacyDoc()
    ensureInitialized(doc)
    const data = readFurnitureDoc(doc)
    expect(data.freePanels).toEqual([])
    // Joinery defaults to butt and drilling to no rules: both compile to nothing.
    expect(data.joinery.style).toBe('butt')
    for (const rules of Object.values(data.drilling)) expect(rules).toEqual([])
    for (const profile of Object.values(data.routerProfiles)) expect(profile.kind).toBe('none')
  })

  it('seeds the presentation branches with defaults', () => {
    const doc = legacyDoc()
    ensureInitialized(doc)
    const data = readFurnitureDoc(doc)
    expect(data.settings.lengthUnit).toBe('mm')
    expect(data.panelAttributes['vertical-side'].grain).toBe('length')
  })

  it('is idempotent — running init twice changes nothing', () => {
    const doc = legacyDoc()
    ensureInitialized(doc)
    const first = JSON.stringify(readFurnitureDoc(doc))
    ensureInitialized(doc)
    expect(JSON.stringify(readFurnitureDoc(doc))).toBe(first)
  })

  it('initializes a brand-new document at the current schema', () => {
    const doc = new Y.Doc()
    ensureInitialized(doc)
    expect(getFurnitureMap(doc).get('schemaVersion')).toBe(DESIGN_SCHEMA_VERSION)
    expect(readFurnitureDoc(doc).freePanels).toEqual([])
  })
})
