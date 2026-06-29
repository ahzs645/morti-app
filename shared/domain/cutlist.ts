import type { CompiledPanel, PanelOperation, PanelRole } from './types'

const roleCodes: Record<string, string> = {
  'back-panel': 'B',
  'vertical-side': 'S',
  'horizontal-deck': 'H',
  'internal-shelf': 'I',
  'door-front': 'O',
  'drawer-front': 'D',
  'drawer-side': 'D',
  'drawer-back': 'D',
  'drawer-bottom': 'D',
}

export function panelCutlistOrientation(panel: CompiledPanel): string {
  if (panel.role === 'vertical-side') return 'vertical'
  if (panel.role === 'horizontal-deck') return 'horizontal'
  return 'front'
}

export function panelRoleGroup(role: string): string {
  return role.startsWith('drawer-') ? 'drawer' : role
}

export function panelRoleCode(role: string): string {
  return roleCodes[role] ?? (role.match(/[a-z]/i)?.[0] ?? 'P').toUpperCase()
}

export function panelGroupIds(rows: { role?: PanelRole, representative?: { role: PanelRole } }[]): string[] {
  const counts = new Map<string, number>()
  return rows.map((row) => {
    const role = row.role ?? row.representative?.role ?? 'panel'
    const key = panelRoleGroup(role)
    const next = (counts.get(key) ?? 0) + 1
    counts.set(key, next)
    return `${panelRoleCode(role)}${next}`
  })
}

export function panelOperationSignature(panelKey: string, operations: PanelOperation[]): string {
  return operations
    .filter(op => op.targetPanelKey === panelKey)
    .map(op => [
      op.operationType,
      op.face ?? '',
      (op.center?.x ?? op.cx ?? op.x ?? 0).toFixed(6),
      (op.center?.y ?? op.cy ?? op.y ?? 0).toFixed(6),
      (op.diameter ?? 0).toFixed(6),
      (op.width ?? 0).toFixed(6),
      (op.height ?? 0).toFixed(6),
      (op.length ?? 0).toFixed(6),
      (op.depth ?? 0).toFixed(6),
      op.through ? '1' : '0',
    ].join(':'))
    .sort()
    .join('|')
}

export function panelCutlistSignature(panel: CompiledPanel, operations: PanelOperation[]): string {
  return [
    panel.role,
    panelCutlistOrientation(panel),
    Math.max(0, panel.width).toFixed(6),
    Math.max(0, panel.height).toFixed(6),
    Math.max(0, panel.thickness).toFixed(6),
    panelOperationSignature(panel.key, operations),
  ].join('|')
}
