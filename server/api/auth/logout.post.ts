import { getCookie } from 'h3'
import { clearAuthSession } from '~~/server/utils/auth'
import { dbQuery } from '~~/server/utils/db'
import { hashValue } from '~~/server/utils/security'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'morti_session')
  if (token) {
    await dbQuery('DELETE FROM auth_sessions WHERE token_hash = $1', [hashValue(token)])
  }
  clearAuthSession(event)
  return { ok: true }
})
