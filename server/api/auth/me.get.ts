import { getCurrentUser, getLocalAuthBypassUser, isLocalAuthBypassAllowed } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  if (isLocalAuthBypassAllowed(event)) return { user: getLocalAuthBypassUser() }
  const user = await getCurrentUser(event)
  return { user }
})
