const express = require('express');
const { TEAM, CATS, TRIGGERS, MATERIALS } = require('../lib/team');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ team: TEAM, cats: CATS, triggers: TRIGGERS, materials: MATERIALS });
});

module.exports = router;
