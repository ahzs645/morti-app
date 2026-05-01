import posthog from 'posthog-js'
import type { AuthUser } from '~~/shared/domain/types'

function isEmailVerified(user: AuthUser | null): boolean {
  if (!user) return false
  return (
    user.verified === true ||
    (typeof user.email_validated_at === 'string' && user.email_validated_at.length > 0)
  )
}

export default defineNuxtPlugin((nuxtApp) => {
  const { posthogKey, posthogHost, posthogUiHost, posthogDebug } =
    useRuntimeConfig().public as {
      posthogKey: string
      posthogHost: string
      posthogUiHost: string
      posthogDebug: boolean
    }

  if (!posthogKey || typeof posthogKey !== 'string') return

  posthog.init(posthogKey, {
    api_host: posthogHost,
    ui_host: posthogUiHost,
    capture_pageview: 'history_change',
  })

  if (posthogDebug) {
    posthog.debug(true)
    ;(window as any).__POSTHOG__ = posthog
  }

  const { user } = useAuth()
  let lastKey = ''

  const sync = () => {
    if (!user.value?.id) {
      if (lastKey !== '') {
        posthog.reset()
        lastKey = ''
      }
      return
    }
    const u = user.value
    const email = typeof u.email === 'string' ? u.email.trim() : ''
    const verified = isEmailVerified(u)
    const key = `${u.id}:${email}:${verified ? '1' : '0'}`
    if (key !== lastKey) {
      lastKey = key
      posthog.identify(u.id, {
        ...(email ? { email } : {}),
        email_verified: verified,
      })
    }
  }

  sync()
  watch(user, sync, { deep: true })

  nuxtApp.provide('posthog', posthog)
})
