import { describe, expect, it } from 'vitest'
import {
  ALL_PROFILE_EDGES,
  MAX_BIT_SIZE,
  NO_PROFILE_EDGES,
  type RouterProfile,
  conflictingEdges,
  defaultRouterProfile,
  defaultRouterProfileMap,
  profileCutters,
  profileIsActive,
  routerProfileSummary,
  sanitizeRouterProfile,
  selectedProfileEdges,
} from './router-profiles'
import { NO_EDGE_BANDS } from './edgeband'
import { ALL_PANEL_ROLES } from './panel-attributes'

const panel = { width: 0.6, height: 0.4, thickness: 0.018 }

function profile(over: Partial<RouterProfile> = {}): RouterProfile {
  return { ...defaultRouterProfile(), ...over }
}

describe('defaults', () => {
  it('starts every role square-edged', () => {
    const map = defaultRouterProfileMap()
    for (const role of ALL_PANEL_ROLES) {
      expect(map[role].kind).toBe('none')
      expect(profileIsActive(map[role])).toBe(false)
    }
  })
})

describe('sanitize', () => {
  it('rejects an unknown profile kind', () => {
    expect(sanitizeRouterProfile({ kind: 'ogee' as never }).kind).toBe('none')
  })

  it('caps the bit size', () => {
    expect(sanitizeRouterProfile({ bitSize: 10 }).bitSize).toBe(MAX_BIT_SIZE)
  })

  it('falls back for a non-positive bit size', () => {
    expect(sanitizeRouterProfile({ bitSize: 0 }).bitSize).toBeGreaterThan(0)
    expect(sanitizeRouterProfile({ bitSize: -1 }).bitSize).toBeGreaterThan(0)
  })

  it('treats any non-true edge value as off', () => {
    const clean = sanitizeRouterProfile({ edges: { top: 1, bottom: true } as never })
    expect(clean.edges.top).toBe(false)
    expect(clean.edges.bottom).toBe(true)
  })
})

describe('activity and summary', () => {
  it('needs a kind, a size, and at least one edge', () => {
    expect(profileIsActive(profile({ kind: 'chamfer', edges: { ...NO_PROFILE_EDGES } }))).toBe(false)
    expect(profileIsActive(profile({ kind: 'none', edges: { ...ALL_PROFILE_EDGES } }))).toBe(false)
    expect(profileIsActive(profile({ kind: 'chamfer', edges: { ...ALL_PROFILE_EDGES } }))).toBe(true)
  })

  it('lists selected edges in a stable order', () => {
    const p = profile({ kind: 'cove', edges: { top: true, bottom: false, left: true, right: false } })
    expect(selectedProfileEdges(p)).toEqual(['top', 'left'])
  })

  it('summarises for the cutlist', () => {
    expect(routerProfileSummary(profile())).toBe('—')
    const p = profile({ kind: 'chamfer', bitSize: 0.006, edges: { top: true, bottom: true, left: false, right: false } })
    expect(routerProfileSummary(p)).toBe('Chamfer 6 mm T/B')
  })
})

describe('profileCutters', () => {
  it('produces nothing for a square edge', () => {
    expect(profileCutters(panel, profile())).toEqual([])
  })

  it('produces one cutter per selected edge', () => {
    for (const kind of ['chamfer', 'round-over', 'cove', 'straight'] as const) {
      const p = profile({ kind, edges: { top: true, bottom: true, left: false, right: false } })
      expect(profileCutters(panel, p)).toHaveLength(2)
      const all = profile({ kind, edges: { ...ALL_PROFILE_EDGES } })
      expect(profileCutters(panel, all)).toHaveLength(4)
    }
  })

  it('uses a carved cutter for round-over and a plain cylinder for cove', () => {
    const roundOver = profileCutters(panel, profile({ kind: 'round-over', edges: { ...ALL_PROFILE_EDGES } }))
    expect(roundOver.every(c => c.shape === 'rounded')).toBe(true)
    const cove = profileCutters(panel, profile({ kind: 'cove', edges: { ...ALL_PROFILE_EDGES } }))
    expect(cove.every(c => c.shape === 'cylinder')).toBe(true)
  })

  it('rotates the chamfer cutter 45 degrees', () => {
    const [cutter] = profileCutters(panel, profile({ kind: 'chamfer', edges: { top: true, bottom: false, left: false, right: false } }))
    expect(cutter.shape).toBe('wedge')
    expect(cutter.rotation).toBeCloseTo(Math.PI / 4, 10)
  })

  it('emits one box per pocket for multi-pocket', () => {
    const p = profile({ kind: 'multi-pocket', pocketCount: 5, edges: { top: true, bottom: false, left: false, right: false } })
    const cutters = profileCutters(panel, p)
    expect(cutters).toHaveLength(5)
    expect(cutters.every(c => c.shape === 'box')).toBe(true)
    // Spread along the edge, not stacked.
    expect(new Set(cutters.map(c => c.position.x.toFixed(6))).size).toBe(5)
  })

  it('runs cutters past the edge so the boolean stays watertight', () => {
    const [cutter] = profileCutters(panel, profile({ kind: 'chamfer', bitSize: 0.006, edges: { top: true, bottom: false, left: false, right: false } }))
    expect(cutter.size.x).toBeGreaterThan(panel.width)
  })

  it('clamps a bit that is wider than the panel rather than cutting it in two', () => {
    const narrow = { width: 0.02, height: 0.02, thickness: 0.018 }
    const cutters = profileCutters(narrow, profile({ kind: 'chamfer', bitSize: 0.04, edges: { ...ALL_PROFILE_EDGES } }))
    for (const cutter of cutters) {
      expect(cutter.size.z).toBeLessThanOrEqual(narrow.width)
    }
  })

  it('orients cutters along the edge they follow', () => {
    const top = profileCutters(panel, profile({ kind: 'cove', edges: { top: true, bottom: false, left: false, right: false } }))[0]
    const left = profileCutters(panel, profile({ kind: 'cove', edges: { top: false, bottom: false, left: true, right: false } }))[0]
    expect(top.axis).toBe('x')
    expect(left.axis).toBe('y')
  })
})

describe('conflictingEdges', () => {
  it('reports nothing when there is no banding', () => {
    const p = profile({ kind: 'chamfer', edges: { ...ALL_PROFILE_EDGES } })
    expect(conflictingEdges(p, NO_EDGE_BANDS)).toEqual([])
  })

  it('flags an edge that is both taped and routed', () => {
    const p = profile({ kind: 'chamfer', edges: { top: true, bottom: false, left: false, right: false } })
    const bands = { ...NO_EDGE_BANDS, top: 'abs-1-22', left: 'abs-1-22' }
    // Only the routed edge conflicts; a taped-but-unrouted edge is fine.
    expect(conflictingEdges(p, bands)).toEqual(['top'])
  })

  it('reports nothing for a square edge, however it is taped', () => {
    expect(conflictingEdges(profile(), { ...NO_EDGE_BANDS, top: 'abs-1-22' })).toEqual([])
  })
})
