const db = require('../db');
const config = require('../config');

/**
 * Powiadomienia push na urządzenia mobilne przez usługę Expo.
 *
 * Aplikacja webowa odpytuje serwer co 15 sekund i to jej wystarcza, ale telefon
 * z zamkniętą aplikacją niczego nie odpytuje — bez pushy zespół dowiadywałby
 * się o nowym zadaniu dopiero po samodzielnym otwarciu aplikacji.
 *
 * Wysyłka jest celowo "best effort": błąd sieci po stronie Expo nie może
 * przerwać zapisu zgłoszenia ani przekazania zadania.
 */

const insertToken = db.prepare(`
  INSERT INTO push_tokens (token, user_id, platform, created_at, last_seen_at)
  VALUES (@token, @userId, @platform, @now, @now)
  ON CONFLICT(token) DO UPDATE SET
    user_id = excluded.user_id,
    platform = excluded.platform,
    last_seen_at = excluded.last_seen_at
`);
const deleteToken = db.prepare('DELETE FROM push_tokens WHERE token = ?');
const deleteTokenForUser = db.prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?');
const selectTokensForUser = db.prepare('SELECT token FROM push_tokens WHERE user_id = ?');

/** Token Expo ma stały kształt — odsiewamy śmieci, zanim trafią do bazy. */
function isExpoToken(value) {
  return typeof value === 'string' && /^Expo(nent)?PushToken\[[^\]]{1,200}\]$/.test(value.trim());
}

function registerToken({ token, userId, platform }) {
  insertToken.run({
    token: token.trim(),
    userId,
    platform: (platform || 'android').slice(0, 20),
    now: new Date().toISOString(),
  });
}

function unregisterToken({ token, userId }) {
  return deleteTokenForUser.run(token.trim(), userId).changes > 0;
}

/**
 * Wysyła jedno powiadomienie na wszystkie urządzenia danej osoby.
 * Wywoływane spoza transakcji (przez setImmediate) — zapis do bazy jest już
 * wtedy zatwierdzony, a ewentualny timeout HTTP nie blokuje odpowiedzi API.
 */
async function sendToUser(userId, { title, body, data }) {
  if (!config.pushEnabled) return;

  const tokens = selectTokensForUser.all(userId).map((r) => r.token);
  if (tokens.length === 0) return;

  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    data: data || {},
    sound: 'default',
    channelId: 'default',
    priority: 'high',
  }));

  let payload;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(config.pushEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    payload = await res.json();
  } catch (err) {
    console.error('[push] nie udało się wysłać powiadomienia:', err.message);
    return;
  }

  // Expo odpowiada tablicą wyników w kolejności wysłanych wiadomości.
  // "DeviceNotRegistered" oznacza odinstalowaną aplikację albo unieważniony
  // token — trzymanie go dalej to wysyłanie w próżnię przy każdym zadaniu.
  const results = (payload && payload.data) || [];
  results.forEach((result, index) => {
    if (result && result.status === 'error') {
      const code = result.details && result.details.error;
      if (code === 'DeviceNotRegistered') {
        deleteToken.run(tokens[index]);
      } else {
        console.error('[push] Expo odrzuciło wiadomość:', result.message || code);
      }
    }
  });
}

module.exports = { isExpoToken, registerToken, unregisterToken, sendToUser };
