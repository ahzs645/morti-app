import { createError, getRouterParam } from 'h3'
import { dbQuery } from '~~/server/utils/db'
import { projectRecordFromRow, type ProjectRow } from '~~/server/utils/projects'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project id is required.' })

  const result = await dbQuery<ProjectRow>(
    `
      UPDATE projects
      SET remix_count = remix_count + 1,
          updated_at = now()
      WHERE id = $1
        AND deleted_at IS NULL
        AND visibility = 'public'
        AND snapshot IS NOT NULL
      RETURNING *
    `,
    [id],
  )
  const row = result.rows[0]
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'This project is private or no longer available.',
    })
  }
  return projectRecordFromRow(row)
})
