#!/usr/bin/env node
/**
 * Zakłada konta zespołu marketingu. Uruchamiany raz, po pierwszym wdrożeniu:
 *
 *   npm run seed
 *
 * Hasła startowe są losowane kryptograficznie i wypisywane JEDEN raz na
 * ekranie — nie ma ich ani w repozytorium, ani w bazie (w bazie leży wyłącznie
 * hash bcrypt). Poprzednia wersja trzymała hasła wprost w kodzie tego pliku,
 * przez co każdy z dostępem do repo znał hasło administratora.
 *
 * Każde konto dostaje flagę "musisz zmienić hasło" — przy pierwszym logowaniu
 * aplikacja wymusi ustawienie własnego hasła, więc losowe hasło startowe jest
 * jednorazową przepustką, a nie hasłem na stałe.
 *
 * Skrypt jest idempotentny: istniejące loginy pomija, więc bezpiecznie
 * uruchomić go ponownie po dodaniu kogoś do zespołu.
 */
const db = require('../src/db');
const { hashPassword, generatePassword } = require('../src/auth');
const { TEAM } = require('../src/lib/team');

// Kto ma uprawnienia administratora (widzi wszystkie zgłoszenia i zarządza kontami).
const ADMIN_IDS = new Set(['karolina']);

const exists = db.prepare('SELECT 1 FROM users WHERE username = ?');
const insert = db.prepare(`
  INSERT INTO users (id, username, password_hash, name, role, is_admin, token_version, must_change_password, created_at)
  VALUES (@id, @username, @passwordHash, @name, @role, @isAdmin, 0, 1, @createdAt)
`);

async function main() {
  const created = [];
  const now = new Date().toISOString();

  for (const member of TEAM) {
    if (exists.get(member.id)) {
      console.log(`↷ pomijam — konto "${member.id}" już istnieje`);
      continue;
    }
    const password = generatePassword(16);
    insert.run({
      id: member.id,
      username: member.id,
      passwordHash: await hashPassword(password),
      name: member.name,
      role: member.role,
      isAdmin: ADMIN_IDS.has(member.id) ? 1 : 0,
      createdAt: now,
    });
    created.push({ login: member.id, name: member.name, password });
  }

  if (created.length === 0) {
    console.log('\nNie utworzono żadnego konta — wszystkie już istniały.');
    console.log('Aby ustawić komuś nowe hasło: npm run set-password -- <login>');
    return;
  }

  console.log('\n' + '='.repeat(64));
  console.log(' HASŁA STARTOWE — zapisz je teraz, nie da się ich później odczytać');
  console.log('='.repeat(64));
  for (const account of created) {
    console.log(`  ${account.login.padEnd(12)} ${account.password}   (${account.name})`);
  }
  console.log('='.repeat(64));
  console.log('Przekaż każdej osobie jej hasło bezpiecznym kanałem.');
  console.log('Przy pierwszym logowaniu aplikacja poprosi o ustawienie własnego hasła.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Nie udało się założyć kont:', err);
    process.exit(1);
  });
