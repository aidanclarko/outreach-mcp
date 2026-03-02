#!/usr/bin/env tsx
// Run once to get a Gmail refresh token:
//   npx tsx scripts/gmail-auth.ts

import { google } from 'googleapis'
import http from 'http'
import dotenv from 'dotenv'

dotenv.config()

const REDIRECT_URI = 'http://localhost:3000/callback'
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly'
]

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env')
    console.error('\nCreate OAuth2 credentials at:')
    console.error('  https://console.cloud.google.com/apis/credentials')
    console.error('\nSet redirect URI to: http://localhost:3000/callback')
    process.exit(1)
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  })

  console.log('\nStep 1 — Open this URL in your browser:\n')
  console.log(authUrl)
  console.log('\nStep 2 — Waiting for callback on http://localhost:3000/callback...\n')

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return

      const url = new URL(req.url, 'http://localhost:3000')
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(`<h1>Auth error: ${error}</h1><p>You can close this tab.</p>`)
        server.close()
        reject(new Error(`OAuth error: ${error}`))
        return
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h1>Auth successful!</h1><p>You can close this tab and return to the terminal.</p>')
        server.close()
        resolve(code)
      }
    })

    server.listen(3000, () => {
      console.log('Listening on http://localhost:3000 ...')
    })
  })

  const { tokens } = await oauth2Client.getToken(code)

  console.log('\nStep 3 — Add this to your .env file:\n')
  if (tokens.refresh_token) {
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`)
    console.log('\nThen restart the MCP server.')
  } else {
    console.log('Warning: No refresh_token received.')
    console.log('Revoke app access and re-run: https://myaccount.google.com/permissions')
  }
}

main().catch(console.error)
