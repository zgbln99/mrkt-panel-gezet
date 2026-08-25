/**
 * Wczytanie i walidacja konfiguracji ze zmiennych środowiskowych.
 *
 * Cała walidacja dzieje się TUTAJ i przy starcie procesu — dzięki temu błąd
 * konfiguracji na VPS-ie kończy się czytelnym komunikatem w logu pm2/systemd,
 * a nie zagadkowym crashem w środku obsługi requestu.
 */
require('dotenv').config();

const path = require('path');

const errors = [];

function requiredSecret(name, minLength) {
  const value = process.env[name];
  if (!value || value.trim().length < minLength) {
    errors.push(
      `${name} jest pusty lub zbyt krótki (wymagane min. ${minLength} znaków). ` +
        'Wygeneruj sekret: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
    return null;
  }
  if (/^zmien-to/i.test(value)) {
    errors.push(`${name} nadal ma wartość-zaślepkę z .env.example — ustaw własny, losowy sekret.`);
    return null;
  }
  return value.trim();
}

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    errors.push(`${name} musi być liczbą całkowitą (otrzymano: "${raw}").`);
    return fallback;
  }
  return parsed;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// Lista dozwolonych originów dla CORS. Pusta lista = brak żądań cross-origin,
// co jest poprawnym (i najbezpieczniejszym) stanem, gdy frontend i API stoją
// pod tą samą domeną za nginx-em.
const clientOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const config = {
  nodeEnv: NODE_ENV,
  isProduction,
  port: intFromEnv('PORT', 4000),
  host: process.env.HOST || '127.0.0.1',
  jwtSecret: requiredSecret('JWT_SECRET', 32),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbPath: path.resolve(process.env.DB_PATH || './data/gezet.db'),
  clientOrigins,
  // Liczba warstw proxy przed aplikacją (nginx = 1). Bez tego Express widzi
  // każde żądanie jako pochodzące z 127.0.0.1 i rate-limit per-IP przestaje
  // działać — jeden bot wyczerpałby limit całemu zespołowi.
  trustProxy: intFromEnv('TRUST_PROXY', 1),
  bcryptRounds: intFromEnv('BCRYPT_ROUNDS', 12),
  // Ile zgłoszeń zwraca panel w jednym zapytaniu (panel odpytuje cyklicznie).
  requestsPageSize: intFromEnv('REQUESTS_PAGE_SIZE', 200),
  logRequests: process.env.LOG_REQUESTS !== 'false',
  // Powiadomienia push na telefony (aplikacja mobilna). Wyłączenie nie psuje
  // niczego innego — powiadomienia w aplikacji działają niezależnie.
  pushEnabled: process.env.PUSH_ENABLED !== 'false',
  pushEndpoint: process.env.PUSH_ENDPOINT || 'https://exp.host/--/api/v2/push/send',
};

if (config.bcryptRounds < 10 || config.bcryptRounds > 15) {
  errors.push('BCRYPT_ROUNDS powinno mieścić się w przedziale 10–15 (domyślnie 12).');
}

if (errors.length > 0) {
  const message =
    'Nieprawidłowa konfiguracja aplikacji — popraw plik .env i uruchom ponownie:\n' +
    errors.map((e) => `  • ${e}`).join('\n');
  throw new Error(message);
}

module.exports = config;
