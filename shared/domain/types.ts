import type { DrillingMap } from './drilling'
import type { PanelAttributeMap } from './panel-attributes'
import type { AreaUnit, FractionDenominator, LengthUnit, VolumeUnit, WeightUnit } from './units'

export type ModuleType = 'shelf' | 'shelves' | 'dividers' | 'drawer' | 'doors' | 'left-door' | 'right-door'

export interface FurnitureModule {
  id: string
  type: ModuleType
  height: number // metres
  drawerCount?: number // 1..32, drawer only
  shelfCount?: number // 1..16, internal shelf boards, 'shelves' only
  dividerCount?: number // 1..16, vertical divider boards, 'dividers' only
}

export interface FurnitureColumn {
  width: number // metres
  modules: FurnitureModule[]
}

export interface FurnitureConfig {
  depth: number
  panelThickness: number
  backPanelThickness: number
  panelJointClearance: number
  frontClearance: number
  sidePanelOverhang: number
  pullHoleDiameter: number
  pullHoleEdgeInset: number
  pullHolePairGap: number
  backPanelGrooveClearance: number
  drawerBottomInset: number
  drawerSlidesReserve: number
  backPanelInset: number
  minColumnWidth: number
  maxColumnWidth: number
  minModuleHeight: number
  maxModuleHeight: number
  minDrawerHeight: number
  maxDrawerHeight: number
}

/** Which rate a project prices against. Mirrors `magicSettings`, which offers
 *  both a per-volume (timber) and a per-area (sheet goods) price. */
export type CostBasis = 'volume' | 'area'

/**
 * Presentation and reporting preferences — the Morti analogue of
 * `magicSettings` plus the unit/precision selectors in `getDimensions`.
 *
 * These never affect stored geometry (which is always metres on a 1 mm grid);
 * they only change how numbers are displayed, parsed, and reported.
 */
export interface ProjectSettings {
  lengthUnit: LengthUnit
  lengthPrecision: number
  /** Woodworking reports edge banding in its own unit; so do we. */
  edgeUnit: LengthUnit
  edgePrecision: number
  areaUnit: AreaUnit
  areaPrecision: number
  volumeUnit: VolumeUnit
  weightUnit: WeightUnit
  /** Denominator used when `lengthUnit` or `edgeUnit` is `fraction`. */
  fractionDenominator: FractionDenominator
  /** ISO 4217 code used to format costs. */
  currency: string
  costBasis: CostBasis
  reportWeight: boolean
  reportCost: boolean
  reportOperations: boolean
}

export const PROJECT_SETTINGS_KEYS: (keyof ProjectSettings)[] = [
  'lengthUnit',
  'lengthPrecision',
  'edgeUnit',
  'edgePrecision',
  'areaUnit',
  'areaPrecision',
  'volumeUnit',
  'weightUnit',
  'fractionDenominator',
  'currency',
  'costBasis',
  'reportWeight',
  'reportCost',
  'reportOperations',
]

export interface FurnitureDoc {
  schemaVersion: number
  lastAppliedMigrationId: string | null
  config: FurnitureConfig
  settings: ProjectSettings
  /** Grain direction and edge banding, keyed by `PanelRole`. */
  panelAttributes: PanelAttributeMap
  /** Drilling rules re-applied on every compile, keyed by `PanelRole`. */
  drilling: DrillingMap
  columns: FurnitureColumn[]
}

export type RenderStyle = 'rendered' | 'technical'

export interface MaterialAssignment {
  /** Preset id from MATERIAL_PRESETS, or 'custom' to use the customColor hex. */
  presetId: string
  /** Hex used when presetId === 'custom'. */
  customColor: string
}

export interface PublicStyle {
  renderStyle: RenderStyle
  technical: {
    colors: {
      background: string
      grid: string
      outlines: string
      fills: string
    }
  }
  rendered: {
    colors: {
      background: string
      grid: string
      defaultPanel: string
      verticalSide: string
      horizontalDeck: string
      moduleFront: string
    }
    materials: {
      carcass: MaterialAssignment
      sides: MaterialAssignment
      deck: MaterialAssignment
      fronts: MaterialAssignment
    }
  }
}

export type ProjectVisibility = 'public' | 'private'

export interface AuthUser {
  id: string
  email: string
  verified: boolean
  email_validated_at: string
  is_admin: boolean
  created: string
  updated: string
}

export interface CloudProjectRecord {
  id: string
  collectionId: string
  collectionName: 'morti_projects'
  owner: string
  name: string
  visibility: ProjectVisibility
  client_project_id: string
  source_project_id?: string
  is_demo: boolean
  remix_count: number
  public_style: string // JSON-serialized PublicStyle
  snapshot: string // file name
  published_at?: string
  deleted_at?: string
  created: string
  updated: string
}

export interface LocalProjectRow {
  id: string
  name: string
  cloudId: string | null
  createdAt: number | string
  updatedAt: number | string
  isDemo: boolean
  pinned?: boolean
}

export type ViewMode = 'assembly' | 'cutlist' | 'style'

export interface CameraState {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  target: [number, number, number]
}

export interface ProjectEditorStateRow {
  id: string // = projectId
  projectId?: string
  viewMode: ViewMode
  splitRatio: number
  projectDesignerSplitRatio?: number
  projectDesignerZoomPercent?: number
  selectedModuleIds?: string[]
  camera: CameraState | null
  assemblyOpenDoorsDrawers: boolean
  assemblySpaceModulesView: boolean
  moduleVolumeHelpersVisible: boolean
  renderMode: 'rendered' | 'render-debug' | 'technical'
  publicStyle: PublicStyle
  cutlistSelectedDrawingKey: string | null
}

export type PanelRole =
  | 'vertical-side'
  | 'horizontal-deck'
  | 'internal-shelf'
  | 'vertical-divider'
  | 'back-panel'
  | 'door-front'
  | 'drawer-front'
  | 'drawer-side'
  | 'drawer-back'
  | 'drawer-bottom'

/**
 * Machining operations subtracted from a panel.
 *
 * `through-hole` and `rail-cut` are Morti's originals. The rest port
 * Woodworking's drilling and fixture toolbars: `drillHoles`,
 * `drillCountersinks`, `drillCounterbores`, `drillCounterbores2x`,
 * `magicDriller`, `magicDowels`, `magicCNC`, `magicFixture`, and the
 * groove/dado/rabbet cuts `magicCut` and `magicKnife` make.
 */
export type OperationType =
  | 'through-hole'
  | 'rail-cut'
  /** Blind hole for a dowel, shelf pin, or cam bolt. */
  | 'dowel-hole'
  /** Conical seat so a flat-head screw sits flush. */
  | 'countersink'
  /** Flat-bottomed recess so a screw head or cam sits below the surface. */
  | 'counterbore'
  /** Flat-bottomed CNC pocket of arbitrary size. */
  | 'pocket'
  /** Slot cut along the grain, e.g. for a back panel. */
  | 'groove'
  /** Slot cut across the grain, e.g. to seat a shelf. */
  | 'dado'
  /** Step cut along a panel edge. */
  | 'rabbet'

export const OPERATION_TYPES: OperationType[] = [
  'through-hole',
  'rail-cut',
  'dowel-hole',
  'countersink',
  'counterbore',
  'pocket',
  'groove',
  'dado',
  'rabbet',
]

export const OPERATION_TYPE_LABEL: Record<OperationType, string> = {
  'through-hole': 'Through hole',
  'rail-cut': 'Rail cut',
  'dowel-hole': 'Dowel hole',
  'countersink': 'Countersink',
  'counterbore': 'Counterbore',
  'pocket': 'Pocket',
  'groove': 'Groove',
  'dado': 'Dado',
  'rabbet': 'Rabbet',
}

export interface PanelOperation {
  id: string
  operationType: OperationType
  targetPanelKey: string
  face?: 'front' | 'back'
  center?: { x: number, y: number }
  // through-hole / dowel-hole / countersink / counterbore
  cx?: number
  cy?: number
  diameter?: number
  depth?: number
  through?: boolean
  /** Countersink/counterbore only: the wider head recess diameter. */
  headDiameter?: number
  /** Counterbore only: how deep the head recess goes. */
  headDepth?: number
  // rail-cut / pocket / groove / dado / rabbet
  x?: number
  y?: number
  width?: number
  height?: number
  length?: number
  rotation?: number
  sourceModuleId?: string
  /** Hardware code this operation exists to seat, for the BOM. */
  hardwareCode?: string
}

export interface CompiledPanel {
  key: string
  role: PanelRole
  width: number
  height: number
  thickness: number
  position: [number, number, number]
  rotation: [number, number, number]
  operations: PanelOperation[]
  orientation?: 'vertical-xy' | 'vertical-yz' | 'horizontal-xz'
  sourceModuleId?: string
  doorHinge?: 'left' | 'right'
  touchedModuleIds?: string[]
}

export interface CompiledAssemblyIssue {
  severity: 'warning' | 'error'
  code: string
  message: string
  moduleId?: string | null
  columnIndex?: number
  moduleIndex?: number
}

export interface CompiledAssembly {
  panels: CompiledPanel[]
  operations: PanelOperation[]
  issues: CompiledAssemblyIssue[]
}

export interface HardwareSpec {
  code: string
  kind:
    | 'wood-dowel'
    | 'cam-lock'
    | 'cam-bolt'
    | 'wood-screw'
    | 'euro-screw'
    | 'drawer-slide-right'
    | 'drawer-slide-left'
    | 'back-panel-clip'
    | 'adhesive-bottom-pad'
    | 'confirmat-screw'
    | 'pocket-screw'
    | 'shelf-pin'
  name: string
  unit: 'piece'
  diameterMm?: number
  lengthMm?: number
  widthMm?: number
  heightMm?: number
  notes?: string
  included: boolean
  modelGlbSrc: string
  links?: { label: string; url: string }[]
  buyLinks?: { label: string; url: string }[]
}

export const PANEL_ROLE_SHORT_CODE: Record<PanelRole, string> = {
  'vertical-side': 'S',
  'horizontal-deck': 'D',
  'internal-shelf': 'IS',
  'vertical-divider': 'VD',
  'back-panel': 'B',
  'door-front': 'DF',
  'drawer-front': 'DRF',
  'drawer-side': 'DRS',
  'drawer-back': 'DRB',
  'drawer-bottom': 'DBM',
}

export const DESIGN_SCHEMA_VERSION = 3
export const ASSEMBLY_COMPILER_VERSION = 1
export const TECHNICAL_RENDERER_VERSION = 1
