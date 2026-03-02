import fs from 'fs'
import {ai, model } from "./handleAI"

export default async function extractResume(): Promise<any> {
  try {
    const pdfParse = require('pdf-parse')
    const buffer = fs.readFileSync('./resume.pdf')
    const pdf = await pdfParse(buffer)
    const res: string = pdf.text.toString()
    
    const response = await ai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'Extract from this resume and return ONLY valid JSON with fields: name, email, skills (array), experience_years (number), target_role, summary. Return nothing else, no markdown, no backticks.'
        },
        { role: 'user', content: res }
      ]
    })

    const result = response.choices[0].message.content
    return JSON.parse(result!)

  } catch (err) {
    throw new Error(`Failed to parse resume: ${err}`)
  }
}