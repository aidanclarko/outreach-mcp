import Database from 'better-sqlite3'
import { schema } from './schema'
import dotenv from 'dotenv'

dotenv.config()

const isAutoMode = !!(process.env.TURSO_URL && process.env.TURSO_TOKEN)

let db: Database.Database

function getDB(): Database.Database {
  if (!db) {
    db = new Database('outreach.db')
    db.exec(schema)
  }
  return db
}


export const client = {
  run(sql: string, params: any[] = []) {
    return getDB().prepare(sql).run(...params)
  },

  get(sql: string, params: any[] = []) {
    return getDB().prepare(sql).get(...params)
  },

  all(sql: string, params: any[] = []) {
    return getDB().prepare(sql).all(...params)
  },

  // check if in auto mode
  mode: isAutoMode ? 'auto' : 'easy'
}

export type DB = typeof client