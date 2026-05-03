import { createError, getRouterParam } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { dbQuery } from '~~/server/utils/db'
import { PROJECT_METADATA_SELECT, projectRecordFromRow, type ProjectRow } from '~~/server/utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const clientId = String(getRouterParam(event, 'clientId') || '').trim()
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'client project id is required.' })

  const result = await dbQuery<ProjectRow>(
    `
      SELECT ${PROJECT_METADATA_SELECT}
      FROM projects
      WHERE owner_id = $1
        AND client_project_id = $2
        AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [user.id, clientId],
  )

  const row = result.rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  return projectRecordFromRow(row)
})
