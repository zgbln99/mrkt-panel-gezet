const express = require('express');
const db = require('../db');
const { verifyPassword, hashPassword, signToken } = require('../auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Bardzo prosty rate-limit w pamięci procesu: max 8 nieudanych prób logowania
// na adres IP w ciągu 10 minut. Chroni przed prostym brute-force na hasła.
const attempts = new Map(); // ip -> [timestamps]
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  attempts.set(ip, list);
  return list.length >= MAX_ATTEMPTS;
}
function recordFailedAttempt(ip) {
  const list = attempts.get(ip) || [];
  list.push(Date.now());
  attempts.set(ip, list);
}

router.post('/login', (req, res) => {
  const ip = req.ip;
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za kilka minut.' });
  }

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Podaj login i hasło.' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim().toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Nieprawidłowy login lub hasło.' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, isAdmin: !!user.is_admin },
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password — każdy zalogowany zmienia WŁASNE hasło,
// wymaga podania aktualnego hasła (chroni przed przejęciem konta z
// pozostawionej otwartej sesji).
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Podaj aktualne i nowe hasło.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Nowe hasło musi mieć co najmniej 8 znaków.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Aktualne hasło jest nieprawidłowe.' });
  }
  if (verifyPassword(newPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Nowe hasło musi różnić się od poprzedniego.' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), user.id);
  res.json({ ok: true });
});

module.exports = router;
