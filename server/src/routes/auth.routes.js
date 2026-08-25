const express = require('express');
const db = require('../db');
const {
  verifyPassword,
  hashPassword,
  signToken,
  validatePassword,
} = require('../auth');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const selectByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const selectById = db.prepare('SELECT * FROM users WHERE id = ?');
const markLogin = db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?');
const updatePassword = db.prepare(
  'UPDATE users SET password_hash = ?, token_version = token_version + 1, must_change_password = 0 WHERE id = ?'
);

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    isAdmin: !!user.is_admin,
    mustChangePassword: !!user.must_change_password,
  };
}

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Podaj login i hasło.' });
    }

    const user = selectByUsername.get(username.trim().toLowerCase().slice(0, 64));

    // Hash porównujemy także dla nieistniejącego loginu (na stałej atrapie),
    // żeby czas odpowiedzi nie zdradzał, które loginy istnieją w systemie.
    const hash = user ? user.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await verifyPassword(password, hash);

    if (!user || !ok) {
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło.' });
    }

    markLogin.run(new Date().toISOString(), user.id);
    // Udane logowanie zeruje licznik nieudanych prób dla tego adresu IP.
    if (typeof req.resetLoginAttempts === 'function') req.resetLoginAttempts();

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// GET /api/auth/me — odtworzenie sesji z zapisanego tokenu
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password — zmiana WŁASNEGO hasła.
// Wymaga aktualnego hasła, dzięki czemu porzucona, otwarta sesja nie
// wystarcza do trwałego przejęcia konta.
router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Podaj aktualne i nowe hasło.' });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const user = selectById.get(req.user.id);
    if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Aktualne hasło jest nieprawidłowe.' });
    }
    if (await verifyPassword(newPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Nowe hasło musi różnić się od poprzedniego.' });
    }

    const hash = await hashPassword(newPassword);
    updatePassword.run(hash, user.id);

    // token_version wzrósł, więc dotychczasowy token (także ten w tej
    // przeglądarce) przestał być ważny — odsyłamy świeży, żeby osoba
    // zmieniająca hasło nie została wylogowana w trakcie pracy.
    const updated = selectById.get(user.id);
    res.json({ ok: true, token: signToken(updated), user: publicUser(updated) });
  })
);

module.exports = router;
