import OpenAI from 'openai'
import dotenv from 'dotenv'

dotenv.config()

export const ai = new OpenAI({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_BASE_URL
})

export const model = process.env.AI_MODEL || 'claude-sonnet-4-20250514'