import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { createError } from 'h3'

export function getAuthSecret(): string {
  const config = useRuntimeConfig()
  const secret = String(process.env.AUTH_SECRET || config.authSecret || '')
  if (secret.length < 32) {
    throw createError({
      statusCode: 500,
      statusMessage: 'AUTH_SECRET must be set to at least 32 characters.',
    })
  }
  return secret
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacValue(value: string): string {
  return createHmac('sha256', getAuthSecret()).update(value).digest('hex')
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

export function makeOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function normalizeOtpCode(code: string): string {
  return code.replace(/\D/g, '').slice(0, 6)
}

export function hashOtpCode(challengeId: string, code: string): string {
  return hmacValue(`otp:${challengeId}:${normalizeOtpCode(code)}`)
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
