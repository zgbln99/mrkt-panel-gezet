/**
 * Zakłada domyślne konta zespołu (idempotentnie — pomija już istniejące
 * loginy). Uruchom raz po pierwszym wdrożeniu:
 *
 *   npm run seed
 *
 * WAŻNE: zmień poniższe hasła startowe zanim udostępnisz aplikację
 * publicznie, i poproś każdą osobę o zmianę hasła przy pierwszym logowaniu
 * (ta wersja nie ma jeszcze ekranu zmiany hasła — patrz README, sekcja
 * "Dalsze kroki bezpieczeństwa").
 */
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const db = require('../src/db');
const { hashPassword } = require('../src/auth');

const DEFAULT_USERS = [
  { username: 'karolina', password: 'zmien-to-haslo-admina', name: 'Karolina Lisowska-Kycia', role: 'Dyrektor Marketingu', isAdmin: true },
  { username: 'piotr', password: 'zmien-to-haslo-piotr', name: 'Piotr', role: 'Foto', isAdmin: false },
  { username: 'bogdan', password: 'zmien-to-haslo-bogdan', name: 'Bogdan', role: 'Video', isAdmin: false },
  { username: 'inga', password: 'zmien-to-haslo-inga', name: 'Inga', role: 'Social / eventy / agencje', isAdmin: false },
  { username: 'martyna', password: 'zmien-to-haslo-martyna', name: 'Martyna', role: 'Social / eventy / agencje', isAdmin: false },
  { username: 'zbigniew', password: 'zmien-to-haslo-zbigniew', name: 'Zbigniew', role: 'Google Moja Firma / eventy', isAdmin: false },
];

const insert = db.prepare(`
  INSERT INTO users (id, username, password_hash, name, role, is_admin)
  VALUES (@id, @username, @passwordHash, @name, @role, @isAdmin)
`);
const exists = db.prepare('SELECT 1 FROM users WHERE username = ?');

let created = 0;
for (const u of DEFAULT_USERS) {
  if (exists.get(u.username)) {
    console.log(`↷ pomijam — konto "${u.username}" już istnieje`);
    continue;
  }
  insert.run({
    id: u.username, // stałe, czytelne id = username (unikalne, wystarczające dla tej skali)
    username: u.username,
    passwordHash: hashPassword(u.password),
    name: u.name,
    role: u.role,
    isAdmin: u.isAdmin ? 1 : 0,
  });
  created++;
  console.log(`✓ utworzono konto "${u.username}" (hasło startowe: ${u.password})`);
}

console.log(`\nGotowe — utworzono ${created} nowych kont. Zmień hasła startowe przed publicznym udostępnieniem aplikacji!`);
