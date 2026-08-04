# Porting designs & components from FreeCAD "Woodworking" into Morti

This doc captures how we evaluate and bring capabilities from
[dprojects/Woodworking](https://github.com/dprojects/Woodworking) into Morti, and
gives a **repeatable recipe** for adding a new furniture component. It uses the
`shelves` component (added in this change) as the worked example.

## TL;DR feasibility

- **Woodworking** is a [FreeCAD](https://www.freecad.org/) workbench written in
  Python (~99% Python). It drives FreeCAD's geometry kernel with "magic" macros
  (`magicStart`, `magicDowels`, `magicDriller`, `magicColors`, `getDimensions`,
  `sheet2export`, …).
- **Morti** is a web app (Nuxt 4 / Vue 3 / Three.js) with a **parametric,
  panel-based** model: a design is `columns → modules`, and a compiler turns those
  into panels + operations for 3D, cutlist, and export.

There is **no shared runtime, file format, or geometry kernel**, so we cannot
literally import Woodworking code or `.FCStd` files. What we *can* do — and what
this guide is about — is **replicate the capability as a native Morti component**
that flows through the existing parametric pipeline. That gives us 3D preview,
cutlist, and `.morti` export "for free".

## Capability map: Woodworking → Morti

The workbench ships **158 toolbar entries across 23 toolbars** — 144 workbench
tools plus 14 FreeCAD built-ins it borrows. The full per-tool mapping is a live
page in the app at **`/tools`** (source: `shared/domain/woodworking-tools.ts`),
which is the place to look up any individual tool. The table here is the
capability-level summary.

| Woodworking capability | Morti equivalent | Where |
| --- | --- | --- |
| `magicStart`, furniture skeleton | `columns → modules` + designer | Designer |
| `panelDefault*`, `panelMove*`, `panelResize*`, `panelFace*`, `panelBetween*`, `panelCopy*` | Free-panel layer (`shared/domain/free-panels.ts`) | Designer → Free panels |
| `magicSettings`, unit and precision options | `ProjectSettings` (`shared/domain/units.ts`) | Project settings |
| `getDimensions`, weight and cost | Cutlist + `shared/domain/costing.ts` | Cutlist |
| `sheet2export` | `shared/domain/cutlist-export.ts` | Cutlist → Export |
| `grainH/V/X` | `shared/domain/panel-attributes.ts` | Edges & grain |
| `addVeneer`, `band*` | `shared/domain/edgeband.ts` | Edges & grain + Cutlist |
| `magicDriller`, `drill*`, `magicDowels`, `magicCNC` | `shared/domain/operations.ts` + `drilling.ts` | Drilling |
| `magicJoints` and the joint cutters | `shared/domain/joinery.ts` | Project settings → Joint style |
| `router*`, `multiPocket*` | `shared/domain/router-profiles.ts` | Edges & grain → Edge profile |
| `panelSide*`, `panelBackOut`, `panelCoverXY`, `panel2taper`, `roundCurve` | `shared/domain/outline.ts` | Edges & grain → Shape |
| `panel2frame` | `frame` module type | Designer → module type |
| `Std_VarSet`, spreadsheet + `showAlias` | `shared/domain/variables.ts` | Project settings → Variables |
| `showOccupiedSpace` + transport limits | `shared/domain/occupied-space.ts` | Cutlist summary |
| `magicColors`, `setTextures`, `makeBeautiful` | `PublicStyle` materials | Style panel |

### Known gaps

Honest list of what is *not* covered, so the `/tools` page and this doc agree:

- **Custom outlines have no editor.** `sketch2pad` / `wires2pad` outlines are
  modelled, persisted, and extruded, but presets are the only way to author a
  shape from the UI.
- **No external geometry import** (`addExternal`).
- **No interactive measuring or vertex picking** (`magicMeasure`, `showVertex`,
  `selectVertex`, `showMeasurements` on the model itself).
- **No arbitrary rotation** (`magicAngle`, `panel2angle`) — the panel model is
  axis-aligned by design.
- **Corner blocks and braces** have parts and costing but no generator.
- **FreeCAD IDE tooling** (`debugInfo`, `scanObjects`, dependency graph, macro
  runner, `PartDesign_*`) is deliberately out of scope.

The model below is what makes each new row tractable.

## The data model (what you're mapping onto)

Source of truth: `shared/domain/types.ts`.

```
FurnitureDoc
├─ config: FurnitureConfig          // thicknesses, clearances, depth, limits
└─ columns: FurnitureColumn[]
   ├─ width
   └─ modules: FurnitureModule[]
      ├─ id, type: ModuleType       // shelf | shelves | drawer | doors | left-door | right-door
      ├─ height
      ├─ drawerCount?               // drawer only
      └─ shelfCount?                // shelves only
```

The **compiler** (`shared/domain/assembly.ts › compileAssembly`) walks the columns,
builds a per-module "cell" (the interior box bounded by the surrounding
sides/decks), and dispatches on `module.type` to emit `CompiledPanel`s (each with a
`PanelRole`) plus `PanelOperation`s. Everything downstream keys off `PanelRole`:

- **3D** — `components/three/DesignerCanvas.vue` maps each role to a material part.
- **Cutlist** — `shared/domain/cutlist.ts` groups/labels panels by role.
- **Persistence** — `shared/yjs/doc.ts` (Yjs ⇄ POJO) and `.morti` import/export.

## Worked example: the `shelves` component

`shelves` is an open bay subdivided by N evenly-spaced internal shelf boards —
exactly the kind of part Woodworking builds by hand. It contrasts with the existing
`shelf` module, which is a single empty compartment.

![3D assembly with internal shelves](assets/woodworking/shelves-assembly.png)

*Column A is a `shelves` module with 4 boards; column C stacks a 3-board `shelves`
module over a `doors` cabinet. The green horizontal boards are the new
`internal-shelf` panels.*

![Designer inspector showing the Shelves control](assets/woodworking/shelves-inspector.png)

*Selecting the module exposes a new **Shelves** count field, mirroring the existing
**Drawers** field.*

![Cutlist including the internal-shelf parts](assets/woodworking/shelves-cutlist.png)

*The cutlist picks up the new role automatically: row **`I1 internal-shelf`**,
Qty 7 (4 + 3 boards), with correct dimensions.*

### Recipe — every layer a new component touches

Follow these in order. Each bullet links the change to the file you edit.

1. **Type model** — `shared/domain/types.ts`
   - Add the value to `ModuleType` (`'shelves'`).
   - Add any per-module field (`shelfCount?: number`).
   - Add a new `PanelRole` if the component emits a new kind of panel
     (`'internal-shelf'`) and give it a `PANEL_ROLE_SHORT_CODE` (`'IS'`).

2. **Defaults & constants** — `shared/domain/defaults.ts`
   - Add the type to `MODULE_TYPES` (this is what the designer's Type dropdown
     iterates).
   - Add `DEFAULT_/MIN_/MAX_` constants (`DEFAULT_SHELF_COUNT`, `SHELF_COUNT_MIN/MAX`).
   - Seed the field in `defaultModule()`.

3. **Compiler** — `shared/domain/assembly.ts`
   - Write a `compile<Component>()` that emits `CompiledPanel`s from the cell
     bounds (`compileShelves` spaces `count` boards across the interior height and
     emits `internal-shelf` panels with `orientation: 'horizontal-xz'`).
   - Dispatch it in `compileModule()`.

4. **Persistence** — `shared/yjs/doc.ts`
   - Accept the new type in `ensureInitialized` (the type allow-list) and in
     `readFurnitureDoc`.
   - Read/write/sanitize the new field in `ensureInitialized`, `readFurnitureDoc`,
     and `toYModule`.
   - Seed defaults in `insertModule` and `setModuleType` (add the field when the
     type is set, delete it when the type changes away).
   - Add a mutator (`setShelfCount`) following `setDrawerCount`.

5. **Cutlist labels** — `shared/domain/cutlist.ts`
   - Add the role to `roleCodes` (`'internal-shelf': 'I'`) so groups get a stable
     prefix.

6. **3D material** — `components/three/DesignerCanvas.vue`
   - Map the new role to a `CabinetPart` in `partForPanel` (internal shelves reuse
     `'deck'`, so no new style config is needed).

7. **Designer UI** — `components/project/ProjectDesigner.vue`
   - Import the constants + mutator.
   - Add a `selected<Field>Value` computed, an `updateSelectedModules<Field>()`,
     and an `onSelected<Field>Commit()` handler (mirror the drawer-count trio).
   - Add the input row in the inspector `<template>`, gated on
     `selectedTypeValue === '<type>'`.

8. **2D front view** — `components/project/ProjectDesignerFrontView.vue`
   - Add a visual branch so the flat designer reflects the part (shelves draw
     evenly-spaced divider lines, like drawer separators).
   - **Not optional if the component has visible structure.** The flat view is
     the primary editing surface; a component that renders in 3D but not here
     reads as broken. The `frame` type shipped without a branch and drew as an
     empty rectangle while the 3D showed a full face frame.

9. **AI generation (optional)** — `shared/domain/ai-furniture.ts`
   - Add the type to that file's local `MODULE_TYPES`/compact map and normalize the
     new field, so the (off-by-default) AI path can produce it.

> Schema note: adding a module type and an optional field is **backward
> compatible** — old docs still load, so `DESIGN_SCHEMA_VERSION` does not need to
> bump. Only bump it (and add a migration in `shared/yjs/doc.ts › MIGRATIONS`) if
> you rename/remove an existing field.

### Checklist to verify a new component

```bash
npm run typecheck        # whole-pipeline type safety
npm run dev              # then exercise it in the editor
```

Two things to confirm by eye: the part renders in **3D** (assembly view) and shows
up correctly in the **Cutlist** with sane dimensions and quantities.

## Reproducible demo / screenshot workflow

Clicking through the SVG designer is brittle to script, so we seed designs from a
`.morti` fixture instead. `.morti` is a JSON envelope around a base64 Yjs update
(`shared/yjs/morti-format.ts`), so a fixture can be built in plain Node:

```bash
node scripts/make-demo-fixture.mjs docs/assets/woodworking/shelves-demo.morti
```

Edit the `COLUMNS` array in `scripts/make-demo-fixture.mjs` to describe any piece,
then **Import** the file from the Morti home screen (or drive it with Playwright:
`page.locator('input[type=file]').setInputFiles(...)`). The committed
`docs/assets/woodworking/shelves-demo.morti` reproduces the screenshots above.

For headless screenshots in CI/dev containers, Chromium is preinstalled; launch
Playwright with `--use-gl=angle --use-angle=swiftshader` so the Three.js canvas
renders without a GPU.

## Second worked example: the `dividers` component

`dividers` is the vertical counterpart to `shelves` — N evenly-spaced **vertical**
boards (`vertical-divider` role) that split a bay into side-by-side sub-bays. It was
built by following the recipe above verbatim, which is the point: the same nine
edits, swapping "horizontal board across the height" for "vertical board across the
width". Concretely it differs from `shelves` only in:

- the panel `orientation` is `vertical-yz` (not `horizontal-xz`), and boards are
  spaced across the cell **width** (`xMin..xMax`) instead of its height;
- `partForPanel` maps `vertical-divider` to the `sides` material (not `deck`);
- the 2D front-view branch draws vertical lines instead of horizontal ones.

If you're adding a component, copy whichever of the two (`shelves` /  `dividers`)
is closer to your part and adjust those three axis-specific spots.

![Vertical dividers next to internal shelves](assets/woodworking/dividers-and-shelves.png)

*Left bay: a `dividers` module (3 vertical boards). Right bay: a `shelves` module
(4 horizontal boards). Both were added live through the editor.*

## Cutlist export (`sheet2export`)

`shared/domain/cutlist-export.ts` serializes the compiled cutlist to **CSV, JSON,
HTML, and Markdown**, mirroring Woodworking's `sheet2export`. It's a pure,
framework-free module (so it's unit-tested directly), driven by an Export toolbar
in the cutlist view (`components/project/ProjectCutlist.vue`). Dimensions are
emitted in **millimetres** — the practical cut-list unit and the app's underlying
1 mm metric grid — even though the on-screen table shows metres. To add another
format, extend `CutlistFormat` + `serializeCutlist` and the `CUTLIST_FORMATS` list.

## Document schema

The port added several branches to the Y.Doc alongside `config` and `columns`:

| Branch | Holds | Added by |
| --- | --- | --- |
| `settings` | units, precision, currency, report toggles | units port |
| `panelAttributes` | grain direction + edge banding, per `PanelRole` | grain/veneer port |
| `drilling` | hole-pattern rules, per `PanelRole` | drilling port |
| `joinery` | joint style and fastener sizing | joinery port |
| `routerProfiles` | edge profile, per `PanelRole` | router port |
| `outlines` | panel shape, per `PanelRole` | outline port |
| `freePanels` | free-standing boards | free-panel layer |
| `variables`, `transport` | named variables, transport limits | variables port |

Only the free-panel layer needed a schema bump (3 → 4), because it changes what
a design *is* rather than how it is presented. Everything else is additive and
defaults to a no-op, so a document written before the port compiles to exactly
the panels it did before — see `shared/yjs/migration.test.ts`.

Two design decisions run through all of it:

1. **Attributes key off `PanelRole`, not panel keys.** Carcass panels are
   regenerated on every edit, so a panel has no stable hand-picked identity —
   its key changes as soon as a column is inserted. The role is what survives.
2. **Tools become re-applied rules, not one-shot writes.** Upstream, clicking
   `magicDriller` writes holes into the model. Here the compiler rebuilds the
   panels on every edit, so the durable form is a rule that is re-derived each
   time — which also means the holes follow the panel as it resizes.

## What's next (good follow-on ports)

- **Custom outline editor** — a point editor for `sketch2pad` / `wires2pad`.
- **Outlines in the flat view** — door fronts are clipped to their outline, but
  drawer fronts are not: a drawer module holds N stacked fronts drawn as
  separators over a single fill, so clipping the module would cut only the top
  drawer. The bands need to become real elements first.

  Note this is narrower than it first appears. An outline lives in its panel's
  own width x height plane, and only the roles the compiler emits as
  `vertical-xy` — door and drawer fronts, the back panel, frame members — have
  that plane facing the viewer. A shaped `vertical-side` is arched across its
  *depth*, so a front elevation genuinely cannot show it; that is geometry, not
  a missing feature.
- **Measurement overlay** — dimension annotations on the 3D model
  (`showMeasurements`, `magicMeasure`).
- **Corner block / brace generators** — the parts and costing already exist.
