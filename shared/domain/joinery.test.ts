import { describe, expect, it } from 'vitest'
import {
  DEFAULT_JOINERY_SETTINGS,
  type JoinerySettings,
  applyJoinery,
  contactCentre,
  fastenerPositions,
  findPanelContacts,
  isFastenerless,
  panelAabb,
  worldToPanelLocal,
} from './joinery'
import type { CompiledPanel } from './types'

function panel(over: Partial<CompiledPanel> & Pick<CompiledPanel, 'key'>): CompiledPanel {
  return {
    role: 'vertical-side',
    width: 0.45,
    height: 1.2,
    thickness: 0.018,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    operations: [],
    orientation: 'vertical-xy',
    ...over,
  }
}

// A left side panel standing in the YZ plane, and a shelf butting into it.
const side = panel({
  key: 'side',
  orientation: 'vertical-yz',
  width: 0.45, // runs along Z (depth)
  height: 1.2, // runs along Y
  thickness: 0.018, // runs along X
  position: [-0.25, 0, 0],
})

const shelf = panel({
  key: 'shelf',
  role: 'horizontal-deck',
  orientation: 'horizontal-xz',
  width: 0.482, // runs along X
  height: 0.45, // runs along Z (depth)
  thickness: 0.018, // runs along Y
  position: [0, 0.3, 0],
})

describe('panelAabb', () => {
  it('maps each orientation onto the right world axes', () => {
    const box = panelAabb(side)
    // Thickness on X, height on Y, width on Z.
    expect(box.max[0] - box.min[0]).toBeCloseTo(0.018, 10)
    expect(box.max[1] - box.min[1]).toBeCloseTo(1.2, 10)
    expect(box.max[2] - box.min[2]).toBeCloseTo(0.45, 10)

    const deck = panelAabb(shelf)
    expect(deck.max[0] - deck.min[0]).toBeCloseTo(0.482, 10)
    expect(deck.max[1] - deck.min[1]).toBeCloseTo(0.018, 10)
    expect(deck.max[2] - deck.min[2]).toBeCloseTo(0.45, 10)
  })

  it('centres the box on the panel position', () => {
    const box = panelAabb(shelf)
    expect((box.min[1] + box.max[1]) / 2).toBeCloseTo(0.3, 10)
  })
})

describe('findPanelContacts', () => {
  it('finds a shelf butting into a side panel', () => {
    const contacts = findPanelContacts([side, shelf])
    expect(contacts).toHaveLength(1)
    // The side presents its face (thickness along X, the contact axis).
    expect(contacts[0].receiving.key).toBe('side')
    expect(contacts[0].meeting.key).toBe('shelf')
    expect(contacts[0].axis).toBe(0)
  })

  it('finds nothing when panels are far apart', () => {
    const far = panel({ ...shelf, key: 'far', position: [5, 0.3, 0] })
    expect(findPanelContacts([side, far])).toEqual([])
  })

  it('ignores coplanar siblings that merely touch edge to edge', () => {
    // Two shelves stacked so their faces meet: both are thin along Y, so
    // neither is "meeting" the other edge-on.
    const upper = panel({ ...shelf, key: 'upper', position: [0, 0.318, 0] })
    const contacts = findPanelContacts([shelf, upper])
    expect(contacts).toEqual([])
  })

  it('ignores a contact whose overlap is a sliver', () => {
    // A shelf that only just clips the side panel's corner.
    const clipping = panel({ ...shelf, key: 'clip', width: 0.482, position: [0, 0.3, 0.449] })
    expect(findPanelContacts([side, clipping])).toEqual([])
  })

  it('scales to a whole carcass without duplicating pairs', () => {
    const right = panel({ ...side, key: 'right', position: [0.25, 0, 0] })
    const contacts = findPanelContacts([side, right, shelf])
    // The shelf meets each side once.
    expect(contacts).toHaveLength(2)
    expect(new Set(contacts.map(c => c.receiving.key))).toEqual(new Set(['side', 'right']))
  })
})

describe('fastenerPositions', () => {
  const [contact] = findPanelContacts([side, shelf])

  it('centres a single fastener on the contact', () => {
    const [p] = fastenerPositions(contact, 1, 0.05)
    const centre = contactCentre(contact)
    const [u, v] = contact.overlap.axes
    expect(p.u).toBeCloseTo(centre[u], 10)
    expect(p.v).toBeCloseTo(centre[v], 10)
  })

  it('spreads several fasteners between the end insets', () => {
    const positions = fastenerPositions(contact, 3, 0.05)
    expect(positions).toHaveLength(3)
    const along = positions.map(p => (contact.overlap.max[0] - contact.overlap.min[0] >= contact.overlap.max[1] - contact.overlap.min[1] ? p.u : p.v))
    // Evenly spaced.
    expect(along[1] - along[0]).toBeCloseTo(along[2] - along[1], 9)
  })

  it('never insets so far that fasteners cross over', () => {
    const positions = fastenerPositions(contact, 2, 10)
    expect(positions[0].u).toBeLessThanOrEqual(positions[1].u + 1e-9)
    expect(positions[0].v).toBeLessThanOrEqual(positions[1].v + 1e-9)
  })

  it('clamps absurd counts', () => {
    expect(fastenerPositions(contact, 1000, 0.05).length).toBeLessThanOrEqual(16)
    expect(fastenerPositions(contact, 0, 0.05).length).toBeGreaterThan(0)
  })
})

describe('worldToPanelLocal', () => {
  it('is zero at the panel centre', () => {
    const local = worldToPanelLocal(shelf, shelf.position)
    expect(local.x).toBeCloseTo(0, 10)
    expect(local.y).toBeCloseTo(0, 10)
  })

  it('measures along the panel width and height axes', () => {
    // Shelf: width on X, height on Z.
    const local = worldToPanelLocal(shelf, [0.1, 0.3, 0.2])
    expect(local.x).toBeCloseTo(0.1, 10)
    expect(local.y).toBeCloseTo(0.2, 10)
  })
})

describe('applyJoinery', () => {
  const panels = [side, shelf]

  function settings(over: Partial<JoinerySettings> = {}): JoinerySettings {
    return { ...DEFAULT_JOINERY_SETTINGS, ...over }
  }

  it('emits nothing for butt joints, so a default project is unchanged', () => {
    const result = applyJoinery(panels, settings({ style: 'butt' }))
    expect(result.operations).toEqual([])
    expect(result.hardware.size).toBe(0)
  })

  it('bores into both panels for a dowel joint', () => {
    const result = applyJoinery(panels, settings({ style: 'dowel', fastenersPerJoint: 2 }))
    const targets = result.operations.map(o => o.targetPanelKey)
    expect(targets.filter(k => k === 'side')).toHaveLength(2)
    expect(targets.filter(k => k === 'shelf')).toHaveLength(2)
    expect(result.operations.every(o => o.operationType === 'dowel-hole')).toBe(true)
  })

  it('counts one dowel per fastener', () => {
    const result = applyJoinery(panels, settings({ style: 'dowel', fastenersPerJoint: 3 }))
    expect(result.hardware.get('A2')).toBe(3)
  })

  it('uses a counterbore and a cam for a cam-lock joint', () => {
    const result = applyJoinery(panels, settings({ style: 'cam-lock', fastenersPerJoint: 2 }))
    expect(result.operations.some(o => o.operationType === 'counterbore')).toBe(true)
    expect(result.hardware.get('G1')).toBe(2)
  })

  it('cuts a pocket in the meeting panel for pocket screws', () => {
    const result = applyJoinery(panels, settings({ style: 'pocket-screw' }))
    expect(result.operations.some(o => o.operationType === 'pocket' && o.targetPanelKey === 'shelf')).toBe(true)
    expect(result.hardware.get('P3')).toBeGreaterThan(0)
  })

  it('cuts a single dado per contact regardless of fastener count', () => {
    const result = applyJoinery(panels, settings({ style: 'dado', fastenersPerJoint: 5 }))
    expect(result.operations).toHaveLength(1)
    expect(result.operations[0].operationType).toBe('dado')
    expect(result.operations[0].targetPanelKey).toBe('side')
  })

  it('consumes no hardware for wood-only joints', () => {
    for (const style of ['dado', 'rabbet', 'tongue-groove', 'mitre-45'] as const) {
      expect(isFastenerless(style)).toBe(true)
      expect(applyJoinery(panels, settings({ style })).hardware.size).toBe(0)
    }
  })

  it('treats a mitre as a panel profile rather than a cut', () => {
    expect(applyJoinery(panels, settings({ style: 'mitre-45' })).operations).toEqual([])
  })

  it('keeps a dado inside the receiving panel', () => {
    const [op] = applyJoinery(panels, settings({ style: 'dado' })).operations
    expect(op.width!).toBeLessThanOrEqual(side.width + 1e-9)
    expect(op.height!).toBeLessThanOrEqual(side.height + 1e-9)
    expect(op.depth!).toBeLessThan(side.thickness)
  })

  it('gives every operation a unique id', () => {
    const result = applyJoinery(panels, settings({ style: 'dowel', fastenersPerJoint: 4 }))
    expect(new Set(result.operations.map(o => o.id)).size).toBe(result.operations.length)
  })
})
