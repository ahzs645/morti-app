// Build a `.morti` fixture file from a plain JS furniture description.
//
// This is handy for: reproducible UI/screenshot demos, regression fixtures, and
// importing furniture shapes (e.g. designs replicated from other tools — see
// docs/woodworking-port.md) without clicking through the editor.
//
// A `.morti` file is just a JSON envelope wrapping a base64-encoded Yjs update.
// We build the same Y.Doc structure that shared/yjs/doc.ts `ensureInitialized`
// expects, so the file imports cleanly through the app's Import button.
//
// Usage:
//   node scripts/make-demo-fixture.mjs out.morti
//
// Edit COLUMNS below to change the piece. Module types:
//   shelf  | shelves(shelfCount) | drawer(drawerCount) | doors | left-door | right-door
import * as Y from 'yjs'
import { writeFileSync } from 'node:fs'

// Mirror of DEFAULT_FURNITURE_CONFIG (shared/domain/defaults.ts). All metres.
const DEFAULT_CONFIG = {
  depth: 0.45, panelThickness: 0.018, backPanelThickness: 0.02, panelJointClearance: 0.002,
  frontClearance: 0.002, sidePanelOverhang: 0.02, pullHoleDiameter: 0.025, pullHoleEdgeInset: 0.04,
  pullHolePairGap: 0.06, backPanelGrooveClearance: 0.001, drawerBottomInset: 0.02, drawerSlidesReserve: 0.01,
  backPanelInset: 0.01, minColumnWidth: 0.12, maxColumnWidth: 1.2, minModuleHeight: 0.08,
  maxModuleHeight: 1.2, minDrawerHeight: 0.08, maxDrawerHeight: 0.25,
}

// The demo piece showcasing the `shelves` component. width in metres.
const COLUMNS = [
  { width: 0.5, modules: [{ type: 'shelves', height: 1.2, shelfCount: 4 }] },
  { width: 0.5, modules: [{ type: 'shelf', height: 0.6 }, { type: 'drawer', height: 0.6, drawerCount: 2 }] },
  { width: 0.5, modules: [{ type: 'shelves', height: 0.7, shelfCount: 3 }, { type: 'doors', height: 0.5 }] },
]

let counter = 0
const nextId = () => `mod-${(++counter).toString().padStart(3, '0')}`

function toYModule(m) {
  const y = new Y.Map()
  y.set('id', nextId())
  y.set('type', m.type)
  y.set('height', m.height)
  if (typeof m.drawerCount === 'number') y.set('drawerCount', m.drawerCount)
  if (typeof m.shelfCount === 'number') y.set('shelfCount', m.shelfCount)
  return y
}

function toYColumn(c) {
  const col = new Y.Map()
  col.set('width', c.width)
  const arr = new Y.Array()
  arr.push(c.modules.map(toYModule))
  col.set('modules', arr)
  return col
}

const doc = new Y.Doc()
const map = doc.getMap('furniture')
map.set('schemaVersion', 3) // DESIGN_SCHEMA_VERSION
map.set('lastAppliedMigrationId', null)
const cfg = new Y.Map()
for (const [k, v] of Object.entries(DEFAULT_CONFIG)) cfg.set(k, v)
map.set('config', cfg)
const cols = new Y.Array()
cols.push(COLUMNS.map(toYColumn))
map.set('columns', cols)

const envelope = {
  formatVersion: 1,             // MORTI_FORMAT_VERSION
  designSchemaVersion: 3,       // DESIGN_SCHEMA_VERSION
  assemblyCompilerVersion: 1,   // ASSEMBLY_COMPILER_VERSION
  technicalRendererVersion: 1,  // TECHNICAL_RENDERER_VERSION
  exportedAt: new Date().toISOString(),
  yjsUpdateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
}

const out = process.argv[2] || 'demo.morti'
writeFileSync(out, JSON.stringify(envelope))
console.log(`wrote ${out} (${Buffer.byteLength(JSON.stringify(envelope))} bytes)`)
