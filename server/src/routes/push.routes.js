const express = require('express');
const { requireAuth, blockUntilPasswordChanged } = require('../middleware/auth');
const { str } = require('../lib/validate');
const push = require('../lib/push');

const router = express.Router();

router.use(requireAuth, blockUntilPasswordChanged);

// POST /api/push/register — aplikacja mobilna zgłasza token urządzenia.
// Wywoływane przy każdym starcie aplikacji: tokeny bywają odnawiane przez
// system, a zapis odświeża też last_seen_at.
//
// Telefon wysyła oddzielnie token FCM i token Expo, oznaczone tym samym
// deviceId — serwer wybiera potem jedną drogę wysyłki na urządzenie.
router.post('/register', (req, res) => {
  const { token, platform } = req.body || {};
  const kind = str(req.body && req.body.kind, 10) || 'expo';
  const deviceId = str(req.body && req.body.deviceId, 64);

  if (!push.KINDS.has(kind)) {
    return res.status(400).json({ error: 'Nieznany rodzaj tokenu urządzenia.' });
  }
  if (!push.isValidToken(token, kind)) {
    return res.status(400).json({ error: 'Nieprawidłowy token urządzenia.' });
  }

  push.registerToken({ token, userId: req.user.id, deviceId, kind, platform });
  res.json({ ok: true, transport: push.transportName() });
});

// POST /api/push/unregister — wylogowanie na telefonie.
// Bez tego kolejne powiadomienia trafiałyby na urządzenie osoby, która się
// już wylogowała. Kasujemy po deviceId, żeby zniknęły oba tokeny naraz.
router.post('/unregister', (req, res) => {
  const deviceId = str(req.body && req.body.deviceId, 64);
  const token = str(req.body && req.body.token, 4096);

  if (!deviceId && !token) {
    return res.status(400).json({ error: 'Brak identyfikatora urządzenia.' });
  }

  push.unregisterDevice({ deviceId, token, userId: req.user.id });
  res.json({ ok: true });
});

module.exports = router;
