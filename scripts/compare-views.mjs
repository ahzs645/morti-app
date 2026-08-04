// Screenshot every design option twice — once in the flat front view, once in
// the 3D preview — so the two can be compared side by side.
//
// The flat view is hand-drawn HTML while the 3D comes out of the parametric
// compiler, so they drift apart silently: a module type that renders as a solid
// slab on the left and an open bay on the right looks fine in isolation and
// wrong the moment you see both. This walks one fixture per option and captures
// both panes, plus a contact sheet that puts each pair next to the other.
//
// Usage:
//   npm run dev                        # in another terminal
//   node scripts/compare-views.mjs
//   node scripts/compare-views.mjs --case=frame --case=dividers
//   node scripts/compare-views.mjs --url=http://localhost:3000 --out=.screenshots
//
// Output (default .screenshots/compare/):
//   <case>-2d.png     the flat front view pane
//   <case>-3d.png     the 3D preview canvas
//   <case>-split.png  the whole editor, both panes at once
//   index.html        contact sheet — open this
//
// Chromium comes from Playwright. In a container without a bundled browser,
// point CHROMIUM_PATH at one and it will be used instead.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildMortiFile } from './lib/morti-fixture.mjs'

/**
 * Playwright reaches for its own `chrome-headless-shell` build, which a
 * container that pre-installs only full Chromium will not have. Find that
 * Chromium and use it rather than making every caller export a path.
 * Returns null to let Playwright resolve its own browser as usual.
 */
function resolveChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!root || !existsSync(root)) return null
  const candidates = readdirSync(root)
    .filter(name => name.startsWith('chromium-'))
    .sort()
    .reverse()
    .map(name => join(root, name, 'chrome-linux', 'chrome'))
  return [join(root, 'chromium'), ...candidates].find(path => existsSync(path)) ?? null
}

// --- Cases -----------------------------------------------------------------
//
// One option per case, isolated, so a screenshot shows that option and nothing
// else. `expect` says what the pair should agree on; it is printed under the
// images in the contact sheet, which is where a mismatch gets noticed.

const BAY = { width: 0.5, height: 1.2 }

const CASES = [
  {
    id: 'shelf',
    title: 'Empty bay (shelf)',
    expect: 'An open bay in both. It compiles to no panels at all, so nothing sits inside it.',
    design: { columns: [{ width: BAY.width, modules: [{ type: 'shelf', height: BAY.height }] }] },
  },
  {
    id: 'shelves',
    title: 'Shelves ×4',
    expect: 'Four horizontal boards spanning the bay, evenly spaced, at panel thickness.',
    design: { columns: [{ width: BAY.width, modules: [{ type: 'shelves', height: BAY.height, shelfCount: 4 }] }] },
  },
  {
    id: 'dividers',
    title: 'Dividers ×3',
    expect: 'Three vertical boards, evenly spaced. Not a row of doors.',
    design: { columns: [{ width: BAY.width, modules: [{ type: 'dividers', height: BAY.height, dividerCount: 3 }] }] },
  },
  {
    id: 'frame',
    title: 'Face frame (1 stile, 2 rails)',
    expect: 'A 2×3 grid of openings you can see through, all six the same size.',
    design: { columns: [{ width: BAY.width, modules: [{ type: 'frame', height: BAY.height, frameStileCount: 1, frameRailCount: 2 }] }] },
  },
  {
    id: 'frame-dense',
    title: 'Face frame (2 stiles, 3 rails)',
    expect: 'A 3×4 grid of equal openings — the end openings must not be larger than the middle ones.',
    design: { columns: [{ width: 0.7, modules: [{ type: 'frame', height: BAY.height, frameStileCount: 2, frameRailCount: 3 }] }] },
  },
  {
    id: 'drawer',
    title: 'Drawers ×4',
    expect: 'Four solid fronts, each with a pair of pull holes.',
    design: { columns: [{ width: BAY.width, modules: [{ type: 'drawer', height: BAY.height, drawerCount: 4 }] }] },
  },
  {
    id: 'doors',
    title: 'Double doors',
    expect: 'Two solid leaves meeting at a centre gap, a pull either side of it.',
    design: { columns: [{ width: BAY.width, modules: [{ type: 'doors', height: BAY.height }] }] },
  },
  {
    id: 'single-doors',
    title: 'Left door over right door',
    expect: 'Two single leaves stacked, pulls on opposite sides.',
    design: {
      columns: [{
        width: BAY.width,
        modules: [{ type: 'left-door', height: 0.6 }, { type: 'right-door', height: 0.6 }],
      }],
    },
  },
  {
    id: 'stacked-modules',
    title: 'One module vs two of the same total height',
    expect: 'Both columns exactly the same height. Splitting a bay in two must not make the piece taller.',
    design: {
      columns: [
        { width: BAY.width, modules: [{ type: 'drawer', height: 1.2, drawerCount: 2 }] },
        { width: BAY.width, modules: [{ type: 'left-door', height: 0.6 }, { type: 'right-door', height: 0.6 }] },
        {
          width: BAY.width,
          modules: [
            { type: 'shelves', height: 0.4, shelfCount: 1 },
            { type: 'shelves', height: 0.4, shelfCount: 1 },
            { type: 'shelves', height: 0.4, shelfCount: 1 },
          ],
        },
      ],
    },
  },
  {
    id: 'outline-arch',
    title: 'Arch-top door outline',
    expect: 'Both leaves arch over at the top. The flat view clips the front to the same profile the 3D extrudes.',
    design: {
      columns: [{ width: BAY.width, modules: [{ type: 'doors', height: BAY.height }] }],
      outlines: { 'door-front': { shape: 'arch-top', amount: 0.28, points: [] } },
    },
  },
  {
    id: 'outline-cut-corner',
    title: 'Cut-corner drawer fronts',
    expect: 'Known gap: the 3D cuts the corner off each front, the flat view still draws them square.',
    design: {
      columns: [{ width: BAY.width, modules: [{ type: 'drawer', height: BAY.height, drawerCount: 3 }] }],
      outlines: { 'drawer-front': { shape: 'cut-top-right', amount: 0.3, points: [] } },
    },
  },
  {
    id: 'outline-side',
    title: 'Arched side panels',
    expect: 'Only the 3D can show this: a side panel stands edge-on to a front elevation, so it has no profile to draw.',
    design: {
      columns: [{ width: BAY.width, modules: [{ type: 'shelves', height: BAY.height, shelfCount: 3 }] }],
      outlines: { 'vertical-side': { shape: 'arch-top', amount: 0.3, points: [] } },
    },
  },
  {
    id: 'router-chamfer',
    title: 'Chamfered deck edges',
    expect: 'Only the 3D can show this: an edge profile is a few millimetres deep and reads as a line in elevation.',
    design: {
      columns: [{ width: BAY.width, modules: [{ type: 'shelves', height: BAY.height, shelfCount: 3 }] }],
      routerProfiles: {
        'horizontal-deck': {
          kind: 'chamfer',
          bitSize: 0.012,
          pocketCount: 3,
          edges: { top: true, bottom: false, left: true, right: true },
        },
      },
    },
  },
  {
    id: 'drilling',
    title: 'System-32 shelf pin rows',
    expect: 'Only the 3D can show this: holes are bored into the inner faces of the side panels.',
    design: {
      columns: [{ width: BAY.width, modules: [{ type: 'shelves', height: BAY.height, shelfCount: 3 }] }],
      drilling: {
        'vertical-side': {
          id: 'vertical-side',
          enabled: true,
          operationType: 'through-hole',
          face: 'front',
          diameter: 0.005,
          depth: 0.012,
          headDiameter: 0.01,
          headDepth: 0.006,
          hardwareCode: null,
          pattern: { kind: 'row', anchor: 'left', count: 8, rows: 2, spacing: 0.032, rowSpacing: 0.032, inset: 0.037, offset: 0 },
        },
      },
    },
  },
  {
    id: 'joinery-dowel',
    title: 'Dowelled joints',
    expect: 'Only the 3D can show this: the bores sit in the joints between panels. The cutlist is where it is checked.',
    design: {
      columns: [{ width: BAY.width, modules: [{ type: 'shelves', height: BAY.height, shelfCount: 3 }] }],
      joinery: { style: 'dowel', fastenersPerJoint: 2, fastenerDiameter: 0.008, fastenerDepth: 0.015, endInset: 0.05 },
    },
  },
  {
    id: 'free-panel',
    title: 'Free panel over the carcass',
    expect: 'A board floating clear above the carcass in both, spanning its full width.',
    design: {
      columns: [
        { width: BAY.width, modules: [{ type: 'shelves', height: BAY.height, shelfCount: 3 }] },
        { width: BAY.width, modules: [{ type: 'drawer', height: BAY.height, drawerCount: 3 }] },
      ],
      freePanels: [{
        id: 'free-top',
        label: 'Top board',
        size: { x: 1.1, y: 0.025, z: 0.5 },
        position: { x: 0, y: 1.35, z: 0 },
        role: 'horizontal-deck',
      }],
    },
  },
  {
    id: 'bands-grain',
    title: 'Edge banding and grain',
    expect: 'Only the 3D can show this: grain runs across the shelf faces. Banding is a cutlist column.',
    design: {
      columns: [{ width: BAY.width, modules: [{ type: 'shelves', height: BAY.height, shelfCount: 4 }] }],
      panelAttributes: {
        'internal-shelf': {
          grain: 'width',
          bands: { top: 'abs-2-22', bottom: null, left: null, right: null },
        },
      },
    },
  },
  {
    id: 'all',
    title: 'Every module type at once',
    expect: 'Column for column, the two panes tell the same story left to right.',
    design: {
      columns: [
        { width: BAY.width, modules: [{ type: 'shelves', height: BAY.height, shelfCount: 4 }] },
        { width: BAY.width, modules: [{ type: 'dividers', height: BAY.height, dividerCount: 3 }] },
        { width: BAY.width, modules: [{ type: 'frame', height: BAY.height, frameStileCount: 1, frameRailCount: 2 }] },
        { width: BAY.width, modules: [{ type: 'drawer', height: BAY.height, drawerCount: 4 }] },
        { width: BAY.width, modules: [{ type: 'doors', height: BAY.height }] },
        { width: BAY.width, modules: [{ type: 'left-door', height: 0.6 }, { type: 'right-door', height: 0.6 }] },
        { width: BAY.width, modules: [{ type: 'shelf', height: BAY.height }] },
      ],
      freePanels: [{
        id: 'free-top',
        label: 'Top board',
        size: { x: 3.6, y: 0.025, z: 0.5 },
        position: { x: 0, y: 1.35, z: 0 },
        role: 'horizontal-deck',
      }],
    },
  },
]

// --- Options ---------------------------------------------------------------

function parseArgs(argv) {
  const options = { url: 'http://localhost:3000', out: '.screenshots/compare', cases: [] }
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=')
    if (key === 'case' && value) options.cases.push(value)
    else if (key === 'url' && value) options.url = value.replace(/\/$/, '')
    else if (key === 'out' && value) options.out = value
    else if (key === 'help') options.help = true
  }
  return options
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  console.log('node scripts/compare-views.mjs [--url=http://localhost:3000] [--out=dir] [--case=id ...]')
  console.log('cases:', CASES.map(c => c.id).join(', '))
  process.exit(0)
}

const selected = options.cases.length > 0
  ? CASES.filter(c => options.cases.includes(c.id))
  : CASES
if (selected.length === 0) {
  console.error(`No case matched. Available: ${CASES.map(c => c.id).join(', ')}`)
  process.exit(1)
}

const outDir = resolve(process.cwd(), options.out)
const fixtureDir = join(outDir, 'fixtures')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(fixtureDir, { recursive: true })

// --- Capture ---------------------------------------------------------------

// The 3D pane needs a moment to compile the assembly, upload geometry and
// settle its camera; there is no ready signal to await, so these are the waits
// that proved reliable rather than numbers picked for their own sake.
const IMPORT_SETTLE_MS = 6000
const RENDER_SETTLE_MS = 9000

const executablePath = resolveChromium()
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  // SwiftShader so the WebGL preview renders without a GPU.
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 2 })

const problems = []
page.on('pageerror', error => problems.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() !== 'error' && message.type() !== 'warning') return
  if (message.text().includes('ERR_CONNECTION_RESET')) return
  problems.push(`${message.type()}: ${message.text()}`)
})

/**
 * Point the 3D camera straight down −Z, so it frames the same elevation the
 * flat view draws. The default camera is a three-quarter view: good for reading
 * depth, useless for comparing against a front elevation, because every edge is
 * foreshortened by a different amount.
 *
 * The editor keeps its camera in IndexedDB and restores it on load, so this
 * writes the state there and reloads. `fitToView` in DesignerCanvas re-frames
 * without changing the direction, so the framing stays automatic.
 */
async function faceCameraFront(projectId) {
  await page.evaluate(async (id) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('madera')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const store = db.transaction('projectEditorState', 'readwrite').objectStore('projectEditorState')
    const existing = await new Promise((resolve) => {
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
    // Distance is a placeholder; `fitToView` replaces it on the next frame.
    const camera = { position: [0, 0, 3], quaternion: [0, 0, 0, 1], target: [0, 0, 0] }
    await new Promise((resolve, reject) => {
      const request = store.put({ ...(existing ?? { id, projectId: id }), id, projectId: id, camera })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    db.close()
  }, projectId)
  await page.reload({ waitUntil: 'networkidle' })
}

async function captureCase(testCase) {
  const fixturePath = join(fixtureDir, `${testCase.id}.morti`)
  writeFileSync(fixturePath, buildMortiFile(testCase.design))

  await page.goto(`${options.url}/`, { waitUntil: 'networkidle' })
  await page.locator('input[type=file]').first().setInputFiles(fixturePath)
  await page.waitForTimeout(IMPORT_SETTLE_MS)

  if (!page.url().includes('/project/')) {
    // The import lands on the project list; the project carries the fixture's
    // file name, which is how the right one is picked out of earlier runs.
    await page.locator(`a[href^="/project/"]:has-text("${testCase.id}")`).first().click({ timeout: 30000 })
  }
  await page.waitForTimeout(RENDER_SETTLE_MS)

  const projectId = page.url().split('/project/')[1]?.split(/[?#]/)[0]
  if (!projectId) throw new Error(`did not land on a project page (at ${page.url()})`)
  await faceCameraFront(projectId)
  await page.waitForTimeout(RENDER_SETTLE_MS)

  await page.screenshot({ path: join(outDir, `${testCase.id}-split.png`) })
  await page.locator('.project-input-pane').first().screenshot({ path: join(outDir, `${testCase.id}-2d.png`) })
  await page.locator('canvas').first().screenshot({ path: join(outDir, `${testCase.id}-3d.png`) })
}

const results = []
for (const [index, testCase] of selected.entries()) {
  const before = problems.length
  process.stdout.write(`[${index + 1}/${selected.length}] ${testCase.id} … `)
  try {
    await captureCase(testCase)
    const fresh = problems.slice(before)
    results.push({ ...testCase, ok: true, problems: fresh })
    console.log(fresh.length > 0 ? `captured, ${fresh.length} console problem(s)` : 'captured')
  }
  catch (error) {
    // Keep the console output from the failed run: an import that never lands
    // on a project is usually a malformed fixture, and the page said why.
    const fresh = problems.slice(before)
    results.push({ ...testCase, ok: false, error: String(error?.message ?? error), problems: fresh })
    console.log(`FAILED — ${String(error?.message ?? error).split('\n')[0]}`)
    for (const problem of fresh.slice(0, 3)) console.log(`    ${problem}`)
  }
}

await browser.close()

// --- Contact sheet ---------------------------------------------------------

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

writeFileSync(join(outDir, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flat view vs 3D</title>
<style>
  :root { color-scheme: dark; --bg:#17100b; --fg:#f6e9dd; --muted:#c2a48c; --line:#3a2a1d; }
  body { margin:0; padding:2rem; background:var(--bg); color:var(--fg);
         font:15px/1.5 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size:1.5rem; margin:0 0 .25rem; }
  .sub { color:var(--muted); margin:0 0 2rem; }
  section { border-top:1px solid var(--line); padding:1.5rem 0; }
  h2 { font-size:1.05rem; margin:0 0 .25rem; }
  .expect { color:var(--muted); margin:0 0 1rem; max-width:70ch; }
  .pair { display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:1rem; }
  figure { margin:0; }
  figcaption { color:var(--muted); font-size:.8rem; text-transform:uppercase;
               letter-spacing:.06em; margin-bottom:.4rem; }
  img { width:100%; height:auto; display:block; border-radius:8px;
        border:1px solid var(--line); background:#0d0906; }
  .problems { margin-top:1rem; padding:.75rem 1rem; border-radius:8px;
              background:#3a1d1d; color:#ffd9d9; font-size:.85rem; white-space:pre-wrap; }
  a { color:inherit; }
</style>
</head>
<body>
<h1>Flat view vs 3D</h1>
<p class="sub">${selected.length} option${selected.length === 1 ? '' : 's'}, each captured in both panes.
Regenerate with <code>node scripts/compare-views.mjs</code>.</p>
${results.map(result => `<section id="${escapeHtml(result.id)}">
  <h2>${escapeHtml(result.title)}</h2>
  <p class="expect">${escapeHtml(result.expect)}</p>
  ${result.ok
    ? `<div class="pair">
    <figure><figcaption>Flat front view</figcaption><img src="${result.id}-2d.png" alt="${escapeHtml(result.title)} in the flat front view"></figure>
    <figure><figcaption>3D preview</figcaption><img src="${result.id}-3d.png" alt="${escapeHtml(result.title)} in the 3D preview"></figure>
  </div>
  <p class="expect"><a href="${result.id}-split.png">Both panes in one shot →</a></p>`
    : `<div class="problems">Capture failed: ${escapeHtml(result.error)}</div>`}
  ${result.problems?.length ? `<div class="problems">${escapeHtml(result.problems.join('\n'))}</div>` : ''}
</section>`).join('\n')}
</body>
</html>
`)

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} captured → ${join(outDir, 'index.html')}`)
if (problems.length > 0) {
  console.log(`\n${problems.length} console problem(s):`)
  for (const problem of [...new Set(problems)].slice(0, 12)) console.log(`  ${problem}`)
}
process.exit(failed.length > 0 ? 1 : 0)
