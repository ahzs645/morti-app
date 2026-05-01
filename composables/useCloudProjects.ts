import * as Y from 'yjs'
import type { CloudProjectRecord, LocalProjectRow, ProjectVisibility, PublicStyle } from '~~/shared/domain/types'
import { STORES, idbPut } from '~~/shared/idb/madera-db'

const COLLECTION = 'madera_projects'

interface EnsureCloudProjectOpts {
  clientProjectId: string
  name: string
}

type EnsureCloudProjectInput = EnsureCloudProjectOpts | Pick<LocalProjectRow, 'id' | 'name'>

interface OwnerCloudListOptions {
  includeDemos?: boolean
}

function snapshotFormData(bytes: Uint8Array, clientProjectId: string): FormData {
  const form = new FormData()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy], { type: 'application/octet-stream' })
  form.append('snapshot', blob, `snapshot-${clientProjectId}.bin`)
  return form
}

function clientProjectIdOf(project: EnsureCloudProjectInput): string {
  return 'clientProjectId' in project ? project.clientProjectId : project.id
}

function publicStylePayload(style?: PublicStyle | null): string | undefined {
  return style ? JSON.stringify(style) : undefined
}

function isDeleted(record: CloudProjectRecord): boolean {
  return typeof record.deleted_at === 'string' && record.deleted_at.length > 0
}

function mergeUpdates(local: Uint8Array | null, remote: Uint8Array): Uint8Array {
  if (!local || local.byteLength === 0) return new Uint8Array(remote)
  const doc = new Y.Doc()
  Y.applyUpdate(doc, local)
  Y.applyUpdate(doc, remote)
  return Y.encodeStateAsUpdate(doc)
}

export function useCloudProjects() {
  const pb = usePb()

  function getAuthUserId(): string {
    const id = (pb.authStore.record as { id?: string } | null)?.id
    if (!id) throw new Error('Not authenticated.')
    return id
  }

  function isAdmin(): boolean {
    return (pb.authStore.record as { is_admin?: boolean } | null)?.is_admin === true
  }

  async function listOwnerCloudProjects(options: OwnerCloudListOptions = {}): Promise<CloudProjectRecord[]> {
    try {
      if (!pb.authStore.isValid) return []
      const userId = getAuthUserId()
      const records = await pb.collection(COLLECTION).getFullList<CloudProjectRecord>({
        filter: `owner = ${JSON.stringify(userId)} && deleted_at = ""`,
        sort: '-updated',
      })
      return records.filter((record) => {
        if (!record.client_project_id) return false
        if (record.is_demo) return options.includeDemos === true && record.visibility === 'public'
        return true
      })
    }
    catch {
      // Local-only mode: no cloud backend reachable.
      return []
    }
  }

  async function listMyProjects(): Promise<CloudProjectRecord[]> {
    return await listOwnerCloudProjects()
  }

  async function listDemos(): Promise<CloudProjectRecord[]> {
    try {
      return await pb.collection(COLLECTION).getFullList<CloudProjectRecord>({
        filter: 'is_demo = true && visibility = "public"',
        sort: '-updated',
      })
    }
    catch {
      // Local-only mode: no cloud backend reachable.
      return []
    }
  }

  async function findCloudProjectByClientId(clientProjectId: string): Promise<CloudProjectRecord | null> {
    if (!pb.authStore.isValid) return null
    try {
      const matches = await pb.collection(COLLECTION).getList<CloudProjectRecord>(1, 10, {
        filter: `client_project_id = ${JSON.stringify(clientProjectId)}`,
        sort: '-updated',
      })
      return matches.items.filter(record => !isDeleted(record)).find(record => record.visibility === 'public') ?? matches.items.filter(record => !isDeleted(record))[0] ?? null
    }
    catch (err: unknown) {
      const status = (err as { status?: number } | null)?.status
      if (status === 404) return null
      throw err
    }
  }

  async function reconcileLocalProjectsWithOwnerCloud(options: OwnerCloudListOptions = {}): Promise<CloudProjectRecord[]> {
    if (!pb.authStore.isValid) return []
    const records = await listOwnerCloudProjects(options)
    const local = useLocalProjects()
    for (const record of records) {
      const projectId = record.client_project_id
      const existing = await local.getLocalProject(projectId)
      const row: LocalProjectRow = {
        id: projectId,
        name: record.name,
        cloudId: record.id,
        createdAt: existing?.createdAt ?? record.created,
        updatedAt: record.updated,
        isDemo: record.is_demo,
        pinned: existing?.pinned ?? false,
      }
      await idbPut<LocalProjectRow>(STORES.projects, row)

      const remote = await fetchSnapshotBytes(record)
      if (remote && remote.byteLength > 0) {
        const localSnapshot = await local.getDesignSnapshot(projectId)
        await local.putDesignSnapshot(projectId, mergeUpdates(localSnapshot, remote))
      }
    }
    await local.listLocalProjects()
    return records
  }

  async function ensureCloudProject(project: EnsureCloudProjectInput, style?: PublicStyle | null): Promise<CloudProjectRecord> {
    const clientProjectId = clientProjectIdOf(project)
    const existing = await findCloudProjectByClientId(clientProjectId)
    const stylePayload = publicStylePayload(style)
    if (existing) {
      const patch: Record<string, unknown> = {}
      if (existing.name !== project.name) patch.name = project.name
      if (stylePayload !== undefined && existing.public_style !== stylePayload) patch.public_style = stylePayload
      if (Object.keys(patch).length === 0) return existing
      await pb.collection(COLLECTION).update(existing.id, patch)
      return await pb.collection(COLLECTION).getOne<CloudProjectRecord>(existing.id)
    }
    const userId = getAuthUserId()
    return await pb.collection(COLLECTION).create<CloudProjectRecord>({
      owner: userId,
      name: project.name,
      visibility: 'private' as ProjectVisibility,
      client_project_id: clientProjectId,
      is_demo: false,
      remix_count: 0,
      public_style: stylePayload,
    })
  }

  async function softDeleteCloudProjectForClientId(clientProjectId: string): Promise<void> {
    const rec = await findCloudProjectByClientId(clientProjectId)
    if (!rec) return
    await pb.collection(COLLECTION).update(rec.id, { deleted_at: new Date().toISOString() })
  }

  async function uploadSnapshotBytes(recordId: string, clientProjectId: string, bytes: Uint8Array): Promise<CloudProjectRecord> {
    const form = snapshotFormData(bytes, clientProjectId)
    return await pb.collection(COLLECTION).update<CloudProjectRecord>(recordId, form)
  }

  async function fetchSnapshotBytes(record: CloudProjectRecord): Promise<Uint8Array | null> {
    if (!record.snapshot) return null
    const res = await fetch(getSnapshotURL(record))
    if (!res.ok) throw new Error(`Failed to download cloud snapshot: ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }

  async function uploadSnapshot(project: LocalProjectRow): Promise<CloudProjectRecord> {
    const local = useLocalProjects()
    const bytes = await local.getDesignSnapshot(project.id)
    if (!bytes || bytes.byteLength === 0) throw new Error('Nothing to upload yet for this project.')
    const rec = await ensureCloudProject(project)
    return await uploadSnapshotBytes(rec.id, project.id, bytes)
  }

  async function publishFromLocal(project: LocalProjectRow, style?: PublicStyle | null): Promise<CloudProjectRecord> {
    const local = useLocalProjects()
    const bytes = await local.getDesignSnapshot(project.id)
    if (!bytes || bytes.byteLength === 0) throw new Error('Nothing to publish yet.')
    const rec = await ensureCloudProject(project, style)
    const form = snapshotFormData(bytes, project.id)
    form.append('name', project.name)
    form.append('visibility', 'public')
    form.append('published_at', new Date().toISOString())
    const stylePayload = publicStylePayload(style)
    if (stylePayload !== undefined) form.append('public_style', stylePayload)
    return await pb.collection(COLLECTION).update<CloudProjectRecord>(rec.id, form)
  }

  async function unpublishCloudProject(recordId: string): Promise<CloudProjectRecord> {
    return await pb.collection(COLLECTION).update<CloudProjectRecord>(recordId, { visibility: 'private' })
  }

  async function downloadSnapshotIntoLocal(recordId: string, localProjectId: string): Promise<void> {
    const record = await pb.collection(COLLECTION).getOne<CloudProjectRecord>(recordId)
    const bytes = await fetchSnapshotBytes(record)
    if (!bytes || bytes.byteLength === 0) throw new Error('No cloud snapshot for this project.')
    await useLocalProjects().putDesignSnapshot(localProjectId, bytes)
  }

  async function setCloudProjectName(recordId: string, name: string): Promise<CloudProjectRecord> {
    return await pb.collection(COLLECTION).update<CloudProjectRecord>(recordId, { name })
  }

  async function setCloudProjectVisibility(recordId: string, visibility: ProjectVisibility): Promise<CloudProjectRecord> {
    return await pb.collection(COLLECTION).update<CloudProjectRecord>(recordId, { visibility })
  }

  async function setCloudPublicStyle(recordId: string, style: PublicStyle): Promise<CloudProjectRecord> {
    return await pb.collection(COLLECTION).update<CloudProjectRecord>(recordId, {
      public_style: publicStylePayload(style),
    })
  }

  async function updateCloudProjectStyle(recordId: string, style: PublicStyle): Promise<CloudProjectRecord> {
    return await setCloudPublicStyle(recordId, style)
  }

  async function setCloudPublishedAt(recordId: string, isoOrNull: string | null): Promise<CloudProjectRecord> {
    return await pb.collection(COLLECTION).update<CloudProjectRecord>(recordId, {
      published_at: isoOrNull ?? '',
    })
  }

  async function setIsDemo(recordId: string, isDemo: boolean): Promise<CloudProjectRecord> {
    if (!isAdmin()) throw new Error('Admin access is required.')
    return await pb.collection(COLLECTION).update<CloudProjectRecord>(recordId, { is_demo: isDemo })
  }

  async function updateCloudProjectDemoFlag(recordId: string, isDemo: boolean): Promise<CloudProjectRecord> {
    return await setIsDemo(recordId, isDemo)
  }

  async function incrementRemixCount(recordId: string): Promise<CloudProjectRecord> {
    return await pb.collection(COLLECTION).update<CloudProjectRecord>(recordId, { 'remix_count+': 1 })
  }

  function getSnapshotURL(record: CloudProjectRecord): string {
    return pb.files.getURL(record, record.snapshot)
  }

  return {
    listMyProjects,
    listOwnerCloudProjects,
    listDemos,
    reconcileLocalProjectsWithOwnerCloud,
    findCloudProjectByClientId,
    ensureCloudProject,
    softDeleteCloudProjectForClientId,
    fetchSnapshotBytes,
    uploadSnapshotBytes,
    uploadSnapshot,
    publishFromLocal,
    unpublishCloudProject,
    downloadSnapshotIntoLocal,
    setCloudProjectName,
    setCloudProjectVisibility,
    setCloudPublicStyle,
    updateCloudProjectStyle,
    setCloudPublishedAt,
    setIsDemo,
    updateCloudProjectDemoFlag,
    incrementRemixCount,
    getSnapshotURL,
  }
}
