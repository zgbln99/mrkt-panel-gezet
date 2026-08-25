const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

/**
 * Hashowanie haseł działa asynchronicznie (bcryptjs rozbija pracę na kawałki
 * przez setImmediate). Wariant `*Sync` przy koszcie 12 blokowałby pętlę
 * zdarzeń na kilkaset ms — czyli całe API zamierałoby na czas każdego
 * logowania i każdej zmiany hasła.
 */
function hashPassword(plain) {
  return new Promise((resolve, reject) => {
    bcrypt.hash(String(plain), config.bcryptRounds, (err, hash) => (err ? reject(err) : resolve(hash)));
  });
}

function verifyPassword(plain, hash) {
  return new Promise((resolve) => {
    bcrypt.compare(String(plain), String(hash || ''), (err, ok) => resolve(!err && ok === true));
  });
}

/**
 * Porównanie odporne na atak czasowy — używane tam, gdzie wynik porównania
 * mógłby ujawnić informację o sekrecie.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, isAdmin: !!user.is_admin, tv: user.token_version || 0 },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

/** Losowe, czytelne hasło startowe (bez znaków mylących: 0/O, 1/l/I). */
function generatePassword(length = 16) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * Minimalne wymagania dla hasła. Świadomie stawiamy na długość, a nie na
 * wymuszanie znaków specjalnych — dłuższe hasło daje realnie więcej entropii
 * niż "Haslo1!" i jest łatwiejsze do zapamiętania.
 */
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 128;

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `Hasło może mieć najwyżej ${MAX_PASSWORD_LENGTH} znaków.`;
  }
  if (/^\s|\s$/.test(value)) {
    return 'Hasło nie może zaczynać się ani kończyć spacją.';
  }
  return null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  safeEqual,
  signToken,
  verifyToken,
  generatePassword,
  validatePassword,
  MIN_PASSWORD_LENGTH,
};
