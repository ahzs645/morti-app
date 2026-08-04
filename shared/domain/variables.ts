/**
 * Named project variables — the Morti analogue of Woodworking's
 * parameterization tools (`Std_VarSet`, the spreadsheet + `showAlias`, and the
 * cell references `magicGlue` / `sketch2clone` designs lean on).
 *
 * A variable gives a dimension a name ("carcass depth", "shelf pitch") so the
 * same number can drive several config fields and be retuned in one place.
 * Bindings are deliberately **one-way**: a variable drives config fields, not
 * the reverse, so there is never a cycle to resolve.
 *
 * Values are metres, like everything else in the document; the UI renders them
 * through `units.ts`.
 *
 * Pure and framework-free so it can be unit-tested directly.
 */

import type { FurnitureConfig } from './types'
import { FURNITURE_CONFIG_WRITABLE_KEYS } from './defaults'

export interface ProjectVariable {
  id: string
  /** Display name. Also the alias shown against bound fields. */
  name: string
  /** Value in metres. */
  value: number
  /** Config fields this variable drives. */
  bindings: (keyof FurnitureConfig)[]
}

export const MAX_VARIABLES = 32
const MAX_VALUE = 20

export function defaultVariable(id: string): ProjectVariable {
  return { id, name: 'New variable', value: 0.018, bindings: [] }
}

const WRITABLE = new Set<string>(FURNITURE_CONFIG_WRITABLE_KEYS as string[])

export function sanitizeVariable(input: unknown, fallbackId: string): ProjectVariable {
  const source = (input ?? {}) as Partial<ProjectVariable>
  const bindings = Array.isArray(source.bindings)
    ? [...new Set(source.bindings.filter(key => typeof key === 'string' && WRITABLE.has(key)))] as (keyof FurnitureConfig)[]
    : []
  return {
    id: typeof source.id === 'string' && source.id.length > 0 ? source.id : fallbackId,
    name: typeof source.name === 'string' && source.name.trim().length > 0
      ? source.name.trim().slice(0, 48)
      : 'Variable',
    value: typeof source.value === 'number' && Number.isFinite(source.value) && source.value >= 0
      ? Math.min(MAX_VALUE, Math.round(source.value * 1_000_000) / 1_000_000)
      : 0,
    bindings,
  }
}

export function sanitizeVariables(input: unknown): ProjectVariable[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, MAX_VARIABLES).map((variable, index) => sanitizeVariable(variable, `var-${index}`))
}

/**
 * Apply variables to a config. Later variables win when two bind the same
 * field, which matches the list order the user sees.
 */
export function applyVariables(config: FurnitureConfig, variables: ProjectVariable[]): FurnitureConfig {
  if (variables.length === 0) return config
  const next = { ...config }
  for (const variable of variables) {
    for (const key of variable.bindings) {
      if (WRITABLE.has(key as string)) next[key] = variable.value
    }
  }
  return next
}

/** Which variable currently drives a field, if any. Used to show the alias. */
export function variableForField(
  variables: ProjectVariable[],
  key: keyof FurnitureConfig,
): ProjectVariable | null {
  // Last binding wins, mirroring `applyVariables`.
  for (let index = variables.length - 1; index >= 0; index--) {
    if (variables[index].bindings.includes(key)) return variables[index]
  }
  return null
}

/** Fields bound by more than one variable — the user should know. */
export function conflictingBindings(variables: ProjectVariable[]): (keyof FurnitureConfig)[] {
  const counts = new Map<string, number>()
  for (const variable of variables) {
    for (const key of variable.bindings) counts.set(key as string, (counts.get(key as string) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key as keyof FurnitureConfig)
}
