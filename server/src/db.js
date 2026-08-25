const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');   // równoległy odczyt podczas zapisu
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL'); // bezpieczne przy WAL, zauważalnie szybsze
db.pragma('busy_timeout = 5000');  // zamiast natychmiastowego SQLITE_BUSY

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

/* ------------------------------------------------------------------ *
 * Migracje — idempotentne, wykonywane przy każdym starcie.
 * Dzięki temu `git pull && pm2 restart` wystarczy do aktualizacji bazy;
 * nie ma osobnego kroku migracyjnego do zapomnienia podczas wdrożenia.
 * ------------------------------------------------------------------ */

function columnNames(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function addColumn(table, column, definition) {
  if (!columnNames(table).includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// token_version — pozwala unieważnić WSZYSTKIE wydane tokeny danego konta.
// Bez tego zmiana (lub administracyjny reset) hasła nie wyrzucałaby z aplikacji
// osoby, która przejęła sesję: skradziony token JWT działałby do wygaśnięcia.
addColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
// must_change_password — konto założone przez seed lub po resecie hasła przez
// administratora musi ustawić własne hasło przy pierwszym logowaniu.
addColumn('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'created_at', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'last_login_at', 'TEXT');
addColumn('tasks', 'updated_at', 'TEXT');

db.exec(`
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifs_user_at ON notifications(user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`);

// Przypisania zadań w osobnej tabeli: pozwala odpytać "zadania osoby X"
// indeksem zamiast wczytywania wszystkich zadań i parsowania JSON-a w Node.
// Kolumna tasks.assignees zostaje wyłącznie jako materiał do backfillu.
db.exec(`
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
`);

const backfillNeeded = db.prepare('SELECT COUNT(*) AS n FROM task_assignees').get().n === 0
  && db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n > 0;

if (backfillNeeded) {
  const rows = db.prepare('SELECT id, assignees FROM tasks').all();
  const insert = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)');
  const run = db.transaction(() => {
    for (const row of rows) {
      let list = [];
      try { list = JSON.parse(row.assignees || '[]'); } catch { list = []; }
      for (const userId of list) if (userId) insert.run(row.id, userId);
    }
  });
  run();
  console.log(`[db] migracja: przeniesiono przypisania ${rows.length} zadań do tabeli task_assignees`);
}

module.exports = db;
