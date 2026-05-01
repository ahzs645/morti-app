import { getCurrentUser } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  return { user: await getCurrentUser(event) }
})
