import { Models, ServerClient } from 'postmark'
import { createError } from 'h3'

let postmarkClient: ServerClient | null = null

function getPostmarkClient(): ServerClient {
  const config = useRuntimeConfig()
  const token = String(process.env.POSTMARK_SERVER_TOKEN || config.postmarkServerToken || '')
  if (!token) {
    throw createError({
      statusCode: 503,
      statusMessage: 'POSTMARK_SERVER_TOKEN is not configured.',
    })
  }
  if (!postmarkClient) postmarkClient = new ServerClient(token)
  return postmarkClient
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const config = useRuntimeConfig()
  const from = String(process.env.POSTMARK_FROM_EMAIL || config.postmarkFromEmail || '')
  if (!from) {
    throw createError({
      statusCode: 503,
      statusMessage: 'POSTMARK_FROM_EMAIL is not configured.',
    })
  }

  const appName = 'Morti'
  const stream = String(process.env.POSTMARK_MESSAGE_STREAM || config.postmarkMessageStream || 'outbound')
  await getPostmarkClient().sendEmail({
    From: from,
    To: to,
    Subject: `Your ${appName} sign-in code`,
    TextBody: `Your ${appName} sign-in code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    HtmlBody: `<p>Your ${appName} sign-in code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    MessageStream: stream,
    Tag: 'otp',
    TrackOpens: false,
    TrackLinks: Models.LinkTrackingOptions.None,
  })
}
