const db = require('../db');
const config = require('../config');
const fcm = require('./fcm');

/**
 * Powiadomienia push na urządzenia mobilne.
 *
 * Aplikacja webowa odpytuje serwer co 15 sekund i to jej wystarcza, ale telefon
 * z zamkniętą aplikacją niczego nie odpytuje — bez pushy zespół dowiadywałby
 * się o nowym zadaniu dopiero po samodzielnym otwarciu aplikacji.
 *
 * Dwie drogi wysyłki:
 *   • FCM (bezpośrednio do Google) — używana, gdy skonfigurowano klucz konta
 *     usługi. Treść powiadomienia nie przechodzi wtedy przez firmę trzecią.
 *   • przekaźnik Expo — działa bez konfiguracji, przydatny na starcie
 *     i jako zapas dla urządzeń bez tokenu FCM.
 *
 * Wysyłka jest "best effort": błąd sieci nie może przerwać zapisu zgłoszenia
 * ani przekazania zadania.
 */

const insertToken = db.prepare(`
  INSERT INTO push_tokens (token, user_id, device_id, kind, platform, created_at, last_seen_at)
  VALUES (@token, @userId, @deviceId, @kind, @platform, @now, @now)
  ON CONFLICT(token) DO UPDATE SET
    user_id = excluded.user_id,
    device_id = excluded.device_id,
    kind = excluded.kind,
    platform = excluded.platform,
    last_seen_at = excluded.last_seen_at
`);
const deleteToken = db.prepare('DELETE FROM push_tokens WHERE token = ?');
const deleteDevice = db.prepare('DELETE FROM push_tokens WHERE device_id = ? AND user_id = ?');
const deleteTokenForUser = db.prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?');
const selectForUser = db.prepare('SELECT token, kind, device_id FROM push_tokens WHERE user_id = ?');

const KINDS = new Set(['expo', 'fcm']);

/** Token Expo ma stały kształt; token FCM to nieprzewidywalny ciąg z Google. */
function isValidToken(value, kind) {
  if (typeof value !== 'string') return false;
  const token = value.trim();
  if (kind === 'expo') return /^Expo(nent)?PushToken\[[^\]]{1,200}\]$/.test(token);
  return token.length >= 20 && token.length <= 4096 && !/\s/.test(token);
}

function registerToken({ token, userId, deviceId, kind = 'expo', platform }) {
  insertToken.run({
    token: token.trim(),
    userId,
    deviceId: String(deviceId || '').slice(0, 64),
    kind: KINDS.has(kind) ? kind : 'expo',
    platform: (platform || 'android').slice(0, 20),
    now: new Date().toISOString(),
  });
}

/** Wylogowanie na telefonie — kasujemy wszystkie tokeny tego urządzenia. */
function unregisterDevice({ deviceId, token, userId }) {
  if (deviceId) return deleteDevice.run(String(deviceId).slice(0, 64), userId).changes > 0;
  if (token) return deleteTokenForUser.run(String(token).trim(), userId).changes > 0;
  return false;
}

/**
 * Wybiera po jednym tokenie na urządzenie: FCM, jeśli skonfigurowany i dostępny,
 * w przeciwnym razie Expo. Dzięki temu telefon zgłaszający oba tokeny dostaje
 * jedno powiadomienie, a nie dwa.
 */
function pickTokens(rows) {
  const byDevice = new Map();
  for (const row of rows) {
    // Wpisy bez device_id (ze starszej wersji aplikacji) traktujemy jako
    // osobne urządzenia — inaczej zlałyby się w jedno.
    const key = row.device_id || `token:${row.token}`;
    if (!byDevice.has(key)) byDevice.set(key, []);
    byDevice.get(key).push(row);
  }

  const chosen = [];
  for (const candidates of byDevice.values()) {
    const preferred = fcm.isConfigured()
      ? candidates.find((c) => c.kind === 'fcm') || candidates.find((c) => c.kind === 'expo')
      : candidates.find((c) => c.kind === 'expo') || candidates.find((c) => c.kind === 'fcm');
    if (preferred) chosen.push(preferred);
  }
  return chosen;
}

async function sendViaExpo(tokens, { title, body, data }) {
  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    data: data || {},
    sound: 'default',
    channelId: 'default',
    priority: 'high',
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let payload;
  try {
    const res = await fetch(config.pushEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
    payload = await res.json();
  } catch (err) {
    console.error('[push] przekaźnik Expo niedostępny:', err.message);
    return;
  } finally {
    clearTimeout(timeout);
  }

  const results = (payload && payload.data) || [];
  results.forEach((result, index) => {
    if (result && result.status === 'error') {
      const code = result.details && result.details.error;
      if (code === 'DeviceNotRegistered') deleteToken.run(tokens[index]);
      else console.error('[push] Expo odrzuciło wiadomość:', result.message || code);
    }
  });
}

async function sendViaFcm(tokens, message) {
  // Po jednym żądaniu na token: FCM HTTP v1 nie ma wysyłki zbiorczej, a przy
  // skali zespołu marketingu mówimy o kilku urządzeniach na powiadomienie.
  const results = await Promise.allSettled(tokens.map((token) => fcm.sendToToken(token, message)));
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value === 'invalid') {
      deleteToken.run(tokens[index]);
    } else if (result.status === 'rejected') {
      console.error('[fcm] wysyłka nieudana:', result.reason && result.reason.message);
    }
  });
}

/**
 * Wysyła jedno powiadomienie na wszystkie urządzenia danej osoby.
 * Wywoływane spoza transakcji (przez setImmediate) — zapis do bazy jest już
 * zatwierdzony, a ewentualny timeout HTTP nie blokuje odpowiedzi API.
 */
async function sendToUser(userId, { title, body, data }) {
  if (!config.pushEnabled) return;

  const chosen = pickTokens(selectForUser.all(userId));
  if (chosen.length === 0) return;

  const message = { title, body, data };
  const fcmTokens = chosen.filter((c) => c.kind === 'fcm').map((c) => c.token);
  const expoTokens = chosen.filter((c) => c.kind === 'expo').map((c) => c.token);

  const jobs = [];
  if (fcmTokens.length > 0 && fcm.isConfigured()) jobs.push(sendViaFcm(fcmTokens, message));
  if (expoTokens.length > 0) jobs.push(sendViaExpo(expoTokens, message));
  await Promise.all(jobs);
}

/** Opis aktualnie używanej drogi wysyłki — do logu startowego i /api/health. */
function transportName() {
  if (!config.pushEnabled) return 'wyłączone';
  if (fcm.isConfigured()) return `Firebase Cloud Messaging (projekt ${fcm.getProjectId()})`;
  return 'przekaźnik Expo';
}

module.exports = {
  isValidToken,
  registerToken,
  unregisterDevice,
  sendToUser,
  transportName,
  pickTokens,
  KINDS,
};
