import type { AuthUser } from './types'

export const LOCAL_AUTH_BYPASS_USER_ID = 'local-dev'
export const LOCAL_AUTH_BYPASS_EMAIL = 'local@localhost'
const LOCAL_AUTH_BYPASS_TIMESTAMP = '2026-01-01T00:00:00.000Z'

export function createLocalAuthBypassUser(): AuthUser {
  return {
    id: LOCAL_AUTH_BYPASS_USER_ID,
    email: LOCAL_AUTH_BYPASS_EMAIL,
    verified: true,
    email_validated_at: LOCAL_AUTH_BYPASS_TIMESTAMP,
    is_admin: false,
    created: LOCAL_AUTH_BYPASS_TIMESTAMP,
    updated: LOCAL_AUTH_BYPASS_TIMESTAMP,
  }
}

export function isLocalAuthBypassUser(user: Pick<AuthUser, 'id' | 'email'> | null | undefined): boolean {
  return user?.id === LOCAL_AUTH_BYPASS_USER_ID && user.email === LOCAL_AUTH_BYPASS_EMAIL
}
