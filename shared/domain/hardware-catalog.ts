import type { HardwareSpec } from '~~/shared/domain/types'

/**
 * Morti hardware catalog (1:1 from `B2kN8TtO.js:179-343`).
 *
 * Each entry is a piece of hardware that can be referenced from the design
 * (drawer slides, dowels, screws, etc.). The catalog is read by `/hardware`
 * for the reference table, and by future BOM views.
 *
 * Model paths:
 *   - Entries with confirmed bundled GLB/GLTF assets are wired directly to
 *     their original filenames under `/hardware/models/`.
 *   - Where the original bundle referenced GLTFs that we have not yet
 *     re-bundled, we point at the same filename pattern so the asset can be
 *     dropped in place when sourced. Local picks are listed below.
 *
 * Local picks (filenames preserved verbatim from the original bundle):
 *   A2  woodDowel        → /hardware/models/120-038-199.glb
 *   G1  camLock          → /hardware/models/262_26_031_3.gltf
 *   J6  camBolt          → /hardware/models/262_27_029_4.gltf
 *   F9  woodScrew        → /hardware/models/015_01_962_2.gltf
 *   E13 euroScrew        → /hardware/models/BN_1935_1430874_cross_recessed_Euro_screw_6_3x13.glb
 *   D5  drawerSlideRight → /hardware/models/551_80_935_5.gltf
 *   D6  drawerSlideLeft  → /hardware/models/551_80_935_5.gltf  (mirrored at runtime)
 *   C7  backPanelClip    → /hardware/models/260_09_701_1.gltf
 *   B6  adhesiveBottomPad→ /hardware/models/strip.glb
 */

export const HARDWARE_CATALOG: HardwareSpec[] = [
  {
    code: 'A2',
    kind: 'wood-dowel',
    name: 'Fluted wood dowel',
    unit: 'piece',
    diameterMm: 8,
    lengthMm: 30,
    notes: 'Primary alignment dowel for panel-to-panel joints.',
    included: true,
    modelGlbSrc: '/hardware/models/120-038-199.glb',
    links: [
      { label: 'Häfele 120.038.199', url: 'https://www.hafele.com' },
    ],
    buyLinks: [
      { label: 'Hornbach', url: 'https://www.hornbach.nl' },
    ],
  },
  {
    code: 'G1',
    kind: 'cam-lock',
    name: 'Cam lock connector',
    unit: 'piece',
    diameterMm: 15,
    lengthMm: 12,
    notes: 'Eccentric connector housing used with the cam bolt.',
    included: true,
    modelGlbSrc: '/hardware/models/262_26_031_3.gltf',
    links: [
      { label: 'Häfele 262.26.031', url: 'https://www.hafele.com' },
    ],
    buyLinks: [
      { label: 'Meubelbeslag Online', url: 'https://www.meubelbeslagonline.nl' },
      { label: 'MeubelbeslagXXL', url: 'https://www.meubelbeslagxxl.nl' },
    ],
  },
  {
    code: 'J6',
    kind: 'cam-bolt',
    name: 'Cam bolt',
    unit: 'piece',
    diameterMm: 8,
    lengthMm: 35,
    notes: 'Threaded connector bolt paired with the cam lock.',
    included: true,
    modelGlbSrc: '/hardware/models/262_27_029_4.gltf',
    links: [
      { label: 'Häfele 262.27.029', url: 'https://www.hafele.com' },
    ],
    buyLinks: [
      { label: 'Meubelbeslag Online', url: 'https://www.meubelbeslagonline.nl' },
    ],
  },
  {
    code: 'F9',
    kind: 'wood-screw',
    name: 'Countersunk wood screw',
    unit: 'piece',
    diameterMm: 4,
    lengthMm: 40,
    notes: 'General structural screw for cabinet assembly.',
    included: true,
    modelGlbSrc: '/hardware/models/015_01_962_2.gltf',
    links: [
      { label: 'Häfele 015.01.962', url: 'https://www.hafele.com' },
    ],
    buyLinks: [
      { label: 'Schroeven Express', url: 'https://www.schroevenexpress.nl' },
      { label: 'Praxis', url: 'https://www.praxis.nl' },
    ],
  },
  {
    code: 'E13',
    kind: 'euro-screw',
    name: 'Euro screw',
    unit: 'piece',
    diameterMm: 6.3,
    lengthMm: 13,
    notes: 'Short system screw for drawer runner mounting.',
    included: true,
    modelGlbSrc: '/hardware/models/BN_1935_1430874_cross_recessed_Euro_screw_6_3x13.glb',
    links: [
      { label: 'Bossard BN 1935', url: 'https://www.bossard.com' },
    ],
    buyLinks: [
      { label: 'HWT-pro', url: 'https://www.hwt-pro.nl' },
    ],
  },
  {
    code: 'D5',
    kind: 'drawer-slide-right',
    name: 'Drawer runner, right',
    unit: 'piece',
    notes: 'Marked as guia DCHA. Right-hand side of a drawer slide pair.',
    included: true,
    modelGlbSrc: '/hardware/models/551_80_935_5.gltf',
    links: [
      { label: 'Häfele 551.80.935', url: 'https://www.hafele.com' },
    ],
    buyLinks: [
      { label: 'Furnica', url: 'https://www.furnica.nl' },
    ],
  },
  {
    code: 'D6',
    kind: 'drawer-slide-left',
    name: 'Drawer runner, left',
    unit: 'piece',
    notes: 'Marked as guia IZQ. Left-hand side of a drawer slide pair.',
    included: true,
    modelGlbSrc: '/hardware/models/551_80_935_5.gltf',
    links: [
      { label: 'Häfele 551.80.935', url: 'https://www.hafele.com' },
    ],
    buyLinks: [
      { label: 'Furnica', url: 'https://www.furnica.nl' },
    ],
  },
  {
    code: 'C7',
    kind: 'back-panel-clip',
    name: 'Back panel retaining clip',
    unit: 'piece',
    notes: 'Keeps the back panel from moving in its groove.',
    included: true,
    modelGlbSrc: '/hardware/models/260_09_701_1.gltf',
    links: [
      { label: 'Häfele 260.09.701', url: 'https://www.hafele.com' },
    ],
    buyLinks: [
      { label: 'Ironware', url: 'https://www.ironware.eu' },
    ],
  },
  {
    code: 'B6',
    kind: 'adhesive-bottom-pad',
    name: 'Adhesive bottom pad strip',
    unit: 'piece',
    notes: 'Padded sticky strip for protecting the bottom/base.',
    included: true,
    modelGlbSrc: '/hardware/models/strip.glb',
    links: [],
    buyLinks: [
      { label: 'Amazon.nl', url: 'https://www.amazon.nl' },
    ],
  },
]
