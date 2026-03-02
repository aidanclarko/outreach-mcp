import extractResume from "../lib/resume"
import { client } from "../db/client"

export async function profileTool() {
  try {
    const result = await extractResume()
    
    client.run(
      `INSERT OR REPLACE INTO profile (name, email, skills, experience_years, target_role, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [result.name, result.email, JSON.stringify(result.skills), result.experience_years, result.target_role, result.summary]
    )

    return {
      content: [{
        type: 'text',
        text: `Profile saved!\nName: ${result.name}\nRole: ${result.target_role}\nSkills: ${result.skills.join(', ')}`
      }]
    }

  } catch (err) {
    return {
      content: [{
        type: 'text',
        text: `Failed to parse resume: ${err}`
      }]
    }
  }
}