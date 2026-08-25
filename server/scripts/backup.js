#!/usr/bin/env node
/**
 * Kopia zapasowa bazy SQLite:
 *
 *   npm run backup                 # → ./backups/gezet-RRRR-MM-DDTgg-mm.db
 *   npm run backup -- /sciezka/do/katalogu
 *
 * Używa wbudowanego mechanizmu SQLite (VACUUM INTO), a nie zwykłego `cp`.
 * To istotne: przy włączonym trybie WAL skopiowanie samego pliku .db podczas
 * pracy aplikacji daje kopię niespójną — część zapisów siedzi jeszcze w pliku
 * -wal. VACUUM INTO tworzy poprawną, zwartą kopię bez zatrzymywania serwera.
 *
 * Skrypt kasuje kopie starsze niż BACKUP_KEEP_DAYS (domyślnie 30 dni).
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const config = require('../src/config');

const targetDir = path.resolve(process.argv[2] || path.join(path.dirname(config.dbPath), '..', 'backups'));
const keepDays = Number.parseInt(process.env.BACKUP_KEEP_DAYS || '30', 10);

fs.mkdirSync(targetDir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const target = path.join(targetDir, `gezet-${stamp}.db`);

if (fs.existsSync(target)) {
  console.log(`Kopia ${target} już istnieje — pomijam.`);
  process.exit(0);
}

// VACUUM INTO nie przyjmuje parametru wiązanego, a ścieżka pochodzi z
// argumentu wywołania — escapujemy apostrofy zgodnie ze składnią SQL.
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

const size = fs.statSync(target).size;
console.log(`✓ Kopia zapasowa: ${target} (${(size / 1024).toFixed(0)} KB)`);

if (Number.isFinite(keepDays) && keepDays > 0) {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const file of fs.readdirSync(targetDir)) {
    if (!/^gezet-.*\.db$/.test(file)) continue;
    const full = path.join(targetDir, file);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      removed++;
    }
  }
  if (removed > 0) console.log(`  Usunięto ${removed} kopii starszych niż ${keepDays} dni.`);
}

process.exit(0);
