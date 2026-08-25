const express = require('express');
const db = require('../db');
const { requireAuth, blockUntilPasswordChanged } = require('../middleware/auth');

const router = express.Router();

const selectForUser = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY at DESC LIMIT 50');
const countUnread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0');
const markOne = db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?');
const markAll = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0');
// Powiadomienia to dziennik zdarzeń, nie archiwum — starsze, przeczytane
// wpisy tylko rozdymałyby bazę i listę w dzwonku.
const pruneOld = db.prepare(
  "DELETE FROM notifications WHERE user_id = ? AND read = 1 AND at < datetime('now', '-30 days')"
);

router.use(requireAuth, blockUntilPasswordChanged);

router.get('/', (req, res) => {
  pruneOld.run(req.user.id);
  const rows = selectForUser.all(req.user.id);
  res.json({
    unread: countUnread.get(req.user.id).n,
    notifications: rows.map((n) => ({
      id: n.id,
      text: n.text,
      read: !!n.read,
      at: n.at,
      requestId: n.request_id,
      taskId: n.task_id,
    })),
  });
});

router.post('/:id/read', (req, res) => {
  const result = markOne.run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Nie znaleziono powiadomienia.' });
  res.json({ ok: true });
});

router.post('/read-all', (req, res) => {
  markAll.run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
