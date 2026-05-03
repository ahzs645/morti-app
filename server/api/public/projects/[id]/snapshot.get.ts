import { createError, getHeader, getRouterParam, send, setHeader, setResponseStatus } from 'h3'
import { dbQuery } from '~~/server/utils/db'
import {
  PROJECT_METADATA_SELECT,
  ifNoneMatchMatches,
  projectHasSnapshot,
  projectSnapshotEtag,
  type ProjectRow,
} from '~~/server/utils/projects'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project id is required.' })
  const result = await dbQuery<ProjectRow>(
    `
      SELECT ${PROJECT_METADATA_SELECT}
      FROM projects
      WHERE id = $1
        AND deleted_at IS NULL
        AND visibility = 'public'
        AND snapshot IS NOT NULL
      LIMIT 1
    `,
    [id],
  )
  const row = result.rows[0]
  if (!row || !projectHasSnapshot(row)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'This project is private or no longer available.',
    })
  }
  const etag = projectSnapshotEtag(row)
  if (etag) setHeader(event, 'etag', etag)
  setHeader(event, 'content-type', row.snapshot_content_type || 'application/octet-stream')
  setHeader(event, 'cache-control', 'public, max-age=60, must-revalidate')

  if (etag && ifNoneMatchMatches(getHeader(event, 'if-none-match'), etag)) {
    setResponseStatus(event, 304)
    return send(event, '')
  }

  const snapshotResult = await dbQuery<Pick<ProjectRow, 'snapshot'>>('SELECT snapshot FROM projects WHERE id = $1 LIMIT 1', [id])
  const bytes = snapshotResult.rows[0]?.snapshot
  if (!bytes) {
    throw createError({
      statusCode: 404,
      statusMessage: 'This project is private or no longer available.',
    })
  }
  return bytes
})
