# UI Component Parity Audit

Date: 2026-05-01

Reference target: compiled/decompiled Madera folder.

Primary routes under active parity work: `/project/FGllYyKbUbZc-BUtjgD-eQ` and `/p/g6gwm07vsohbf20`.

Status definitions:

- **Checked**: compared directly against compiled/decompiled output and patched where needed, or browser-smoked on the target route.
- **Partially checked**: touched indirectly through the target route or one behavior path, but not exhaustively compared as a standalone component.
- **Not checked**: inventoried, but no direct compiled-vs-source parity pass was completed yet.

## Verification Completed

- `npm run typecheck` passed after the parity changes.
- `npm run build` passed after the parity changes.
- `npm run typecheck` and `npm run build` passed again after the technical-mode blank render and open-animation settling fixes.
- `npm run typecheck` and `npm run build` passed again after the public viewer control-state fix.
- `npm run typecheck` and `npm run build` passed again after porting the compiled assembly compiler/orientation model into `shared/domain/assembly.ts`.
- `npm run typecheck` and `npm run build` passed again after adding compiled operation metadata to cutlist grouping keys.
- `npm run typecheck` and `npm run build` passed again after the cutlist right-pane preview renderer fix.
- `npm run typecheck` and `npm run build` passed again after the right-pane 3D animation lifecycle fix.
- `npm run typecheck` and `npm run build` passed again after the drawer reset fix that starts rebuilt/remounted panels at their current compiled assembly targets.
- Production server was restarted on `http://127.0.0.1:3000`.
- Headless Chrome smoke opened `/project/FGllYyKbUbZc-BUtjgD-eQ`.
- Headless Chrome smoke opened `/p/g6gwm07vsohbf20` and clicked every unselected public viewer control in the Assembly and Canvas render-mode groups.
- Headless Chrome smoke re-opened `/p/g6gwm07vsohbf20` after the compiler port and clicked Normal, Open, Space, Technical, and Render debug with real pointer events.
- Headless Chrome confirmed the Open doors/drawers screenshots at 2.5s and 7.5s were pixel-identical, so the open animation settles instead of running indefinitely.
- Headless Chrome rechecked Open doors/drawers with software WebGL enabled; the 2.5s and 7.5s screenshots were byte-identical and both canvases had WebGL contexts.
- Headless Chrome captured a nonblank normal technical-mode screenshot after the compiler port at `/tmp/madera-public-compiled-normal-technical.png`.
- Final Headless Chrome smoke after the last rebuild confirmed `/p/g6gwm07vsohbf20` had no failed network requests, no console errors, two live canvases, and selectable Technical drawing mode.
- Headless Chrome could not verify `/project/FGllYyKbUbZc-BUtjgD-eQ` after the final rebuild because this headless browser session has no persisted cloud/local project record and the route rendered "Project not found"; route-level project checks above are from the earlier authenticated/local-data smoke.
- Headless Chrome verified the cutlist right-pane preview stack through `/graphics`: 20 panel cards were present, each card rendered a deterministic technical SVG preview, the D4-D7 row stayed populated after a delayed recheck, and there were no console errors, failed network requests, or runtime exceptions.
- Headless Chrome rechecked `/graphics` selected-cutlist mode after shared cutlist selection keys were added: selecting a `drawer-back` panel reduced the right pane to one selected card and rendered the selected technical preview with no console/runtime/network issues.
- Headless Chrome created a disposable local project in IndexedDB, opened `/project/codex-animation-test`, switched the right 3D pane to Open doors/drawers, dragged/rotated the canvas, and confirmed the open assembly stayed extended with no failed requests or runtime errors.
- Headless Chrome created another disposable local project with Open doors/drawers already persisted, opened `/project/codex-drawer-reset-proof`, confirmed the drawers were extended on the first early screenshot, rotated the right 3D canvas repeatedly, and confirmed the drawers stayed extended on both immediate and delayed screenshots.
- Smoke confirmed:
  - no failed network requests,
  - no console errors,
  - no runtime exceptions,
  - editor split mounted,
  - project inputs rendered,
  - view controls rendered,
  - WebGL canvas rendered nonblank pixels.
  - public viewer controls changed selected state for Normal, Open, Space, Technical, and Render debug.

## Checked Components

| Component | Status | What was checked |
| --- | --- | --- |
| `components/project/EditorSplit.vue` | Checked | Compared props/emits, split ratio behavior, drag math, 80px pane clamp, divider lock cleanup, pointer listeners, collapsed input pane handling, slot structure, divider/handle classes, and CSS sizing against compiled output. Patched inline drag behavior to match compiled. |
| `components/project/ProjectDesigner.vue` | Checked | Compared inspector/settings controls, column/module mutations, selection fallback, zoom clamping, column resize guard, multi-column resize behavior, settings fields, blank config input handling, default inserted column width, settings copy/dialog reset behavior, and sanitized config display. Patched behavior to match compiled where differences were found. |
| `components/project/ProjectDesignerFrontView.vue` | Checked | Compared props/defaults, front-view layout behavior, module boundary drag targets, boundary index handling, window pointer listeners, cleanup hook, selection classes, shelf selection styling, labels, and width display. Patched boundary drag behavior and cleanup to match compiled. |
| `components/project/ProjectStylePanel.vue` | Checked | Compared title/header, reset button, Technical/Rendered segmented control, color rows, `input[type=color]`, props/emits, classes, and reset behavior. Component UI matched; rendered default color constants were patched in shared defaults. |
| `components/project/ProjectCloudActions.vue` | Checked | Compared signed-in/verified visibility rules, retry button, draft sync status display, publish button state/label, classes, published-state calculation, and prop pass-through into publish dialog. Visible UI matched. |
| `components/project/ProjectPublishDialog.vue` | Checked | Compared visible labels, descriptions, preview frame, loading state, MP4 download button, published alert, copy link behavior, unpublish confirmation text, footer buttons, classes, disabled/loading conditions, and publish/unpublish flow. Patched publish to use one atomic update and unpublish to only set private visibility. Preview cache behavior is still not fully ported. |
| `components/three/ProjectCanvas.vue` | Checked | Compared canvas boundary behavior, prop pass-through to `DesignerCanvas`, render-mode mapping, and public viewer render mode. Patched `rendered` to coerce to `render-debug` at the canvas boundary, with `technical` preserved. |
| `components/three/DesignerCanvas.vue` | Checked | Compared assembly view controls, render mode buttons, teleport host behavior, public style color use, default rendered palette, technical mode fill/outline colors, camera restoration, camera validation, render-mode lighting, WebGL renderer initialization risk, and nonblank canvas behavior. Rechecked the door-open assembly option and technical render option after user reports. Patched open-mode settling, door hinge detection, mutual exclusivity with spaced modules, compiled-style oriented panel targets, drawer pull scaling, space-module offsets, WebGL surface-id/outline-exclude technical compositing, through-hole/rail-cut operation overlays, scene rebuilds so camera/editor rerenders preserve existing panel transforms, and fresh rebuild/remount placement so objects start at the current compiled assembly target instead of replaying drawers from closed. |
| `composables/useThreejsCanvas.ts` | Checked | Compared renderer init/error handling and render-loop behavior. Patched renderer creation with `try/catch` so WebGL init failures do not crash the route. |
| `shared/domain/cutlist.ts` | Checked | Added a shared cutlist signature/group-id helper used by both the left panel table and right preview grid, removing duplicate grouping-key logic that could leave the right pane filtered to zero panels while the left row stayed selected. |
| `components/project/PanelSvgPreview.vue` | Checked | Added a deterministic technical preview for cutlist panel cards that draws panel cuboids plus rail-cut and through-hole operation overlays from compiled panel metadata. This avoids per-card WebGL context churn and keeps all right-pane cards populated. |
| `components/app/AppDialog.vue` | Partially checked | Indirectly checked through publish dialog and modal app config. Modal transition defaults were patched to compiled 120ms classes. Standalone component internals were not exhaustively diffed. |
| `components/app/AppConfirmDialog.vue` | Partially checked | Indirectly checked through publish unpublish confirmation. Confirm title/message/button labels/classes were checked in that flow. Standalone variants were not exhaustively diffed. |
| `components/app/AppFormDialog.vue` | Partially checked | Indirectly present on project route. Route mount conditions were patched, but standalone form-dialog internals were not exhaustively diffed. |
| `components/project/VerifyEmailGate.vue` | Partially checked | Project-route email verification gating and placeholder behavior were checked at route level. Standalone component internals were not exhaustively diffed. |
| `components/project/ProjectCutlistPanelGrid.vue` | Partially checked | Route-level cutlist mount, WIP overlay, split locking, selected drawing persistence, and right-pane panel preview rendering were checked. Replaced the grid's per-card WebGL canvases with `PanelSvgPreview`, matching the compiled technical-preview intent while eliminating the blank/disappearing cards caused by browser WebGL context limits. Patched selected-panel matching to share the same cutlist signature helper as `ProjectCutlist` and fall back instead of showing an empty right pane. The full panel grid UI was not exhaustively compared. |

## Not Fully Checked Components

| Component | Status | What remains |
| --- | --- | --- |
| `components/app/AuthModal.vue` | Not checked | Needs compiled comparison for modal layout, auth form labels, validation states, buttons, providers, errors, and transitions. |
| `components/project/ProjectCard.vue` | Not checked | Needs compiled comparison for dashboard card layout, project metadata, action buttons, menu/dropdown behavior, pinned/demo/published states, and responsive behavior. |
| `components/project/ProjectCutlist.vue` | Partially checked | Operation grouping now includes compiled operation metadata (`face`, `length`, `depth`) and uses the shared cutlist signature helper also used by the right preview grid. Full compiled comparison for cutlist UI, table/list structure, labels, states, and export/download interactions remains. |
| `components/project/ProjectPreview.vue` | Not checked | Needs compiled comparison for preview card/canvas behavior, placeholder/loading state, image/video/canvas output, and classes. |
| `components/three/HardwareDrawingCanvas.vue` | Not checked | Needs compiled comparison for hardware drawing camera, render output, materials, sizing, and WebGL failure behavior. |
| `components/three/PanelCanvas.vue` | Partially checked | Rail-cut overlay dimensions were checked against compiled operation metadata (`length` + `width`) and patched so standalone panel drawings consume the compiled operation shape. Render scheduling was moved to manual/event-driven rendering to align with the compiled panel canvas behavior. Full standalone panel drawing render/camera/material parity still needs a dedicated compiled comparison pass. |
| `components/three/PanelMesh.vue` | Not checked | Needs compiled comparison for panel mesh geometry/material props and outline attribute behavior. |
| `components/three/RailCutMesh.vue` | Not checked | Needs compiled comparison for rail-cut drawing geometry, outline color, and render behavior. |

## Checked Route-Level UI Surfaces

| Surface | Status | What was checked |
| --- | --- | --- |
| `pages/project/[id].vue` | Checked | Main parity target. Checked loading/not-found placement, `EditorSplit` structure, preview `Suspense`, top-left/top-right chrome, style panel dock, published/demo buttons, cutlist WIP overlay, cutlist mini alert, split behavior, keyboard handlers, route id reload behavior, editor state hydration, live export, cloud style sync, cloud record refresh, and browser rendering on `/project/FGllYyKbUbZc-BUtjgD-eQ`. |
| `pages/p/[id].vue` | Partially checked | Checked public viewer render-mode mapping, public route availability behavior, and the public 3D viewer control bar with Remix present. Patched public viewer to map rendered style to `render-debug` and to own local assembly/render-mode state so unselected control buttons can be selected. Full page chrome/remix flow was not exhaustively diffed. |
| `pages/graphics.vue` | Partially checked | Checked route metadata parity. Patched `definePageMeta({ layout: false })`. Page UI itself was not exhaustively diffed. |
| `pages/render/project/[id].vue` | Partially checked | Indirectly checked through publish preview/render behavior and build smoke. Full render capture UI/message parity was not exhaustively diffed. |
| `pages/render/p/[id].vue` | Partially checked | Indirectly checked through public project loading rules. Full render route behavior was not exhaustively diffed. |

## Route-Level UI Surfaces Not Checked

| Surface | Status | What remains |
| --- | --- | --- |
| `pages/index.vue` | Not checked | Needs compiled comparison for project list/dashboard, empty states, import/create flows, project card composition, auth/cloud controls, and responsive layout. |
| `pages/design.vue` | Not checked | Needs compiled comparison for design route UI, editor/canvas composition, controls, and route metadata. |
| `pages/hardware.vue` | Not checked | Needs compiled comparison for hardware catalog UI, cards/lists, filters, drawing canvases, links, and responsive layout. |

## Checked Supporting UI/Theme Infrastructure

| File | Status | What was checked |
| --- | --- | --- |
| `assets/css/main.css` | Checked | Compared theme aliases, font stack, Madera colors, radius, ring/border/divide/stroke/fill aliases, and ring-offset tokens against compiled CSS. Patched alias names and values to match compiled output. |
| `app.config.ts` | Checked | Compared Nuxt UI color aliases, icon defaults, toaster position, and modal transition classes. Patched modal transition classes to compiled 120ms definitions. |
| `nuxt.config.ts` | Checked | Compared app shell-relevant config, icon CSS layer, route rules, color mode, fonts, and runtime feature flag defaults. Patched icon CSS layer to `base`. |
| `shared/domain/defaults.ts` | Checked | Compared furniture defaults, public style defaults, rendered/technical palettes, style normalization, metric snapping helper, and camera default. Patched compiled color constants, hex validation/normalization, 1mm snapping, and default camera. |
| `shared/yjs/doc.ts` | Checked | Compared Yjs initialization, migrations, metric snapping, config reads/writes, column/module repair, module type/height/drawer count normalization. Patched missing repair and legacy migration behavior. |
| `composables/useEditorState.ts` | Checked | Compared editor state defaults and persistence normalization. Patched default camera, render-mode coercion, public style normalization, selected ids, cutlist key normalization, and `updatedAt`. |
| `composables/useCloudAutosync.ts` | Checked | Compared cloud draft autosync behavior. Patched autosync to ensure cloud project, merge remote snapshot once, persist merged local state, upload snapshot, and queue syncs behind a promise chain. |
| `composables/useCloudProjects.ts` | Checked | Compared cloud publish/unpublish/update helpers used by project UI. Patched atomic publish and private-only unpublish helpers. |
| `composables/useLoadPublicProject.ts` | Checked | Compared public project availability checks. Patched rejection for deleted/private/unpublished records before snapshot fetch. |
| `shared/three/outline.ts` | Partially checked | Compared outline helper intent, surface-id baking, and outline-exclude attributes against compiled technical rendering. Existing helper remains in use; the `DesignerCanvas` technical pass now provides the WebGL postprocess equivalent. |
| `shared/three/materials.ts` | Checked | Compared compiled material modes. Patched technical mode away from the temporary wireframe fallback and back to compiled-style flat `MeshBasicMaterial` fills with `toneMapped: false`. |
| `shared/three/dots-grid.ts` | Partially checked | Indirectly checked through `DesignerCanvas` grid color/render behavior. No standalone full diff completed. |
| `shared/three/lights.ts` | Partially checked | Indirectly checked through `DesignerCanvas` lighting modes. No standalone full diff completed. |
| `shared/three/skydome.ts` | Partially checked | Indirectly checked through `DesignerCanvas` render modes. No standalone full diff completed. |
| `shared/three/orbit.ts` | Partially checked | Indirectly checked through camera/orbit behavior. No standalone full diff completed. |

## Supporting Files Not Checked

| File | Status | What remains |
| --- | --- | --- |
| `composables/useAuth.ts` | Not checked | Needs compiled comparison for auth state, verification handling, refresh behavior, and UI side effects. |
| `composables/usePb.ts` | Not checked | Needs compiled comparison for PocketBase setup, auth persistence, and error handling. |
| `composables/useUser.ts` | Not checked | Needs compiled comparison for user profile/auth wrapper behavior. |
| `composables/useLocalProjects.ts` | Partially checked | Checked methods used by project route and publish flow. Full project list/import/duplicate/delete dashboard behavior was not exhaustively diffed. |
| `composables/useDesignDoc.ts` | Partially checked | Checked enough for project route hydration/persistence, but full compiled checkpoint-based undo/redo parity is not complete. |
| `composables/useEditorSplit.ts` | Partially checked | Old composable was compared earlier; `EditorSplit.vue` now carries compiled inline drag behavior. File remains in repo but is not the active parity path. |
| `composables/useThemeColors.ts` | Partially checked | Indirectly checked through canvas/theme color behavior. No standalone full diff completed. |
| `shared/domain/assembly.ts` | Checked | Ported the compiled assembly compiler structure: oriented `vertical-yz` side panels, `horizontal-xz` decks, `vertical-xy` fronts/backs, side-panel overhang, per-module back panels, drawer boxes, pull-hole metadata, back-panel groove rail-cuts, drawer-bottom groove rail-cuts, 1mm metric snapping, and compiled panel key shapes. Verified through typecheck/build and public 3D smoke screenshots. |
| `shared/domain/fingerprint.ts` | Partially checked | Used in autosync parity. Full compiled fingerprint behavior for all call sites was not exhaustively diffed. |
| `shared/domain/hardware-catalog.ts` | Not checked | Needs compiled comparison for hardware route/catalog UI. |
| `shared/yjs/madera-format.ts` | Partially checked | Live route export was patched at caller level. Full compiled `.madera` import/export validation and file error parity is still outstanding. |

## Known Remaining Gaps

- Publish preview MP4 IndexedDB cache/fingerprint behavior is not fully ported.
- Full checkpoint-based undo/redo model from compiled output is not fully ported.
- Dashboard/index, auth modal, project card, hardware, design, panel canvas, hardware canvas, and standalone cutlist components still need dedicated parity passes.
- Dependency versions still use ranges in `package.json`; exact compiled dependency pinning was identified but not applied in this pass.
