// Serialize a compiled cutlist to common interchange formats — the Morti analogue
// of FreeCAD Woodworking's `sheet2export` (CSV/JSON/HTML/Markdown). Pure and
// framework-free so it can be unit-tested and reused outside the Vue component.
//
// Dimensions are stored in metres and rendered through `shared/domain/units.ts`
// in whatever unit the project's `ProjectSettings` selects — millimetres by
// default, which is what this exporter emitted before units were configurable.

import type { CostingTotals } from './costing'
import type { BandListReport } from './edgeband'
import type { ProjectSettings } from './types'
import { DEFAULT_PROJECT_SETTINGS } from './defaults'
import {
  AREA_UNIT_SYMBOL,
  LENGTH_UNIT_SYMBOL,
  VOLUME_UNIT_SYMBOL,
  WEIGHT_UNIT_SYMBOL,
  convertArea,
  convertVolume,
  convertWeight,
  formatArea,
  formatLength,
  formatMoney,
  formatVolume,
  formatWeight,
} from './units'

export interface CutlistPanelRow {
  groupId: string
  role: string
  orientation: string
  width: number // metres
  height: number // metres
  thickness: number // metres
  quantity: number
  /** Material label, when the project reports cost/weight. */
  material?: string
  /** Weight of the whole group, kg. */
  weightKg?: number
  /** Material cost of the whole group, in the project currency. */
  cost?: number
  /** Grain direction code (`L` / `W` / `—`). */
  grain?: string
  /** Banded-edge summary, e.g. `T/B/L`. */
  banding?: string
  /** Router edge profile note, e.g. `Chamfer 6 mm T/B`. */
  edgeProfile?: string
}

export interface CutlistOperationRow {
  operationType: string
  targetRole: string
  face: string
  diameter: number | null // metres
  depth: number | null // metres
  width: number | null // metres
  length: number | null // metres
  through: boolean
  quantity: number
}

export interface CutlistData {
  projectName: string
  exportedAt: string // ISO string
  panels: CutlistPanelRow[]
  operations: CutlistOperationRow[]
  /** Presentation settings. Defaults to millimetres when omitted. */
  settings?: ProjectSettings
  /** Weight/cost rollup from `costing.ts`, when the project reports it. */
  totals?: CostingTotals
  /** Edge-banding tape report from `edgeband.ts › computeBandList`. */
  bandList?: BandListReport
}

export type CutlistFormat = 'csv' | 'json' | 'html' | 'md'

export interface SerializedCutlist {
  content: string
  mime: string
  ext: string
}

export const CUTLIST_FORMATS: { format: CutlistFormat, label: string }[] = [
  { format: 'csv', label: 'CSV' },
  { format: 'json', label: 'JSON' },
  { format: 'html', label: 'HTML' },
  { format: 'md', label: 'Markdown' },
]

// ---------------------------------------------------------------------------
// Presentation helpers — every number in every format goes through these, so a
// unit change lands in CSV, JSON, HTML, and Markdown at once.
// ---------------------------------------------------------------------------

interface Presenter {
  settings: ProjectSettings
  /** Length symbol for column headers, e.g. `mm`. */
  lengthSymbol: string
  /** Format metres for display. Empty string for null/undefined. */
  len: (metres: number | null | undefined) => string
  /** Numeric form of the same, for JSON. `null` stays null. */
  lenValue: (metres: number | null | undefined) => number | null
  money: (amount: number | null | undefined) => string
  /** Material/weight/cost columns are opt-in twice over: the project has to
   *  report them *and* the data has to carry them, so a caller that never
   *  computed costing emits exactly the columns it always did. */
  showMaterial: boolean
  showWeight: boolean
  showCost: boolean
  showOperations: boolean
  showGrain: boolean
  showBanding: boolean
  showProfile: boolean
}

function roundTo(value: number, precision: number): number {
  const factor = 10 ** Math.max(0, Math.min(6, precision))
  return Math.round(value * factor) / factor
}

function makePresenter(data: CutlistData): Presenter {
  const s = data.settings ?? DEFAULT_PROJECT_SETTINGS
  const options = { precision: s.lengthPrecision, denominator: s.fractionDenominator }
  const hasMaterial = data.panels.some(row => row.material != null)
  const hasWeight = data.panels.some(row => row.weightKg != null) || data.totals != null
  const hasCost = data.panels.some(row => row.cost != null) || data.totals != null
  const hasGrain = data.panels.some(row => row.grain != null)
  const hasBanding = data.panels.some(row => row.banding != null && row.banding !== '—')
  const hasProfile = data.panels.some(row => row.edgeProfile != null && row.edgeProfile !== '—')
  return {
    settings: s,
    lengthSymbol: LENGTH_UNIT_SYMBOL[s.lengthUnit],
    len: (metres) => {
      if (metres == null || !Number.isFinite(metres)) return ''
      return formatLength(metres, s.lengthUnit, options)
    },
    lenValue: (metres) => {
      if (metres == null || !Number.isFinite(metres)) return null
      // Fractional inches have no numeric form of their own — JSON consumers get
      // decimal inches, which is the same quantity without the display sugar.
      const value = s.lengthUnit === 'fraction'
        ? metres / 0.0254
        : Number(formatLength(metres, s.lengthUnit, options))
      return roundTo(value, s.lengthUnit === 'fraction' ? 4 : s.lengthPrecision)
    },
    money: amount => (amount == null || !Number.isFinite(amount) ? '' : formatMoney(amount, s.currency)),
    showMaterial: hasMaterial && (s.reportWeight || s.reportCost),
    showWeight: hasWeight && s.reportWeight,
    showCost: hasCost && s.reportCost,
    showOperations: s.reportOperations,
    showGrain: hasGrain,
    showBanding: hasBanding,
    showProfile: hasProfile,
  }
}

function slugifyName(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return base || 'cutlist'
}

export function cutlistFileName(name: string, format: CutlistFormat): string {
  const ext = format === 'md' ? 'md' : format
  return `${slugifyName(name)}-cutlist.${ext}`
}

/** Extra columns a project turns on via `reportWeight` / `reportCost`. */
function panelExtraHeaders(p: Presenter): string[] {
  const headers: string[] = []
  if (p.showGrain) headers.push('Grain')
  if (p.showBanding) headers.push('Banding')
  if (p.showProfile) headers.push('Edge profile')
  if (p.showMaterial) headers.push('Material')
  if (p.showWeight) headers.push(`Weight (${WEIGHT_UNIT_SYMBOL[p.settings.weightUnit]})`)
  if (p.showCost) headers.push(`Cost (${p.settings.currency})`)
  return headers
}

function panelExtraCells(row: CutlistPanelRow, p: Presenter): string[] {
  const cells: string[] = []
  if (p.showGrain) cells.push(row.grain ?? '')
  if (p.showBanding) cells.push(row.banding ?? '')
  if (p.showProfile) cells.push(row.edgeProfile ?? '')
  if (p.showMaterial) cells.push(row.material ?? '')
  if (p.showWeight) cells.push(row.weightKg == null ? '' : formatWeight(row.weightKg, p.settings.weightUnit))
  if (p.showCost) cells.push(row.cost == null ? '' : p.money(row.cost))
  return cells
}

/** Tape rows shared by every text format (`bandList`). */
function bandListRows(report: BandListReport, p: Presenter): string[][] {
  const s = p.settings
  const edgeOptions = { precision: s.edgePrecision, denominator: s.fractionDenominator }
  return report.rows.map(row => [
    row.band.label,
    String(row.edgeCount),
    formatLength(row.lengthM, s.edgeUnit, edgeOptions),
    formatMoney(row.cost, s.currency),
    row.tooNarrow ? 'tape narrower than panel' : '',
  ])
}

const BAND_LIST_HEADERS = (p: Presenter) => [
  'Edge band',
  'Edges',
  `Length (${LENGTH_UNIT_SYMBOL[p.settings.edgeUnit]})`,
  `Cost (${p.settings.currency})`,
  'Note',
]

/** Summary lines shared by every text format. */
function totalsPairs(totals: CostingTotals, p: Presenter): [string, string][] {
  const s = p.settings
  const pairs: [string, string][] = [
    ['Panels', String(totals.panelCount)],
    [`Face area (${AREA_UNIT_SYMBOL[s.areaUnit]})`, formatArea(totals.faceAreaM2, s.areaUnit, s.areaPrecision)],
    [`Volume (${VOLUME_UNIT_SYMBOL[s.volumeUnit]})`, formatVolume(totals.volumeM3, s.volumeUnit)],
    [`Edge length (${LENGTH_UNIT_SYMBOL[s.edgeUnit]})`, formatLength(totals.edgeLengthM, s.edgeUnit, { precision: s.edgePrecision, denominator: s.fractionDenominator })],
  ]
  if (p.showWeight) pairs.push([`Weight (${WEIGHT_UNIT_SYMBOL[s.weightUnit]})`, formatWeight(totals.weightKg, s.weightUnit)])
  if (p.showCost) pairs.push([`Cost (${s.currency})`, formatMoney(totals.cost, s.currency)])
  return pairs
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(',')
}

function toCsv(data: CutlistData): string {
  const p = makePresenter(data)
  const u = p.lengthSymbol
  const lines: string[] = []
  lines.push('Panel cutlist')
  lines.push(csvRow(['Part', 'Role', 'Orientation', `Width (${u})`, `Height (${u})`, `Thickness (${u})`, 'Qty', ...panelExtraHeaders(p)]))
  for (const row of data.panels) {
    lines.push(csvRow([
      row.groupId,
      row.role,
      row.orientation,
      p.len(row.width),
      p.len(row.height),
      p.len(row.thickness),
      row.quantity,
      ...panelExtraCells(row, p),
    ]))
  }
  if (p.showOperations) {
    lines.push('')
    lines.push('Machining operations')
    lines.push(csvRow(['Operation', 'Target panel', 'Face', `Diameter (${u})`, `Depth (${u})`, `Width (${u})`, `Length (${u})`, 'Through', 'Qty']))
    for (const o of data.operations) {
      lines.push(csvRow([o.operationType, o.targetRole, o.face, p.len(o.diameter), p.len(o.depth), p.len(o.width), p.len(o.length), o.through ? 'yes' : 'no', o.quantity]))
    }
  }
  if (data.bandList && data.bandList.rows.length > 0) {
    lines.push('')
    lines.push('Edge banding')
    lines.push(csvRow(BAND_LIST_HEADERS(p)))
    for (const row of bandListRows(data.bandList, p)) lines.push(csvRow(row))
  }
  if (data.totals) {
    lines.push('')
    lines.push('Totals')
    for (const [label, value] of totalsPairs(data.totals, p)) lines.push(csvRow([label, value]))
  }
  return lines.join('\r\n')
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function toJson(data: CutlistData): string {
  const p = makePresenter(data)
  const s = p.settings
  const payload: Record<string, unknown> = {
    projectName: data.projectName,
    exportedAt: data.exportedAt,
    units: s.lengthUnit === 'fraction' ? 'in' : s.lengthUnit,
    panels: data.panels.map(row => ({
      part: row.groupId,
      role: row.role,
      orientation: row.orientation,
      width: p.lenValue(row.width),
      height: p.lenValue(row.height),
      thickness: p.lenValue(row.thickness),
      quantity: row.quantity,
      ...(p.showWeight || p.showCost ? { material: row.material ?? null } : {}),
      ...(p.showWeight ? { weight: row.weightKg == null ? null : roundTo(convertWeight(row.weightKg, s.weightUnit), 3) } : {}),
      ...(p.showCost ? { cost: row.cost == null ? null : roundTo(row.cost, 2) } : {}),
    })),
  }
  if (p.showOperations) {
    payload.operations = data.operations.map(o => ({
      operation: o.operationType,
      targetPanel: o.targetRole,
      face: o.face,
      diameter: p.lenValue(o.diameter),
      depth: p.lenValue(o.depth),
      width: p.lenValue(o.width),
      length: p.lenValue(o.length),
      through: o.through,
      quantity: o.quantity,
    }))
  }
  if (data.bandList && data.bandList.rows.length > 0) {
    payload.edgeBanding = {
      rows: data.bandList.rows.map(row => ({
        band: row.band.label,
        bandId: row.band.id,
        thicknessMm: row.band.thicknessMm,
        widthMm: row.band.widthMm,
        edges: row.edgeCount,
        length: p.lenValue(row.lengthM),
        cost: roundTo(row.cost, 2),
        tooNarrow: row.tooNarrow,
      })),
      totalLength: p.lenValue(data.bandList.totalLengthM),
      totalCost: roundTo(data.bandList.totalCost, 2),
      currency: s.currency,
    }
  }
  if (data.totals) {
    payload.totals = {
      panelCount: data.totals.panelCount,
      faceArea: roundTo(convertArea(data.totals.faceAreaM2, s.areaUnit), s.areaPrecision),
      areaUnit: s.areaUnit,
      volume: roundTo(convertVolume(data.totals.volumeM3, s.volumeUnit), 4),
      volumeUnit: s.volumeUnit,
      edgeLength: p.lenValue(data.totals.edgeLengthM),
      ...(p.showWeight ? { weight: roundTo(convertWeight(data.totals.weightKg, s.weightUnit), 3), weightUnit: s.weightUnit } : {}),
      ...(p.showCost ? { cost: roundTo(data.totals.cost, 2), currency: s.currency } : {}),
    }
  }
  return JSON.stringify(payload, null, 2)
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function toMarkdown(data: CutlistData): string {
  const p = makePresenter(data)
  const extras = panelExtraHeaders(p)
  const out: string[] = []
  out.push(`# Cutlist — ${data.projectName}`)
  out.push('')
  out.push(`_Exported ${data.exportedAt} · dimensions in ${p.lengthSymbol}_`)
  out.push('')
  out.push('## Panels')
  out.push('')
  out.push(`| Part | Role | Orientation | Width | Height | Thickness | Qty |${extras.map(h => ` ${h} |`).join('')}`)
  out.push(`| --- | --- | --- | ---: | ---: | ---: | ---: |${extras.map(() => ' ---: |').join('')}`)
  for (const row of data.panels) {
    const extraCells = panelExtraCells(row, p).map(c => ` ${c} |`).join('')
    out.push(`| ${row.groupId} | ${row.role} | ${row.orientation} | ${p.len(row.width)} | ${p.len(row.height)} | ${p.len(row.thickness)} | ${row.quantity} |${extraCells}`)
  }
  if (data.panels.length === 0) out.push(`| — | — | — | — | — | — | — |${extras.map(() => ' — |').join('')}`)
  if (p.showOperations) {
    out.push('')
    out.push('## Machining operations')
    out.push('')
    out.push('| Operation | Target panel | Face | Diameter | Depth | Width | Length | Through | Qty |')
    out.push('| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |')
    for (const o of data.operations) {
      out.push(`| ${o.operationType} | ${o.targetRole} | ${o.face} | ${p.len(o.diameter)} | ${p.len(o.depth)} | ${p.len(o.width)} | ${p.len(o.length)} | ${o.through ? 'yes' : 'no'} | ${o.quantity} |`)
    }
    if (data.operations.length === 0) out.push('| — | — | — | — | — | — | — | — | — |')
  }
  if (data.bandList && data.bandList.rows.length > 0) {
    out.push('')
    out.push('## Edge banding')
    out.push('')
    out.push(`| ${BAND_LIST_HEADERS(p).join(' | ')} |`)
    out.push('| --- | ---: | ---: | ---: | --- |')
    for (const row of bandListRows(data.bandList, p)) out.push(`| ${row.join(' | ')} |`)
  }
  if (data.totals) {
    out.push('')
    out.push('## Totals')
    out.push('')
    out.push('| Measure | Value |')
    out.push('| --- | ---: |')
    for (const [label, value] of totalsPairs(data.totals, p)) out.push(`| ${label} | ${value} |`)
  }
  out.push('')
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toHtml(data: CutlistData): string {
  const p = makePresenter(data)
  const extras = panelExtraHeaders(p)
  const panelColumns = 7 + extras.length

  const panelRows = data.panels.map((row) => {
    const extraCells = panelExtraCells(row, p)
      .map(cell => `<td>${escapeHtml(cell)}</td>`)
      .join('')
    return `<tr><td>${escapeHtml(row.groupId)}</td><td>${escapeHtml(row.role)}</td><td>${escapeHtml(row.orientation)}</td>`
      + `<td class="n">${p.len(row.width)}</td><td class="n">${p.len(row.height)}</td><td class="n">${p.len(row.thickness)}</td><td class="n">${row.quantity}</td>`
      + extraCells + '</tr>'
  }).join('\n')

  const opRows = data.operations.map(o =>
    `<tr><td>${escapeHtml(o.operationType)}</td><td>${escapeHtml(o.targetRole)}</td><td>${escapeHtml(o.face)}</td>`
    + `<td class="n">${p.len(o.diameter)}</td><td class="n">${p.len(o.depth)}</td><td class="n">${p.len(o.width)}</td><td class="n">${p.len(o.length)}</td>`
    + `<td>${o.through ? 'yes' : 'no'}</td><td class="n">${o.quantity}</td></tr>`,
  ).join('\n')

  const operationsSection = p.showOperations
    ? `<h2>Machining operations</h2>
<table>
<thead><tr><th>Operation</th><th>Target panel</th><th>Face</th><th>Diameter</th><th>Depth</th><th>Width</th><th>Length</th><th>Through</th><th>Qty</th></tr></thead>
<tbody>
${opRows || '<tr><td colspan="9">No machining operations</td></tr>'}
</tbody>
</table>`
    : ''

  const bandSection = data.bandList && data.bandList.rows.length > 0
    ? `<h2>Edge banding</h2>
<table>
<thead><tr>${BAND_LIST_HEADERS(p).map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
<tbody>
${bandListRows(data.bandList, p).map(row => `<tr>${row.map((cell, index) => `<td${index === 0 || index === 4 ? '' : ' class="n"'}>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('\n')}
</tbody>
</table>`
    : ''

  const totalsSection = data.totals
    ? `<h2>Totals</h2>
<table>
<thead><tr><th>Measure</th><th>Value</th></tr></thead>
<tbody>
${totalsPairs(data.totals, p).map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td class="n">${escapeHtml(value)}</td></tr>`).join('\n')}
</tbody>
</table>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cutlist — ${escapeHtml(data.projectName)}</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; color: #1c1917; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .meta { color: #78716c; margin-bottom: 1.5rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #d6d3d1; padding: 4px 8px; text-align: left; }
  th { background: #f5f5f4; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<h1>Cutlist — ${escapeHtml(data.projectName)}</h1>
<p class="meta">Exported ${escapeHtml(data.exportedAt)} · dimensions in ${escapeHtml(p.lengthSymbol)}</p>
<h2>Panels</h2>
<table>
<thead><tr><th>Part</th><th>Role</th><th>Orientation</th><th>Width</th><th>Height</th><th>Thickness</th><th>Qty</th>${extras.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
<tbody>
${panelRows || `<tr><td colspan="${panelColumns}">No panels</td></tr>`}
</tbody>
</table>
${operationsSection}
${bandSection}
${totalsSection}
</body>
</html>
`
}

export function serializeCutlist(data: CutlistData, format: CutlistFormat): SerializedCutlist {
  switch (format) {
    case 'csv':
      return { content: toCsv(data), mime: 'text/csv;charset=utf-8', ext: 'csv' }
    case 'json':
      return { content: toJson(data), mime: 'application/json', ext: 'json' }
    case 'html':
      return { content: toHtml(data), mime: 'text/html;charset=utf-8', ext: 'html' }
    case 'md':
      return { content: toMarkdown(data), mime: 'text/markdown;charset=utf-8', ext: 'md' }
  }
}
