#!/usr/bin/env node
/**
 * Test drogi wysyłki przez Firebase Cloud Messaging — bez łączenia się
 * z internetem.
 *
 * Sprawdza to, co najłatwiej zepsuć i najtrudniej zauważyć na produkcji:
 * poprawność podpisanego tokenu dostępu (assertion JWT), kształt wiadomości
 * wysyłanej do FCM oraz to, że urządzenie zgłaszające token FCM i Expo dostaje
 * powiadomienie tylko jedną drogą.
 *
 *   npm run test:fcm
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gezet-fcm-'));

// Klucz wygenerowany na miejscu — nigdzie nie trzymamy prawdziwych poświadczeń.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const serviceAccount = {
  type: 'service_account',
  project_id: 'gezet-mrkt-app',
  private_key_id: 'test-key',
  private_key: privateKey,
  client_email: 'push@gezet-mrkt-app.iam.gserviceaccount.com',
  client_id: '1',
  token_uri: 'https://oauth2.googleapis.com/token',
};

process.env.NODE_ENV = 'test';
process.env.PORT = '45899';
process.env.HOST = '127.0.0.1';
process.env.JWT_SECRET = 'test-secret-' + 'x'.repeat(40);
process.env.DB_PATH = path.join(tmpDir, 'fcm.db');
process.env.CLIENT_ORIGIN = '';
process.env.BCRYPT_ROUNDS = '10';
process.env.LOG_REQUESTS = 'false';
process.env.TRUST_PROXY = '0';
process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(serviceAccount);

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

async function main() {
  const fcm = require('../src/lib/fcm');
  const push = require('../src/lib/push');
  const db = require('../src/db');

  console.log('\n· Konfiguracja');
  check('klucz konta usługi wczytany', fcm.isConfigured(), fcm.getLoadError() || '');
  check('projekt odczytany z klucza', fcm.getProjectId() === 'gezet-mrkt-app', fcm.getProjectId());
  check('opis drogi wysyłki wskazuje Firebase', push.transportName().includes('Firebase'), push.transportName());

  console.log('\n· Token dostępu OAuth');
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('oauth2.googleapis.com')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.testowy', expires_in: 3600 }) };
    }
    return { ok: true, status: 200, json: async () => ({ name: 'projects/gezet-mrkt-app/messages/1' }) };
  };

  const accessToken = await fcm.getAccessToken();
  check('token dostępu pobrany', accessToken === 'ya29.testowy');

  const tokenCall = calls.find((c) => c.url.includes('oauth2'));
  const assertion = new URLSearchParams(tokenCall.init.body).get('assertion');
  const decoded = jwt.verify(assertion, publicKey, { algorithms: ['RS256'] });
  check('assertion podpisana kluczem konta usługi (RS256)', !!decoded);
  check('assertion wskazuje właściwego nadawcę', decoded.iss === serviceAccount.client_email, decoded.iss);
  check('assertion prosi o zakres firebase.messaging',
    decoded.scope === 'https://www.googleapis.com/auth/firebase.messaging', decoded.scope);
  check('assertion ma poprawnego odbiorcę', decoded.aud === 'https://oauth2.googleapis.com/token', decoded.aud);
  check('assertion nie jest bezterminowa', decoded.exp - decoded.iat <= 3600, `${decoded.exp - decoded.iat} s`);

  const cached = await fcm.getAccessToken();
  const tokenCalls = calls.filter((c) => c.url.includes('oauth2')).length;
  check('token dostępu jest cache’owany, a nie pobierany co wiadomość',
    cached === 'ya29.testowy' && tokenCalls === 1, `${tokenCalls} żądań`);

  console.log('\n· Wiadomość wysyłana do FCM');
  calls.length = 0;
  const result = await fcm.sendToToken('token-urzadzenia', {
    title: 'Nowe zadanie',
    body: 'Post social media — nowość Hyundai Tucson',
    data: { taskId: 'task-1', requestId: null },
  });
  check('wysyłka zakończona powodzeniem', result === 'ok', result);

  const sendCall = calls.find((c) => c.url.includes('fcm.googleapis.com'));
  check('adres zawiera identyfikator projektu',
    sendCall.url === 'https://fcm.googleapis.com/v1/projects/gezet-mrkt-app/messages:send', sendCall.url);

  const message = JSON.parse(sendCall.init.body).message;
  check('wiadomość zawiera tytuł i treść',
    message.notification.title === 'Nowe zadanie' && message.notification.body.includes('Hyundai'), '');
  check('kanał powiadomień ustawiony na "default"', message.android.notification.channel_id === 'default');
  check('dźwięk włączony', message.android.notification.sound === 'default');
  check('wysoki priorytet (budzi telefon w trybie Doze)',
    message.android.priority === 'high' && message.android.notification.notification_priority === 'PRIORITY_HIGH');
  check('wibracje włączone', message.android.notification.default_vibrate_timings === true);
  check('powiadomienie widoczne na ekranie blokady', message.android.notification.visibility === 'PUBLIC');
  check('pola data są stringami (FCM odrzuca inne typy)',
    Object.values(message.data).every((v) => typeof v === 'string'), JSON.stringify(message.data));
  check('puste pola data są pomijane', !('requestId' in message.data), JSON.stringify(message.data));

  console.log('\n· Reakcja na odpowiedzi Firebase');
  global.fetch = async (url) => {
    if (String(url).includes('oauth2')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.testowy', expires_in: 3600 }) };
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: { status: 'UNREGISTERED', message: 'Requested entity was not found.' } }),
    };
  };
  const unregistered = await fcm.sendToToken('token-po-odinstalowaniu', { title: 't', body: 'b', data: {} });
  check('token odinstalowanej aplikacji oznaczony do skasowania', unregistered === 'invalid', unregistered);

  console.log('\n· Wybór drogi wysyłki');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO push_tokens (token, user_id, device_id, kind, platform, created_at, last_seen_at)
     VALUES (?, 'inga', 'telefon-ingi', ?, 'android', ?, ?)`
  ).run('fcm-token-ingi-abcdefghijklmnop', 'fcm', now, now);
  db.prepare(
    `INSERT INTO push_tokens (token, user_id, device_id, kind, platform, created_at, last_seen_at)
     VALUES (?, 'inga', 'telefon-ingi', ?, 'android', ?, ?)`
  ).run('ExpoPushToken[inga]', 'expo', now, now);

  const rows = db.prepare('SELECT token, kind, device_id FROM push_tokens WHERE user_id = ?').all('inga');
  const chosen = push.pickTokens(rows);
  check('jedno urządzenie = jedno powiadomienie', chosen.length === 1, `wybrano ${chosen.length}`);
  check('przy skonfigurowanym Firebase wybierana jest droga FCM',
    chosen[0].kind === 'fcm', `wybrano ${chosen[0].kind}`);

  // Telefon ze starszą wersją aplikacji zgłasza wyłącznie token Expo —
  // nie może zostać bez powiadomień po włączeniu Firebase.
  db.prepare(
    `INSERT INTO push_tokens (token, user_id, device_id, kind, platform, created_at, last_seen_at)
     VALUES (?, 'inga', 'stary-telefon', ?, 'android', ?, ?)`
  ).run('ExpoPushToken[stary]', 'expo', now, now);
  const withLegacy = push.pickTokens(db.prepare('SELECT token, kind, device_id FROM push_tokens WHERE user_id = ?').all('inga'));
  check('urządzenie bez tokenu FCM dostaje powiadomienie przez Expo',
    withLegacy.length === 2 && withLegacy.some((c) => c.kind === 'expo'), JSON.stringify(withLegacy.map((c) => c.kind)));
}

main()
  .then(() => {
    console.log('\n' + '─'.repeat(56));
    if (failures.length === 0) {
      console.log(`Wszystkie testy FCM przeszły (${passed}).`);
    } else {
      console.log(`Niepowodzenia (${failures.length} z ${passed + failures.length}):`);
      failures.forEach((f) => console.log(`  • ${f}`));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(failures.length === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error('\nTest FCM przerwany błędem:', err);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  });
