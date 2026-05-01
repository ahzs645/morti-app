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

/**
 * Load a public project for the read-only viewer (`/p/:id`) or render route
 * (`/render/p/:id`). Hits PocketBase, downloads the snapshot bytes, applies
 * them to a fresh `Y.Doc`, and returns the parsed `publicStyle`.
 *
 * Throws (via `createError`) on PocketBase 403 / 404 with the user-facing
 * message "This project is private or no longer available."
 */
export async function loadPublicProject(cloudId: string): Promise<LoadPublicProjectResult> {
  const pb = usePb()
  const { getSnapshotURL } = useCloudProjects()

  let record: CloudProjectRecord
  try {
    record = await pb.collection('madera_projects').getOne<CloudProjectRecord>(cloudId)
  }
  catch (err: unknown) {
    const status = (err as { status?: number } | null)?.status
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

  const url = getSnapshotURL(record)
  const resp = await fetch(url)
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
