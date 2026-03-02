import { google } from 'googleapis'
import dotenv from 'dotenv'

dotenv.config()

function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Gmail credentials not configured. Run: npx tsx scripts/gmail-auth.ts'
    )
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3000/callback')
  oauth2.setCredentials({ refresh_token: refreshToken })
  return oauth2
}

interface Attachment {
  filename: string
  mimeType: string
  data: Buffer
}

function buildRawMessage(from: string, to: string, subject: string, body: string, attachment?: Attachment): string {
  if (!attachment) {
    return [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body
    ].join('\r\n')
  }

  const boundary = `boundary_${Date.now()}`
  const b64 = attachment.data.toString('base64').replace(/(.{76})/g, '$1\r\n')

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    b64,
    `--${boundary}--`
  ].join('\r\n')
}

async function getSenderEmail(): Promise<string> {
  const auth = getOAuth2Client()
  const gmail = google.gmail({ version: 'v1', auth })
  const profile = await gmail.users.getProfile({ userId: 'me' })
  return profile.data.emailAddress ?? ''
}

export async function sendEmail(to: string, subject: string, body: string, attachment?: Attachment): Promise<string> {
  const auth = getOAuth2Client()
  const gmail = google.gmail({ version: 'v1', auth })
  const from = await getSenderEmail()
  const raw = Buffer.from(buildRawMessage(from, to, subject, body, attachment)).toString('base64url')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  })

  return res.data.threadId ?? ''
}

export async function createDraft(to: string, subject: string, body: string): Promise<string> {
  const auth = getOAuth2Client()
  const gmail = google.gmail({ version: 'v1', auth })
  const from = await getSenderEmail()
  const raw = Buffer.from(buildRawMessage(from, to, subject, body)).toString('base64url')

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw } }
  })

  return res.data.id ?? ''
}
