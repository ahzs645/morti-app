import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import type {
  CompiledAssembly,
  CompiledAssemblyIssue,
  CompiledPanel,
  FurnitureColumn,
  FurnitureConfig,
  FurnitureDoc,
  FurnitureModule,
  PanelOperation,
  PanelRole,
} from '~~/shared/domain/types'
import { effectiveDepth, isHoleOperation } from '~~/shared/domain/operations'
import { FRAME_MEMBER_WIDTH } from '~~/shared/domain/defaults'
import { drillingOperationsForPanel } from '~~/shared/domain/drilling'
import { applyJoinery } from '~~/shared/domain/joinery'

// ---------------------------------------------------------------------------
// Tunables (mirrors Dt_x5Iy5.js module-level constants)
// ---------------------------------------------------------------------------

const HOLE_MIN_DIAMETER = 5e-4 // 0.5 mm clamp
const RAILCUT_MIN_SIZE = 5e-4
const PULL_HOLE_DEPTH_PADDING = 1e-6
const DEGENERATE_MIN_SIZE = 0.001

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

interface CompileOptions {
  // Reserved — currently no toggles. Door / drawer animation is applied at the
  // canvas layer, not in the compiler.
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function panelKey(columnIndex: number, moduleIndex: number, role: PanelRole, suffix?: string): string {
  return suffix
    ? `${columnIndex}-${moduleIndex}-${role}-${suffix}`
    : `${columnIndex}-${moduleIndex}-${role}`
}

function columnInteriorWidth(column: FurnitureColumn, config: FurnitureConfig): number {
  return Math.max(0.001, column.width - 2 * config.panelThickness)
}

function columnTotalHeight(column: FurnitureColumn): number {
  let h = 0
  for (const m of column.modules) h += Math.max(0, m.height)
  return Math.max(0.001, h)
}

interface CellBounds {
  moduleId: string
  columnIndex: number
  moduleIndex: number
  width: number
  height: number
  depth: number
  frontWidth: number
  frontHeight: number
}

function makeIssue(
  code: string,
  message: string,
  cell?: CellBounds,
  severity: CompiledAssemblyIssue['severity'] = 'error',
): CompiledAssemblyIssue {
  return {
    severity,
    code,
    message,
    moduleId: cell?.moduleId,
    columnIndex: cell?.columnIndex,
    moduleIndex: cell?.moduleIndex,
  }
}

function moduleCellBounds(
  column: FurnitureColumn,
  module: FurnitureModule,
  columnIndex: number,
  moduleIndex: number,
  moduleBaseY: number,
  config: FurnitureConfig,
): CellBounds {
  const moduleTopY = moduleBaseY + module.height
  const width = column.width - config.panelThickness - 2 * config.panelJointClearance
  const height = moduleTopY - moduleBaseY - config.panelThickness - 2 * config.panelJointClearance
  const depth = config.depth - config.backPanelInset - config.backPanelThickness - 2 * config.panelJointClearance
  return {
    moduleId: module.id,
    columnIndex,
    moduleIndex,
    width,
    height,
    depth,
    frontWidth: width - 2 * config.frontClearance,
    frontHeight: height - 2 * config.frontClearance,
  }
}

function validateAssembly(columns: FurnitureColumn[], config: FurnitureConfig): CompiledAssemblyIssue[] {
  const issues: CompiledAssemblyIssue[] = []
  if (config.backPanelInset + config.backPanelThickness + config.panelJointClearance >= config.depth) {
    issues.push(makeIssue('back-reserve-overflows-depth', 'Back panel inset, back thickness, and joint clearance exceed cabinet depth.'))
  }

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex]
    let moduleBaseY = 0
    for (let moduleIndex = 0; moduleIndex < column.modules.length; moduleIndex++) {
      const module = column.modules[moduleIndex]
      const cell = moduleCellBounds(column, module, columnIndex, moduleIndex, moduleBaseY, config)
      if (cell.width < DEGENERATE_MIN_SIZE) issues.push(makeIssue('cell-too-narrow', 'Module interior is too narrow.', cell))
      if (cell.height < DEGENERATE_MIN_SIZE) issues.push(makeIssue('cell-too-short', 'Module interior is too short.', cell))
      if (cell.depth < DEGENERATE_MIN_SIZE) issues.push(makeIssue('cell-too-shallow', 'Module interior is too shallow.', cell))
      if (cell.frontWidth < DEGENERATE_MIN_SIZE || cell.frontHeight < DEGENERATE_MIN_SIZE) issues.push(makeIssue('front-degenerate', 'Module front face is too small.', cell))
      if (module.type === 'doors' && (cell.frontWidth - 2 * config.frontClearance) / 2 < DEGENERATE_MIN_SIZE) {
        issues.push(makeIssue('paired-door-too-narrow', 'Paired door leaves are too narrow after front clearance.', cell))
      }
      if (module.type === 'drawer') {
        if (config.drawerSlidesReserve >= cell.depth) issues.push(makeIssue('slides-reserve-overflows-cell', 'Drawer slides reserve exceeds the module depth.', cell))
        const drawerCount = Math.max(1, Math.floor(module.drawerCount ?? 1))
        const frontBandHeight = (cell.height - config.frontClearance * (drawerCount + 1)) / drawerCount
        const drawerBoxBandHeight = (cell.height - 2 * config.panelJointClearance * Math.max(0, drawerCount - 1)) / drawerCount - 2 * config.drawerBottomInset - 2 * config.panelJointClearance
        const drawerBackBandHeight = drawerBoxBandHeight - config.backPanelInset - config.backPanelThickness
        if (frontBandHeight < DEGENERATE_MIN_SIZE || drawerBoxBandHeight < DEGENERATE_MIN_SIZE || drawerBackBandHeight < DEGENERATE_MIN_SIZE) {
          issues.push(makeIssue('drawer-band-too-short', 'Drawer band is too short for the front, bottom board, side/back panels, and clearances.', cell))
        }
        if (cell.depth - config.drawerSlidesReserve < DEGENERATE_MIN_SIZE) {
          issues.push(makeIssue('drawer-depth-too-shallow', 'Drawer box depth is too shallow after the slides reserve.', cell))
        }
      }
      moduleBaseY += Math.max(0.001, module.height)
    }
  }
  return issues
}

// ---------------------------------------------------------------------------
// Compile assembly (ported from the original Morti assembly generator)
// ---------------------------------------------------------------------------

const METRIC_SNAP = 0.001
const METRIC_SNAP_MULTIPLIER = Math.round(1 / METRIC_SNAP)

interface CompiledCellBounds extends CellBounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  zMin: number
  zMax: number
  frontZ: number
}

function snapMetric(value: number): number {
  return Number.isFinite(value) ? Math.round(value * METRIC_SNAP_MULTIPLIER) / METRIC_SNAP_MULTIPLIER : 0
}

function positiveMetric(value: number): number {
  return Math.max(DEGENERATE_MIN_SIZE, snapMetric(value))
}

function panelRotation(orientation: NonNullable<CompiledPanel['orientation']>): [number, number, number] {
  if (orientation === 'horizontal-xz') return [-Math.PI / 2, 0, 0]
  if (orientation === 'vertical-yz') return [0, Math.PI / 2, 0]
  return [0, 0, 0]
}

function makePanel(args: {
  key: string
  role: PanelRole
  position: { x: number, y: number, z: number }
  size: { width: number, height: number, thickness: number }
  orientation: NonNullable<CompiledPanel['orientation']>
  sourceModuleId?: string
  doorHinge?: 'left' | 'right'
  touchedModuleIds?: string[]
}): CompiledPanel {
  return {
    key: args.key,
    role: args.role,
    width: args.size.width,
    height: args.size.height,
    thickness: args.size.thickness,
    position: [args.position.x, args.position.y, args.position.z],
    rotation: panelRotation(args.orientation),
    operations: [],
    orientation: args.orientation,
    sourceModuleId: args.sourceModuleId,
    doorHinge: args.doorHinge,
    touchedModuleIds: args.touchedModuleIds,
  }
}

function buildCellGrid(columns: FurnitureColumn[], config: FurnitureConfig): CompiledCellBounds[][] {
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0)
  const halfWidth = totalWidth / 2
  const cells: CompiledCellBounds[][] = []
  let cursorX = 0

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex]
    const columnWidth = column.width
    const columnCenterX = cursorX + columnWidth / 2 - halfWidth
    cursorX += columnWidth

    const columnCells: CompiledCellBounds[] = []
    let moduleBaseY = 0
    for (let moduleIndex = 0; moduleIndex < column.modules.length; moduleIndex++) {
      const module = column.modules[moduleIndex]
      const moduleTopY = moduleBaseY + module.height
      const xMin = columnCenterX - columnWidth / 2 + config.panelThickness / 2 + config.panelJointClearance
      const xMax = columnCenterX + columnWidth / 2 - config.panelThickness / 2 - config.panelJointClearance
      const yMin = moduleBaseY + config.panelThickness / 2 + config.panelJointClearance
      const yMax = moduleTopY - config.panelThickness / 2 - config.panelJointClearance
      const zMin = -config.depth / 2 + config.backPanelInset + config.backPanelThickness + config.panelJointClearance
      const zMax = config.depth / 2 - config.panelJointClearance
      columnCells.push({
        moduleId: module.id,
        columnIndex,
        moduleIndex,
        xMin,
        xMax,
        yMin,
        yMax,
        zMin,
        zMax,
        width: xMax - xMin,
        height: yMax - yMin,
        depth: zMax - zMin,
        frontZ: config.depth / 2 - config.panelThickness / 2,
        frontWidth: xMax - xMin - 2 * config.frontClearance,
        frontHeight: yMax - yMin - 2 * config.frontClearance,
      })
      moduleBaseY = moduleTopY
    }
    cells.push(columnCells)
  }

  return cells
}

function validateCompiledCells(columns: FurnitureColumn[], cells: CompiledCellBounds[][], config: FurnitureConfig): CompiledAssemblyIssue[] {
  const issues: CompiledAssemblyIssue[] = []
  if (config.backPanelInset + config.backPanelThickness + config.panelJointClearance >= config.depth) {
    issues.push(makeIssue('back-reserve-overflows-depth', 'Back panel inset, back thickness, and joint clearance exceed cabinet depth.'))
  }

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex]
    const columnCells = cells[columnIndex] ?? []
    for (let moduleIndex = 0; moduleIndex < column.modules.length; moduleIndex++) {
      const module = column.modules[moduleIndex]
      const cell = columnCells[moduleIndex]
      if (!cell) continue
      if (cell.width < DEGENERATE_MIN_SIZE) issues.push(makeIssue('cell-too-narrow', 'Module interior is too narrow.', cell))
      if (cell.height < DEGENERATE_MIN_SIZE) issues.push(makeIssue('cell-too-short', 'Module interior is too short.', cell))
      if (cell.depth < DEGENERATE_MIN_SIZE) issues.push(makeIssue('cell-too-shallow', 'Module interior is too shallow.', cell))
      if (cell.frontWidth < DEGENERATE_MIN_SIZE || cell.frontHeight < DEGENERATE_MIN_SIZE) issues.push(makeIssue('front-degenerate', 'Module front face is too small.', cell))
      if (module.type === 'doors' && (cell.frontWidth - 2 * config.frontClearance) / 2 < DEGENERATE_MIN_SIZE) {
        issues.push(makeIssue('paired-door-too-narrow', 'Paired door leaves are too narrow after front clearance.', cell))
      }
      if (module.type !== 'drawer') continue

      if (config.drawerSlidesReserve >= cell.depth) issues.push(makeIssue('slides-reserve-overflows-cell', 'Drawer slides reserve exceeds the module depth.', cell))
      const drawerCount = Math.max(1, Math.floor(module.drawerCount ?? 1))
      const frontBandHeight = (cell.height - config.frontClearance * (drawerCount + 1)) / drawerCount
      const drawerBoxBandHeight = (cell.height - 2 * config.panelJointClearance * Math.max(0, drawerCount - 1)) / drawerCount - 2 * config.drawerBottomInset - 2 * config.panelJointClearance
      const drawerBackBandHeight = drawerBoxBandHeight - config.backPanelInset - config.backPanelThickness
      if (frontBandHeight < DEGENERATE_MIN_SIZE || drawerBoxBandHeight < DEGENERATE_MIN_SIZE || drawerBackBandHeight < DEGENERATE_MIN_SIZE) {
        issues.push(makeIssue('drawer-band-too-short', 'Drawer band is too short for the front, bottom board, side/back panels, and clearances.', cell))
      }
      if (cell.depth - config.drawerSlidesReserve < DEGENERATE_MIN_SIZE) {
        issues.push(makeIssue('drawer-depth-too-shallow', 'Drawer box depth is too shallow after the slides reserve.', cell))
      }
    }
  }

  return issues
}

function moduleIdsAtBoundary(columns: FurnitureColumn[], columnIndex: number): string[] {
  if (columnIndex < 0 || columnIndex >= columns.length) return []
  return columns[columnIndex].modules.map(module => module.id)
}

function clampOperationCenter(panelWidth: number, panelHeight: number, diameter: number, x: number, y: number) {
  const radius = Math.max(0, diameter / 2)
  const halfWidth = panelWidth / 2
  const halfHeight = panelHeight / 2
  const minX = -halfWidth + radius
  const maxX = halfWidth - radius
  const minY = -halfHeight + radius
  const maxY = halfHeight - radius
  return {
    x: minX > maxX ? 0 : Math.min(maxX, Math.max(minX, x)),
    y: minY > maxY ? 0 : Math.min(maxY, Math.max(minY, y)),
  }
}

function makePullHole(panel: CompiledPanel, requestedCenter: { x: number, y: number }, diameter: number, suffix: string): PanelOperation {
  const center = clampOperationCenter(panel.width, panel.height, diameter, requestedCenter.x, requestedCenter.y)
  return {
    id: `op:pull-hole:${panel.key}:${suffix}`,
    operationType: 'through-hole',
    targetPanelKey: panel.key,
    face: 'front',
    center,
    cx: center.x,
    cy: center.y,
    diameter,
    depth: panel.thickness,
    through: true,
    sourceModuleId: panel.sourceModuleId,
  }
}

function backPanelGrooveDepth(config: FurnitureConfig): number {
  return config.panelThickness * 0.25
}

function makeVerticalSide(boundaryIndex: number, x: number, height: number, config: FurnitureConfig, touchedModuleIds: string[]): CompiledPanel {
  const overhang = config.sidePanelOverhang
  return makePanel({
    key: `vertical:boundary:${boundaryIndex}`,
    role: 'vertical-side',
    position: { x, y: height / 2, z: 0 },
    size: { width: config.depth, height: height + 2 * overhang, thickness: config.panelThickness },
    orientation: 'vertical-yz',
    touchedModuleIds,
  })
}

function makeHorizontalDeck(
  columnIndex: number,
  boundaryIndex: number,
  x: number,
  y: number,
  columnWidth: number,
  config: FurnitureConfig,
  touchedModuleIds: string[],
): CompiledPanel {
  const depth = config.depth + config.sidePanelOverhang / 2
  const usableWidth = Math.max(DEGENERATE_MIN_SIZE, columnWidth - config.panelThickness - 2 * config.panelJointClearance)
  return makePanel({
    key: `horizontal:column:${columnIndex}:boundary:${boundaryIndex}`,
    role: 'horizontal-deck',
    position: { x, y, z: config.sidePanelOverhang / 4 },
    size: { width: usableWidth, height: depth, thickness: config.panelThickness },
    orientation: 'horizontal-xz',
    touchedModuleIds,
  })
}

function makeBackPanel(module: FurnitureModule, cell: CompiledCellBounds, config: FurnitureConfig): CompiledPanel {
  const reserve = backPanelGrooveDepth(config)
  return makePanel({
    key: `back:column:${cell.columnIndex}:module:${cell.moduleIndex}`,
    role: 'back-panel',
    sourceModuleId: module.id,
    position: {
      x: (cell.xMin + cell.xMax) / 2,
      y: (cell.yMin + cell.yMax) / 2,
      z: -config.depth / 2 + config.backPanelInset + config.backPanelThickness / 2,
    },
    size: {
      width: Math.max(DEGENERATE_MIN_SIZE, cell.width + 2 * reserve),
      height: Math.max(DEGENERATE_MIN_SIZE, cell.height + 2 * reserve),
      thickness: config.backPanelThickness,
    },
    orientation: 'vertical-xy',
    touchedModuleIds: [module.id],
  })
}

function makeBackGrooveOperation(backPanel: CompiledPanel, targetPanel: CompiledPanel, target: 'left-side' | 'right-side' | 'bottom-deck' | 'top-deck', config: FurnitureConfig): PanelOperation {
  const reserve = backPanelGrooveDepth(config)
  const grooveWidth = config.backPanelThickness + config.backPanelGrooveClearance
  const isSide = target === 'left-side' || target === 'right-side'
  let length: number
  let rotation: number
  let centerX: number
  let centerY: number

  if (isSide) {
    length = Math.max(DEGENERATE_MIN_SIZE, targetPanel.height - targetPanel.thickness + reserve - config.sidePanelOverhang)
    rotation = Math.PI / 2
    centerX = -(backPanel.position[2] - targetPanel.position[2])
    centerY = (reserve - targetPanel.thickness - config.sidePanelOverhang) / 2
  }
  else {
    length = Math.max(DEGENERATE_MIN_SIZE, targetPanel.width)
    rotation = 0
    centerX = 0
    centerY = -(backPanel.position[2] - targetPanel.position[2])
  }

  const face = target === 'left-side' || target === 'bottom-deck' ? 'front' : 'back'
  return {
    id: `op:rail-cut:${backPanel.key}:${target}`,
    operationType: 'rail-cut',
    targetPanelKey: targetPanel.key,
    face,
    center: { x: centerX, y: centerY },
    x: centerX,
    y: centerY,
    width: grooveWidth,
    length,
    height: grooveWidth,
    depth: reserve,
    rotation,
    sourceModuleId: backPanel.sourceModuleId,
  }
}

function makeDrawerBottomGrooveOperation(
  drawerBottom: CompiledPanel,
  targetPanel: CompiledPanel,
  target: 'left-side' | 'right-side' | 'back' | 'front',
  cell: CompiledCellBounds,
  config: FurnitureConfig,
): PanelOperation {
  const reserve = backPanelGrooveDepth(config)
  const grooveWidth = config.backPanelThickness + config.backPanelGrooveClearance
  const panelThickness = config.panelThickness
  let face: 'front' | 'back'
  let length: number
  let centerX: number
  let centerY: number

  if (target === 'left-side' || target === 'right-side') {
    face = target === 'left-side' ? 'front' : 'back'
    length = Math.max(DEGENERATE_MIN_SIZE, targetPanel.width)
    centerX = -(drawerBottom.position[2] - targetPanel.position[2])
    centerY = drawerBottom.position[1] - targetPanel.position[1]
  }
  else if (target === 'back') {
    face = 'front'
    length = Math.max(DEGENERATE_MIN_SIZE, targetPanel.width)
    centerX = drawerBottom.position[0] - targetPanel.position[0]
    centerY = drawerBottom.position[1] - targetPanel.position[1]
  }
  else {
    face = 'back'
    length = Math.max(DEGENERATE_MIN_SIZE, cell.width - 2 * panelThickness + 2 * reserve)
    centerX = drawerBottom.position[0] - targetPanel.position[0]
    centerY = drawerBottom.position[1] - targetPanel.position[1]
  }

  return {
    id: `op:rail-cut:${drawerBottom.key}:${target}`,
    operationType: 'rail-cut',
    targetPanelKey: targetPanel.key,
    face,
    center: { x: centerX, y: centerY },
    x: centerX,
    y: centerY,
    width: grooveWidth,
    length,
    height: grooveWidth,
    depth: reserve,
    rotation: 0,
    sourceModuleId: drawerBottom.sourceModuleId,
  }
}

function compileDoorOrFrontPanels(module: FurnitureModule, cell: CompiledCellBounds, config: FurnitureConfig) {
  const panels: CompiledPanel[] = []
  const operations: PanelOperation[] = []
  const frontClearance = config.frontClearance
  const centerX = (cell.xMin + cell.xMax) / 2
  const centerY = (cell.yMin + cell.yMax) / 2
  const frontHeight = Math.max(DEGENERATE_MIN_SIZE, cell.frontHeight)
  const diameter = config.pullHoleDiameter
  const inset = config.pullHoleEdgeInset

  function singleDoorPull(panel: CompiledPanel, hinge: 'left' | 'right') {
    const x = hinge === 'left' ? panel.width / 2 - inset : -panel.width / 2 + inset
    const y = panel.height / 2 - inset
    return { x, y }
  }

  function pairedDoorPull(panel: CompiledPanel, side: 'left' | 'right') {
    const xFromCenter = panel.width / 2 + frontClearance - config.pullHolePairGap / 2
    const x = side === 'left' ? xFromCenter : -xFromCenter
    const y = panel.height / 2 - inset
    return { x, y }
  }

  if (module.type === 'left-door' || module.type === 'right-door') {
    const width = Math.max(DEGENERATE_MIN_SIZE, cell.frontWidth)
    const hinge = module.type === 'left-door' ? 'left' : 'right'
    const panel = makePanel({
      key: `door-front:${module.id}`,
      role: 'door-front',
      sourceModuleId: module.id,
      doorHinge: hinge,
      position: { x: centerX, y: centerY, z: cell.frontZ },
      size: { width, height: frontHeight, thickness: config.panelThickness },
      orientation: 'vertical-xy',
    })
    panels.push(panel)
    operations.push(makePullHole(panel, singleDoorPull(panel, hinge), diameter, 'a'))
    return { panels, operations }
  }

  if (module.type === 'doors') {
    const width = Math.max(DEGENERATE_MIN_SIZE, (cell.frontWidth - 2 * frontClearance) / 2)
    const leftX = centerX - width / 2 - frontClearance
    const rightX = centerX + width / 2 + frontClearance
    const left = makePanel({
      key: `door-front:${module.id}:left`,
      role: 'door-front',
      sourceModuleId: module.id,
      doorHinge: 'left',
      position: { x: leftX, y: centerY, z: cell.frontZ },
      size: { width, height: frontHeight, thickness: config.panelThickness },
      orientation: 'vertical-xy',
    })
    const right = makePanel({
      key: `door-front:${module.id}:right`,
      role: 'door-front',
      sourceModuleId: module.id,
      doorHinge: 'right',
      position: { x: rightX, y: centerY, z: cell.frontZ },
      size: { width, height: frontHeight, thickness: config.panelThickness },
      orientation: 'vertical-xy',
    })
    panels.push(left, right)
    operations.push(makePullHole(left, pairedDoorPull(left, 'left'), diameter, 'a'))
    operations.push(makePullHole(right, pairedDoorPull(right, 'right'), diameter, 'a'))
  }

  return { panels, operations }
}

function compileDrawer(module: FurnitureModule, cell: CompiledCellBounds, config: FurnitureConfig) {
  const panels: CompiledPanel[] = []
  const operations: PanelOperation[] = []
  const drawerCount = Math.max(1, Math.floor(module.drawerCount ?? 1))
  const panelThickness = config.panelThickness
  const backThickness = config.backPanelThickness
  const jointClearance = config.panelJointClearance
  const drawerBottomInset = config.drawerBottomInset
  const backInset = config.backPanelInset
  const frontClearance = config.frontClearance
  const centerX = (cell.xMin + cell.xMax) / 2
  const frontBandHeight = (cell.height - frontClearance * (drawerCount + 1)) / drawerCount
  const frontHeight = Math.max(DEGENERATE_MIN_SIZE, frontBandHeight)
  const spacing = 2 * jointClearance
  const drawerBoxBandHeight = (cell.height - spacing * Math.max(0, drawerCount - 1)) / drawerCount
  const slideDepth = Math.max(DEGENERATE_MIN_SIZE, cell.depth - config.drawerSlidesReserve)
  const drawerSideWidth = Math.max(DEGENERATE_MIN_SIZE, slideDepth - 2 * panelThickness - 2 * jointClearance)
  const drawerBoxBackZ = cell.zMax - slideDepth
  const drawerBoxCenterZ = drawerBoxBackZ + slideDepth / 2 + jointClearance
  const reserve = backPanelGrooveDepth(config)
  const bottomWidth = Math.max(DEGENERATE_MIN_SIZE, cell.width - 2 * jointClearance - 2 * panelThickness + 2 * reserve)
  const leftSideX = cell.xMin + panelThickness / 2 + jointClearance
  const rightSideX = cell.xMax - panelThickness / 2 - jointClearance
  const backZ = drawerBoxBackZ + panelThickness / 2 + jointClearance

  for (let drawerIndex = 0; drawerIndex < drawerCount; drawerIndex++) {
    const frontY = cell.yMin + frontClearance + drawerIndex * (frontHeight + frontClearance) + frontHeight / 2
    const drawerBandBottom = cell.yMin + drawerIndex * (drawerBoxBandHeight + spacing)
    const drawerBandTop = drawerBandBottom + drawerBoxBandHeight
    const usableBottom = drawerBandBottom + drawerBottomInset + jointClearance
    const usableTop = drawerBandTop - drawerBottomInset - jointClearance
    const drawerBoxHeight = Math.max(DEGENERATE_MIN_SIZE, usableTop - usableBottom)
    const drawerBoxCenterY = (usableBottom + usableTop) / 2
    const drawerBottomY = usableBottom + backInset + backThickness / 2
    const front = makePanel({
      key: `drawer-front:${module.id}:${drawerIndex}`,
      role: 'drawer-front',
      sourceModuleId: module.id,
      position: { x: centerX, y: frontY, z: cell.frontZ },
      size: { width: cell.frontWidth, height: frontHeight, thickness: panelThickness },
      orientation: 'vertical-xy',
    })
    panels.push(front)
    const pullY = frontHeight / 2 - config.pullHoleEdgeInset
    operations.push(
      makePullHole(front, { x: -config.pullHolePairGap / 2, y: pullY }, config.pullHoleDiameter, 'left'),
      makePullHole(front, { x: config.pullHolePairGap / 2, y: pullY }, config.pullHoleDiameter, 'right'),
    )

    const leftSide = makePanel({
      key: `drawer-side:${module.id}:${drawerIndex}:left`,
      role: 'drawer-side',
      sourceModuleId: module.id,
      position: { x: leftSideX, y: drawerBoxCenterY, z: drawerBoxCenterZ },
      size: { width: drawerSideWidth, height: drawerBoxHeight, thickness: panelThickness },
      orientation: 'vertical-yz',
    })
    const rightSide = makePanel({
      key: `drawer-side:${module.id}:${drawerIndex}:right`,
      role: 'drawer-side',
      sourceModuleId: module.id,
      position: { x: rightSideX, y: drawerBoxCenterY, z: drawerBoxCenterZ },
      size: { width: drawerSideWidth, height: drawerBoxHeight, thickness: panelThickness },
      orientation: 'vertical-yz',
    })
    const back = makePanel({
      key: `drawer-back:${module.id}:${drawerIndex}`,
      role: 'drawer-back',
      sourceModuleId: module.id,
      position: { x: centerX, y: drawerBoxCenterY, z: backZ },
      size: { width: front.width, height: drawerBoxHeight, thickness: panelThickness },
      orientation: 'vertical-xy',
    })
    const bottom = makePanel({
      key: `drawer-bottom:${module.id}:${drawerIndex}`,
      role: 'drawer-bottom',
      sourceModuleId: module.id,
      position: { x: centerX, y: drawerBottomY, z: drawerBoxCenterZ },
      size: { width: bottomWidth, height: drawerSideWidth, thickness: backThickness },
      orientation: 'horizontal-xz',
    })
    panels.push(leftSide, rightSide, back, bottom)
    operations.push(
      makeDrawerBottomGrooveOperation(bottom, leftSide, 'left-side', cell, config),
      makeDrawerBottomGrooveOperation(bottom, rightSide, 'right-side', cell, config),
      makeDrawerBottomGrooveOperation(bottom, back, 'back', cell, config),
      makeDrawerBottomGrooveOperation(bottom, front, 'front', cell, config),
    )
  }

  return { panels, operations }
}

function compileShelves(module: FurnitureModule, cell: CompiledCellBounds, config: FurnitureConfig) {
  const panels: CompiledPanel[] = []
  const count = Math.max(1, Math.min(16, Math.floor(module.shelfCount ?? 1)))
  const interiorHeight = cell.yMax - cell.yMin
  const gap = interiorHeight / (count + 1)
  const centerX = (cell.xMin + cell.xMax) / 2
  const centerZ = (cell.zMin + cell.zMax) / 2
  const width = Math.max(DEGENERATE_MIN_SIZE, cell.width)
  const boardDepth = Math.max(DEGENERATE_MIN_SIZE, cell.depth)

  for (let shelfIndex = 0; shelfIndex < count; shelfIndex++) {
    const y = cell.yMin + gap * (shelfIndex + 1)
    panels.push(makePanel({
      key: `internal-shelf:${module.id}:${shelfIndex}`,
      role: 'internal-shelf',
      sourceModuleId: module.id,
      position: { x: centerX, y, z: centerZ },
      size: { width, height: boardDepth, thickness: config.panelThickness },
      orientation: 'horizontal-xz',
    }))
  }

  return { panels, operations: [] as PanelOperation[] }
}

function compileDividers(module: FurnitureModule, cell: CompiledCellBounds, config: FurnitureConfig) {
  const panels: CompiledPanel[] = []
  const count = Math.max(1, Math.min(16, Math.floor(module.dividerCount ?? 1)))
  const interiorWidth = cell.xMax - cell.xMin
  const gap = interiorWidth / (count + 1)
  const centerY = (cell.yMin + cell.yMax) / 2
  const centerZ = (cell.zMin + cell.zMax) / 2
  const height = Math.max(DEGENERATE_MIN_SIZE, cell.height)
  const boardDepth = Math.max(DEGENERATE_MIN_SIZE, cell.depth)

  for (let dividerIndex = 0; dividerIndex < count; dividerIndex++) {
    const x = cell.xMin + gap * (dividerIndex + 1)
    panels.push(makePanel({
      key: `vertical-divider:${module.id}:${dividerIndex}`,
      role: 'vertical-divider',
      sourceModuleId: module.id,
      position: { x, y: centerY, z: centerZ },
      // vertical-yz: local width maps to depth (Z), local height maps to Y.
      size: { width: boardDepth, height, thickness: config.panelThickness },
      orientation: 'vertical-yz',
    }))
  }

  return { panels, operations: [] as PanelOperation[] }
}

/**
 * Face frame across the module opening — the parametric form of `panel2frame`.
 *
 * The four outer members always exist; `frameRailCount` and `frameStileCount`
 * add evenly spaced members inside them, so a plain surround is the zero case.
 * Members sit at the cell's front face, ahead of the carcass.
 */
function compileFrame(module: FurnitureModule, cell: CompiledCellBounds, config: FurnitureConfig) {
  const panels: CompiledPanel[] = []
  const memberWidth = Math.min(FRAME_MEMBER_WIDTH, Math.max(DEGENERATE_MIN_SIZE, Math.min(cell.width, cell.height) / 3))
  const thickness = config.panelThickness
  const z = cell.frontZ - thickness / 2
  const width = Math.max(DEGENERATE_MIN_SIZE, cell.frontWidth)
  const height = Math.max(DEGENERATE_MIN_SIZE, cell.frontHeight)
  const centerX = (cell.xMin + cell.xMax) / 2
  const centerY = (cell.yMin + cell.yMax) / 2
  const topY = centerY + height / 2 - memberWidth / 2
  const bottomY = centerY - height / 2 + memberWidth / 2
  const leftX = centerX - width / 2 + memberWidth / 2
  const rightX = centerX + width / 2 - memberWidth / 2

  const rail = (key: string, y: number, railWidth: number) => makePanel({
    key,
    role: 'frame-rail',
    sourceModuleId: module.id,
    position: { x: centerX, y, z },
    size: { width: railWidth, height: memberWidth, thickness },
    orientation: 'vertical-xy',
  })

  const stile = (key: string, x: number) => makePanel({
    key,
    role: 'frame-stile',
    sourceModuleId: module.id,
    position: { x, y: centerY, z },
    size: { width: memberWidth, height, thickness },
    orientation: 'vertical-xy',
  })

  // Stiles run the full height; rails span between them.
  panels.push(stile(`frame-stile:${module.id}:left`, leftX))
  panels.push(stile(`frame-stile:${module.id}:right`, rightX))
  const railSpan = Math.max(DEGENERATE_MIN_SIZE, width - 2 * memberWidth)
  panels.push(rail(`frame-rail:${module.id}:top`, topY, railSpan))
  panels.push(rail(`frame-rail:${module.id}:bottom`, bottomY, railSpan))

  const extraRails = Math.max(0, Math.min(8, Math.floor(module.frameRailCount ?? 0)))
  const innerHeight = bottomY + memberWidth / 2
  const innerTop = topY - memberWidth / 2
  for (let index = 0; index < extraRails; index++) {
    const t = (index + 1) / (extraRails + 1)
    panels.push(rail(`frame-rail:${module.id}:${index}`, innerHeight + (innerTop - innerHeight) * t, railSpan))
  }

  const extraStiles = Math.max(0, Math.min(8, Math.floor(module.frameStileCount ?? 0)))
  const innerLeft = leftX + memberWidth / 2
  const innerRight = rightX - memberWidth / 2
  for (let index = 0; index < extraStiles; index++) {
    const t = (index + 1) / (extraStiles + 1)
    panels.push(stile(`frame-stile:${module.id}:${index}`, innerLeft + (innerRight - innerLeft) * t))
  }

  return { panels, operations: [] as PanelOperation[] }
}

function compileModule(module: FurnitureModule, cell: CompiledCellBounds, config: FurnitureConfig) {
  if (module.type === 'shelf') return { panels: [] as CompiledPanel[], operations: [] as PanelOperation[] }
  if (module.type === 'shelves') return compileShelves(module, cell, config)
  if (module.type === 'dividers') return compileDividers(module, cell, config)
  if (module.type === 'frame') return compileFrame(module, cell, config)
  if (module.type === 'drawer') return compileDrawer(module, cell, config)
  return compileDoorOrFrontPanels(module, cell, config)
}

function normalizeOperation(operation: PanelOperation): PanelOperation {
  const center = operation.center
  const normalized: PanelOperation = {
    ...operation,
    center: center ? { x: center.x, y: center.y } : undefined,
  }
  if (normalized.center) {
    if (normalized.operationType === 'through-hole') {
      normalized.cx = normalized.center.x
      normalized.cy = normalized.center.y
    }
    else {
      normalized.x = normalized.center.x
      normalized.y = normalized.center.y
    }
  }
  if (normalized.diameter != null) normalized.diameter = snapMetric(normalized.diameter)
  if (normalized.depth != null) normalized.depth = snapMetric(normalized.depth)
  if (normalized.width != null) normalized.width = snapMetric(normalized.width)
  if (normalized.height != null) normalized.height = snapMetric(normalized.height)
  if (normalized.length != null) normalized.length = snapMetric(normalized.length)
  return normalized
}

function normalizePanel(panel: CompiledPanel, yOffset: number): CompiledPanel {
  return {
    ...panel,
    width: positiveMetric(panel.width),
    height: positiveMetric(panel.height),
    thickness: positiveMetric(panel.thickness),
    position: [panel.position[0], snapMetric(panel.position[1] + yOffset), panel.position[2]],
    operations: [],
  }
}

export function compileAssembly(furnitureDoc: FurnitureDoc, _opts: CompileOptions = {}): CompiledAssembly {
  const config = furnitureDoc.config
  const columns = furnitureDoc.columns
  if (columns.length === 0) return { panels: [], operations: [], issues: [] }

  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0)
  if (!(totalWidth > 0)) return { panels: [], operations: [], issues: [] }

  const columnHeights = columns.map(column => column.modules.reduce((sum, module) => sum + module.height, 0))
  const cells = buildCellGrid(columns, config)
  const issues = validateCompiledCells(columns, cells, config)
  const panels: CompiledPanel[] = []
  const operations: PanelOperation[] = []
  const columnBoundaries = [0]

  for (const column of columns) columnBoundaries.push(columnBoundaries[columnBoundaries.length - 1] + column.width)

  const halfWidth = totalWidth / 2
  for (let boundaryIndex = 0; boundaryIndex < columnBoundaries.length; boundaryIndex++) {
    const x = columnBoundaries[boundaryIndex] - halfWidth
    const leftHeight = boundaryIndex > 0 ? columnHeights[boundaryIndex - 1] : 0
    const rightHeight = boundaryIndex < columnHeights.length ? columnHeights[boundaryIndex] : 0
    const sideHeight = Math.max(leftHeight, rightHeight)
    const touchedModuleIds = [...moduleIdsAtBoundary(columns, boundaryIndex - 1), ...moduleIdsAtBoundary(columns, boundaryIndex)]
    panels.push(makeVerticalSide(boundaryIndex, x, sideHeight, config, touchedModuleIds))
  }

  let cursorX = 0
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex]
    const columnCenterX = cursorX + column.width / 2 - halfWidth
    cursorX += column.width
    if (column.modules.length === 0) continue

    const moduleBoundaries = [0]
    let y = 0
    for (const module of column.modules) {
      y += module.height
      moduleBoundaries.push(y)
    }

    for (let boundaryIndex = 0; boundaryIndex < moduleBoundaries.length; boundaryIndex++) {
      let touchedModuleIds: string[]
      if (boundaryIndex === 0) touchedModuleIds = [column.modules[0].id]
      else if (boundaryIndex === column.modules.length) touchedModuleIds = [column.modules[column.modules.length - 1].id]
      else touchedModuleIds = [column.modules[boundaryIndex - 1].id, column.modules[boundaryIndex].id]
      panels.push(makeHorizontalDeck(columnIndex, boundaryIndex, columnCenterX, moduleBoundaries[boundaryIndex], column.width, config, touchedModuleIds))
    }

    for (let moduleIndex = 0; moduleIndex < column.modules.length; moduleIndex++) {
      const module = column.modules[moduleIndex]
      const cell = cells[columnIndex]?.[moduleIndex]
      if (!cell) continue
      panels.push(makeBackPanel(module, cell, config))
      const compiled = compileModule(module, cell, config)
      panels.push(...compiled.panels)
      operations.push(...compiled.operations)
    }
  }

  const panelMap = new Map(panels.map(panel => [panel.key, panel]))
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex]
    for (let moduleIndex = 0; moduleIndex < column.modules.length; moduleIndex++) {
      const cell = cells[columnIndex]?.[moduleIndex]
      if (!cell) continue
      const backPanel = panelMap.get(`back:column:${columnIndex}:module:${moduleIndex}`)
      if (!backPanel) continue
      const targets = [
        { key: `vertical:boundary:${columnIndex}`, target: 'left-side' as const },
        { key: `vertical:boundary:${columnIndex + 1}`, target: 'right-side' as const },
        { key: `horizontal:column:${columnIndex}:boundary:${moduleIndex}`, target: 'bottom-deck' as const },
        { key: `horizontal:column:${columnIndex}:boundary:${moduleIndex + 1}`, target: 'top-deck' as const },
      ]
      for (const { key, target } of targets) {
        const targetPanel = panelMap.get(key)
        if (targetPanel) operations.push(makeBackGrooveOperation(backPanel, targetPanel, target, config))
      }
    }
  }

  const normalizedPanels = panels.map(panel => normalizePanel(panel, config.sidePanelOverhang))

  // Drilling rules are re-applied on every compile, against the *normalized*
  // panel sizes, so a pattern anchored to an edge follows the panel as the
  // design changes rather than baking in the size it was authored at.
  if (furnitureDoc.drilling) {
    for (const panel of normalizedPanels) {
      operations.push(...drillingOperationsForPanel(panel.key, panel.role, panel, furnitureDoc.drilling))
    }
  }

  // Joinery reads the finished panel boxes, so it sees every panel the
  // compiler produced — carcass, module, and (later) free-standing alike.
  if (furnitureDoc.joinery) {
    operations.push(...applyJoinery(normalizedPanels, furnitureDoc.joinery).operations)
  }

  const normalizedOperations = operations.map(normalizeOperation)
  const normalizedPanelMap = new Map(normalizedPanels.map(panel => [panel.key, panel]))
  for (const operation of normalizedOperations) {
    normalizedPanelMap.get(operation.targetPanelKey)?.operations.push(operation)
  }

  return { panels: normalizedPanels, operations: normalizedOperations, issues }
}

// ---------------------------------------------------------------------------
// Geometry compilation (CSG cache)
// ---------------------------------------------------------------------------

const GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>()

// Lazy CSG evaluator — created once and re-used. (three-bvh-csg is GPU-free.)
let evaluatorInstance: Evaluator | null = null
function getEvaluator(): Evaluator {
  if (evaluatorInstance) return evaluatorInstance
  evaluatorInstance = new Evaluator()
  evaluatorInstance.useGroups = false
  return evaluatorInstance
}

function panelGeometryCacheKey(panel: CompiledPanel, operations: PanelOperation[]): string {
  // Hash includes role-independent dims + every through-hole on this panel.
  const ops = operations
    .filter(o => o.operationType === 'through-hole' && o.targetPanelKey === panel.key)
    .map(o => `${(o.center?.x ?? o.cx ?? 0).toFixed(6)},${(o.center?.y ?? o.cy ?? 0).toFixed(6)},${(o.diameter ?? 0).toFixed(6)}`)
    .sort()
    .join(';')
  return [
    panel.role,
    panel.width.toFixed(6),
    panel.height.toFixed(6),
    panel.thickness.toFixed(6),
    ops,
  ].join('|')
}

/**
 * Build a panel BufferGeometry. Through-hole operations are subtracted via
 * three-bvh-csg; rail-cuts are not represented in geometry — they are drawn
 * as outline rectangles by RailCutMesh.
 */
export function compilePartGeometry(
  panel: CompiledPanel,
  operations: PanelOperation[],
): THREE.BufferGeometry {
  const key = panelGeometryCacheKey(panel, operations)
  const cached = GEOMETRY_CACHE.get(key)
  if (cached) return cached.clone()

  const w = Math.max(0.001, panel.width)
  const h = Math.max(0.001, panel.height)
  const t = Math.max(0.001, panel.thickness)

  const box = new THREE.BoxGeometry(w, h, t)
  let brushAccum = new Brush(box)
  brushAccum.updateMatrixWorld()

  const evaluator = getEvaluator()
  const mine = operations.filter(o => o.targetPanelKey === panel.key)

  /** Subtract a cutter and dispose it. */
  const cut = (geometry: THREE.BufferGeometry) => {
    const cutBrush = new Brush(geometry)
    cutBrush.updateMatrixWorld()
    brushAccum = evaluator.evaluate(brushAccum, cutBrush, SUBTRACTION) as Brush
    geometry.dispose()
  }

  // Blind features are cut from the face they are drilled into; `front` is +Z.
  const faceSign = (op: PanelOperation) => (op.face === 'back' ? -1 : 1)
  const OVERSHOOT = PULL_HOLE_DEPTH_PADDING * 2

  /**
   * Centre a blind cutter of height `depth + OVERSHOOT` so it starts flush
   * with the drilled face and bottoms out exactly `depth` into the panel.
   * Front face sits at +t/2, back at -t/2.
   */
  const blindCutterZ = (depth: number, sign: number) => sign * (t / 2 + OVERSHOOT / 2 - depth / 2)

  for (const op of mine) {
    const ox = op.center?.x ?? op.cx ?? op.x ?? 0
    const oy = op.center?.y ?? op.cy ?? op.y ?? 0
    const sign = faceSign(op)

    if (isHoleOperation(op) && (op.diameter ?? 0) > 0) {
      const r = Math.max(HOLE_MIN_DIAMETER / 2, (op.diameter ?? 0) / 2)
      const depth = effectiveDepth(op, t)

      if (depth == null) {
        // Through: overshoot both faces so the boolean stays watertight.
        const cyl = new THREE.CylinderGeometry(r, r, t * 1.35 + OVERSHOOT, 32)
        cyl.rotateX(Math.PI / 2)
        cyl.translate(ox, oy, 0)
        cut(cyl)
      }
      else {
        const cyl = new THREE.CylinderGeometry(r, r, depth + OVERSHOOT, 32)
        cyl.rotateX(Math.PI / 2)
        cyl.translate(ox, oy, blindCutterZ(depth, sign))
        cut(cyl)
      }

      // Head recess: a cone for a countersink, a flat-bottomed bore otherwise.
      const headRadius = Math.max(r, (op.headDiameter ?? 0) / 2)
      if (op.operationType === 'countersink' && headRadius > r) {
        // 82° included angle is the flat-head wood-screw standard.
        const coneHeight = (headRadius - r) / Math.tan((82 / 2) * (Math.PI / 180))
        const cone = new THREE.CylinderGeometry(headRadius, r, coneHeight, 32)
        // After rotateX(+90°) the wide end faces +Z; flip it for a back-face
        // countersink so the mouth still opens onto the drilled face.
        cone.rotateX(sign > 0 ? Math.PI / 2 : -Math.PI / 2)
        cone.translate(ox, oy, sign * (t / 2 - coneHeight / 2))
        cut(cone)
      }
      else if (op.operationType === 'counterbore' && headRadius > r) {
        const headDepth = Math.max(HOLE_MIN_DIAMETER, Math.min(t, op.headDepth ?? 0))
        const bore = new THREE.CylinderGeometry(headRadius, headRadius, headDepth + OVERSHOOT, 32)
        bore.rotateX(Math.PI / 2)
        bore.translate(ox, oy, blindCutterZ(headDepth, sign))
        cut(bore)
      }
      continue
    }

    // Pockets, grooves, dados, and rabbets all remove a rectangular prism from
    // one face. `rail-cut` keeps its existing overlay-only treatment.
    if (
      op.operationType === 'pocket'
      || op.operationType === 'groove'
      || op.operationType === 'dado'
      || op.operationType === 'rabbet'
    ) {
      const sw = Math.max(RAILCUT_MIN_SIZE, op.width ?? 0)
      const sh = Math.max(RAILCUT_MIN_SIZE, op.height ?? 0)
      const depth = effectiveDepth(op, t)
      const through = depth == null
      const boxCut = new THREE.BoxGeometry(sw, sh, through ? t * 1.35 + OVERSHOOT : depth + OVERSHOOT)
      if (op.rotation) boxCut.rotateZ(op.rotation)
      boxCut.translate(ox, oy, through ? 0 : blindCutterZ(depth, sign))
      cut(boxCut)
    }
  }

  const result = brushAccum.geometry.clone()
  GEOMETRY_CACHE.set(key, result)
  return result.clone()
}

/** Drop the geometry cache (e.g. on hot reload, or before a full teardown). */
export function clearPanelGeometryCache(): void {
  for (const g of GEOMETRY_CACHE.values()) g.dispose()
  GEOMETRY_CACHE.clear()
}
