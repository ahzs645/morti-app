// Build a `.morti` fixture file from a plain JS furniture description.
//
// This is handy for: reproducible UI/screenshot demos, regression fixtures, and
// importing furniture shapes (e.g. designs replicated from other tools — see
// docs/woodworking-port.md) without clicking through the editor.
//
// The Yjs document the file wraps is built by scripts/lib/morti-fixture.mjs, so
// the schema version and branch encodings stay in one place rather than drifting
// per script.
//
// Usage:
//   node scripts/make-demo-fixture.mjs out.morti
//
// Edit COLUMNS below to change the piece. Module types:
//   shelf | shelves(shelfCount) | dividers(dividerCount) | drawer(drawerCount)
//   frame(frameRailCount, frameStileCount) | doors | left-door | right-door
//
// For a design that also uses outlines, router profiles, drilling, joinery or
// free panels, pass those branches to `buildMortiFile` — see the cases in
// scripts/compare-views.mjs for worked examples of each.
import { writeFileSync } from 'node:fs'
import { buildMortiFile } from './lib/morti-fixture.mjs'

// The demo piece showcasing the `shelves` component. width in metres.
const COLUMNS = [
  { width: 0.5, modules: [{ type: 'shelves', height: 1.2, shelfCount: 4 }] },
  { width: 0.5, modules: [{ type: 'shelf', height: 0.6 }, { type: 'drawer', height: 0.6, drawerCount: 2 }] },
  { width: 0.5, modules: [{ type: 'shelves', height: 0.7, shelfCount: 3 }, { type: 'doors', height: 0.5 }] },
]

const contents = buildMortiFile({
  columns: COLUMNS,
  config: { maxDrawerHeight: 0.25 },
})

const out = process.argv[2] || 'demo.morti'
writeFileSync(out, contents)
console.log(`wrote ${out} (${Buffer.byteLength(contents)} bytes)`)
