const fs = require('fs');
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Wysyłka powiadomień bezpośrednio przez Firebase Cloud Messaging (HTTP v1).
 *
 * Alternatywą jest przekaźnik Expo (lib/push.js) — działa bez konfiguracji, ale
 * treść powiadomienia (nazwiska, tytuły zadań) przechodzi wtedy przez serwery
 * firmy trzeciej. Przy własnym projekcie Firebase droga bezpośrednia zostawia
 * te dane między naszym serwerem a Google, więc jest domyślną, gdy tylko
 * skonfigurowano konto usługi.
 *
 * Wymaga klucza konta usługi z Firebase:
 *   Ustawienia projektu → Konta usługi → Wygeneruj nowy klucz prywatny
 * i wskazania go w FCM_SERVICE_ACCOUNT (ścieżka) albo FCM_SERVICE_ACCOUNT_JSON.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let serviceAccount = null;
let loadError = null;

function loadServiceAccount() {
  const inline = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const path = process.env.FCM_SERVICE_ACCOUNT;

  try {
    if (inline && inline.trim()) return JSON.parse(inline);
    if (path && path.trim()) return JSON.parse(fs.readFileSync(path.trim(), 'utf8'));
  } catch (err) {
    loadError = `Nie udało się wczytać klucza konta usługi FCM: ${err.message}`;
    return null;
  }
  return null;
}

serviceAccount = loadServiceAccount();

if (serviceAccount && (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id)) {
  loadError = 'Klucz konta usługi FCM jest niekompletny (wymagane pola: project_id, client_email, private_key).';
  serviceAccount = null;
}

const isConfigured = () => !!serviceAccount;
const getProjectId = () => (serviceAccount ? serviceAccount.project_id : null);
const getLoadError = () => loadError;

/* --------------------------- token dostępu OAuth --------------------------- */

let cachedToken = null;
let cachedUntil = 0;
let pending = null;

async function getAccessToken() {
  // Token żyje godzinę; odnawiamy minutę przed końcem, żeby nie trafić
  // na wygaśnięcie w trakcie wysyłki.
  if (cachedToken && Date.now() < cachedUntil - 60000) return cachedToken;
  // Kilka powiadomień naraz nie może wywołać kilku równoległych żądań o token.
  if (pending) return pending;

  pending = (async () => {
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      { iss: serviceAccount.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 },
      serviceAccount.private_key,
      { algorithm: 'RS256' }
    );

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok || !body || !body.access_token) {
      throw new Error(
        `FCM: nie udało się uzyskać tokenu dostępu (${res.status})` +
          (body && body.error_description ? `: ${body.error_description}` : '')
      );
    }

    cachedToken = body.access_token;
    cachedUntil = Date.now() + (body.expires_in || 3600) * 1000;
    return cachedToken;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

/* -------------------------------- wysyłka -------------------------------- */

/**
 * Wysyła powiadomienie na jeden token urządzenia.
 * Zwraca 'ok', 'invalid' (token do skasowania) albo 'error'.
 */
async function sendToToken(deviceToken, { title, body, data }) {
  const accessToken = await getAccessToken();

  const message = {
    message: {
      token: deviceToken,
      notification: { title, body },
      // Wartości w data muszą być stringami — FCM odrzuca liczby i null.
      data: Object.fromEntries(
        Object.entries(data || {})
          .filter(([, value]) => value !== null && value !== undefined)
          .map(([key, value]) => [key, String(value)])
      ),
      android: {
        // "high" budzi urządzenie także w trybie Doze — bez tego powiadomienie
        // o nowym zadaniu potrafi przyjść z kilkunastominutowym opóźnieniem.
        priority: 'high',
        notification: {
          channel_id: 'default',
          sound: 'default',
          default_vibrate_timings: true,
          notification_priority: 'PRIORITY_HIGH',
          visibility: 'PUBLIC',
        },
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let res;
  let payload;
  try {
    res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
    payload = await res.json().catch(() => null);
  } finally {
    clearTimeout(timeout);
  }

  if (res.ok) return 'ok';

  const status = payload && payload.error && payload.error.status;
  // UNREGISTERED = aplikacja odinstalowana albo token unieważniony przez
  // Androida; NOT_FOUND to jej starszy odpowiednik. Trzymanie takiego tokenu
  // to wysyłanie w próżnię przy każdym zadaniu.
  if (res.status === 404 || status === 'UNREGISTERED' || status === 'NOT_FOUND') return 'invalid';
  if (status === 'INVALID_ARGUMENT' && JSON.stringify(payload).includes('token')) return 'invalid';

  console.error('[fcm] odrzucone przez Firebase:', res.status, status || JSON.stringify(payload).slice(0, 200));
  return 'error';
}

module.exports = { isConfigured, getProjectId, getLoadError, sendToToken, getAccessToken };
