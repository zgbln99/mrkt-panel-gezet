#!/usr/bin/env node
/**
 * Awaryjne ustawienie hasła z poziomu serwera:
 *
 *   npm run set-password -- <login> [nowe-haslo]
 *
 * Potrzebne wtedy, gdy nikt nie może zalogować się jako administrator (a więc
 * panel "Zarządzanie kontami" jest poza zasięgiem) — na przykład gdy jedyny
 * administrator zapomniał hasła. Bez podania hasła skrypt wylosuje je i wypisze.
 *
 * Operacja unieważnia wszystkie aktywne sesje tego konta.
 */
const db = require('../src/db');
const { hashPassword, generatePassword, validatePassword } = require('../src/auth');

const [, , loginArg, passwordArg] = process.argv;

if (!loginArg) {
  console.error('Użycie: npm run set-password -- <login> [nowe-haslo]');
  console.error('\nDostępne konta:');
  for (const u of db.prepare('SELECT username, name, is_admin FROM users ORDER BY username').all()) {
    console.error(`  ${u.username.padEnd(12)} ${u.name}${u.is_admin ? ' (administrator)' : ''}`);
  }
  process.exit(1);
}

const login = String(loginArg).trim().toLowerCase();
const user = db.prepare('SELECT id, username, name FROM users WHERE username = ?').get(login);

if (!user) {
  console.error(`Nie znaleziono konta o loginie "${login}".`);
  process.exit(1);
}

const password = passwordArg || generatePassword(16);
const problem = validatePassword(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

hashPassword(password)
  .then((hash) => {
    db.prepare(
      `UPDATE users
          SET password_hash = ?, token_version = token_version + 1, must_change_password = 1
        WHERE id = ?`
    ).run(hash, user.id);

    console.log(`\n✓ Ustawiono nowe hasło dla konta "${user.username}" (${user.name}).`);
    if (!passwordArg) console.log(`  Hasło: ${password}`);
    console.log('  Wszystkie aktywne sesje tego konta zostały unieważnione.');
    console.log('  Przy najbliższym logowaniu aplikacja poprosi o ustawienie własnego hasła.\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Nie udało się ustawić hasła:', err);
    process.exit(1);
  });
