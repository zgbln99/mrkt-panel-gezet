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
const http = require('http');

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
process.env.PUSH_ENABLED = 'true';
// Wysyłkę kierujemy na lokalną atrapę — test niczego nie wysyła do internetu,
// a mimo to sprawdza, że akcja w API kończy się powiadomieniem na telefon.
const PUSH_STUB_PORT = process.env.SMOKE_PUSH_PORT || '45872';
process.env.PUSH_ENDPOINT = `http://127.0.0.1:${PUSH_STUB_PORT}/push`;

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
  // Atrapa przekaźnika push: zbiera wiadomości, które serwer chciał wysłać.
  const pushMessages = [];
  const pushStub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        pushMessages.push(...JSON.parse(body));
      } catch {
        /* nie-JSON w teście nas nie interesuje */
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: [] }));
    });
  });
  await new Promise((resolve) => pushStub.listen(Number(process.env.SMOKE_PUSH_PORT || 45872), '127.0.0.1', resolve));

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

  console.log('\n· Powiadomienia push (rejestracja urządzeń)');
  const push = require('../src/lib/push');
  const fcm = require('../src/lib/fcm');

  const badToken = await call('POST', '/api/push/register', {
    token: piotrChanged.data.token,
    body: { token: 'nie-token', kind: 'expo', deviceId: 'dev-1' },
  });
  check('nieprawidłowy token Expo odrzucony (400)', badToken.status === 400);

  const badKind = await call('POST', '/api/push/register', {
    token: piotrChanged.data.token,
    body: { token: 'ExpoPushToken[abc]', kind: 'sms', deviceId: 'dev-1' },
  });
  check('nieznany rodzaj tokenu odrzucony (400)', badKind.status === 400);

  const pushAnon = await call('POST', '/api/push/register', { body: { token: 'ExpoPushToken[abc]' } });
  check('rejestracja tokenu wymaga zalogowania (401)', pushAnon.status === 401);

  const regExpo = await call('POST', '/api/push/register', {
    token: piotrChanged.data.token,
    body: { token: 'ExpoPushToken[smoke-device-1]', kind: 'expo', deviceId: 'dev-1', platform: 'android' },
  });
  check('rejestracja tokenu Expo działa', regExpo.status === 200);

  const regFcm = await call('POST', '/api/push/register', {
    token: piotrChanged.data.token,
    body: { token: 'fcm-registration-token-abcdefghijklmnop', kind: 'fcm', deviceId: 'dev-1', platform: 'android' },
  });
  check('rejestracja tokenu FCM działa', regFcm.status === 200);
  check('oba tokeny jednego urządzenia zapisane osobno',
    db.prepare('SELECT COUNT(*) AS n FROM push_tokens WHERE device_id = ?').get('dev-1').n === 2);
  check('token zapisany przy właściwym koncie',
    db.prepare('SELECT user_id FROM push_tokens WHERE token = ?').get('ExpoPushToken[smoke-device-1]').user_id === 'piotr');

  const pushReReg = await call('POST', '/api/push/register', {
    token: piotrChanged.data.token,
    body: { token: 'ExpoPushToken[smoke-device-1]', kind: 'expo', deviceId: 'dev-1', platform: 'android' },
  });
  check('ponowna rejestracja nie duplikuje wpisu',
    pushReReg.status === 200 && db.prepare('SELECT COUNT(*) AS n FROM push_tokens').get().n === 2);

  // Sedno routingu: urządzenie zgłaszające oba tokeny musi dostać dokładnie
  // jedno powiadomienie, a nie dwa.
  const rows = db.prepare('SELECT token, kind, device_id FROM push_tokens WHERE user_id = ?').all('piotr');
  const chosen = push.pickTokens(rows);
  check('jedno urządzenie = jedno powiadomienie', chosen.length === 1, `wybrano ${chosen.length}`);
  check('bez klucza FCM wybierana jest droga Expo',
    !fcm.isConfigured() && chosen[0].kind === 'expo', `wybrano ${chosen[0] && chosen[0].kind}`);

  // Drugie urządzenie tej samej osoby to osobne powiadomienie.
  await call('POST', '/api/push/register', {
    token: piotrChanged.data.token,
    body: { token: 'ExpoPushToken[smoke-device-2]', kind: 'expo', deviceId: 'dev-2', platform: 'android' },
  });
  check('drugie urządzenie dostaje własne powiadomienie',
    push.pickTokens(db.prepare('SELECT token, kind, device_id FROM push_tokens WHERE user_id = ?').all('piotr')).length === 2);

  const pushOut = await call('POST', '/api/push/unregister', {
    token: piotrChanged.data.token,
    body: { deviceId: 'dev-1' },
  });
  check('wyrejestrowanie kasuje oba tokeny urządzenia',
    pushOut.status === 200 && db.prepare('SELECT COUNT(*) AS n FROM push_tokens WHERE device_id = ?').get('dev-1').n === 0);
  check('urządzenia innych osób zostają nietknięte',
    db.prepare('SELECT COUNT(*) AS n FROM push_tokens').get().n === 1);

  const healthPush = await call('GET', '/api/health');
  check('health opisuje używaną drogę powiadomień',
    typeof healthPush.data.push === 'string' && healthPush.data.push.length > 0, healthPush.data.push);


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

  console.log('\n· Powiadomienie faktycznie wychodzi na telefon');
  await call('POST', '/api/push/register', {
    token: piotrChanged.data.token,
    body: { token: 'ExpoPushToken[telefon-piotra]', kind: 'expo', deviceId: 'telefon-piotra', platform: 'android' },
  });
  pushMessages.length = 0;

  // Zgłoszenie typu "nowy model" tworzy m.in. sesję foto przypisaną Piotrowi.
  await call('POST', '/api/requests', {
    body: { name: 'Marek Nowak', triggers: ['new_model'], brand: 'Kia', model: 'Sportage' },
  });
  // Wysyłka rusza przez setImmediate po zatwierdzeniu transakcji.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const toPiotr = pushMessages.find((m) => m.to === 'ExpoPushToken[telefon-piotra]');
  check('nowe zadanie wysyła powiadomienie na telefon wykonawcy', !!toPiotr,
    `wysłano ${pushMessages.length} wiadomości`);
  check('powiadomienie ma tytuł mówiący, czego dotyczy',
    !!toPiotr && toPiotr.title === 'Nowe zadanie', toPiotr && toPiotr.title);
  check('treść powiadomienia nie powtarza tytułu',
    !!toPiotr && !toPiotr.body.startsWith('Nowe zadanie'), toPiotr && toPiotr.body);
  check('powiadomienie ma dźwięk i wysoki priorytet',
    !!toPiotr && toPiotr.sound === 'default' && toPiotr.priority === 'high' && toPiotr.channelId === 'default');
  check('powiadomienie niesie identyfikator zadania do otwarcia',
    !!toPiotr && !!toPiotr.data && !!toPiotr.data.taskId, toPiotr && JSON.stringify(toPiotr.data));

  const toUnregistered = pushMessages.find((m) => m.to === 'ExpoPushToken[smoke-device-1]');
  check('urządzenie wyrejestrowane nie dostaje powiadomień', !toUnregistered);

  console.log('\n· Zgłoszenie „tylko foto / video”');
  const photoOnly = await call('POST', '/api/requests', {
    body: { name: 'Jan Kowalski', triggers: ['photo_video_only'], photoVideoScope: 'foto', brand: 'Kia' },
  });
  check('zgłoszenie „tylko foto” zapisane (201)', photoOnly.status === 201, JSON.stringify(photoOnly.data));
  check('„tylko foto” tworzy wyłącznie zadanie foto',
    photoOnly.data.tasks.length === 1 && photoOnly.data.tasks[0].category === 'foto',
    JSON.stringify(photoOnly.data.tasks.map((t) => t.category)));

  const photoVideo = await call('POST', '/api/requests', {
    body: { name: 'Jan Kowalski', triggers: ['photo_video_only'], brand: 'Kia' },
  });
  check('domyślny zakres tworzy zadanie foto i video',
    photoVideo.data.tasks.length === 2 &&
      photoVideo.data.tasks.some((t) => t.category === 'foto') &&
      photoVideo.data.tasks.some((t) => t.category === 'video'),
    JSON.stringify(photoVideo.data.tasks.map((t) => t.category)));
  check('zgłoszenie „tylko foto / video” nie generuje zadań digital',
    photoVideo.data.tasks.every((t) => t.category !== 'digital'));

  const badScope = await call('POST', '/api/requests', {
    body: { name: 'Jan Kowalski', triggers: ['photo_video_only'], photoVideoScope: '__nieznany__' },
  });
  check('nieznany zakres wraca do wartości domyślnej', badScope.data.tasks.length === 2,
    JSON.stringify(badScope.data.tasks.map((t) => t.category)));

  console.log('\n· Zlecenie dodane z panelu administratora');
  const manualAnon = await call('POST', '/api/requests/manual', { body: { name: 'X', triggers: ['new_model'] } });
  check('dodawanie zadań z panelu wymaga zalogowania (401)', manualAnon.status === 401);

  const manualForbidden = await call('POST', '/api/requests/manual', {
    token: piotrChanged.data.token,
    body: { name: 'Piotr', triggers: ['new_model'] },
  });
  check('pracownik nie doda zlecenia z panelu (403)', manualForbidden.status === 403);

  const manualEmpty = await call('POST', '/api/requests/manual', { token: adminToken, body: { name: 'Karolina' } });
  check('zlecenie bez typu i bez własnych zadań odrzucone (400)', manualEmpty.status === 400);

  const manualNoAssignee = await call('POST', '/api/requests/manual', {
    token: adminToken,
    body: { name: 'Karolina', customTasks: [{ category: 'foto', title: 'Sesja', assignees: [] }] },
  });
  check('własne zadanie bez wykonawcy odrzucone (400)', manualNoAssignee.status === 400);

  const manualBadCategory = await call('POST', '/api/requests/manual', {
    token: adminToken,
    body: { name: 'Karolina', customTasks: [{ category: 'nie-ma-takiej', title: 'Sesja', assignees: ['piotr'] }] },
  });
  check('własne zadanie z nieznaną kategorią odrzucone (400)', manualBadCategory.status === 400);

  const manual = await call('POST', '/api/requests/manual', {
    token: adminToken,
    body: {
      name: 'Karolina Lisowska-Kycia',
      brand: 'Toyota',
      model: 'Corolla',
      triggers: ['photo_video_only'],
      photoVideoScope: 'video',
      customTasks: [
        { category: 'materials', title: 'Zamów banery na salon', details: 'Format 3×1 m.', assignees: ['piotr'] },
      ],
    },
  });
  check('administrator dodaje zlecenie z panelu (201)', manual.status === 201, JSON.stringify(manual.data));
  check('zlecenie łączy zadania z typu zlecenia i zadanie własne',
    manual.data.tasks.length === 2 &&
      manual.data.tasks.some((t) => t.category === 'video') &&
      manual.data.tasks.some((t) => t.title === 'Zamów banery na salon'),
    JSON.stringify(manual.data.tasks.map((t) => t.title)));
  check('zlecenie z panelu jest od razu przeczytane',
    db.prepare('SELECT seen FROM requests WHERE id = ?').get(manual.data.requestId).seen === 1);
  check('zakres foto/video zapisany w bazie',
    db.prepare('SELECT photo_video_scope AS s FROM requests WHERE id = ?').get(manual.data.requestId).s === 'video');
  check('własne zadanie ma wskazanego wykonawcę',
    manual.data.tasks.find((t) => t.title === 'Zamów banery na salon').assignees.join() === 'piotr');

  const manualOverride = await call('POST', '/api/requests/manual', {
    token: adminToken,
    body: {
      name: 'Karolina Lisowska-Kycia',
      brand: 'Kia',
      triggers: ['photo_video_only'],
      assigneesOverride: ['piotr'],
    },
  });
  check('przypisanie z panelu nadpisuje domyślny podział wg ról',
    manualOverride.data.tasks.length === 2 && manualOverride.data.tasks.every((t) => t.assignees.join() === 'piotr'),
    JSON.stringify(manualOverride.data.tasks.map((t) => t.assignees)));

  const manualBadOverride = await call('POST', '/api/requests/manual', {
    token: adminToken,
    body: { name: 'Karolina', brand: 'Kia', triggers: ['photo_video_only'], assigneesOverride: ['nie-ma-takiego'] },
  });
  check('nieznana osoba w przypisaniu jest pomijana, podział zostaje domyślny',
    manualBadOverride.data.tasks.some((t) => t.assignees.includes('piotr')) &&
      manualBadOverride.data.tasks.some((t) => t.assignees.includes('bogdan')),
    JSON.stringify(manualBadOverride.data.tasks.map((t) => t.assignees)));

  const manualOnlyCustom = await call('POST', '/api/requests/manual', {
    token: adminToken,
    body: {
      name: 'Karolina Lisowska-Kycia',
      customTasks: [{ category: 'digital', title: 'Przejrzeć statystyki kampanii', assignees: ['piotr'] }],
    },
  });
  check('samo własne zadanie nie dokłada zadania zastępczego',
    manualOnlyCustom.data.tasks.length === 1 && manualOnlyCustom.data.tasks[0].title === 'Przejrzeć statystyki kampanii',
    JSON.stringify(manualOnlyCustom.data.tasks.map((t) => t.title)));

  const adminNotifs = await call('GET', '/api/notifications', { token: adminToken });
  check('administrator nie dostaje powiadomienia o własnym zleceniu',
    !adminNotifs.data.notifications.some((n) => n.requestId === manual.data.requestId));

  pushStub.close();

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
