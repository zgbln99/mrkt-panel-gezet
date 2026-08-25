const express = require('express');
const db = require('../db');
const { hashPassword, validatePassword, generatePassword } = require('../auth');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const selectAll = db.prepare(
  `SELECT id, username, name, role, is_admin, must_change_password, last_login_at
     FROM users ORDER BY is_admin DESC, name ASC`
);
const selectById = db.prepare('SELECT id, username, name FROM users WHERE id = ?');
const resetPassword = db.prepare(
  `UPDATE users
      SET password_hash = ?, token_version = token_version + 1, must_change_password = 1
    WHERE id = ?`
);

// GET /api/users — lista kont zespołu (nigdy z hashami haseł)
router.get('/', requireAuth, requireAdmin, (_req, res) => {
  res.json({
    users: selectAll.all().map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      isAdmin: !!u.is_admin,
      mustChangePassword: !!u.must_change_password,
      lastLoginAt: u.last_login_at || null,
    })),
  });
});

// POST /api/users/:id/reset-password — administrator ustawia nowe hasło innej
// osobie (np. po jego zapomnieniu). Pominięcie `newPassword` powoduje
// wygenerowanie losowego hasła i zwrócenie go JEDEN raz w odpowiedzi.
//
// Reset podnosi token_version, więc wszystkie aktywne sesje tego konta
// natychmiast przestają działać — to bywa ważniejsze niż samo hasło, jeśli
// resetujemy po zgubieniu laptopa.
router.post(
  '/:id/reset-password',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = selectById.get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Nie znaleziono konta.' });

    const provided = req.body && req.body.newPassword;
    const generated = provided ? null : generatePassword(16);
    const password = provided || generated;

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    resetPassword.run(await hashPassword(password), user.id);

    res.json({
      ok: true,
      // Hasło odsyłamy wyłącznie wtedy, gdy to my je wygenerowaliśmy —
      // administrator musi mieć co przekazać danej osobie.
      generatedPassword: generated,
      user: { id: user.id, username: user.username, name: user.name },
    });
  })
);

module.exports = router;
