import * as Y from 'yjs'
import type { LocalProjectRow } from '~~/shared/domain/types'
import { cryptoRandomId } from '~~/shared/domain/defaults'
import { ensureInitialized } from '~~/shared/yjs/doc'
import { exportDoc, importDocFromBlob } from '~~/shared/yjs/madera-format'
import {
  STORES,
  idbClearForProject,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
} from '~~/shared/idb/madera-db'

interface DesignStateRow {
  projectId: string
  update?: Uint8Array
  snapshot?: ArrayBuffer | Uint8Array
  updatedAt?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeRow(name: string): LocalProjectRow {
  const t = nowIso()
  return {
    id: cryptoRandomId(),
    name: name.trim() || 'Untitled project',
    cloudId: null,
    createdAt: t,
    updatedAt: t,
    isDemo: false,
    pinned: false,
  }
}

async function writeFreshDesignState(projectId: string): Promise<void> {
  const doc = new Y.Doc()
  ensureInitialized(doc)
  const update = Y.encodeStateAsUpdate(doc)
  await idbPut<DesignStateRow>(STORES.designState, { projectId, update, snapshot: update, updatedAt: nowIso() })
}

function stateBytes(state: DesignStateRow | undefined): Uint8Array | null {
  const bytes = state?.update ?? state?.snapshot
  if (!bytes) return null
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
}

export function useLocalProjects() {
  const projects = ref<LocalProjectRow[]>([])

  async function listLocalProjects(): Promise<LocalProjectRow[]> {
    const rows = await idbGetAll<LocalProjectRow>(STORES.projects)
    rows.sort((a, b) => {
      const ap = a.pinned ? 1 : 0
      const bp = b.pinned ? 1 : 0
      if (ap !== bp) return bp - ap
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    projects.value = rows
    return rows
  }

  async function getLocalProject(id: string): Promise<LocalProjectRow | undefined> {
    return await idbGet<LocalProjectRow>(STORES.projects, id)
  }

  async function createLocalProject(name: string): Promise<LocalProjectRow> {
    const row = makeRow(name)
    await idbPut<LocalProjectRow>(STORES.projects, row)
    await writeFreshDesignState(row.id)
    await listLocalProjects()
    return row
  }

  async function renameLocalProject(id: string, name: string): Promise<LocalProjectRow | undefined> {
    const row = await getLocalProject(id)
    if (!row) return undefined
    const updated: LocalProjectRow = { ...row, name: name.trim() || 'Untitled project', updatedAt: nowIso() }
    await idbPut<LocalProjectRow>(STORES.projects, updated)
    await listLocalProjects()
    return updated
  }

  async function updateLocalProject(id: string, patch: Partial<Pick<LocalProjectRow, 'name' | 'pinned'>>): Promise<LocalProjectRow | undefined> {
    const row = await getLocalProject(id)
    if (!row) return undefined
    const updated: LocalProjectRow = {
      ...row,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() || 'Untitled project' : row.name,
      pinned: patch.pinned !== undefined ? patch.pinned : row.pinned ?? false,
      updatedAt: nowIso(),
    }
    await idbPut<LocalProjectRow>(STORES.projects, updated)
    await listLocalProjects()
    return updated
  }

  async function setLocalProjectCloudId(id: string, cloudId: string | null): Promise<void> {
    const row = await getLocalProject(id)
    if (!row) return
    const updated: LocalProjectRow = { ...row, cloudId, updatedAt: nowIso() }
    await idbPut<LocalProjectRow>(STORES.projects, updated)
    await listLocalProjects()
  }

  async function deleteLocalProject(id: string): Promise<void> {
    await idbDelete(STORES.projects, id)
    await idbClearForProject(id)
    await listLocalProjects()
  }

  async function duplicateLocalProject(id: string, name?: string): Promise<LocalProjectRow | null> {
    const src = await getLocalProject(id)
    if (!src) return null
    const srcState = await idbGet<DesignStateRow>(STORES.designState, id)
    const row = makeRow(name ?? `${src.name} copy`)
    await idbPut<LocalProjectRow>(STORES.projects, row)
    const srcBytes = stateBytes(srcState)
    if (srcBytes) {
      const copy = new Uint8Array(srcBytes.byteLength)
      copy.set(srcBytes)
      await idbPut<DesignStateRow>(STORES.designState, { projectId: row.id, update: copy, snapshot: copy, updatedAt: nowIso() })
    }
    else {
      await writeFreshDesignState(row.id)
    }
    await listLocalProjects()
    return row
  }

  async function importMaderaFile(blob: Blob, name: string): Promise<LocalProjectRow> {
    const doc = await importDocFromBlob(blob)
    const update = Y.encodeStateAsUpdate(doc)
    const row = makeRow(name)
    await idbPut<LocalProjectRow>(STORES.projects, row)
    await idbPut<DesignStateRow>(STORES.designState, { projectId: row.id, update, snapshot: update, updatedAt: nowIso() })
    await listLocalProjects()
    return row
  }

  // Used by `/p/:id` Remix flow: encode an in-memory Y.Doc as a brand-new
  // local project (no envelope round-trip). Returns the new local row.
  async function importDocAsCopy(doc: Y.Doc, name: string): Promise<LocalProjectRow> {
    ensureInitialized(doc)
    const update = Y.encodeStateAsUpdate(doc)
    const row = makeRow(name)
    await idbPut<LocalProjectRow>(STORES.projects, row)
    await idbPut<DesignStateRow>(STORES.designState, { projectId: row.id, update, snapshot: update, updatedAt: nowIso() })
    await listLocalProjects()
    return row
  }

  async function exportMaderaFile(id: string): Promise<Blob | null> {
    const state = await idbGet<DesignStateRow>(STORES.designState, id)
    const bytes = stateBytes(state)
    if (!bytes) return null
    const doc = new Y.Doc()
    Y.applyUpdate(doc, bytes)
    ensureInitialized(doc)
    return exportDoc(doc)
  }

  async function getDesignSnapshot(id: string): Promise<Uint8Array | null> {
    const state = await idbGet<DesignStateRow>(STORES.designState, id)
    const bytes = stateBytes(state)
    return bytes ? new Uint8Array(bytes) : null
  }

  async function putDesignSnapshot(id: string, update: Uint8Array): Promise<void> {
    const copy = new Uint8Array(update.byteLength)
    copy.set(update)
    await idbPut<DesignStateRow>(STORES.designState, { projectId: id, update: copy, snapshot: copy, updatedAt: nowIso() })
  }

  return {
    projects,
    listLocalProjects,
    getLocalProject,
    createLocalProject,
    updateLocalProject,
    renameLocalProject,
    setLocalProjectCloudId,
    deleteLocalProject,
    duplicateLocalProject,
    importMaderaFile,
    importDocAsCopy,
    exportMaderaFile,
    getDesignSnapshot,
    putDesignSnapshot,
  }
}
