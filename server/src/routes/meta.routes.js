const express = require('express');
const { TEAM, CATS, TRIGGERS, MATERIALS, PHOTO_VIDEO_SCOPES } = require('../lib/team');
const { MIN_PASSWORD_LENGTH } = require('../auth');

const router = express.Router();

// Metadane są stałe przez cały czas życia procesu — liczymy odpowiedź raz.
const payload = JSON.stringify({
  team: TEAM,
  cats: CATS,
  triggers: TRIGGERS,
  materials: MATERIALS,
  photoVideoScopes: PHOTO_VIDEO_SCOPES,
  passwordMinLength: MIN_PASSWORD_LENGTH,
});

router.get('/', (_req, res) => {
  // Krótki cache: formularz odpytuje ten endpoint przy każdym otwarciu strony,
  // a zawartość zmienia się wyłącznie po wdrożeniu nowej wersji aplikacji.
  res.set('Cache-Control', 'public, max-age=300');
  res.type('application/json').send(payload);
});

module.exports = router;
