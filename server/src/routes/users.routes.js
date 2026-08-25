const express = require('express');
const db = require('../db');
const { hashPassword } = require('../auth');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users — lista kont zespołu (bez hashy haseł), tylko admin
router.get('/', requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT id, username, name, role, is_admin FROM users ORDER BY is_admin DESC, name ASC').all();
  res.json({ users: rows.map((u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, isAdmin: !!u.is_admin })) });
});

// POST /api/users/:id/reset-password — admin ustawia nowe hasło dowolnej
// osobie (np. gdy ktoś zapomniał hasła) — bez znajomości starego hasła,
// bo to admin wykonuje operację w cudzym imieniu.
router.post('/:id/reset-password', requireAuth, requireAdmin, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Nowe hasło musi mieć co najmniej 8 znaków.' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Nie znaleziono konta.' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), user.id);
  res.json({ ok: true });
});

module.exports = router;
