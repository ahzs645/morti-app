import { describe, expect, it } from 'vitest'
import {
  SYSTEM_32_SPACING,
  defaultDrillingMap,
  defaultDrillingRule,
  drillingHardwareCounts,
  drillingOperationsForPanel,
  sanitizeDrillingMap,
  sanitizeDrillingRule,
} from './drilling'
import { ALL_PANEL_ROLES } from './panel-attributes'
import type { PanelOperation } from './types'

const panel = { width: 0.6, height: 1.8, thickness: 0.018 }

function mapWith(role: keyof ReturnType<typeof defaultDrillingMap>, rules: unknown[]) {
  return sanitizeDrillingMap({ [role]: rules })
}

describe('defaults', () => {
  it('starts every role with no drilling', () => {
    const map = defaultDrillingMap()
    for (const role of ALL_PANEL_ROLES) expect(map[role]).toEqual([])
  })

  it('defaults a new rule to the 32 mm shelf-pin system', () => {
    expect(defaultDrillingRule('r1').pattern.spacing).toBe(SYSTEM_32_SPACING)
  })
})

describe('sanitize', () => {
  it('replaces an unknown operation type with the default', () => {
    expect(sanitizeDrillingRule({ operationType: 'laser' }, 'r1').operationType).toBe('dowel-hole')
  })

  it('rejects negative metrics', () => {
    const rule = sanitizeDrillingRule({ diameter: -5, depth: -1 }, 'r1')
    expect(rule.diameter).toBeGreaterThan(0)
    expect(rule.depth).toBeGreaterThan(0)
  })

  it('clamps counts into range', () => {
    expect(sanitizeDrillingRule({ pattern: { count: 9999 } }, 'r1').pattern.count).toBe(64)
    expect(sanitizeDrillingRule({ pattern: { count: 0 } }, 'r1').pattern.count).toBe(1)
  })

  it('keeps a negative offset, which legitimately shifts a pattern back', () => {
    expect(sanitizeDrillingRule({ pattern: { offset: -0.05 } }, 'r1').pattern.offset).toBeCloseTo(-0.05, 10)
  })

  it('caps how many rules a role can carry', () => {
    const many = Array.from({ length: 20 }, () => ({}))
    expect(mapWith('vertical-side', many)['vertical-side'].length).toBeLessThanOrEqual(8)
  })

  it('treats a non-array rule list as empty', () => {
    expect(sanitizeDrillingMap({ 'vertical-side': 'nope' })['vertical-side']).toEqual([])
  })
})

describe('drillingOperationsForPanel', () => {
  const rule = {
    ...defaultDrillingRule('r1'),
    operationType: 'dowel-hole' as const,
    diameter: 0.005,
    depth: 0.012,
    hardwareCode: 'S8',
    pattern: { kind: 'row' as const, anchor: 'left' as const, count: 4, spacing: 0.032, inset: 0.037 },
  }

  it('emits nothing for a role with no rules', () => {
    expect(drillingOperationsForPanel('p', 'vertical-side', panel, defaultDrillingMap())).toEqual([])
  })

  it('expands an enabled rule into one operation per hole', () => {
    const ops = drillingOperationsForPanel('p', 'vertical-side', panel, mapWith('vertical-side', [rule]))
    expect(ops).toHaveLength(4)
    expect(ops.every(o => o.targetPanelKey === 'p')).toBe(true)
    expect(ops.every(o => o.operationType === 'dowel-hole')).toBe(true)
  })

  it('skips disabled rules', () => {
    const ops = drillingOperationsForPanel('p', 'vertical-side', panel, mapWith('vertical-side', [{ ...rule, enabled: false }]))
    expect(ops).toEqual([])
  })

  it('only applies a rule to its own role', () => {
    const map = mapWith('vertical-side', [rule])
    expect(drillingOperationsForPanel('p', 'back-panel', panel, map)).toEqual([])
  })

  it('namespaces ids per rule so two rules never collide', () => {
    const map = mapWith('vertical-side', [
      { ...rule, id: 'a' },
      { ...rule, id: 'b' },
    ])
    const ops = drillingOperationsForPanel('p', 'vertical-side', panel, map)
    expect(ops).toHaveLength(8)
    expect(new Set(ops.map(o => o.id)).size).toBe(8)
  })

  it('follows the panel as it resizes rather than baking in a size', () => {
    const map = mapWith('vertical-side', [{ ...rule, pattern: { ...rule.pattern, anchor: 'right' as const } }])
    const narrow = drillingOperationsForPanel('p', 'vertical-side', { ...panel, width: 0.4 }, map)
    const wide = drillingOperationsForPanel('p', 'vertical-side', { ...panel, width: 0.8 }, map)
    // Right-anchored holes stay the same inset from the right edge, so their
    // absolute x differs with panel width.
    expect(narrow[0].cx).not.toBeCloseTo(wide[0].cx!, 6)
    expect(0.2 - narrow[0].cx!).toBeCloseTo(0.4 - wide[0].cx!, 6)
  })

  it('carries the hardware code onto every hole', () => {
    const ops = drillingOperationsForPanel('p', 'vertical-side', panel, mapWith('vertical-side', [rule]))
    expect(ops.every(o => o.hardwareCode === 'S8')).toBe(true)
  })
})

describe('drillingHardwareCounts', () => {
  const op = (hardwareCode?: string): PanelOperation =>
    ({ id: Math.random().toString(), operationType: 'dowel-hole', targetPanelKey: 'p', hardwareCode })

  it('counts one piece of hardware per hole', () => {
    const counts = drillingHardwareCounts([op('S8'), op('S8'), op('A2')])
    expect(counts.get('S8')).toBe(2)
    expect(counts.get('A2')).toBe(1)
  })

  it('ignores holes with no hardware attached', () => {
    expect(drillingHardwareCounts([op(), op()]).size).toBe(0)
  })
})
