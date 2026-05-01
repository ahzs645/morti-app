import type { H3Event } from 'h3'
import { createError, deleteCookie, getCookie, setCookie } from 'h3'
import type { AuthUser } from '~~/shared/domain/types'
import { createId, hashValue, randomToken } from '~~/server/utils/security'
import { dbQuery } from '~~/server/utils/db'

const SESSION_COOKIE = 'morti_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

interface UserRow {
  id: string
  email: string
  email_verified_at: Date | string | null
  is_admin: boolean
  created_at: Date | string
  updated_at: Date | string
}

function iso(value: Date | string | null | undefined): string {
  if (!value) return ''
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function authUserFromRow(row: UserRow): AuthUser {
  const verifiedAt = iso(row.email_verified_at)
  return {
    id: row.id,
    email: row.email,
    verified: verifiedAt.length > 0,
    email_validated_at: verifiedAt,
    is_admin: row.is_admin === true,
    created: iso(row.created_at),
    updated: iso(row.updated_at),
  }
}

function setSessionCookie(event: H3Event, token: string) {
  const appBaseUrl = String(process.env.APP_BASE_URL || useRuntimeConfig().appBaseUrl || '')
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appBaseUrl.startsWith('https://'),
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export function clearAuthSession(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export async function createAuthSession(event: H3Event, userId: string): Promise<void> {
  const token = randomToken()
  await dbQuery(
    `
      INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, now() + interval '30 days')
    `,
    [createId('ses'), userId, hashValue(token)],
  )
  setSessionCookie(event, token)
}

export async function getCurrentUser(event: H3Event): Promise<AuthUser | null> {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return null

  const result = await dbQuery<UserRow>(
    `
      SELECT u.id, u.email, u.email_verified_at, u.is_admin, u.created_at, u.updated_at
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
      LIMIT 1
    `,
    [hashValue(token)],
  )

  const row = result.rows[0]
  if (!row) {
    clearAuthSession(event)
    return null
  }

  await dbQuery(
    'UPDATE auth_sessions SET last_used_at = now() WHERE token_hash = $1',
    [hashValue(token)],
  )
  return authUserFromRow(row)
}

export async function requireUser(event: H3Event): Promise<AuthUser> {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign in to continue.',
    })
  }
  return user
}

export async function requireAdmin(event: H3Event): Promise<AuthUser> {
  const user = await requireUser(event)
  if (!user.is_admin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin access is required.',
    })
  }
  return user
}
