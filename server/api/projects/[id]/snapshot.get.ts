import { createError, getRouterParam, setHeader } from 'h3'
import { getCurrentUser } from '~~/server/utils/auth'
import { dbQuery } from '~~/server/utils/db'
import { assertCanReadProject, type ProjectRow } from '~~/server/utils/projects'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project id is required.' })
  const result = await dbQuery<ProjectRow>('SELECT * FROM projects WHERE id = $1 LIMIT 1', [id])
  const row = result.rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  assertCanReadProject(row, await getCurrentUser(event))
  if (!row.snapshot) throw createError({ statusCode: 404, statusMessage: 'No snapshot found.' })
  setHeader(event, 'content-type', row.snapshot_content_type || 'application/octet-stream')
  setHeader(event, 'cache-control', row.visibility === 'public' ? 'public, max-age=60' : 'private, no-store')
  return row.snapshot
})
