import { createError, getHeader, readBody } from 'h3'
import { dbQuery } from '~~/server/utils/db'
import { sendOtpEmail } from '~~/server/utils/email'
import { assertOtpSendAllowed } from '~~/server/utils/rate-limit'
import { createId, hashOtpCode, isValidEmail, makeOtpCode, normalizeEmail } from '~~/server/utils/security'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string }>(event)
  const email = String(body?.email || '').trim()
  const emailNormalized = normalizeEmail(email)
  if (!isValidEmail(emailNormalized)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address.' })
  }

  const ipHash = await assertOtpSendAllowed(event, emailNormalized)
  const otpId = createId('otp')
  const code = makeOtpCode()

  await dbQuery(
    `
      INSERT INTO otp_challenges (id, email, email_normalized, code_hash, ip_hash, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, now() + interval '10 minutes')
    `,
    [
      otpId,
      email,
      emailNormalized,
      hashOtpCode(otpId, code),
      ipHash,
      String(getHeader(event, 'user-agent') || '').slice(0, 500),
    ],
  )

  await sendOtpEmail(email, code)

  return {
    otpId,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }
})
