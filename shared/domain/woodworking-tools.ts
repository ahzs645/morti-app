/**
 * The full tool map from the FreeCAD "Woodworking" workbench
 * (github.com/dprojects/Woodworking) to where each tool now lives in Morti.
 *
 * Grouped by the workbench's own 23 toolbars so someone who knows the
 * workbench can find the equivalent by the name they already use. Rendered by
 * `pages/tools.vue`.
 *
 * Status meanings:
 *   ported          — a direct equivalent exists in Morti
 *   partial         — the capability is there, but narrower than upstream
 *   native          — Morti already did this, before the port
 *   not-applicable  — a FreeCAD shell/IDE feature, not a woodworking one
 */

export type PortStatus = 'ported' | 'partial' | 'native' | 'not-applicable'

export const PORT_STATUS_LABEL: Record<PortStatus, string> = {
  'ported': 'Ported',
  'partial': 'Partial',
  'native': 'Already in Morti',
  'not-applicable': 'Not applicable',
}

export interface ToolMapping {
  /** Upstream tool name, verbatim. */
  tool: string
  status: PortStatus
  /** Where it lives in Morti. */
  where: string
  note?: string
}

export interface ToolbarGroup {
  /** Upstream toolbar name, without the "Woodworking - " prefix. */
  name: string
  tools: ToolMapping[]
}

const DESIGNER = 'Designer'
const EDGES = 'Designer → Edges & grain'
const FREE = 'Designer → Free panels'
const DRILLING = 'Designer → Drilling'
const SETTINGS = 'Designer → Project settings'
const CUTLIST = 'Cutlist'
const STYLE = 'Style panel'

export const WOODWORKING_TOOLBARS: ToolbarGroup[] = [
  {
    name: 'start',
    tools: [
      { tool: 'magicStart', status: 'ported', where: `${FREE} · ${DESIGNER}`, note: 'Columns and modules build the carcass; free panels cover ad-hoc boards.' },
      { tool: 'panelDefaultXY', status: 'ported', where: `${FREE} → Add on plane → XY` },
      { tool: 'panelDefaultYX', status: 'ported', where: `${FREE} → Add on plane → YX` },
      { tool: 'panelDefaultXZ', status: 'ported', where: `${FREE} → Add on plane → XZ` },
      { tool: 'panelDefaultZX', status: 'ported', where: `${FREE} → Add on plane → ZX` },
      { tool: 'panelDefaultYZ', status: 'ported', where: `${FREE} → Add on plane → YZ` },
      { tool: 'panelDefaultZY', status: 'ported', where: `${FREE} → Add on plane → ZY` },
    ],
  },
  {
    name: 'move and copy',
    tools: [
      { tool: 'magicMove', status: 'ported', where: `${FREE} → Centre (mm) fields` },
      { tool: 'panelMoveXp', status: 'ported', where: `${FREE} → X +` },
      { tool: 'panelMoveXm', status: 'ported', where: `${FREE} → X −` },
      { tool: 'panelMoveYp', status: 'ported', where: `${FREE} → Y +` },
      { tool: 'panelMoveYm', status: 'ported', where: `${FREE} → Y −` },
      { tool: 'panelMoveZp', status: 'ported', where: `${FREE} → Z +` },
      { tool: 'panelMoveZm', status: 'ported', where: `${FREE} → Z −` },
      { tool: 'magicAngle', status: 'not-applicable', where: '—', note: 'Panels are axis-aligned; arbitrary rotation is not in the model.' },
    ],
  },
  {
    name: 'resize',
    tools: [
      { tool: 'magicResizer', status: 'ported', where: `${FREE} → Size (mm) fields` },
      { tool: 'panelResize1', status: 'ported', where: `${FREE} → grow/shrink X` },
      { tool: 'panelResize2', status: 'ported', where: `${FREE} → grow/shrink X` },
      { tool: 'panelResize3', status: 'ported', where: `${FREE} → grow/shrink Y` },
      { tool: 'panelResize4', status: 'ported', where: `${FREE} → grow/shrink Y` },
      { tool: 'panelResize5', status: 'ported', where: `${FREE} → grow/shrink Z` },
      { tool: 'panelResize6', status: 'ported', where: `${FREE} → grow/shrink Z` },
    ],
  },
  {
    name: 'face',
    tools: [
      { tool: 'panelFaceXY', status: 'ported', where: `${FREE} → From face` },
      { tool: 'panelFaceYX', status: 'ported', where: `${FREE} → From face` },
      { tool: 'panelFaceXZ', status: 'ported', where: `${FREE} → From face` },
      { tool: 'panelFaceZX', status: 'ported', where: `${FREE} → From face` },
      { tool: 'panelFaceYZ', status: 'ported', where: `${FREE} → From face` },
      { tool: 'panelFaceZY', status: 'ported', where: `${FREE} → From face`, note: 'One tool covers all six: the new panel inherits the source panel’s plane.' },
    ],
  },
  {
    name: 'between',
    tools: [
      { tool: 'panelBetweenXY', status: 'ported', where: `${FREE} → Fill between` },
      { tool: 'panelBetweenYX', status: 'ported', where: `${FREE} → Fill between` },
      { tool: 'panelBetweenXZ', status: 'ported', where: `${FREE} → Fill between` },
      { tool: 'panelBetweenZX', status: 'ported', where: `${FREE} → Fill between` },
      { tool: 'panelBetweenYZ', status: 'ported', where: `${FREE} → Fill between` },
      { tool: 'panelBetweenZY', status: 'ported', where: `${FREE} → Fill between`, note: 'The gap axis is detected, so one tool covers all six.' },
    ],
  },
  {
    name: 'irregular shapes',
    tools: [
      { tool: 'magicManager', status: 'ported', where: `${EDGES} → Shape` },
      { tool: 'panelSideLeft', status: 'ported', where: `${EDGES} → Shape → Cut bottom-left` },
      { tool: 'panelSideRight', status: 'ported', where: `${EDGES} → Shape → Cut bottom-right` },
      { tool: 'panelSideLeftUP', status: 'ported', where: `${EDGES} → Shape → Cut top-left` },
      { tool: 'panelSideRightUP', status: 'ported', where: `${EDGES} → Shape → Cut top-right` },
      { tool: 'panelBackOut', status: 'ported', where: `${EDGES} → Shape → Back notch` },
      { tool: 'panelCoverXY', status: 'ported', where: `${EDGES} → Shape → Rounded corners` },
      { tool: 'sketch2pad', status: 'partial', where: `${EDGES} → Shape → Custom outline`, note: 'Custom outlines compile and export, but there is no point editor yet.' },
      { tool: 'wires2pad', status: 'partial', where: `${EDGES} → Shape → Custom outline`, note: 'As above — modelled and extruded, not yet authorable from the UI.' },
      { tool: 'addExternal', status: 'not-applicable', where: '—', note: 'Importing external CAD geometry is out of scope for the web app.' },
    ],
  },
  {
    name: 'location',
    tools: [
      { tool: 'panelMove2Anchor', status: 'partial', where: `${FREE} → Centre (mm)`, note: 'Numeric placement rather than snapping to a picked anchor.' },
      { tool: 'showVertex', status: 'not-applicable', where: '—', note: 'No vertex picking in the web viewer.' },
      { tool: 'selectVertex', status: 'not-applicable', where: '—', note: 'No vertex picking in the web viewer.' },
      { tool: 'panelMove2Face', status: 'partial', where: `${FREE} → From face`, note: 'Derives a panel at a face; does not move an existing one onto one.' },
      { tool: 'mapPosition', status: 'partial', where: `${FREE} → Centre (mm)` },
      { tool: 'panelMove2Center', status: 'ported', where: `${FREE} → Centre` },
      { tool: 'shelvesEqual', status: 'ported', where: `${FREE} → Space evenly` },
    ],
  },
  {
    name: 'preview',
    tools: [
      { tool: 'fitModel', status: 'native', where: '3D view', note: 'Orbit and zoom are built in.' },
      { tool: 'makeTransparent', status: 'not-applicable', where: '—', note: 'Not ported; the technical render mode serves a similar purpose.' },
      { tool: 'frontsOpenClose', status: 'native', where: '3D view → open doors and drawers' },
      { tool: 'magicView', status: 'native', where: '3D view → view helper' },
    ],
  },
  {
    name: 'project manage',
    tools: [
      { tool: 'magicSettings', status: 'ported', where: SETTINGS },
      { tool: 'Std_New', status: 'native', where: 'Home → new project' },
      { tool: 'Std_Save', status: 'native', where: 'Autosaved locally; cloud sync when signed in' },
      { tool: 'Std_Open', status: 'native', where: 'Home → project list, or Import .morti' },
      { tool: 'Std_MergeProjects', status: 'not-applicable', where: '—' },
      { tool: 'selected2LinkGroup', status: 'not-applicable', where: '—', note: 'FreeCAD document containers have no analogue here.' },
      { tool: 'selected2Link', status: 'not-applicable', where: '—' },
      { tool: 'selected2Group', status: 'not-applicable', where: '—' },
      { tool: 'selected2Assembly', status: 'not-applicable', where: '—' },
      { tool: 'selected2Outside', status: 'not-applicable', where: '—' },
      { tool: 'eyeRa', status: 'not-applicable', where: '—', note: 'Per-object visibility is not modelled.' },
      { tool: 'eyeHorus', status: 'not-applicable', where: '—' },
    ],
  },
  {
    name: 'decorations',
    tools: [
      { tool: 'magicColors', status: 'native', where: `${STYLE} → materials` },
      { tool: 'setTextures', status: 'ported', where: `${STYLE} → material presets`, note: 'Procedural wood grain per species, with direction set in Edges & grain.' },
      { tool: 'makeBeautiful', status: 'native', where: `${STYLE}` },
    ],
  },
  {
    name: 'dimensions',
    tools: [
      { tool: 'getDimensions', status: 'ported', where: `${CUTLIST}`, note: 'Panel table plus totals for area, volume, edge length, weight, and cost.' },
      { tool: 'sheet2export', status: 'ported', where: `${CUTLIST} → Export CSV / JSON / HTML / Markdown` },
      { tool: 'showMeasurements', status: 'partial', where: `${CUTLIST}`, note: 'Dimensions are tabulated, not annotated on the 3D model.' },
      { tool: 'magicMeasure', status: 'not-applicable', where: '—', note: 'No interactive measuring tool in the 3D view.' },
    ],
  },
  {
    name: 'dowels and screws',
    tools: [
      { tool: 'magicDowels', status: 'ported', where: `${DRILLING} → Dowel hole`, note: 'Also produced automatically by the dowel joint style.' },
      { tool: 'panel2link', status: 'not-applicable', where: '—' },
      { tool: 'panel2clone', status: 'not-applicable', where: '—' },
      { tool: 'sketch2dowel', status: 'partial', where: `${DRILLING} → pattern`, note: 'Patterns are parametric rather than sketch-driven.' },
      { tool: 'edge2dowel', status: 'ported', where: `${DRILLING} → anchor edge + inset` },
    ],
  },
  {
    name: 'fixture',
    tools: [
      { tool: 'magicFixture', status: 'ported', where: `${DRILLING} → hardware`, note: 'A rule can name the hardware its holes seat, which feeds the BOM.' },
      { tool: 'edge2drillbit', status: 'ported', where: `${DRILLING} → anchor edge + inset` },
    ],
  },
  {
    name: 'drilling holes',
    tools: [
      { tool: 'magicDriller', status: 'ported', where: DRILLING },
      { tool: 'drillHoles', status: 'ported', where: `${DRILLING} → Through hole` },
      { tool: 'drillCountersinks', status: 'ported', where: `${DRILLING} → Countersink` },
      { tool: 'drillCounterbores', status: 'ported', where: `${DRILLING} → Counterbore` },
      { tool: 'drillCounterbores2x', status: 'ported', where: `${DRILLING} → Counterbore ×2`, note: 'Add one rule per face — front and back.' },
      { tool: 'magicCNC', status: 'ported', where: 'Pocket operation' },
      { tool: 'cutDowels', status: 'ported', where: `${DRILLING} → Dowel hole` },
    ],
  },
  {
    name: 'convert',
    tools: [
      { tool: 'panel2pad', status: 'native', where: '—', note: 'Every Morti panel is already a solid; there is nothing to convert.' },
      { tool: 'panelCopyXY', status: 'ported', where: `${FREE} → Copy to → XY` },
      { tool: 'panelCopyYX', status: 'ported', where: `${FREE} → Copy to → YX` },
      { tool: 'panelCopyXZ', status: 'ported', where: `${FREE} → Copy to → XZ` },
      { tool: 'panelCopyZX', status: 'ported', where: `${FREE} → Copy to → ZX` },
      { tool: 'panelCopyYZ', status: 'ported', where: `${FREE} → Copy to → YZ` },
      { tool: 'panelCopyZY', status: 'ported', where: `${FREE} → Copy to → ZY` },
    ],
  },
  {
    name: 'parameterization',
    tools: [
      { tool: 'magicGlue', status: 'not-applicable', where: '—', note: 'Panels are already parametric; there is no mesh to convert.' },
      { tool: 'sketch2clone', status: 'not-applicable', where: '—' },
      { tool: 'Spreadsheet_CreateSheet', status: 'ported', where: `${SETTINGS} → Variables` },
      { tool: 'showAlias', status: 'ported', where: `${SETTINGS}`, note: 'A driven field shows the name of the variable driving it.' },
      { tool: 'Std_VarSet', status: 'ported', where: `${SETTINGS} → Variables` },
    ],
  },
  {
    name: 'construction',
    tools: [
      { tool: 'panel2profile', status: 'partial', where: `${EDGES} → Edge profile` },
      { tool: 'panel2angle', status: 'not-applicable', where: '—', note: 'Arbitrary angled panels are outside the axis-aligned model.' },
      { tool: 'panel2angle45cut', status: 'partial', where: `${SETTINGS} → Joint style → Mitre 45°` },
      { tool: 'panel2frame', status: 'ported', where: `${DESIGNER} → module type → Frame` },
      { tool: 'panel2taper', status: 'ported', where: `${EDGES} → Shape → Taper` },
      { tool: 'cornerBlock', status: 'partial', where: `${CUTLIST}`, note: 'The corner-block part exists and can be priced, but nothing generates one yet.' },
      { tool: 'cornerBrace', status: 'partial', where: `${CUTLIST}`, note: 'As above.' },
    ],
  },
  {
    name: 'joinery',
    tools: [
      { tool: 'magicJoints', status: 'ported', where: `${SETTINGS} → Joint style` },
      { tool: 'jointTenonCut', status: 'ported', where: 'Joint style → Mortise & tenon' },
      { tool: 'jointMortiseCut', status: 'ported', where: 'Joint style → Mortise & tenon' },
      { tool: 'magicCut', status: 'ported', where: 'Joint style → Dado' },
      { tool: 'magicKnife', status: 'ported', where: 'Joint style → Tongue & groove' },
      { tool: 'jointTenonDowel', status: 'ported', where: 'Joint style → Dowel' },
      { tool: 'cutTenonDowels', status: 'ported', where: 'Joint style → Dowel' },
      { tool: 'magicCorner', status: 'ported', where: 'Joint style → Mitre 45°' },
      { tool: 'magicCutLinks', status: 'ported', where: 'Joint style', note: 'A style applies at every panel contact, so the link variants are implicit.' },
      { tool: 'magicKnifeLinks', status: 'ported', where: 'Joint style' },
      { tool: 'jointTenonDowelP', status: 'ported', where: 'Joint style → Dowel' },
      { tool: 'cutTenonDowelsP', status: 'ported', where: 'Joint style → Dowel' },
    ],
  },
  {
    name: 'router',
    tools: [
      { tool: 'routerCove', status: 'ported', where: `${EDGES} → Edge profile → Cove` },
      { tool: 'routerCove2', status: 'ported', where: 'Cove, 2 edges selected' },
      { tool: 'routerCove4', status: 'ported', where: 'Cove, 4 edges selected' },
      { tool: 'routerRoundOver', status: 'ported', where: `${EDGES} → Edge profile → Round over` },
      { tool: 'routerRoundOver2', status: 'ported', where: 'Round over, 2 edges selected' },
      { tool: 'routerRoundOver4', status: 'ported', where: 'Round over, 4 edges selected' },
      { tool: 'routerStraight2', status: 'ported', where: `${EDGES} → Edge profile → Straight rebate` },
      { tool: 'routerStraight3', status: 'ported', where: 'Straight rebate, 3 edges selected' },
      { tool: 'routerStraight4', status: 'ported', where: 'Straight rebate, 4 edges selected' },
      { tool: 'routerChamfer', status: 'ported', where: `${EDGES} → Edge profile → Chamfer` },
      { tool: 'routerChamfer2', status: 'ported', where: 'Chamfer, 2 edges selected' },
      { tool: 'routerChamfer4', status: 'ported', where: 'Chamfer, 4 edges selected' },
      { tool: 'multiPocket', status: 'ported', where: `${EDGES} → Edge profile → Multi-pocket` },
      { tool: 'multiPocket2', status: 'ported', where: 'Multi-pocket, 2 edges selected' },
      { tool: 'multiPocket4', status: 'ported', where: 'Multi-pocket, 4 edges selected' },
    ],
  },
  {
    name: 'veneer',
    tools: [
      { tool: 'addVeneer', status: 'ported', where: `${EDGES} → Banding → Wood veneer` },
      { tool: 'bandLibrary', status: 'ported', where: `${EDGES} → Banding`, note: 'Stock ABS and veneer tapes with thickness, width, and price per metre.' },
      { tool: 'bandApply', status: 'ported', where: `${EDGES} → Banding → per edge` },
      { tool: 'bandRemove', status: 'ported', where: `${EDGES} → Banding → Bare` },
      { tool: 'bandList', status: 'ported', where: `${CUTLIST} → Edge banding`, note: 'Tape length and cost per band, flagging tape narrower than the panel.' },
      { tool: 'panelMaterial', status: 'native', where: `${STYLE} → materials` },
    ],
  },
  {
    name: 'grain direction',
    tools: [
      { tool: 'grainH', status: 'ported', where: `${EDGES} → Grain → Along length` },
      { tool: 'grainV', status: 'ported', where: `${EDGES} → Grain → Across width` },
      { tool: 'grainX', status: 'ported', where: `${EDGES} → Grain → No grain` },
    ],
  },
  {
    name: 'advanced',
    tools: [
      { tool: 'align2Curve', status: 'partial', where: `${EDGES} → Shape → Arched top` },
      { tool: 'roundCurve', status: 'ported', where: `${EDGES} → Shape → Rounded corners` },
      { tool: 'showOccupiedSpace', status: 'ported', where: `${CUTLIST} → Occupied space`, note: 'Also checks the piece against the transport limits in project settings.' },
      { tool: 'showConstraints', status: 'not-applicable', where: '—' },
      { tool: 'Std_Part', status: 'not-applicable', where: '—' },
      { tool: 'PartDesign_Body', status: 'not-applicable', where: '—' },
      { tool: 'PartDesign_NewSketch', status: 'not-applicable', where: '—' },
      { tool: 'PartDesign_Pad', status: 'not-applicable', where: '—' },
    ],
  },
  {
    name: 'code and debug',
    tools: [
      { tool: 'debugInfo', status: 'not-applicable', where: '—', note: 'FreeCAD IDE tooling, deliberately out of scope.' },
      { tool: 'scanObjects', status: 'not-applicable', where: '—' },
      { tool: 'Std_DependencyGraph', status: 'not-applicable', where: '—' },
      { tool: 'showPlacement', status: 'not-applicable', where: '—' },
      { tool: 'Std_DlgMacroExecute', status: 'not-applicable', where: '—' },
      { tool: 'Std_DlgMacroExecuteDirect', status: 'not-applicable', where: '—' },
      { tool: 'Std_DlgMacroRecord', status: 'not-applicable', where: '—' },
    ],
  },
]

export interface ToolStats {
  total: number
  byStatus: Record<PortStatus, number>
  /** Share of applicable tools with a full equivalent, 0…1. Partial ports are
   *  deliberately excluded — counting them would overstate the coverage. */
  coverage: number
}

export function toolStats(groups: ToolbarGroup[] = WOODWORKING_TOOLBARS): ToolStats {
  const byStatus: Record<PortStatus, number> = {
    'ported': 0,
    'partial': 0,
    'native': 0,
    'not-applicable': 0,
  }
  let total = 0
  for (const group of groups) {
    for (const tool of group.tools) {
      byStatus[tool.status] += 1
      total += 1
    }
  }
  const applicable = total - byStatus['not-applicable']
  return {
    total,
    byStatus,
    coverage: applicable === 0 ? 1 : (byStatus.ported + byStatus.native) / applicable,
  }
}
