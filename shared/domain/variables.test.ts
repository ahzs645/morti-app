import { describe, expect, it } from 'vitest'
import {
  type ProjectVariable,
  applyVariables,
  conflictingBindings,
  defaultVariable,
  sanitizeVariable,
  sanitizeVariables,
  variableForField,
} from './variables'
import { DEFAULT_FURNITURE_CONFIG } from './defaults'

function variable(over: Partial<ProjectVariable> = {}): ProjectVariable {
  return { ...defaultVariable('v1'), ...over }
}

describe('sanitize', () => {
  it('drops bindings to fields that are not writable config', () => {
    const clean = sanitizeVariable({ bindings: ['depth', 'notAField', 'schemaVersion'] }, 'v')
    expect(clean.bindings).toEqual(['depth'])
  })

  it('de-duplicates bindings', () => {
    expect(sanitizeVariable({ bindings: ['depth', 'depth'] }, 'v').bindings).toEqual(['depth'])
  })

  it('rejects a negative value', () => {
    expect(sanitizeVariable({ value: -1 }, 'v').value).toBe(0)
  })

  it('falls back to a name when given none', () => {
    expect(sanitizeVariable({ name: '   ' }, 'v').name).toBe('Variable')
  })

  it('treats a non-array as no variables', () => {
    expect(sanitizeVariables(null)).toEqual([])
  })

  it('caps the variable count', () => {
    expect(sanitizeVariables(Array.from({ length: 200 }, () => ({}))).length).toBeLessThanOrEqual(32)
  })
})

describe('applyVariables', () => {
  it('returns the config untouched when there are no variables', () => {
    expect(applyVariables(DEFAULT_FURNITURE_CONFIG, [])).toBe(DEFAULT_FURNITURE_CONFIG)
  })

  it('drives every field a variable binds', () => {
    const applied = applyVariables(DEFAULT_FURNITURE_CONFIG, [
      variable({ value: 0.025, bindings: ['panelThickness', 'backPanelThickness'] }),
    ])
    expect(applied.panelThickness).toBeCloseTo(0.025, 10)
    expect(applied.backPanelThickness).toBeCloseTo(0.025, 10)
  })

  it('leaves unbound fields alone', () => {
    const applied = applyVariables(DEFAULT_FURNITURE_CONFIG, [variable({ value: 0.025, bindings: ['panelThickness'] })])
    expect(applied.depth).toBeCloseTo(DEFAULT_FURNITURE_CONFIG.depth, 10)
  })

  it('does not mutate the input config', () => {
    const before = { ...DEFAULT_FURNITURE_CONFIG }
    applyVariables(DEFAULT_FURNITURE_CONFIG, [variable({ value: 0.03, bindings: ['depth'] })])
    expect(DEFAULT_FURNITURE_CONFIG).toEqual(before)
  })

  it('lets the last variable win when two bind the same field', () => {
    const applied = applyVariables(DEFAULT_FURNITURE_CONFIG, [
      variable({ id: 'a', value: 0.018, bindings: ['panelThickness'] }),
      variable({ id: 'b', value: 0.025, bindings: ['panelThickness'] }),
    ])
    expect(applied.panelThickness).toBeCloseTo(0.025, 10)
  })
})

describe('introspection', () => {
  const list = [
    variable({ id: 'a', name: 'Carcass', bindings: ['panelThickness'] }),
    variable({ id: 'b', name: 'Back', bindings: ['backPanelThickness', 'panelThickness'] }),
  ]

  it('reports the variable that actually wins a field', () => {
    expect(variableForField(list, 'panelThickness')?.id).toBe('b')
    expect(variableForField(list, 'backPanelThickness')?.id).toBe('b')
  })

  it('reports nothing for an unbound field', () => {
    expect(variableForField(list, 'depth')).toBeNull()
  })

  it('flags fields driven by more than one variable', () => {
    expect(conflictingBindings(list)).toEqual(['panelThickness'])
  })

  it('flags nothing when bindings are distinct', () => {
    expect(conflictingBindings([variable({ bindings: ['depth'] })])).toEqual([])
  })
})
