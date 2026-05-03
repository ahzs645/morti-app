import { getQuery } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { dbQuery } from '~~/server/utils/db'
import { PROJECT_METADATA_SELECT, projectRecordFromRow, type ProjectRow } from '~~/server/utils/projects'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  if (query.demos === 'true') {
    const result = await dbQuery<ProjectRow>(
      `
        SELECT ${PROJECT_METADATA_SELECT}
        FROM projects
        WHERE deleted_at IS NULL
          AND is_demo = true
          AND visibility = 'public'
          AND snapshot IS NOT NULL
        ORDER BY updated_at DESC
      `,
    )
    return result.rows.map(projectRecordFromRow)
  }

  const user = await requireUser(event)
  const includeDemos = query.includeDemos === 'true'
  const result = await dbQuery<ProjectRow>(
    `
      SELECT ${PROJECT_METADATA_SELECT}
      FROM projects
      WHERE owner_id = $1
        AND deleted_at IS NULL
        AND ($2::boolean = true OR is_demo = false)
      ORDER BY updated_at DESC
    `,
    [user.id, includeDemos],
  )
  return result.rows.map(projectRecordFromRow)
})
