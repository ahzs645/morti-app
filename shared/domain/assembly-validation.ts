import type {
  CompiledAssemblyIssue,
  FurnitureColumn,
  FurnitureConfig,
  FurnitureDoc,
  FurnitureModule,
} from '~~/shared/domain/types'

const DEGENERATE_MIN_SIZE = 0.001

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

interface CompiledCellBounds extends CellBounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  zMin: number
  zMax: number
  frontZ: number
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
      if (cell.frontWidth < DEGENERATE_MIN_SIZE || cell.frontHeight < DEGENERATE_MIN_SIZE) {
        issues.push(makeIssue('front-degenerate', 'Module front face is too small.', cell))
      }
      if (module.type === 'doors' && cell.frontWidth / 2 < DEGENERATE_MIN_SIZE) {
        issues.push(makeIssue('paired-door-too-narrow', 'Paired door leaves are too narrow after front clearance.', cell))
      }
      if (module.type === 'drawer') {
        if (config.drawerSlidesReserve >= cell.depth) {
          issues.push(makeIssue('slides-reserve-overflows-cell', 'Drawer slides reserve exceeds the module depth.', cell))
        }
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
  }
  return issues
}

export function validateFurnitureDocIssues(furnitureDoc: FurnitureDoc): CompiledAssemblyIssue[] {
  const config = furnitureDoc.config
  const columns = furnitureDoc.columns
  if (columns.length === 0) return []
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0)
  if (!(totalWidth > 0)) return []
  return validateCompiledCells(columns, buildCellGrid(columns, config), config)
}
