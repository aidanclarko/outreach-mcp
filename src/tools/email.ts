import fs from 'fs'
import { client } from '../db/client'
import { generateColdEmail } from '../lib/emailWriter'
import { sendEmail } from '../lib/gmail'

interface Profile {
  id: number
  name: string
  email: string
  skills: string
  experience_years: number
  target_role: string
  summary: string
}

interface Company {
  id: number
  name: string
  website: string
  location: string
  description: string
  contact_email: string
  status: string
}

interface EmailRow {
  id: number
  company_id: number
  subject: string
  body: string
  sent_at: string | null
  gmail_thread_id: string | null
  contact_email: string
  company_name: string
}

export async function draftEmailsTool(_args: Record<string, never>) {
  try {
    const profile = client.get('SELECT * FROM profile LIMIT 1') as Profile | undefined
    if (!profile) {
      return { content: [{ type: 'text' as const, text: 'No profile found. Run parse_resume first.' }] }
    }

    const prefs = client.get('SELECT daily_limit FROM preferences WHERE id = 1') as
      | { daily_limit: number }
      | undefined
    const limit = prefs?.daily_limit ?? 3

    const companies = client.all(
      `SELECT * FROM companies WHERE status = 'queued' AND contact_email IS NOT NULL LIMIT ?`,
      [limit]
    ) as Company[]

    if (companies.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: 'No queued companies with contact emails. Run search_companies first.'
        }]
      }
    }

    const drafts: Array<{ company: string; subject: string; preview: string }> = []

    for (const company of companies) {
      const { subject, body } = await generateColdEmail(profile, company)

      client.run(
        `INSERT INTO emails (company_id, subject, body) VALUES (?, ?, ?)`,
        [company.id, subject, body]
      )

      client.run(
        `UPDATE companies SET status = 'drafting' WHERE id = ?`,
        [company.id]
      )

      drafts.push({ company: company.name, subject, preview: body.slice(0, 120) + '…' })
    }

    const lines = drafts.map(d =>
      `• ${d.company}\n  Subject: ${d.subject}\n  Preview: ${d.preview}`
    )

    return {
      content: [{
        type: 'text' as const,
        text: `Drafted ${drafts.length} email(s). Review and call send_emails to send.\n\n${lines.join('\n\n')}`
      }]
    }
  } catch (err) {
    return { content: [{ type: 'text' as const, text: `Draft failed: ${err}` }] }
  }
}

export async function sendEmailsTool(_args: Record<string, never>) {
  try {
    const pending = client.all(
      `SELECT e.*, c.contact_email, c.name as company_name
       FROM emails e
       JOIN companies c ON c.id = e.company_id
       WHERE e.sent_at IS NULL`
    ) as EmailRow[]

    if (pending.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No pending drafts to send. Run draft_emails first.' }]
      }
    }

    let resumeAttachment: { filename: string; mimeType: string; data: Buffer } | undefined
    try {
      resumeAttachment = {
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
        data: fs.readFileSync('./resume.pdf')
      }
    } catch {
      // resume.pdf not found — send without attachment
    }

    const sent: string[] = []
    const failed: string[] = []

    for (const email of pending) {
      try {
        const threadId = await sendEmail(email.contact_email, email.subject, email.body, resumeAttachment)

        client.run(
          `UPDATE emails SET sent_at = CURRENT_TIMESTAMP, gmail_thread_id = ? WHERE id = ?`,
          [threadId, email.id]
        )

        client.run(
          `UPDATE companies SET status = 'contacted' WHERE id = ?`,
          [email.company_id]
        )

        sent.push(email.company_name)
      } catch (err) {
        failed.push(`${email.company_name}: ${err}`)
      }
    }

    // Log to daily_log
    const today = new Date().toISOString().slice(0, 10)
    const logRow = client.get(
      `SELECT id, emails_sent FROM daily_log WHERE date = ?`,
      [today]
    ) as { id: number; emails_sent: number } | undefined

    if (logRow) {
      client.run(
        `UPDATE daily_log SET emails_sent = ? WHERE id = ?`,
        [logRow.emails_sent + sent.length, logRow.id]
      )
    } else {
      client.run(
        `INSERT INTO daily_log (date, emails_sent) VALUES (?, ?)`,
        [today, sent.length]
      )
    }

    const lines = [
      sent.length > 0 ? `Sent (${sent.length}): ${sent.join(', ')}` : null,
      failed.length > 0 ? `Failed (${failed.length}):\n${failed.join('\n')}` : null
    ].filter(Boolean) as string[]

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') || 'Nothing sent.' }]
    }
  } catch (err) {
    return { content: [{ type: 'text' as const, text: `Send failed: ${err}` }] }
  }
}

export async function listCompaniesTool(_args: Record<string, never>) {
  try {
    const companies = client.all(
      `SELECT * FROM companies ORDER BY found_at DESC`
    ) as Company[]

    if (companies.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No companies yet. Run search_companies first.' }]
      }
    }

    const groups: Record<string, Company[]> = {}
    for (const c of companies) {
      const status = c.status ?? 'queued'
      if (!groups[status]) groups[status] = []
      groups[status].push(c)
    }

    const STATUS_LABELS: Record<string, string> = {
      queued:    'QUEUED    — ready to draft',
      drafting:  'DRAFTING  — emails written, pending send',
      contacted: 'CONTACTED — emails sent'
    }

    const sections = Object.entries(groups).map(([status, list]) => {
      const label = STATUS_LABELS[status] ?? status.toUpperCase()
      const lines = list.map(c => {
        const email = c.contact_email ? ` — ${c.contact_email}` : ''
        return `  • ${c.name}${email}`
      })
      return `${label} (${list.length})\n${lines.join('\n')}`
    })

    return {
      content: [{ type: 'text' as const, text: sections.join('\n\n') }]
    }
  } catch (err) {
    return { content: [{ type: 'text' as const, text: `List failed: ${err}` }] }
  }
}
