/**
 * Joinery — the Morti analogue of Woodworking's joinery toolbar
 * (`magicJoints`, `jointTenonCut`, `jointMortiseCut`, `jointTenonDowel(P)`,
 * `cutTenonDowels(P)`, `magicCut`, `magicKnife`, `magicCorner`,
 * `magicCutLinks`, `magicKnifeLinks`).
 *
 * Upstream you pick two faces and a joint is written into the model. Morti's
 * panels are regenerated on every edit, so instead we pick a **joint style for
 * the project** and re-derive the joints on each compile: find where panels
 * meet, then emit the operations and hardware that style implies.
 *
 * Contact finding works on the compiled panels' world-space boxes, so it is
 * agnostic to how a panel came to exist — carcass panels today, free-standing
 * panels from the free-panel layer tomorrow.
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

import type { CompiledPanel, PanelOperation } from './types'

export type JointStyle =
  | 'butt'
  | 'dowel'
  | 'mortise-tenon'
  | 'mitre-45'
  | 'rabbet'
  | 'dado'
  | 'tongue-groove'
  | 'cam-lock'
  | 'pocket-screw'

export const JOINT_STYLES: { value: JointStyle, label: string, hint: string }[] = [
  { value: 'butt', label: 'Butt (glue only)', hint: 'Panels simply meet. No machining, no hardware.' },
  { value: 'dowel', label: 'Dowel', hint: 'Blind dowel holes in both panels (magicDowels / jointTenonDowel).' },
  { value: 'mortise-tenon', label: 'Mortise & tenon', hint: 'Mortise pocket in one panel, tenon shoulder cut in the other (jointMortiseCut / jointTenonCut).' },
  { value: 'mitre-45', label: 'Mitre 45°', hint: 'Both panels mitred at the corner (magicCorner / panel2angle45cut).' },
  { value: 'rabbet', label: 'Rabbet', hint: 'A step cut into the receiving panel’s edge.' },
  { value: 'dado', label: 'Dado', hint: 'A slot across the receiving panel to seat the meeting one.' },
  { value: 'tongue-groove', label: 'Tongue & groove', hint: 'A groove in one panel and a matching tongue on the other.' },
  { value: 'cam-lock', label: 'Cam lock (minifix)', hint: 'Cam housing bore plus a cam-bolt hole — knock-down furniture.' },
  { value: 'pocket-screw', label: 'Pocket screw', hint: 'Angled pocket in the meeting panel, screwed into the receiving one.' },
]

export interface JoinerySettings {
  style: JointStyle
  /** Fasteners per joint, distributed along the contact. */
  fastenersPerJoint: number
  /** Diameter of the primary bore, metres. */
  fastenerDiameter: number
  /** How deep the bore goes into each panel, metres. */
  fastenerDepth: number
  /** Distance from each end of the contact to the outermost fastener, metres. */
  endInset: number
}

export const DEFAULT_JOINERY_SETTINGS: JoinerySettings = {
  style: 'butt',
  fastenersPerJoint: 2,
  fastenerDiameter: 0.008,
  fastenerDepth: 0.015,
  endInset: 0.05,
}

/** Hardware each style consumes per fastener, if any. */
export const JOINT_STYLE_HARDWARE: Partial<Record<JointStyle, string>> = {
  'dowel': 'A2',
  'cam-lock': 'G1',
  'pocket-screw': 'P3',
}

/** Styles that only cut wood and need no fastener at all. */
export function isFastenerless(style: JointStyle): boolean {
  return style === 'butt' || style === 'mitre-45' || style === 'rabbet' || style === 'dado' || style === 'tongue-groove'
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type Axis = 0 | 1 | 2

export interface Aabb {
  min: [number, number, number]
  max: [number, number, number]
}

/** Local axis → world axis mapping for each panel orientation the compiler
 *  emits. Panels are always axis-aligned, so a lookup beats a matrix. */
const ORIENTATION_BASIS: Record<NonNullable<CompiledPanel['orientation']>, { width: Axis, height: Axis, thickness: Axis }> = {
  // Local X→world X, Y→world Y, Z→world Z.
  'vertical-xy': { width: 0, height: 1, thickness: 2 },
  // Rotated -90° about X: width stays X, height runs along Z, thickness along Y.
  'horizontal-xz': { width: 0, height: 2, thickness: 1 },
  // Rotated +90° about Y: width runs along Z, height stays Y, thickness along X.
  'vertical-yz': { width: 2, height: 1, thickness: 0 },
}

export function panelBasis(panel: CompiledPanel) {
  return ORIENTATION_BASIS[panel.orientation ?? 'vertical-xy']
}

/** World-space axis-aligned bounds of a compiled panel. */
export function panelAabb(panel: CompiledPanel): Aabb {
  const basis = panelBasis(panel)
  const half: [number, number, number] = [0, 0, 0]
  half[basis.width] = Math.max(0, panel.width) / 2
  half[basis.height] = Math.max(0, panel.height) / 2
  half[basis.thickness] = Math.max(0, panel.thickness) / 2
  return {
    min: [panel.position[0] - half[0], panel.position[1] - half[1], panel.position[2] - half[2]],
    max: [panel.position[0] + half[0], panel.position[1] + half[1], panel.position[2] + half[2]],
  }
}

export interface PanelContact {
  /** Panel whose face is being joined into — the one that gets the mortise. */
  receiving: CompiledPanel
  /** Panel presenting its edge — the one that gets the tenon. */
  meeting: CompiledPanel
  /** World axis the joint runs through. */
  axis: Axis
  /** Overlap extent on the two axes that are not `axis`. */
  overlap: { axes: [Axis, Axis], min: [number, number], max: [number, number] }
  /** Contact plane position along `axis`. */
  planeCoordinate: number
}

/** How close two faces must be to count as touching, metres. */
const CONTACT_TOLERANCE = 0.0015
/** Smallest contact rectangle worth joining, metres. */
const MIN_CONTACT_SIZE = 0.01

function otherAxes(axis: Axis): [Axis, Axis] {
  if (axis === 0) return [1, 2]
  if (axis === 1) return [0, 2]
  return [0, 1]
}

/**
 * Find every place two panels abut face-to-edge.
 *
 * A contact exists when two panels overlap on two axes and are flush (within
 * tolerance) on the third. The panel whose *thickness* runs along that third
 * axis is presenting a face, so it receives; the other is meeting it edge-on.
 * Panels flush along both their thickness axes are coplanar siblings, not a
 * joint, and are skipped.
 */
export function findPanelContacts(panels: CompiledPanel[]): PanelContact[] {
  const boxes = panels.map(panelAabb)
  const bases = panels.map(panelBasis)
  const contacts: PanelContact[] = []

  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const a = boxes[i]
      const b = boxes[j]

      for (let axis = 0 as Axis; axis <= 2; axis = (axis + 1) as Axis) {
        // Flush check: a's max meets b's min, or vice versa.
        const aMaxToBMin = Math.abs(a.max[axis] - b.min[axis])
        const bMaxToAMin = Math.abs(b.max[axis] - a.min[axis])
        const touching = aMaxToBMin <= CONTACT_TOLERANCE || bMaxToAMin <= CONTACT_TOLERANCE
        if (!touching) continue

        const [u, v] = otherAxes(axis)
        const uMin = Math.max(a.min[u], b.min[u])
        const uMax = Math.min(a.max[u], b.max[u])
        const vMin = Math.max(a.min[v], b.min[v])
        const vMax = Math.min(a.max[v], b.max[v])
        if (uMax - uMin < MIN_CONTACT_SIZE || vMax - vMin < MIN_CONTACT_SIZE) continue

        // Whichever panel is thin along this axis is presenting its face.
        const aFaces = bases[i].thickness === axis
        const bFaces = bases[j].thickness === axis
        if (aFaces === bFaces) continue // both faces (coplanar) or neither

        contacts.push({
          receiving: aFaces ? panels[i] : panels[j],
          meeting: aFaces ? panels[j] : panels[i],
          axis,
          overlap: { axes: [u, v], min: [uMin, vMin], max: [uMax, vMax] },
          planeCoordinate: aMaxToBMin <= CONTACT_TOLERANCE ? a.max[axis] : a.min[axis],
        })
      }
    }
  }

  return contacts
}

// ---------------------------------------------------------------------------
// Fastener placement
// ---------------------------------------------------------------------------

/**
 * Evenly spaced positions along the longer side of a contact.
 * One fastener sits at the middle; two or more spread between the insets.
 */
export function fastenerPositions(contact: PanelContact, count: number, endInset: number): { u: number, v: number }[] {
  const [uSize, vSize] = [
    contact.overlap.max[0] - contact.overlap.min[0],
    contact.overlap.max[1] - contact.overlap.min[1],
  ]
  const alongU = uSize >= vSize
  const runMin = alongU ? contact.overlap.min[0] : contact.overlap.min[1]
  const runMax = alongU ? contact.overlap.max[0] : contact.overlap.max[1]
  const crossCentre = alongU
    ? (contact.overlap.min[1] + contact.overlap.max[1]) / 2
    : (contact.overlap.min[0] + contact.overlap.max[0]) / 2

  const n = Math.max(1, Math.min(16, Math.round(count)))
  const run = runMax - runMin
  // Don't inset so far that the fasteners cross over each other.
  const inset = Math.min(Math.max(0, endInset), run / 2 - 1e-6)
  const first = runMin + inset
  const last = runMax - inset

  const positions: { u: number, v: number }[] = []
  for (let index = 0; index < n; index++) {
    const t = n === 1 ? 0.5 : index / (n - 1)
    const along = n === 1 ? (runMin + runMax) / 2 : first + (last - first) * t
    positions.push(alongU ? { u: along, v: crossCentre } : { u: crossCentre, v: along })
  }
  return positions
}

/** World-space midpoint of a contact rectangle. */
export function contactCentre(contact: PanelContact): [number, number, number] {
  const point: [number, number, number] = [0, 0, 0]
  point[contact.axis] = contact.planeCoordinate
  point[contact.overlap.axes[0]] = (contact.overlap.min[0] + contact.overlap.max[0]) / 2
  point[contact.overlap.axes[1]] = (contact.overlap.min[1] + contact.overlap.max[1]) / 2
  return point
}

/** Project a world point onto a panel's local face coordinates. */
export function worldToPanelLocal(panel: CompiledPanel, world: [number, number, number]): { x: number, y: number } {
  const basis = panelBasis(panel)
  return {
    x: world[basis.width] - panel.position[basis.width],
    y: world[basis.height] - panel.position[basis.height],
  }
}

// ---------------------------------------------------------------------------
// Applying a style
// ---------------------------------------------------------------------------

export interface JoineryResult {
  operations: PanelOperation[]
  /** Hardware code → quantity across the whole assembly. */
  hardware: Map<string, number>
}

function makeOperation(base: Omit<PanelOperation, 'id'>, id: string): PanelOperation {
  return { id, ...base }
}

/**
 * Derive joinery operations for a compiled assembly.
 *
 * `butt` returns nothing — panels just meet — which keeps the default project
 * byte-identical to one compiled before joinery existed.
 */
export function applyJoinery(panels: CompiledPanel[], settings: JoinerySettings): JoineryResult {
  const result: JoineryResult = { operations: [], hardware: new Map() }
  if (settings.style === 'butt') return result

  const contacts = findPanelContacts(panels)
  const hardwareCode = JOINT_STYLE_HARDWARE[settings.style]
  const diameter = Math.max(0.001, settings.fastenerDiameter)
  const depth = Math.max(0.001, settings.fastenerDepth)

  contacts.forEach((contact, contactIndex) => {
    const { receiving, meeting, axis } = contact
    const positions = fastenerPositions(contact, settings.fastenersPerJoint, settings.endInset)

    // Which side of the receiving panel the meeting panel arrives from.
    const receivingFace: 'front' | 'back' =
      contact.planeCoordinate >= receiving.position[axis] ? 'front' : 'back'

    positions.forEach((position, index) => {
      const world: [number, number, number] = [0, 0, 0]
      world[axis] = contact.planeCoordinate
      world[contact.overlap.axes[0]] = position.u
      world[contact.overlap.axes[1]] = position.v

      const onReceiving = worldToPanelLocal(receiving, world)
      const onMeeting = worldToPanelLocal(meeting, world)
      const idBase = `joint:${settings.style}:${contactIndex}:${index}`

      if (isFastenerless(settings.style)) {
        // A mitre reshapes both panels rather than cutting a slot in one; it
        // is expressed as a panel profile, not a machining operation.
        if (settings.style === 'mitre-45') return
        // Wood-only joints cut the receiving panel once per contact, where the
        // meeting panel lands — not once per fastener.
        if (index > 0) return

        const worldCentre = contactCentre(contact)
        const centre = worldToPanelLocal(receiving, worldCentre)
        // The contact's two overlap axes are exactly the receiving panel's
        // width and height axes, since the third is its thickness axis.
        const receivingBasis = panelBasis(receiving)
        const extentOn = (worldAxis: Axis) => {
          const slot = contact.overlap.axes[0] === worldAxis ? 0 : 1
          return contact.overlap.max[slot] - contact.overlap.min[slot]
        }
        const cutType: PanelOperation['operationType'] =
          settings.style === 'dado' || settings.style === 'tongue-groove'
            ? 'dado'
            : settings.style === 'rabbet'
              ? 'rabbet'
              : 'groove'

        result.operations.push(makeOperation({
          operationType: cutType,
          targetPanelKey: receiving.key,
          face: receivingFace,
          center: centre,
          x: centre.x,
          y: centre.y,
          width: Math.max(0.001, Math.min(extentOn(receivingBasis.width), receiving.width)),
          height: Math.max(0.001, Math.min(extentOn(receivingBasis.height), receiving.height)),
          depth: Math.min(depth, receiving.thickness * 0.6),
        }, idBase))
        return
      }

      // Fastened joints bore into both panels: a face hole in the receiving
      // panel and an edge hole in the meeting panel.
      result.operations.push(makeOperation({
        operationType: settings.style === 'cam-lock' ? 'counterbore' : 'dowel-hole',
        targetPanelKey: receiving.key,
        face: receivingFace,
        center: onReceiving,
        cx: onReceiving.x,
        cy: onReceiving.y,
        diameter,
        depth: Math.min(depth, receiving.thickness * 0.8),
        through: false,
        headDiameter: settings.style === 'cam-lock' ? Math.max(diameter, 0.015) : undefined,
        headDepth: settings.style === 'cam-lock' ? Math.min(0.0125, receiving.thickness * 0.7) : undefined,
        hardwareCode,
      }, `${idBase}:receiving`))

      result.operations.push(makeOperation({
        operationType: settings.style === 'pocket-screw' ? 'pocket' : 'dowel-hole',
        targetPanelKey: meeting.key,
        face: 'front',
        center: onMeeting,
        cx: onMeeting.x,
        cy: onMeeting.y,
        diameter,
        width: settings.style === 'pocket-screw' ? diameter * 2 : undefined,
        height: settings.style === 'pocket-screw' ? diameter * 3 : undefined,
        depth,
        through: false,
      }, `${idBase}:meeting`))

      if (hardwareCode) {
        result.hardware.set(hardwareCode, (result.hardware.get(hardwareCode) ?? 0) + 1)
      }
    })
  })

  return result
}
