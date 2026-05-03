import { createError, getRouterParam, readMultipartFormData } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { dbQuery } from '~~/server/utils/db'
import { PROJECT_METADATA_SELECT, projectRecordFromRow, type ProjectRow } from '~~/server/utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project id is required.' })

  const existing = await dbQuery<ProjectRow>(`SELECT ${PROJECT_METADATA_SELECT} FROM projects WHERE id = $1 LIMIT 1`, [id])
  const row = existing.rows[0]
  if (!row || row.deleted_at) throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  if (row.owner_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'You do not have access to this project.' })

  const parts = await readMultipartFormData(event)
  const snapshot = parts?.find(part => part.name === 'snapshot')
  if (!snapshot?.data || snapshot.data.byteLength === 0) {
    throw createError({ statusCode: 400, statusMessage: 'snapshot is required.' })
  }
  if (snapshot.data.byteLength > 20 * 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'Snapshot is too large.' })
  }

  const result = await dbQuery<ProjectRow>(
    `
      UPDATE projects
      SET snapshot = $2,
          snapshot_filename = $3,
          snapshot_content_type = $4,
          snapshot_updated_at = now(),
          updated_at = now()
      WHERE id = $1
      RETURNING ${PROJECT_METADATA_SELECT}
    `,
    [
      id,
      Buffer.from(snapshot.data),
      snapshot.filename || `snapshot-${row.client_project_id}.bin`,
      snapshot.type || 'application/octet-stream',
    ],
  )
  return projectRecordFromRow(result.rows[0])
})
