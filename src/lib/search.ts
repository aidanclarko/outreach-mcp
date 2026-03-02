import { client } from '../db/client'
import { ai, model } from './handleAI'

interface Profile {
  skills: string
  experience_years: number
  target_role: string
  summary: string
}

interface CompanyResult {
  name: string
  website: string
  location: string
  description: string
}

// ─── Job board domain blacklist ───────────────────────────────────────────────

const JOB_BOARD_DOMAINS = new Set([
  'snagajob.com', 'indeed.com', 'glassdoor.com', 'ziprecruiter.com', 'monster.com',
  'careerbuilder.com', 'simplyhired.com', 'builtinsf.com', 'builtinchicago.com',
  'builtinnyc.com', 'builtinaustin.com', 'linkedin.com', 'workable.com', 'lever.co',
  'greenhouse.io', 'ashbyhq.com', 'bamboohr.com', 'jobvite.com', 'icims.com'
])

function rootDomain(url: string): string {
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
    return host.replace(/^www\./, '')
  } catch {
    return url.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0]
  }
}

function isValidContactEmail(email: string, companyWebsite: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  if (JOB_BOARD_DOMAINS.has(domain)) return false
  const siteDomain = rootDomain(companyWebsite)
  if (!siteDomain) return false
  return domain === siteDomain || domain.endsWith('.' + siteDomain)
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: controller.signal
    })
    clearTimeout(timer)
    if (!res.ok) return null
    return res.text()
  } catch {
    return null
  }
}

async function serpSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const key = process.env.SERPAPI_KEY
  if (!key) throw new Error('SERPAPI_KEY not set')
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&engine=google&num=10&api_key=${key}`
  const res = await fetchHtml(url)
  if (!res) throw new Error('SerpApi fetch failed')
  const data = JSON.parse(res)
  return (data.organic_results ?? []).map((r: { title: string; link: string; snippet?: string }) => ({
    title: r.title ?? '',
    url: r.link ?? '',
    snippet: r.snippet ?? ''
  }))
}

// ─── Email extraction ────────────────────────────────────────────────────────

const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g

const SKIP = ['noreply', 'no-reply', 'donotreply', 'example', 'sentry', 'wixpress',
              'cloudflare', '.png', '.jpg', '.gif', '.svg']

// Higher score = better cold-email target
function emailScore(email: string): number {
  const local = email.split('@')[0].toLowerCase()
  if (SKIP.some(s => email.includes(s))) return -1
  if (/^(hiring|careers|jobs|talent|recruit)/.test(local)) return 4
  if (/^(hello|hey|founders?|cto|ceo|eng|engineering|team)/.test(local)) return 3
  if (/^(info|contact|get(intouch)?|reach)/.test(local)) return 2
  if (/^(support|help|admin|press|media|sales)/.test(local)) return 1
  return 0
}

function extractEmails(html: string): string[] {
  const matches = html.match(EMAIL_RE) ?? []
  return [...new Set(matches)]
    .filter(e => emailScore(e) >= 0)
    .sort((a, b) => emailScore(b) - emailScore(a))
}

// ─── Contact email finder ────────────────────────────────────────────────────

async function scrapeWebsiteForEmail(baseUrl: string): Promise<string | null> {
  const base = baseUrl.startsWith('http') ? baseUrl.replace(/\/$/, '') : `https://${baseUrl}`
  const paths = ['', '/contact', '/contact-us', '/about', '/about-us', '/team', '/careers', '/jobs']

  for (const path of paths) {
    const html = await fetchHtml(base + path)
    if (!html) continue
    const emails = extractEmails(html)
    if (emails.length > 0) return emails[0]
    await new Promise(r => setTimeout(r, 400))
  }
  return null
}

async function serpEmailSearch(companyName: string, domain: string): Promise<string | null> {
  try {
    const query = `"${companyName}" hiring contact email site:${domain}`
    const results = await serpSearch(query)
    const text = results.map(r => r.snippet).join(' ')
    const emails = extractEmails(text).filter(e => e.includes(domain))
    return emails[0] ?? null
  } catch {
    return null
  }
}

async function aiGuessEmail(companyName: string, website: string, role: string): Promise<string | null> {
  try {
    const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname
    const response = await ai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Given a company name, domain, and target role, return the single most likely email address to cold-email about a job. Return ONLY the email address, nothing else.'
        },
        {
          role: 'user',
          content: `Company: ${companyName}\nDomain: ${domain}\nRole: ${role}`
        }
      ]
    })
    const email = response.choices[0].message.content!.trim().toLowerCase()
    return EMAIL_RE.test(email) ? email : null
  } catch {
    return null
  }
}

async function findContactEmail(company: CompanyResult, role: string): Promise<string | null> {
  // 1. Scrape the company website
  const scraped = await scrapeWebsiteForEmail(company.website)
  if (scraped && isValidContactEmail(scraped, company.website)) return scraped

  // 2. SERP search scoped to their domain
  try {
    const domain = rootDomain(company.website)
    const serpEmail = await serpEmailSearch(company.name, domain)
    if (serpEmail && isValidContactEmail(serpEmail, company.website)) return serpEmail
  } catch { /* invalid URL, skip */ }

  // 3. AI-generated best guess
  const guessed = await aiGuessEmail(company.name, company.website, role)
  if (guessed && isValidContactEmail(guessed, company.website)) return guessed

  return null
}

// ─── JSON extraction helper ──────────────────────────────────────────────────

function extractJsonArray(text: string): string {
  const stripped = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  const start = stripped.indexOf('[')
  const end = stripped.lastIndexOf(']')
  if (start !== -1 && end !== -1) return stripped.slice(start, end + 1)
  return stripped
}

// ─── Query generation ────────────────────────────────────────────────────────

async function generateQueries(profile: Profile, locations: string[]): Promise<string[]> {
  const skills = JSON.parse(profile.skills || '[]') as string[]
  const response = await ai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'Generate 6 focused search queries to find companies actively hiring for this role. Cover: (1) role+location, (2) specific skills+location, (3) startup companies in the area, (4) nonprofit/enterprise variants, (5) remote options, (6) a specific skill combo with company type. Target company career pages, job listings, and company directories — not job boards like Indeed or LinkedIn. Return ONLY a JSON array of 6 strings. No markdown, no explanation.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          role: profile.target_role,
          skills: skills.slice(0, 5).join(', '),
          experience_years: profile.experience_years,
          locations: locations.slice(0, 3).join(', ')
        })
      }
    ]
  })
  return JSON.parse(extractJsonArray(response.choices[0].message.content!.trim()))
}

async function extractCompanies(
  results: Array<{ title: string; url: string; snippet: string }>,
  role: string,
  locations: string[]
): Promise<CompanyResult[]> {
  const response = await ai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `Extract real companies from these search results that are likely hiring a ${role} in ${locations.join(' or ')}.

Rules:
- Only include companies headquartered in or actively hiring in ${locations.join(' or ')}, or that are explicitly remote-friendly
- Skip job boards and aggregators (Indeed, LinkedIn, Glassdoor, ZipRecruiter, etc.)
- Skip staffing agencies, IT consulting farms, and offshore outsourcing companies
- Skip companies with no clear tech product or engineering team
- Return at most 12 companies

Return ONLY a JSON array of objects: { name, website (full URL), location, description (1 sentence about what they build) }.`
      },
      { role: 'user', content: JSON.stringify(results) }
    ]
  })
  return JSON.parse(extractJsonArray(response.choices[0].message.content!.trim()))
}

// ─── Hard post-filters ───────────────────────────────────────────────────────

function matchesTargetLocations(companyLocation: string, targets: string[]): boolean {
  const loc = companyLocation.toLowerCase()
  if (loc.includes('remote')) return true
  return targets
    .filter(t => t.toLowerCase() !== 'remote')
    .some(target => {
      const city = target.split(',')[0].trim().toLowerCase()
      return loc.includes(city)
    })
}

const CONSULTING_KEYWORDS = [
  'staffing', 'consulting', 'outsourcing', 'offshore', 'it services',
  'managed services', 'recruitment', 'recruiting', 'body shop', 'contract staffing',
  'it consulting', 'it solutions provider', 'system integrator'
]

function isConsultingFirm(company: CompanyResult): boolean {
  const text = (company.name + ' ' + company.description).toLowerCase()
  return CONSULTING_KEYWORDS.some(kw => text.includes(kw))
}

// ─── AI quality validation pass ───────────────────────────────────────────────

async function validateCompanies(
  companies: CompanyResult[],
  role: string,
  locations: string[]
): Promise<CompanyResult[]> {
  if (companies.length === 0) return []

  try {
    const response = await ai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `Score each company 1–5 as a cold-email target for a ${role} in ${locations.join(' or ')}.

Scoring:
5 = Real product company, clearly has a tech/engineering team, location matches
4 = Likely product company, plausible tech hiring, approximate location match
3 = Unclear but possible; worth contacting
2 = Staffing agency, consulting, outsourcing, or weak location match
1 = Job board, aggregator, wrong industry, or clearly not relevant

Return ONLY a JSON array: [{ "name": "...", "score": N }]. No markdown.`
        },
        {
          role: 'user',
          content: JSON.stringify(
            companies.map(c => ({ name: c.name, website: c.website, location: c.location, description: c.description }))
          )
        }
      ]
    })

    const scores = JSON.parse(
      extractJsonArray(response.choices[0].message.content!.trim())
    ) as Array<{ name: string; score: number }>

    const scoreMap = new Map(scores.map(s => [s.name, s.score]))
    return companies.filter(c => (scoreMap.get(c.name) ?? 0) >= 3)
  } catch {
    // If validation fails, return all companies rather than losing results
    return companies
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function searchCompanies(): Promise<{
  found: number
  companies: Array<{ name: string; email: string | null }>
}> {
  const profile = client.get('SELECT * FROM profile LIMIT 1') as Profile | undefined
  if (!profile) throw new Error('No profile found. Run the profile tool first.')

  const prefs = client.get('SELECT * FROM preferences LIMIT 1') as { locations: string } | undefined
  const locations: string[] = prefs?.locations ? JSON.parse(prefs.locations) : ['Remote']

  const queries = await generateQueries(profile, locations)

  const allResults: Array<{ title: string; url: string; snippet: string }> = []
  for (const query of queries) {
    try {
      const results = await serpSearch(query)
      allResults.push(...results)
    } catch (err) {
      console.error(`Search failed for "${query}":`, err)
    }
  }

  if (allResults.length === 0) return { found: 0, companies: [] }

  // Deduplicate
  const seen = new Set<string>()
  const unique = allResults.filter(r => !seen.has(r.url) && seen.add(r.url))

  const companies = await extractCompanies(unique, profile.target_role, locations)
  const validated = await validateCompanies(companies, profile.target_role, locations)
  const filtered = validated
    .filter(c => matchesTargetLocations(c.location, locations))
    .filter(c => !isConsultingFirm(c))

  const saved: Array<{ name: string; email: string | null }> = []

  for (const company of filtered) {
    client.run(
      `INSERT OR IGNORE INTO companies (name, website, location, description) VALUES (?, ?, ?, ?)`,
      [company.name, company.website, company.location, company.description]
    )

    const email = await findContactEmail(company, profile.target_role)

    if (email) {
      client.run(
        `UPDATE companies SET contact_email = ? WHERE name = ? AND contact_email IS NULL`,
        [email, company.name]
      )
    }

    saved.push({ name: company.name, email })
  }

  return { found: saved.length, companies: saved }
}
