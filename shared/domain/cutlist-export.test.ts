import { describe, expect, it } from 'vitest'
import {
  type CutlistData,
  cutlistFileName,
  serializeCutlist,
} from './cutlist-export'
import { DEFAULT_PROJECT_SETTINGS } from './defaults'

const sample: CutlistData = {
  projectName: 'My "Shelf" Unit',
  exportedAt: '2026-06-30T00:00:00.000Z',
  panels: [
    { groupId: 'S1', role: 'vertical-side', orientation: 'vertical', width: 0.45, height: 0.34, thickness: 0.018, quantity: 2 },
    { groupId: 'I1', role: 'internal-shelf', orientation: 'horizontal', width: 0.487, height: 0.416, thickness: 0.018, quantity: 4 },
  ],
  operations: [
    { operationType: 'rail-cut', targetRole: 'vertical-side', face: 'front', diameter: null, depth: 0.005, width: 0.021, length: 0.306, through: false, quantity: 2 },
  ],
}

describe('cutlist export', () => {
  it('emits CSV with mm dimensions and both sections', () => {
    const { content, ext, mime } = serializeCutlist(sample, 'csv')
    expect(ext).toBe('csv')
    expect(mime).toContain('text/csv')
    expect(content).toContain('Part,Role,Orientation,Width (mm),Height (mm),Thickness (mm),Qty')
    // 0.45 m -> 450 mm, 0.018 m -> 18 mm
    expect(content).toContain('S1,vertical-side,vertical,450,340,18,2')
    expect(content).toContain('I1,internal-shelf,horizontal,487,416,18,4')
    expect(content).toContain('Machining operations')
    expect(content).toContain('rail-cut,vertical-side,front,,5,21,306,no,2')
  })

  it('emits valid JSON in mm', () => {
    const { content } = serializeCutlist(sample, 'json')
    const parsed = JSON.parse(content)
    expect(parsed.units).toBe('mm')
    expect(parsed.panels).toHaveLength(2)
    expect(parsed.panels[0]).toMatchObject({ part: 'S1', width: 450, height: 340, thickness: 18, quantity: 2 })
    expect(parsed.operations[0]).toMatchObject({ operation: 'rail-cut', diameter: null, depth: 5, quantity: 2 })
  })

  it('emits a Markdown table', () => {
    const { content } = serializeCutlist(sample, 'md')
    expect(content).toContain('# Cutlist — My "Shelf" Unit')
    expect(content).toContain('| Part | Role | Orientation | Width | Height | Thickness | Qty |')
    expect(content).toContain('| S1 | vertical-side | vertical | 450 | 340 | 18 | 2 |')
  })

  it('emits self-contained HTML with escaped project name', () => {
    const { content, mime } = serializeCutlist(sample, 'html')
    expect(mime).toContain('text/html')
    expect(content.startsWith('<!doctype html>')).toBe(true)
    expect(content).toContain('My &quot;Shelf&quot; Unit')
    expect(content).toContain('<td class="n">450</td>')
  })

  it('slugifies file names per format', () => {
    expect(cutlistFileName('My "Shelf" Unit', 'csv')).toBe('my-shelf-unit-cutlist.csv')
    expect(cutlistFileName('   ', 'json')).toBe('cutlist-cutlist.json')
    expect(cutlistFileName('Wardrobe', 'md')).toBe('wardrobe-cutlist.md')
  })

  it('renders dimensions in the project unit', () => {
    const inches: CutlistData = {
      ...sample,
      settings: { ...DEFAULT_PROJECT_SETTINGS, lengthUnit: 'in', lengthPrecision: 2 },
    }
    const { content } = serializeCutlist(inches, 'csv')
    expect(content).toContain('Width (in),Height (in),Thickness (in)')
    // 0.45 m -> 17.72", 0.018 m -> 0.71"
    expect(content).toContain('S1,vertical-side,vertical,17.72,13.39,0.71,2')
  })

  it('renders fractional inches and reports decimal inches in JSON', () => {
    const fractional: CutlistData = {
      ...sample,
      panels: [{ groupId: 'S1', role: 'vertical-side', orientation: 'vertical', width: 0.4572, height: 0.3048, thickness: 0.01905, quantity: 2 }],
      settings: { ...DEFAULT_PROJECT_SETTINGS, lengthUnit: 'fraction' },
    }
    // 0.4572 m = 18", 0.3048 m = 12", 0.01905 m = 3/4"
    expect(serializeCutlist(fractional, 'csv').content).toContain('S1,vertical-side,vertical,18,12,3/4,2')
    const parsed = JSON.parse(serializeCutlist(fractional, 'json').content)
    expect(parsed.units).toBe('in')
    expect(parsed.panels[0]).toMatchObject({ width: 18, height: 12, thickness: 0.75 })
  })

  it('omits material, weight, and cost columns when the data carries none', () => {
    const { content } = serializeCutlist(sample, 'csv')
    expect(content).not.toContain('Material')
    expect(content).not.toContain('Weight')
    expect(content).not.toContain('Cost')
  })

  it('adds material, weight, and cost columns plus a totals block', () => {
    const priced: CutlistData = {
      ...sample,
      panels: sample.panels.map(p => ({ ...p, material: 'White Oak — Natural', weightKg: 1.5, cost: 12 })),
      settings: DEFAULT_PROJECT_SETTINGS,
      totals: { panelCount: 6, volumeM3: 0.01, faceAreaM2: 1.2, edgeLengthM: 8, weightKg: 7.55, cost: 74.4 },
    }
    const { content } = serializeCutlist(priced, 'csv')
    expect(content).toContain('Qty,Material,Weight (kg),Cost (EUR)')
    expect(content).toContain('White Oak — Natural,1.50')
    expect(content).toContain('Totals')
    expect(content).toContain('Panels,6')

    const parsed = JSON.parse(serializeCutlist(priced, 'json').content)
    expect(parsed.panels[0]).toMatchObject({ material: 'White Oak — Natural', cost: 12 })
    expect(parsed.totals).toMatchObject({ panelCount: 6, weightUnit: 'kg', currency: 'EUR' })
  })

  it('drops the operations section when the project turns it off', () => {
    const quiet: CutlistData = {
      ...sample,
      settings: { ...DEFAULT_PROJECT_SETTINGS, reportOperations: false },
    }
    const { content } = serializeCutlist(quiet, 'csv')
    expect(content).not.toContain('Machining operations')
    expect(JSON.parse(serializeCutlist(quiet, 'json').content).operations).toBeUndefined()
  })

  it('handles an empty cutlist without throwing', () => {
    const empty: CutlistData = { projectName: 'x', exportedAt: '2026-06-30T00:00:00.000Z', panels: [], operations: [] }
    for (const fmt of ['csv', 'json', 'html', 'md'] as const) {
      expect(() => serializeCutlist(empty, fmt)).not.toThrow()
    }
    expect(JSON.parse(serializeCutlist(empty, 'json').content).panels).toEqual([])
  })
})
