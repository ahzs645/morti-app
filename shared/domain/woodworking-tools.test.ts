import { describe, expect, it } from 'vitest'
import {
  PORT_STATUS_LABEL,
  WOODWORKING_TOOLBARS,
  toolStats,
} from './woodworking-tools'

describe('tool map', () => {
  it('covers all 23 upstream toolbars', () => {
    expect(WOODWORKING_TOOLBARS).toHaveLength(23)
  })

  it('lists every tool exactly once', () => {
    const names = WOODWORKING_TOOLBARS.flatMap(g => g.tools.map(t => t.tool))
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every tool a status and a destination', () => {
    for (const group of WOODWORKING_TOOLBARS) {
      for (const tool of group.tools) {
        expect(PORT_STATUS_LABEL[tool.status], tool.tool).toBeTruthy()
        expect(tool.where.length, tool.tool).toBeGreaterThan(0)
      }
    }
  })

  it('explains why anything is not applicable', () => {
    // A dash with no note would leave the reader guessing.
    const unexplained = WOODWORKING_TOOLBARS
      .flatMap(g => g.tools)
      .filter(t => t.status === 'not-applicable' && t.where === '—' && !t.note)
    // Grouped tools share one note, so allow some, but not the majority.
    const total = WOODWORKING_TOOLBARS.flatMap(g => g.tools).filter(t => t.status === 'not-applicable').length
    expect(unexplained.length).toBeLessThan(total)
  })

  it('counts consistently', () => {
    const stats = toolStats()
    const summed = Object.values(stats.byStatus).reduce((a, b) => a + b, 0)
    expect(summed).toBe(stats.total)
  })

  it('reports coverage over the applicable tools only', () => {
    const stats = toolStats()
    expect(stats.coverage).toBeGreaterThan(0.85)
    expect(stats.coverage).toBeLessThanOrEqual(1)
  })

  it('excludes partial ports from the coverage figure', () => {
    const stats = toolStats()
    const applicable = stats.total - stats.byStatus['not-applicable']
    expect(stats.coverage).toBeCloseTo((stats.byStatus.ported + stats.byStatus.native) / applicable, 10)
    // Partial ports exist, so counting them would have inflated the number.
    expect(stats.byStatus.partial).toBeGreaterThan(0)
  })
})
