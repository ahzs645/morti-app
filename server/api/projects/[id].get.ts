import { createError, getRouterParam } from 'h3'
import { getCurrentUser } from '~~/server/utils/auth'
import { dbQuery } from '~~/server/utils/db'
import { PROJECT_METADATA_SELECT, assertCanReadProject, projectRecordFromRow, type ProjectRow } from '~~/server/utils/projects'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project id is required.' })
  const result = await dbQuery<ProjectRow>(`SELECT ${PROJECT_METADATA_SELECT} FROM projects WHERE id = $1 LIMIT 1`, [id])
  const row = result.rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  assertCanReadProject(row, await getCurrentUser(event))
  return projectRecordFromRow(row)
})
