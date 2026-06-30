// Serialize a compiled cutlist to common interchange formats — the Morti analogue
// of FreeCAD Woodworking's `sheet2export` (CSV/JSON/HTML/Markdown). Pure and
// framework-free so it can be unit-tested and reused outside the Vue component.
//
// Dimensions are stored in metres and emitted in the caller's chosen unit
// (defaults to millimetres — the practical cut-list unit and the app's underlying
// 1 mm metric grid).

import { convertFromMeters, type LengthUnit } from './units'

export interface CutlistPanelRow {
  groupId: string
  role: string
  orientation: string
  width: number // metres
  height: number // metres
  thickness: number // metres
  quantity: number
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

/** Metres → chosen unit (rounded to that unit's precision). `null` → null. */
function num(value: number | null | undefined, unit: LengthUnit): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return convertFromMeters(value, unit)
}

function numText(value: number | null | undefined, unit: LengthUnit): string {
  const v = num(value, unit)
  return v == null ? '' : String(v)
}

function slugifyName(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return base || 'cutlist'
}

export function cutlistFileName(name: string, format: CutlistFormat): string {
  const ext = format === 'md' ? 'md' : format
  return `${slugifyName(name)}-cutlist.${ext}`
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

function toCsv(data: CutlistData, unit: LengthUnit): string {
  const lines: string[] = []
  lines.push('Panel cutlist')
  lines.push(csvRow(['Part', 'Role', 'Orientation', `Width (${unit})`, `Height (${unit})`, `Thickness (${unit})`, 'Qty']))
  for (const p of data.panels) {
    lines.push(csvRow([p.groupId, p.role, p.orientation, numText(p.width, unit), numText(p.height, unit), numText(p.thickness, unit), p.quantity]))
  }
  lines.push('')
  lines.push('Machining operations')
  lines.push(csvRow(['Operation', 'Target panel', 'Face', `Diameter (${unit})`, `Depth (${unit})`, `Width (${unit})`, `Length (${unit})`, 'Through', 'Qty']))
  for (const o of data.operations) {
    lines.push(csvRow([o.operationType, o.targetRole, o.face, numText(o.diameter, unit), numText(o.depth, unit), numText(o.width, unit), numText(o.length, unit), o.through ? 'yes' : 'no', o.quantity]))
  }
  return lines.join('\r\n')
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function toJson(data: CutlistData, unit: LengthUnit): string {
  return JSON.stringify({
    projectName: data.projectName,
    exportedAt: data.exportedAt,
    units: unit,
    panels: data.panels.map(p => ({
      part: p.groupId,
      role: p.role,
      orientation: p.orientation,
      width: num(p.width, unit),
      height: num(p.height, unit),
      thickness: num(p.thickness, unit),
      quantity: p.quantity,
    })),
    operations: data.operations.map(o => ({
      operation: o.operationType,
      targetPanel: o.targetRole,
      face: o.face,
      diameter: num(o.diameter, unit),
      depth: num(o.depth, unit),
      width: num(o.width, unit),
      length: num(o.length, unit),
      through: o.through,
      quantity: o.quantity,
    })),
  }, null, 2)
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function toMarkdown(data: CutlistData, unit: LengthUnit): string {
  const out: string[] = []
  out.push(`# Cutlist — ${data.projectName}`)
  out.push('')
  out.push(`_Exported ${data.exportedAt} · dimensions in ${unit}_`)
  out.push('')
  out.push('## Panels')
  out.push('')
  out.push(`| Part | Role | Orientation | Width (${unit}) | Height (${unit}) | Thickness (${unit}) | Qty |`)
  out.push('| --- | --- | --- | ---: | ---: | ---: | ---: |')
  for (const p of data.panels) {
    out.push(`| ${p.groupId} | ${p.role} | ${p.orientation} | ${numText(p.width, unit)} | ${numText(p.height, unit)} | ${numText(p.thickness, unit)} | ${p.quantity} |`)
  }
  if (data.panels.length === 0) out.push('| — | — | — | — | — | — | — |')
  out.push('')
  out.push('## Machining operations')
  out.push('')
  out.push(`| Operation | Target panel | Face | Diameter (${unit}) | Depth (${unit}) | Width (${unit}) | Length (${unit}) | Through | Qty |`)
  out.push('| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |')
  for (const o of data.operations) {
    out.push(`| ${o.operationType} | ${o.targetRole} | ${o.face} | ${numText(o.diameter, unit)} | ${numText(o.depth, unit)} | ${numText(o.width, unit)} | ${numText(o.length, unit)} | ${o.through ? 'yes' : 'no'} | ${o.quantity} |`)
  }
  if (data.operations.length === 0) out.push('| — | — | — | — | — | — | — | — | — |')
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

function toHtml(data: CutlistData, unit: LengthUnit): string {
  const panelRows = data.panels.map(p =>
    `<tr><td>${escapeHtml(p.groupId)}</td><td>${escapeHtml(p.role)}</td><td>${escapeHtml(p.orientation)}</td>`
    + `<td class="n">${numText(p.width, unit)}</td><td class="n">${numText(p.height, unit)}</td><td class="n">${numText(p.thickness, unit)}</td><td class="n">${p.quantity}</td></tr>`,
  ).join('\n')
  const opRows = data.operations.map(o =>
    `<tr><td>${escapeHtml(o.operationType)}</td><td>${escapeHtml(o.targetRole)}</td><td>${escapeHtml(o.face)}</td>`
    + `<td class="n">${numText(o.diameter, unit)}</td><td class="n">${numText(o.depth, unit)}</td><td class="n">${numText(o.width, unit)}</td><td class="n">${numText(o.length, unit)}</td>`
    + `<td>${o.through ? 'yes' : 'no'}</td><td class="n">${o.quantity}</td></tr>`,
  ).join('\n')

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
<p class="meta">Exported ${escapeHtml(data.exportedAt)} · dimensions in ${unit}</p>
<h2>Panels</h2>
<table>
<thead><tr><th>Part</th><th>Role</th><th>Orientation</th><th>Width (${unit})</th><th>Height (${unit})</th><th>Thickness (${unit})</th><th>Qty</th></tr></thead>
<tbody>
${panelRows || '<tr><td colspan="7">No panels</td></tr>'}
</tbody>
</table>
<h2>Machining operations</h2>
<table>
<thead><tr><th>Operation</th><th>Target panel</th><th>Face</th><th>Diameter (${unit})</th><th>Depth (${unit})</th><th>Width (${unit})</th><th>Length (${unit})</th><th>Through</th><th>Qty</th></tr></thead>
<tbody>
${opRows || '<tr><td colspan="9">No machining operations</td></tr>'}
</tbody>
</table>
</body>
</html>
`
}

export function serializeCutlist(data: CutlistData, format: CutlistFormat, unit: LengthUnit = 'mm'): SerializedCutlist {
  switch (format) {
    case 'csv':
      return { content: toCsv(data, unit), mime: 'text/csv;charset=utf-8', ext: 'csv' }
    case 'json':
      return { content: toJson(data, unit), mime: 'application/json', ext: 'json' }
    case 'html':
      return { content: toHtml(data, unit), mime: 'text/html;charset=utf-8', ext: 'html' }
    case 'md':
      return { content: toMarkdown(data, unit), mime: 'text/markdown;charset=utf-8', ext: 'md' }
  }
}
