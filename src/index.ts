import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import dotenv from 'dotenv'

import { profileTool } from './tools/profile'
import { searchTool } from './tools/search'
import { preferencesTool, getPreferencesTool } from './tools/preferences'
import { draftEmailsTool, sendEmailsTool, listCompaniesTool } from './tools/email'

dotenv.config()

const server = new McpServer({
  name: 'outreach-mcp',
  version: '1.0.0'
})

server.tool(
  'parse_resume',
  'Parse your resume PDF and save your profile (name, skills, target role, etc.)',
  {},
  profileTool
)

server.tool(
  'search_companies',
  'Search DuckDuckGo for companies hiring based on your resume and preferred locations. No API key required.',
  {},
  searchTool
)

server.tool(
  'get_preferences',
  'View your current job search preferences: locations, company types, and daily email limit.',
  {},
  getPreferencesTool
)

server.tool(
  'set_preferences',
  'Set your job search preferences: target locations and company types (e.g. startup, enterprise, agency).',
  {
    locations: z.array(z.string()).describe('List of cities, regions, or "Remote"'),
    company_types: z.array(z.string()).describe('Types of companies, e.g. startup, enterprise, agency, nonprofit')
  },
  preferencesTool
)

server.tool(
  'draft_emails',
  'Generate AI-written cold email drafts for queued companies. Review drafts before sending.',
  {},
  draftEmailsTool
)

server.tool(
  'send_emails',
  'Send pending email drafts via Gmail. Requires Gmail OAuth setup (run scripts/gmail-auth.ts).',
  {},
  sendEmailsTool
)

server.tool(
  'list_companies',
  'Show all companies in the pipeline grouped by status: queued, drafting, contacted.',
  {},
  listCompaniesTool
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
