import { createError } from 'h3'
import type { AuthUser, CloudProjectRecord, ProjectVisibility } from '~~/shared/domain/types'

export interface ProjectRow {
  id: string
  owner_id: string
  name: string
  visibility: ProjectVisibility
  client_project_id: string
  source_project_id: string | null
  is_demo: boolean
  remix_count: number
  public_style: string | null
  snapshot?: Buffer | null
  has_snapshot?: boolean | null
  snapshot_filename: string | null
  snapshot_content_type: string | null
  snapshot_updated_at: Date | string | null
  published_at: Date | string | null
  deleted_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

export const PROJECT_METADATA_SELECT = `
  id,
  owner_id,
  name,
  visibility,
  client_project_id,
  source_project_id,
  is_demo,
  remix_count,
  public_style,
  snapshot IS NOT NULL AS has_snapshot,
  snapshot_filename,
  snapshot_content_type,
  snapshot_updated_at,
  published_at,
  deleted_at,
  created_at,
  updated_at
`

function iso(value: Date | string | null | undefined): string {
  if (!value) return ''
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function projectHasSnapshot(row: ProjectRow): boolean {
  return !!row.snapshot || row.has_snapshot === true
}

export function projectSnapshotEtag(row: ProjectRow): string | null {
  if (!projectHasSnapshot(row) || !row.snapshot_updated_at) return null
  const updated = row.snapshot_updated_at instanceof Date
    ? row.snapshot_updated_at.getTime()
    : new Date(row.snapshot_updated_at).getTime()
  if (!Number.isFinite(updated)) return null
  return `"snapshot-${row.id}-${updated}"`
}

export function ifNoneMatchMatches(value: string | undefined | null, etag: string): boolean {
  if (!value) return false
  return value.split(',').map(part => part.trim()).includes(etag)
}

export function projectRecordFromRow(row: ProjectRow): CloudProjectRecord {
  return {
    id: row.id,
    collectionId: '',
    collectionName: 'morti_projects',
    owner: row.owner_id,
    name: row.name,
    visibility: row.visibility,
    client_project_id: row.client_project_id,
    ...(row.source_project_id ? { source_project_id: row.source_project_id } : {}),
    is_demo: row.is_demo === true,
    remix_count: Number(row.remix_count ?? 0),
    public_style: row.public_style ?? '',
    snapshot: projectHasSnapshot(row) ? row.snapshot_filename || `snapshot-${row.client_project_id}.bin` : '',
    published_at: iso(row.published_at),
    deleted_at: iso(row.deleted_at),
    created: iso(row.created_at),
    updated: iso(row.updated_at),
  }
}

export function cleanProjectName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  return (name || 'Untitled project').slice(0, 160)
}

export function cleanPublicStyle(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') return value.slice(0, 32_000)
  return JSON.stringify(value).slice(0, 32_000)
}

export function assertCanReadProject(row: ProjectRow, user: AuthUser | null): void {
  if (row.deleted_at) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  }
  if (row.visibility === 'public') return
  if (user?.id && user.id === row.owner_id) return
  throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
}

export function assertCanWriteProject(row: ProjectRow, user: AuthUser): void {
  if (row.deleted_at) throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  if (row.owner_id !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have access to this project.' })
  }
}
