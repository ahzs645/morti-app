import type posthog from 'posthog-js'
import type { AuthUser } from '~~/shared/domain/types'

type PostHog = typeof posthog

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

  let client: PostHog | null = null
  const queued: Array<(posthog: PostHog) => void> = []

  const lazyPosthog = new Proxy({} as PostHog, {
    get(_target, prop) {
      if (client) return client[prop as keyof PostHog]
      return (...args: unknown[]) => {
        queued.push((posthog) => {
          const value = posthog[prop as keyof PostHog]
          if (typeof value === 'function') {
            ;(value as (...args: unknown[]) => unknown).apply(posthog, args)
          }
        })
      }
    },
  })

  nuxtApp.provide('posthog', lazyPosthog)

  if (!posthogKey || typeof posthogKey !== 'string') return

  const idle = (cb: () => void) => {
    if (typeof window === 'undefined') return
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number)
    if (ric) ric(cb, { timeout: 2000 })
    else setTimeout(cb, 1500)
  }

  idle(async () => {
    const { default: posthog } = await import('posthog-js')
    client = posthog

    posthog.init(posthogKey, {
      api_host: posthogHost,
      ui_host: posthogUiHost,
      capture_pageview: 'history_change',
    })

    if (posthogDebug) {
      posthog.debug(true)
      ;(window as any).__POSTHOG__ = posthog
    }

    for (const run of queued.splice(0)) run(posthog)

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
  })
})
