const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/gezet.db';
const resolved = path.resolve(DB_PATH);
fs.mkdirSync(path.dirname(resolved), { recursive: true });

const db = new Database(resolved);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  department TEXT,
  location TEXT,
  brand TEXT,
  model TEXT,
  campaign_period TEXT,
  triggers TEXT NOT NULL DEFAULT '[]',
  materials TEXT NOT NULL DEFAULT '[]',
  materials_other TEXT,
  listing_link TEXT,
  event_name TEXT,
  event_date TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  assignees TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  draft_text TEXT,
  transfer_log TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL,
  request_id TEXT,
  task_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_request ON tasks(request_id);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id);
`);

module.exports = db;
