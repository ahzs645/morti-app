import * as Y from 'yjs'
import type { CloudProjectRecord, PublicStyle } from '~~/shared/domain/types'
import { normalizePublicStyle } from '~~/shared/domain/defaults'

export interface LoadPublicProjectResult {
  record: CloudProjectRecord
  doc: Y.Doc
  publicStyle: PublicStyle
}

function parsePublicStyle(raw: string | undefined | null): PublicStyle {
  if (!raw || typeof raw !== 'string' || raw.length === 0) {
    return normalizePublicStyle()
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PublicStyle>
    return normalizePublicStyle(parsed)
  }
  catch {
    return normalizePublicStyle()
  }
}

export async function loadPublicProject(cloudId: string): Promise<LoadPublicProjectResult> {
  let record: CloudProjectRecord
  try {
    record = await $fetch<CloudProjectRecord>(`/api/public/projects/${encodeURIComponent(cloudId)}`)
  }
  catch (err: unknown) {
    const status = (err as { status?: number, statusCode?: number } | null)?.status
      ?? (err as { statusCode?: number } | null)?.statusCode
    if (status === 403 || status === 404) {
      throw createError({
        statusCode: status,
        statusMessage: 'This project is private or no longer available.',
      })
    }
    throw err
  }

  if (
    (typeof record.deleted_at === 'string' && record.deleted_at.length > 0)
    || record.visibility !== 'public'
    || typeof record.snapshot !== 'string'
    || record.snapshot.length === 0
  ) {
    throw createError({
      statusCode: 404,
      statusMessage: 'This project is private or no longer available.',
    })
  }

  const resp = await fetch(`/api/public/projects/${encodeURIComponent(record.id)}/snapshot`)
  if (!resp.ok) {
    throw createError({
      statusCode: resp.status,
      statusMessage: 'Could not download the project snapshot.',
    })
  }
  const bytes = new Uint8Array(await resp.arrayBuffer())

  const doc = new Y.Doc()
  Y.applyUpdate(doc, bytes)

  const publicStyle = parsePublicStyle(record.public_style)

  return { record, doc, publicStyle }
}
