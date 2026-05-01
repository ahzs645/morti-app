// Local-only auth — no PocketBase / Postgres backend.
// Sign-in is instant: any email creates a local synthetic user persisted in
// localStorage. The OTP step is bypassed (authWithOtp returns immediately).

const LOCAL_USER_KEY = 'madera-local-user'

interface LocalUser {
  id: string
  email: string
  verified: true
  email_validated_at: string
  is_admin: boolean
  created: string
  updated: string
}

function loadLocalUser(): LocalUser | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LocalUser
  }
  catch {
    return null
  }
}

function saveLocalUser(u: LocalUser | null) {
  if (!import.meta.client) return
  if (u) localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u))
  else localStorage.removeItem(LOCAL_USER_KEY)
}

function makeLocalUser(email: string): LocalUser {
  const now = new Date().toISOString()
  // Stable id derived from the email so re-signing-in returns the same user.
  const id = 'local-' + Array.from(email).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(36).replace('-', 'x')
  return {
    id,
    email,
    verified: true,
    email_validated_at: now,
    is_admin: false,
    created: now,
    updated: now,
  }
}

function isEmailVerified(user: LocalUser | null): boolean {
  return !!user && user.verified === true
}

export function useAuth() {
  const user = useState<LocalUser | null>('auth-user', () => loadLocalUser())
  const loading = useState<boolean>('auth-loading', () => false)

  const isAuthed = computed(() => !!user.value?.id)
  const isVerified = computed(() => isEmailVerified(user.value))

  async function requestOtp(email: string): Promise<{ otpId: string }> {
    // Local stub: pretend we sent an OTP. The next step accepts any code.
    const trimmed = email.trim()
    if (!trimmed) throw new Error('Enter your email address.')
    return { otpId: `local:${trimmed}` }
  }

  async function authWithOtp(otpId: string, _code: string) {
    const email = otpId.startsWith('local:') ? otpId.slice('local:'.length) : otpId
    const u = makeLocalUser(email)
    saveLocalUser(u)
    user.value = u
    return { record: u, token: 'local-token' }
  }

  // Convenience for "instant sign-in" flows that want to skip the OTP screen entirely.
  async function signInLocal(email: string) {
    const u = makeLocalUser(email.trim())
    saveLocalUser(u)
    user.value = u
    return u
  }

  async function requestVerification(_email: string) {
    // Already verified locally — no-op.
    return true
  }

  async function signOut() {
    saveLocalUser(null)
    user.value = null
    await navigateTo('/')
  }

  return {
    user,
    loading,
    isAuthed,
    isVerified,
    requestOtp,
    authWithOtp,
    signInLocal,
    requestVerification,
    signOut,
  }
}
