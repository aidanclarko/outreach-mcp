import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import dotenv from 'dotenv'


dotenv.config()

const server = new McpServer({
  name: 'outreach-mcp',
  version: '1.0.0'
})
