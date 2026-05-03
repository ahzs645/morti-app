import { createError, getRouterParam } from 'h3'
import { dbQuery } from '~~/server/utils/db'
import { PROJECT_METADATA_SELECT, projectRecordFromRow, type ProjectRow } from '~~/server/utils/projects'

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
  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'This project is private or no longer available.',
    })
  }
  return projectRecordFromRow(row)
})
