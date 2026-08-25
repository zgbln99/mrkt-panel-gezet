const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  // Nie pozwalamy wystartować z domyślnym/pustym sekretem — na produkcji
  // podpisywanie tokenów słabym sekretem oznacza, że każdy może się podszyć
  // pod dowolnego użytkownika (w tym admina).
  throw new Error('JWT_SECRET jest niepoprawny lub zbyt krótki. Ustaw silny sekret w pliku .env (patrz .env.example).');
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
