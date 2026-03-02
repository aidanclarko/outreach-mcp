import { client } from '../db/client'

interface PrefsArgs {
  locations: string[]
  company_types: string[]
}

export async function getPreferencesTool(_args: Record<string, never>) {
  const prefs = client.get('SELECT * FROM preferences WHERE id = 1') as
    | { locations: string; company_types: string; daily_limit: number; updated_at: string }
    | undefined

  if (!prefs) {
    return {
      content: [{ type: 'text' as const, text: 'No preferences set yet. Use set_preferences to configure your job search.' }]
    }
  }

  const locations: string[] = JSON.parse(prefs.locations || '[]')
  const companyTypes: string[] = JSON.parse(prefs.company_types || '[]')

  return {
    content: [{
      type: 'text' as const,
      text: [
        `Locations: ${locations.length ? locations.join(', ') : '(none)'}`,
        `Company types: ${companyTypes.length ? companyTypes.join(', ') : '(none)'}`,
        `Daily email limit: ${prefs.daily_limit}`,
        `Last updated: ${prefs.updated_at}`
      ].join('\n')
    }]
  }
}

export async function preferencesTool(args: PrefsArgs) {
  const { locations, company_types } = args

  client.run(
    `INSERT OR REPLACE INTO preferences (id, locations, company_types, updated_at)
     VALUES (1, ?, ?, CURRENT_TIMESTAMP)`,
    [JSON.stringify(locations), JSON.stringify(company_types)]
  )

  return {
    content: [{
      type: 'text' as const,
      text: `Preferences saved!\nLocations: ${locations.join(', ')}\nCompany types: ${company_types.join(', ')}`
    }]
  }
}
