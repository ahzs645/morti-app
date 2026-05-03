import { createError, getRouterParam, readBody } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { dbQuery } from '~~/server/utils/db'
import { PROJECT_METADATA_SELECT, cleanProjectName, cleanPublicStyle, projectRecordFromRow, type ProjectRow } from '~~/server/utils/projects'

function cleanVisibility(value: unknown): 'public' | 'private' | undefined {
  if (value === 'public' || value === 'private') return value
  return undefined
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project id is required.' })

  const existing = await dbQuery<ProjectRow>(`SELECT ${PROJECT_METADATA_SELECT} FROM projects WHERE id = $1 LIMIT 1`, [id])
  const row = existing.rows[0]
  if (!row || row.deleted_at) throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  if (row.owner_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'You do not have access to this project.' })

  const body = await readBody<Record<string, unknown>>(event)
  const patch: Record<string, unknown> = {}
  const sets: string[] = []
  const values: unknown[] = []

  function add(column: string, value: unknown) {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if ('name' in body) add('name', cleanProjectName(body.name))
  if ('visibility' in body) {
    const visibility = cleanVisibility(body.visibility)
    if (!visibility) throw createError({ statusCode: 400, statusMessage: 'Invalid visibility.' })
    add('visibility', visibility)
    if (visibility === 'private') add('published_at', null)
  }
  if ('published_at' in body) {
    const value = body.published_at
    add('published_at', typeof value === 'string' && value ? new Date(value) : null)
  }
  if ('public_style' in body) add('public_style', cleanPublicStyle(body.public_style))
  if ('deleted_at' in body) {
    const value = body.deleted_at
    add('deleted_at', typeof value === 'string' && value ? new Date(value) : null)
  }
  if ('is_demo' in body) {
    if (!user.is_admin) throw createError({ statusCode: 403, statusMessage: 'Admin access is required.' })
    add('is_demo', body.is_demo === true)
  }
  if ('remix_count_delta' in body) {
    const delta = Number(body.remix_count_delta)
    if (Number.isFinite(delta) && delta !== 0) {
      patch.remixDelta = delta
    }
  }

  if (sets.length === 0 && !patch.remixDelta) return projectRecordFromRow(row)
  if (patch.remixDelta) sets.push(`remix_count = remix_count + ${Number(patch.remixDelta) > 0 ? 1 : -1}`)
  sets.push('updated_at = now()')
  values.push(id)

  const result = await dbQuery<ProjectRow>(
    `UPDATE projects SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${PROJECT_METADATA_SELECT}`,
    values,
  )
  return projectRecordFromRow(result.rows[0])
})
