import { ai, model } from './handleAI'

interface Profile {
  name: string
  skills: string // JSON array
  target_role: string
  summary: string
}

interface Company {
  name: string
  website: string
  location: string
  description: string
}

function extractJson(text: string): string {
  return text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
}

export async function generateColdEmail(
  profile: Profile,
  company: Company
): Promise<{ subject: string; body: string }> {
  const skills = JSON.parse(profile.skills || '[]') as string[]

  const response = await ai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `You write concise, personalized cold emails for job seekers. Write a professional but human cold email (~150 words) from a candidate to a company.
Mention 2-3 specific skills relevant to the company's work.
Include a line noting that a resume is attached.
End with a clear, low-pressure call to action (e.g. "Would you be open to a quick chat?").
Return ONLY valid JSON: { "subject": "...", "body": "..." }`
      },
      {
        role: 'user',
        content: JSON.stringify({
          candidate: {
            name: profile.name,
            role: profile.target_role,
            skills: skills.slice(0, 6),
            summary: profile.summary
          },
          company: {
            name: company.name,
            website: company.website,
            location: company.location,
            description: company.description
          }
        })
      }
    ]
  })

  const raw = response.choices[0].message.content!.trim()
  return JSON.parse(extractJson(raw))
}
