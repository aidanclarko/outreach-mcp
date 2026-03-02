import { searchCompanies } from '../lib/search'

export async function searchTool(_args: Record<string, never>) {
  try {
    const result = await searchCompanies()

    if (result.found === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No new companies found. Try updating your preferences or check that your profile is set up.' }]
      }
    }

    const lines = result.companies.map(c =>
      c.email ? `• ${c.name} — ${c.email}` : `• ${c.name} — (no email found)`
    )

    return {
      content: [{
        type: 'text' as const,
        text: `Found ${result.found} new companies:\n${lines.join('\n')}`
      }]
    }
  } catch (err) {
    return {
      content: [{ type: 'text' as const, text: `Search failed: ${err}` }]
    }
  }
}
