// Serialize a compiled cutlist to common interchange formats — the Morti analogue
// of FreeCAD Woodworking's `sheet2export` (CSV/JSON/HTML/Markdown). Pure and
// framework-free so it can be unit-tested and reused outside the Vue component.
//
// Dimensions are emitted in **millimetres** (the practical cut-list unit, and the
// app's underlying 1 mm metric grid), not the metres shown on screen.

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

/** Metres → millimetres, rounded to the nearest mm. `null` → null. */
function mm(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 1000)
}

function mmText(value: number | null | undefined): string {
  const v = mm(value)
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

function toCsv(data: CutlistData): string {
  const lines: string[] = []
  lines.push('Panel cutlist')
  lines.push(csvRow(['Part', 'Role', 'Orientation', 'Width (mm)', 'Height (mm)', 'Thickness (mm)', 'Qty']))
  for (const p of data.panels) {
    lines.push(csvRow([p.groupId, p.role, p.orientation, mmText(p.width), mmText(p.height), mmText(p.thickness), p.quantity]))
  }
  lines.push('')
  lines.push('Machining operations')
  lines.push(csvRow(['Operation', 'Target panel', 'Face', 'Diameter (mm)', 'Depth (mm)', 'Width (mm)', 'Length (mm)', 'Through', 'Qty']))
  for (const o of data.operations) {
    lines.push(csvRow([o.operationType, o.targetRole, o.face, mmText(o.diameter), mmText(o.depth), mmText(o.width), mmText(o.length), o.through ? 'yes' : 'no', o.quantity]))
  }
  return lines.join('\r\n')
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function toJson(data: CutlistData): string {
  return JSON.stringify({
    projectName: data.projectName,
    exportedAt: data.exportedAt,
    units: 'mm',
    panels: data.panels.map(p => ({
      part: p.groupId,
      role: p.role,
      orientation: p.orientation,
      width: mm(p.width),
      height: mm(p.height),
      thickness: mm(p.thickness),
      quantity: p.quantity,
    })),
    operations: data.operations.map(o => ({
      operation: o.operationType,
      targetPanel: o.targetRole,
      face: o.face,
      diameter: mm(o.diameter),
      depth: mm(o.depth),
      width: mm(o.width),
      length: mm(o.length),
      through: o.through,
      quantity: o.quantity,
    })),
  }, null, 2)
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function toMarkdown(data: CutlistData): string {
  const out: string[] = []
  out.push(`# Cutlist — ${data.projectName}`)
  out.push('')
  out.push(`_Exported ${data.exportedAt} · dimensions in mm_`)
  out.push('')
  out.push('## Panels')
  out.push('')
  out.push('| Part | Role | Orientation | Width | Height | Thickness | Qty |')
  out.push('| --- | --- | --- | ---: | ---: | ---: | ---: |')
  for (const p of data.panels) {
    out.push(`| ${p.groupId} | ${p.role} | ${p.orientation} | ${mmText(p.width)} | ${mmText(p.height)} | ${mmText(p.thickness)} | ${p.quantity} |`)
  }
  if (data.panels.length === 0) out.push('| — | — | — | — | — | — | — |')
  out.push('')
  out.push('## Machining operations')
  out.push('')
  out.push('| Operation | Target panel | Face | Diameter | Depth | Width | Length | Through | Qty |')
  out.push('| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |')
  for (const o of data.operations) {
    out.push(`| ${o.operationType} | ${o.targetRole} | ${o.face} | ${mmText(o.diameter)} | ${mmText(o.depth)} | ${mmText(o.width)} | ${mmText(o.length)} | ${o.through ? 'yes' : 'no'} | ${o.quantity} |`)
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

function toHtml(data: CutlistData): string {
  const panelRows = data.panels.map(p =>
    `<tr><td>${escapeHtml(p.groupId)}</td><td>${escapeHtml(p.role)}</td><td>${escapeHtml(p.orientation)}</td>`
    + `<td class="n">${mmText(p.width)}</td><td class="n">${mmText(p.height)}</td><td class="n">${mmText(p.thickness)}</td><td class="n">${p.quantity}</td></tr>`,
  ).join('\n')
  const opRows = data.operations.map(o =>
    `<tr><td>${escapeHtml(o.operationType)}</td><td>${escapeHtml(o.targetRole)}</td><td>${escapeHtml(o.face)}</td>`
    + `<td class="n">${mmText(o.diameter)}</td><td class="n">${mmText(o.depth)}</td><td class="n">${mmText(o.width)}</td><td class="n">${mmText(o.length)}</td>`
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
<p class="meta">Exported ${escapeHtml(data.exportedAt)} · dimensions in mm</p>
<h2>Panels</h2>
<table>
<thead><tr><th>Part</th><th>Role</th><th>Orientation</th><th>Width</th><th>Height</th><th>Thickness</th><th>Qty</th></tr></thead>
<tbody>
${panelRows || '<tr><td colspan="7">No panels</td></tr>'}
</tbody>
</table>
<h2>Machining operations</h2>
<table>
<thead><tr><th>Operation</th><th>Target panel</th><th>Face</th><th>Diameter</th><th>Depth</th><th>Width</th><th>Length</th><th>Through</th><th>Qty</th></tr></thead>
<tbody>
${opRows || '<tr><td colspan="9">No machining operations</td></tr>'}
</tbody>
</table>
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
