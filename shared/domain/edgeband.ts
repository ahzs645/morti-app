/**
 * Edge banding — the Morti analogue of Woodworking's veneer toolbar
 * (`bandLibrary`, `bandApply`, `bandRemove`, `bandList`, `addVeneer`).
 *
 * A **band** is a tape spec (thickness, width, colour, price per linear metre).
 * An **assignment** says which of a panel's four edges carry which band. The
 * rollup turns assignments plus panel dimensions into the linear-metre and cost
 * report `bandList` produces upstream.
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

/** Panel-local edges, as seen looking at the panel's face. */
export type PanelEdge = 'top' | 'bottom' | 'left' | 'right'

export const PANEL_EDGES: PanelEdge[] = ['top', 'bottom', 'left', 'right']

export const PANEL_EDGE_LABEL: Record<PanelEdge, string> = {
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
}

/** Single-letter code used in the compact cutlist "Banding" column. */
export const PANEL_EDGE_CODE: Record<PanelEdge, string> = {
  top: 'T',
  bottom: 'B',
  left: 'L',
  right: 'R',
}

export interface EdgeBand {
  id: string
  label: string
  /** Tape thickness in millimetres — what the trade quotes. */
  thicknessMm: number
  /** Tape width in millimetres; must cover the panel thickness. */
  widthMm: number
  /** Swatch colour, also used for the 3D edge strip. */
  colorHex: string
  /** Price per linear metre, in the project currency. */
  pricePerM: number
}

/** `null` on an edge means bare — no tape applied. */
export type EdgeBandAssignment = Record<PanelEdge, string | null>

export const NO_EDGE_BANDS: EdgeBandAssignment = {
  top: null,
  bottom: null,
  left: null,
  right: null,
}

/** Stock tapes, covering the thicknesses a panel shop actually keeps on hand. */
export const EDGE_BAND_LIBRARY: EdgeBand[] = [
  { id: 'abs-04-22', label: 'ABS 0.4 × 22 mm', thicknessMm: 0.4, widthMm: 22, colorHex: '#c8a877', pricePerM: 0.35 },
  { id: 'abs-1-22', label: 'ABS 1.0 × 22 mm', thicknessMm: 1, widthMm: 22, colorHex: '#c8a877', pricePerM: 0.60 },
  { id: 'abs-2-22', label: 'ABS 2.0 × 22 mm', thicknessMm: 2, widthMm: 22, colorHex: '#c8a877', pricePerM: 0.95 },
  { id: 'abs-2-42', label: 'ABS 2.0 × 42 mm', thicknessMm: 2, widthMm: 42, colorHex: '#c8a877', pricePerM: 1.60 },
  { id: 'veneer-06-22', label: 'Wood veneer 0.6 × 22 mm', thicknessMm: 0.6, widthMm: 22, colorHex: '#8a6a3d', pricePerM: 2.20 },
]

export function findEdgeBand(id: string | null | undefined): EdgeBand | null {
  if (!id) return null
  return EDGE_BAND_LIBRARY.find(band => band.id === id) ?? null
}

/** Coerce arbitrary input into a valid assignment, dropping unknown band ids. */
export function sanitizeEdgeBandAssignment(input: Partial<EdgeBandAssignment> | null | undefined): EdgeBandAssignment {
  const source = input ?? {}
  const out: EdgeBandAssignment = { ...NO_EDGE_BANDS }
  for (const edge of PANEL_EDGES) {
    const id = source[edge]
    out[edge] = findEdgeBand(id) ? (id as string) : null
  }
  return out
}

export function hasAnyBand(assignment: EdgeBandAssignment): boolean {
  return PANEL_EDGES.some(edge => assignment[edge] != null)
}

/** Compact display of which edges are banded, e.g. `T/B/L`. `—` when bare. */
export function edgeBandSummary(assignment: EdgeBandAssignment): string {
  const codes = PANEL_EDGES.filter(edge => assignment[edge] != null).map(edge => PANEL_EDGE_CODE[edge])
  return codes.length === 0 ? '—' : codes.join('/')
}

// ---------------------------------------------------------------------------
// Rollup (`bandList`)
// ---------------------------------------------------------------------------

interface BandedPanel {
  /** Panel width in metres — the length of its top and bottom edges. */
  width: number
  /** Panel height in metres — the length of its left and right edges. */
  height: number
  /** Panel thickness in metres, used to flag tape that is too narrow. */
  thickness: number
  quantity: number
  bands: EdgeBandAssignment
}

/** Length of one panel edge, in metres. */
export function edgeLengthM(panel: { width: number, height: number }, edge: PanelEdge): number {
  const value = edge === 'top' || edge === 'bottom' ? panel.width : panel.height
  return Number.isFinite(value) && value > 0 ? value : 0
}

export interface BandListRow {
  band: EdgeBand
  /** Total tape needed, in metres. */
  lengthM: number
  /** Number of individual edges taped. */
  edgeCount: number
  cost: number
  /** True when the tape is narrower than the thickest panel it is applied to,
   *  which would leave the edge partly exposed. */
  tooNarrow: boolean
}

export interface BandListReport {
  rows: BandListRow[]
  totalLengthM: number
  totalCost: number
}

/**
 * Aggregate banding across panel groups into a per-band tape report.
 * Rows come back in library order so the report is stable between renders.
 */
export function computeBandList(panels: BandedPanel[]): BandListReport {
  const byBand = new Map<string, { lengthM: number, edgeCount: number, maxPanelThicknessM: number }>()

  for (const panel of panels) {
    const quantity = Number.isFinite(panel.quantity) && panel.quantity > 0 ? Math.round(panel.quantity) : 0
    if (quantity === 0) continue
    for (const edge of PANEL_EDGES) {
      const bandId = panel.bands[edge]
      if (!bandId || !findEdgeBand(bandId)) continue
      const entry = byBand.get(bandId) ?? { lengthM: 0, edgeCount: 0, maxPanelThicknessM: 0 }
      entry.lengthM += edgeLengthM(panel, edge) * quantity
      entry.edgeCount += quantity
      entry.maxPanelThicknessM = Math.max(entry.maxPanelThicknessM, Math.max(0, panel.thickness))
      byBand.set(bandId, entry)
    }
  }

  const rows: BandListRow[] = []
  for (const band of EDGE_BAND_LIBRARY) {
    const entry = byBand.get(band.id)
    if (!entry) continue
    rows.push({
      band,
      lengthM: entry.lengthM,
      edgeCount: entry.edgeCount,
      cost: entry.lengthM * band.pricePerM,
      tooNarrow: band.widthMm < entry.maxPanelThicknessM * 1000 - 1e-9,
    })
  }

  return {
    rows,
    totalLengthM: rows.reduce((sum, row) => sum + row.lengthM, 0),
    totalCost: rows.reduce((sum, row) => sum + row.cost, 0),
  }
}
