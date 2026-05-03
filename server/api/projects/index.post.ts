import { createError, readBody } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { dbQuery } from '~~/server/utils/db'
import { createId } from '~~/server/utils/security'
import { PROJECT_METADATA_SELECT, cleanProjectName, cleanPublicStyle, projectRecordFromRow, type ProjectRow } from '~~/server/utils/projects'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    client_project_id?: string
    clientProjectId?: string
    name?: string
    public_style?: unknown
  }>(event)
  const clientProjectId = String(body?.client_project_id || body?.clientProjectId || '').trim()
  if (!clientProjectId) {
    throw createError({ statusCode: 400, statusMessage: 'client_project_id is required.' })
  }

  const result = await dbQuery<ProjectRow>(
    `
      INSERT INTO projects (id, owner_id, name, client_project_id, public_style)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (owner_id, client_project_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        public_style = COALESCE(EXCLUDED.public_style, projects.public_style),
        deleted_at = NULL,
        updated_at = now()
      RETURNING ${PROJECT_METADATA_SELECT}
    `,
    [
      createId('prj'),
      user.id,
      cleanProjectName(body?.name),
      clientProjectId.slice(0, 160),
      cleanPublicStyle(body?.public_style),
    ],
  )

  return projectRecordFromRow(result.rows[0])
})
