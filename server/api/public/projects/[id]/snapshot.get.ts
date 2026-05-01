import { createError, getRouterParam, setHeader } from 'h3'
import { dbQuery } from '~~/server/utils/db'
import { type ProjectRow } from '~~/server/utils/projects'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project id is required.' })
  const result = await dbQuery<ProjectRow>(
    `
      SELECT *
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
  if (!row?.snapshot) {
    throw createError({
      statusCode: 404,
      statusMessage: 'This project is private or no longer available.',
    })
  }
  setHeader(event, 'content-type', row.snapshot_content_type || 'application/octet-stream')
  setHeader(event, 'cache-control', 'public, max-age=60')
  return row.snapshot
})
