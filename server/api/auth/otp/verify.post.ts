import { createError, readBody } from 'h3'
import { authUserFromRow, createAuthSession } from '~~/server/utils/auth'
import { dbQuery, withDbClient } from '~~/server/utils/db'
import { createId, hashOtpCode, isValidEmail, normalizeEmail, normalizeOtpCode, safeEqual } from '~~/server/utils/security'

interface OtpRow {
  id: string
  email: string
  email_normalized: string
  code_hash: string
  attempts: number
  consumed_at: Date | string | null
  expires_at: Date | string
}

interface UserRow {
  id: string
  email: string
  email_verified_at: Date | string | null
  is_admin: boolean
  created_at: Date | string
  updated_at: Date | string
}

function invalidCode(): never {
  throw createError({ statusCode: 400, statusMessage: 'Invalid or expired code.' })
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ otpId?: string, code?: string }>(event)
  const otpId = String(body?.otpId || '')
  const code = normalizeOtpCode(String(body?.code || ''))
  if (!otpId || code.length !== 6) invalidCode()

  const otpResult = await dbQuery<OtpRow>(
    `
      SELECT id, email, email_normalized, code_hash, attempts, consumed_at, expires_at
      FROM otp_challenges
      WHERE id = $1
      LIMIT 1
    `,
    [otpId],
  )
  const challenge = otpResult.rows[0]
  if (!challenge) invalidCode()
  if (challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now()) invalidCode()
  if (challenge.attempts >= 5) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts for this code. Request a new one.' })
  }

  const expected = hashOtpCode(challenge.id, code)
  if (!safeEqual(expected, challenge.code_hash)) {
    await dbQuery('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id])
    invalidCode()
  }

  const emailNormalized = normalizeEmail(challenge.email_normalized)
  if (!isValidEmail(emailNormalized)) invalidCode()

  const user = await withDbClient(async (client) => {
    await client.query('BEGIN')
    try {
      await client.query('UPDATE otp_challenges SET consumed_at = now(), attempts = attempts + 1 WHERE id = $1', [challenge.id])
      const existing = await client.query<UserRow>(
        `
          SELECT id, email, email_verified_at, is_admin, created_at, updated_at
          FROM users
          WHERE email_normalized = $1
          LIMIT 1
        `,
        [emailNormalized],
      )

      let row = existing.rows[0]
      if (row) {
        const updated = await client.query<UserRow>(
          `
            UPDATE users
            SET email = $2,
                email_verified_at = COALESCE(email_verified_at, now()),
                updated_at = now()
            WHERE id = $1
            RETURNING id, email, email_verified_at, is_admin, created_at, updated_at
          `,
          [row.id, challenge.email],
        )
        row = updated.rows[0]
      }
      else {
        const inserted = await client.query<UserRow>(
          `
            INSERT INTO users (id, email, email_normalized, email_verified_at)
            VALUES ($1, $2, $3, now())
            RETURNING id, email, email_verified_at, is_admin, created_at, updated_at
          `,
          [createId('usr'), challenge.email, emailNormalized],
        )
        row = inserted.rows[0]
      }

      await client.query('COMMIT')
      return authUserFromRow(row)
    }
    catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  })

  await createAuthSession(event, user.id)
  return { user }
})
