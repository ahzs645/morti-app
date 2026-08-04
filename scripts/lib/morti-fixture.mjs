// Build a `.morti` file from a plain JS description of a design.
//
// A `.morti` file is a JSON envelope wrapping a base64-encoded Yjs update, so
// this builds the same Y.Doc structure `ensureInitialized` in shared/yjs/doc.ts
// expects and encodes it. Anything produced here imports through the app's
// Import button exactly like a file the editor saved.
//
// Kept separate from the scripts that use it so fixture shapes stay in one
// place — scripts/make-demo-fixture.mjs and scripts/compare-views.mjs both
// build on it.
import * as Y from 'yjs'

/** Mirror of DESIGN_SCHEMA_VERSION in shared/yjs/doc.ts. */
export const DESIGN_SCHEMA_VERSION = 4

/** Mirror of DEFAULT_FURNITURE_CONFIG (shared/domain/defaults.ts). All metres. */
export const DEFAULT_CONFIG = {
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
  maxDrawerHeight: 0.35,
}

/** Module fields the editor understands, beyond `id`/`type`/`height`. */
const MODULE_FIELDS = ['shelfCount', 'drawerCount', 'dividerCount', 'frameRailCount', 'frameStileCount']

function toYMap(record) {
  const map = new Y.Map()
  for (const [key, value] of Object.entries(record)) map.set(key, value)
  return map
}

/**
 * @param {object} design
 * @param {Array<{width:number, modules:object[]}>} design.columns
 * @param {object}  [design.config]          overrides on DEFAULT_CONFIG
 * @param {object}  [design.outlines]        role -> { shape, amount, points }
 * @param {object}  [design.routerProfiles]  role -> { kind, bitSize, pocketCount, edges }
 * @param {object}  [design.panelAttributes] role -> { grain, bands }
 * @param {object[]}[design.freePanels]
 * @param {object}  [design.drilling]        role -> rule
 * @param {object}  [design.joinery]
 * @param {object}  [design.settings]
 * @returns {string} the file's JSON text
 */
export function buildMortiFile(design) {
  let counter = 0
  const nextId = () => `mod-${(++counter).toString().padStart(3, '0')}`

  const doc = new Y.Doc()
  const map = doc.getMap('furniture')

  doc.transact(() => {
    map.set('schemaVersion', DESIGN_SCHEMA_VERSION)
    map.set('lastAppliedMigrationId', null)
    map.set('config', toYMap({ ...DEFAULT_CONFIG, ...(design.config ?? {}) }))

    const columns = new Y.Array()
    columns.push((design.columns ?? []).map((column) => {
      const yColumn = new Y.Map()
      yColumn.set('width', column.width)
      const modules = new Y.Array()
      modules.push((column.modules ?? []).map((module) => {
        const yModule = new Y.Map()
        yModule.set('id', module.id ?? nextId())
        yModule.set('type', module.type)
        yModule.set('height', module.height)
        for (const field of MODULE_FIELDS) {
          if (typeof module[field] === 'number') yModule.set(field, module[field])
        }
        return yModule
      }))
      yColumn.set('modules', modules)
      return yColumn
    }))
    map.set('columns', columns)

    // Branches the editor reads lazily; only written when the design uses them,
    // so a fixture stays as close to a fresh document as it can.
    if (design.outlines) map.set('outlines', toYMap(design.outlines))
    if (design.routerProfiles) map.set('routerProfiles', toYMap(design.routerProfiles))
    if (design.joinery) map.set('joinery', toYMap(design.joinery))

    if (design.drilling) {
      // Rules are stored as a Y.Array of plain JSON per role — a lone rule
      // object here reads back as `undefined.toArray()` and takes the whole
      // import down with it.
      const drilling = new Y.Map()
      for (const [role, rules] of Object.entries(design.drilling)) {
        const array = new Y.Array()
        array.push(Array.isArray(rules) ? rules : [rules])
        drilling.set(role, array)
      }
      map.set('drilling', drilling)
    }
    if (design.settings) map.set('settings', toYMap(design.settings))
    if (design.variables) map.set('variables', toYMap(design.variables))
    if (design.transport) map.set('transport', toYMap(design.transport))

    if (design.panelAttributes) {
      const attributes = new Y.Map()
      for (const [role, attribute] of Object.entries(design.panelAttributes)) {
        const yAttribute = new Y.Map()
        if (attribute.grain != null) yAttribute.set('grain', attribute.grain)
        if (attribute.materialId != null) yAttribute.set('materialId', attribute.materialId)
        if (attribute.bands) yAttribute.set('bands', toYMap(attribute.bands))
        attributes.set(role, yAttribute)
      }
      map.set('panelAttributes', attributes)
    }

    if (design.freePanels) {
      const freePanels = new Y.Array()
      freePanels.push(design.freePanels.map((panel, index) => ({
        id: panel.id ?? `free-${index + 1}`,
        label: panel.label ?? `Panel ${index + 1}`,
        size: panel.size,
        position: panel.position,
        role: panel.role ?? 'horizontal-deck',
        groupId: panel.groupId ?? null,
      })))
      map.set('freePanels', freePanels)
    }
  })

  return JSON.stringify({
    formatVersion: 1,
    designSchemaVersion: DESIGN_SCHEMA_VERSION,
    assemblyCompilerVersion: 1,
    technicalRendererVersion: 1,
    // Fixed so a regenerated fixture diffs cleanly.
    exportedAt: '2026-01-01T00:00:00.000Z',
    yjsUpdateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
  }, null, 2)
}
