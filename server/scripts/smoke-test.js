#!/usr/bin/env node
/**
 * Test dymny całego API — uruchamia serwer na tymczasowej bazie i przechodzi
 * pełną ścieżkę: zgłoszenie z formularza, logowanie, wymuszona zmiana hasła,
 * praca na zadaniach, przekazanie zadania, unieważnienie sesji po resecie hasła.
 *
 *   npm test
 *
 * Bez zewnętrznych bibliotek — ma działać także na świeżym VPS-ie po
 * `npm install --omit=dev`, jako weryfikacja wdrożenia.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gezet-smoke-'));

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.SMOKE_PORT || '45871';
process.env.HOST = '127.0.0.1';
process.env.JWT_SECRET = 'test-secret-' + 'x'.repeat(40);
process.env.DB_PATH = path.join(tmpDir, 'smoke.db');
process.env.CLIENT_ORIGIN = '';
process.env.BCRYPT_ROUNDS = '10'; // szybciej w teście; produkcja używa 12
process.env.LOG_REQUESTS = 'false';
process.env.TRUST_PROXY = '0';

const BASE = `http://127.0.0.1:${process.env.PORT}`;

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, endpoint, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + endpoint, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* odpowiedź bez treści */
  }
  return { status: res.status, data };
}

async function main() {
  require('../src/index');
  const db = require('../src/db');
  const { hashPassword } = require('../src/auth');

  // Czekamy, aż serwer zacznie odpowiadać.
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(BASE + '/api/health');
      if (res.ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, name, role, is_admin, token_version, must_change_password, created_at)
    VALUES (@id, @id, @hash, @name, @role, @isAdmin, 0, 1, datetime('now'))
  `);
  const startPassword = 'Startowe-Haslo-123';
  const hash = await hashPassword(startPassword);
  insertUser.run({ id: 'karolina', hash, name: 'Karolina', role: 'Dyrektor Marketingu', isAdmin: 1 });
  insertUser.run({ id: 'bogdan', hash, name: 'Bogdan', role: 'Video', isAdmin: 0 });
  insertUser.run({ id: 'piotr', hash, name: 'Piotr', role: 'Foto', isAdmin: 0 });

  console.log('\n· Endpointy publiczne');
  const health = await call('GET', '/api/health');
  check('GET /api/health zwraca ok', health.status === 200 && health.data.ok === true);

  const meta = await call('GET', '/api/meta');
  check('GET /api/meta zwraca zespół i triggery', meta.status === 200 && Array.isArray(meta.data.team) && meta.data.team.length > 0);

  const notFound = await call('GET', '/api/nie-ma-takiego');
  check('nieznana ścieżka /api/* zwraca 404 w JSON', notFound.status === 404 && typeof notFound.data.error === 'string');

  console.log('\n· Publiczny formularz zgłoszeń');
  const noName = await call('POST', '/api/requests', { body: { triggers: ['new_model'] } });
  check('zgłoszenie bez nazwiska odrzucone (400)', noName.status === 400);

  const empty = await call('POST', '/api/requests', { body: { name: 'Jan Kowalski' } });
  check('zgłoszenie bez treści odrzucone (400)', empty.status === 400);

  const badLink = await call('POST', '/api/requests', {
    body: { name: 'Jan Kowalski', triggers: ['listing_promo'], listingLink: 'javascript:alert(1)' },
  });
  check('link "javascript:" odrzucony (400)', badLink.status === 400, `otrzymano ${badLink.status}`);

  const badTrigger = await call('POST', '/api/requests', {
    body: { name: 'Jan Kowalski', triggers: ['__nieistniejacy__'] },
  });
  check('nieznany typ zgłoszenia odrzucony (400)', badTrigger.status === 400);

  const created = await call('POST', '/api/requests', {
    body: {
      name: 'Jan Kowalski',
      department: 'Sprzedaż / Handlowy',
      location: 'Gorzów Wielkopolski',
      brand: 'Hyundai',
      model: 'Tucson',
      triggers: ['new_model'],
      materials: ['flags'],
      notes: 'Kontekst wewnętrzny.',
    },
  });
  check('poprawne zgłoszenie zapisane (201)', created.status === 201, JSON.stringify(created.data));
  check('zgłoszenie wygenerowało zadania', Array.isArray(created.data.tasks) && created.data.tasks.length >= 5);

  console.log('\n· Logowanie');
  const wrong = await call('POST', '/api/auth/login', { body: { username: 'karolina', password: 'zle' } });
  check('błędne hasło odrzucone (401)', wrong.status === 401);

  const unknown = await call('POST', '/api/auth/login', { body: { username: 'nie-ma', password: 'cokolwiek' } });
  check('nieznany login odrzucony (401)', unknown.status === 401);

  const noToken = await call('GET', '/api/requests');
  check('panel bez tokenu niedostępny (401)', noToken.status === 401);

  const adminLogin = await call('POST', '/api/auth/login', { body: { username: 'karolina', password: startPassword } });
  check('poprawne logowanie zwraca token', adminLogin.status === 200 && typeof adminLogin.data.token === 'string');
  check('konto po seedzie ma flagę zmiany hasła', adminLogin.data.user.mustChangePassword === true);

  console.log('\n· Wymuszona zmiana hasła startowego');
  const blocked = await call('GET', '/api/requests', { token: adminLogin.data.token });
  check('panel zablokowany do czasu zmiany hasła (403)', blocked.status === 403 && blocked.data.code === 'password_change_required');

  const tooShort = await call('POST', '/api/auth/change-password', {
    token: adminLogin.data.token,
    body: { currentPassword: startPassword, newPassword: 'krotkie' },
  });
  check('zbyt krótkie hasło odrzucone (400)', tooShort.status === 400);

  const changed = await call('POST', '/api/auth/change-password', {
    token: adminLogin.data.token,
    body: { currentPassword: startPassword, newPassword: 'Nowe-Haslo-Admina-2026' },
  });
  check('zmiana hasła powiodła się', changed.status === 200 && typeof changed.data.token === 'string');
  const adminToken = changed.data.token;

  const oldToken = await call('GET', '/api/requests', { token: adminLogin.data.token });
  check('stary token unieważniony po zmianie hasła (401)', oldToken.status === 401 && oldToken.data.code === 'token_revoked');

  console.log('\n· Panel administratora');
  const adminView = await call('GET', '/api/requests', { token: adminToken });
  check('administrator widzi zgłoszenie', adminView.status === 200 && adminView.data.requests.length === 1);
  const adminTasks = adminView.data.requests[0].tasks;
  check('administrator widzi wszystkie zadania zgłoszenia', adminTasks.length === created.data.tasks.length);

  const notifs = await call('GET', '/api/notifications', { token: adminToken });
  check('administrator dostał powiadomienie o zgłoszeniu', notifs.status === 200 && notifs.data.notifications.length > 0);

  console.log('\n· Panel pracownika — izolacja danych');
  const bogdanLogin = await call('POST', '/api/auth/login', { body: { username: 'bogdan', password: startPassword } });
  const bogdanChanged = await call('POST', '/api/auth/change-password', {
    token: bogdanLogin.data.token,
    body: { currentPassword: startPassword, newPassword: 'Haslo-Bogdana-2026' },
  });
  const bogdanToken = bogdanChanged.data.token;

  const bogdanView = await call('GET', '/api/requests', { token: bogdanToken });
  check('pracownik widzi zgłoszenie ze swoim zadaniem', bogdanView.status === 200 && bogdanView.data.requests.length === 1);
  const bogdanTasks = bogdanView.data.requests[0].tasks;
  check('pracownik nie dostaje cudzych zadań', bogdanTasks.length < adminTasks.length && bogdanTasks.length > 0,
    `${bogdanTasks.length} z ${adminTasks.length}`);
  check('każde zwrócone zadanie należy do pracownika', bogdanTasks.every((t) => t.assignees.includes('bogdan')));

  const foreignTask = adminTasks.find((t) => !t.assignees.includes('bogdan'));
  const foreign = await call('PATCH', `/api/tasks/${foreignTask.id}`, { token: bogdanToken, body: { status: 'done' } });
  check('pracownik nie zmieni cudzego zadania (403)', foreign.status === 403);

  const ownTask = bogdanTasks[0];
  const statusChange = await call('PATCH', `/api/tasks/${ownTask.id}`, { token: bogdanToken, body: { status: 'progress' } });
  check('pracownik zmienia status własnego zadania', statusChange.status === 200 && statusChange.data.task.status === 'progress');

  const badStatus = await call('PATCH', `/api/tasks/${ownTask.id}`, { token: bogdanToken, body: { status: 'wymyslony' } });
  check('nieprawidłowy status odrzucony (400)', badStatus.status === 400);

  const reassign = await call('PATCH', `/api/tasks/${ownTask.id}`, { token: bogdanToken, body: { assignees: ['bogdan', 'piotr'] } });
  check('pracownik nie zmieni listy przypisań (403)', reassign.status === 403);

  const adminReassign = await call('PATCH', `/api/tasks/${ownTask.id}`, { token: adminToken, body: { assignees: ['bogdan', 'piotr'] } });
  check('administrator zmienia listę przypisań', adminReassign.status === 200 && adminReassign.data.task.assignees.length === 2);

  console.log('\n· Przekazanie zadania');
  const selfTransfer = await call('POST', `/api/tasks/${ownTask.id}/transfer`, { token: bogdanToken, body: { toUserId: 'bogdan' } });
  check('przekazanie samemu sobie odrzucone (400)', selfTransfer.status === 400);

  const transfer = await call('POST', `/api/tasks/${ownTask.id}/transfer`, {
    token: bogdanToken,
    body: { toUserId: 'piotr', note: 'Przejmij proszę, jestem na urlopie.' },
  });
  check('przekazanie zadania działa', transfer.status === 200 && !transfer.data.task.assignees.includes('bogdan'));
  check('przekazanie zapisane w historii', transfer.data.task.transferLog.length === 1);

  const piotrLogin = await call('POST', '/api/auth/login', { body: { username: 'piotr', password: startPassword } });
  const piotrChanged = await call('POST', '/api/auth/change-password', {
    token: piotrLogin.data.token,
    body: { currentPassword: startPassword, newPassword: 'Haslo-Piotra-2026' },
  });
  const piotrNotifs = await call('GET', '/api/notifications', { token: piotrChanged.data.token });
  check('odbiorca dostał powiadomienie o przekazaniu',
    piotrNotifs.data.notifications.some((n) => n.text.includes('przekazał')));

  console.log('\n· Zarządzanie kontami');
  const usersForbidden = await call('GET', '/api/users', { token: bogdanToken });
  check('lista kont niedostępna dla pracownika (403)', usersForbidden.status === 403);

  const users = await call('GET', '/api/users', { token: adminToken });
  check('administrator widzi listę kont', users.status === 200 && users.data.users.length === 3);
  check('lista kont nie zawiera hashy haseł', !JSON.stringify(users.data).includes('$2'));

  const reset = await call('POST', '/api/users/bogdan/reset-password', { token: adminToken, body: {} });
  check('reset hasła generuje hasło jednorazowe', reset.status === 200 && typeof reset.data.generatedPassword === 'string');

  const afterReset = await call('GET', '/api/requests', { token: bogdanToken });
  check('reset hasła unieważnia sesje pracownika (401)', afterReset.status === 401 && afterReset.data.code === 'token_revoked');

  const reloginAfterReset = await call('POST', '/api/auth/login', {
    body: { username: 'bogdan', password: reset.data.generatedPassword },
  });
  check('nowe hasło z resetu działa', reloginAfterReset.status === 200);
  check('konto po resecie znów wymaga zmiany hasła', reloginAfterReset.data.user.mustChangePassword === true);

  console.log('\n· Usuwanie zgłoszeń');
  const requestId = adminView.data.requests[0].id;
  const deleteForbidden = await call('DELETE', `/api/requests/${requestId}`, { token: piotrChanged.data.token });
  check('pracownik nie usunie zgłoszenia (403)', deleteForbidden.status === 403);

  const deleted = await call('DELETE', `/api/requests/${requestId}`, { token: adminToken });
  check('administrator usuwa zgłoszenie', deleted.status === 200);

  const afterDelete = await call('GET', '/api/requests', { token: adminToken });
  check('usunięte zgłoszenie zniknęło z panelu', afterDelete.data.requests.length === 0);

  const orphanTasks = db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
  const orphanAssignees = db.prepare('SELECT COUNT(*) AS n FROM task_assignees').get().n;
  check('kasowanie kaskadowe usunęło zadania', orphanTasks === 0, `zostało ${orphanTasks}`);
  check('kasowanie kaskadowe usunęło przypisania', orphanAssignees === 0, `zostało ${orphanAssignees}`);
}

main()
  .then(() => {
    console.log('\n' + '─'.repeat(56));
    if (failures.length === 0) {
      console.log(`Wszystkie testy przeszły (${passed}).`);
    } else {
      console.log(`Niepowodzenia (${failures.length} z ${passed + failures.length}):`);
      failures.forEach((f) => console.log(`  • ${f}`));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(failures.length === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error('\nTest dymny przerwany błędem:', err);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  });
