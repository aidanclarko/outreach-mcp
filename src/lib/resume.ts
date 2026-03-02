import fs from 'fs'
import { PDFParse } from 'pdf-parse'
import {ai, model } from "./handleAI"

export default async function extractResume(): Promise<any> {
  try {
    const buffer = fs.readFileSync('./resume.pdf')
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const pdf = await parser.getText()
    const res: string = pdf.text
    
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