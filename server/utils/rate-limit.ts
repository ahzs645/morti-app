import type { H3Event } from 'h3'
import { createError, getHeader, getRequestIP, setHeader } from 'h3'
import { dbQuery } from '~~/server/utils/db'
import { hmacValue } from '~~/server/utils/security'

const OTP_EMAIL_COOLDOWN_SECONDS = 60
const OTP_EMAIL_PER_HOUR = 5
const OTP_IP_PER_HOUR = 20
const OTP_IP_PER_DAY = 60

function hashedIp(event: H3Event): string {
  const ip = getRequestIP(event, { xForwardedFor: true }) || getHeader(event, 'x-real-ip') || 'unknown'
  return hmacValue(`ip:${ip}`)
}

function rateLimitError(event: H3Event, retryAfterSeconds: number): never {
  setHeader(event, 'Retry-After', retryAfterSeconds)
  throw createError({
    statusCode: 429,
    statusMessage: 'Too many codes requested. Try again later.',
  })
}

async function countEvents(where: string, params: unknown[]): Promise<number> {
  const result = await dbQuery<{ count: string }>(
    `SELECT count(*)::text AS count FROM email_send_events WHERE ${where}`,
    params,
  )
  return Number(result.rows[0]?.count ?? '0')
}

export async function assertOtpSendAllowed(event: H3Event, emailNormalized: string): Promise<string> {
  const ipHash = hashedIp(event)

  const cooldownCount = await countEvents(
    `purpose = 'otp' AND email_normalized = $1 AND created_at > now() - interval '${OTP_EMAIL_COOLDOWN_SECONDS} seconds'`,
    [emailNormalized],
  )
  if (cooldownCount > 0) rateLimitError(event, OTP_EMAIL_COOLDOWN_SECONDS)

  const emailHourCount = await countEvents(
    "purpose = 'otp' AND email_normalized = $1 AND created_at > now() - interval '1 hour'",
    [emailNormalized],
  )
  if (emailHourCount >= OTP_EMAIL_PER_HOUR) rateLimitError(event, 60 * 60)

  const ipHourCount = await countEvents(
    "purpose = 'otp' AND ip_hash = $1 AND created_at > now() - interval '1 hour'",
    [ipHash],
  )
  if (ipHourCount >= OTP_IP_PER_HOUR) rateLimitError(event, 60 * 60)

  const ipDayCount = await countEvents(
    "purpose = 'otp' AND ip_hash = $1 AND created_at > now() - interval '1 day'",
    [ipHash],
  )
  if (ipDayCount >= OTP_IP_PER_DAY) rateLimitError(event, 60 * 60 * 24)

  await dbQuery(
    'INSERT INTO email_send_events (email_normalized, ip_hash, purpose) VALUES ($1, $2, $3)',
    [emailNormalized, ipHash, 'otp'],
  )
  return ipHash
}
