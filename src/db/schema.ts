export const schema = `
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT,
    skills TEXT,
    experience_years INTEGER,
    target_role TEXT,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY,
    locations TEXT,
    company_types TEXT,
    daily_limit INTEGER DEFAULT 3,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    website TEXT,
    location TEXT,
    type TEXT,
    description TEXT,
    contact_email TEXT,
    contact_name TEXT,
    status TEXT DEFAULT 'queued',
    found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    subject TEXT,
    body TEXT,
    sent_at DATETIME,
    gmail_thread_id TEXT,
    type TEXT DEFAULT 'cold',
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS daily_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    emails_sent INTEGER DEFAULT 0
  );
`;