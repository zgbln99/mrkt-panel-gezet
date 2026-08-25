const express = require('express');
const { requireAuth, blockUntilPasswordChanged } = require('../middleware/auth');
const push = require('../lib/push');

const router = express.Router();

router.use(requireAuth, blockUntilPasswordChanged);

// POST /api/push/register — aplikacja mobilna zgłasza token urządzenia.
// Wywoływane przy każdym starcie aplikacji: token Expo bywa odnawiany, a
// zapis odświeża też last_seen_at.
router.post('/register', (req, res) => {
  const { token, platform } = req.body || {};
  if (!push.isExpoToken(token)) {
    return res.status(400).json({ error: 'Nieprawidłowy token urządzenia.' });
  }
  push.registerToken({ token, userId: req.user.id, platform });
  res.json({ ok: true });
});

// POST /api/push/unregister — wylogowanie na telefonie.
// Bez tego kolejne powiadomienia trafiałyby na urządzenie osoby, która się
// już wylogowała.
router.post('/unregister', (req, res) => {
  const { token } = req.body || {};
  if (typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'Brak tokenu urządzenia.' });
  }
  push.unregisterToken({ token, userId: req.user.id });
  res.json({ ok: true });
});

module.exports = router;
