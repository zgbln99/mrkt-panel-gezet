const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { TEAM } = require('../lib/team');

const router = express.Router();
const TEAM_IDS = new Set(TEAM.map((t) => t.id));
const VALID_STATUSES = new Set(['new', 'progress', 'done']);

function getTask(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}
function isAssignedTo(task, userId) {
  return JSON.parse(task.assignees || '[]').includes(userId);
}
function pushNotification({ userId, text, requestId, taskId }) {
  db.prepare('INSERT INTO notifications (id, user_id, text, read, at, request_id, task_id) VALUES (?, ?, ?, 0, ?, ?, ?)')
    .run(uuidv4(), userId, text, new Date().toISOString(), requestId || null, taskId || null);
}

// PATCH /api/tasks/:id — zmiana statusu (każdy przypisany lub admin);
// zmiana pełnej listy przypisań — wyłącznie admin.
router.patch('/:id', requireAuth, (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Nie znaleziono zadania.' });

  const { status, assignees } = req.body || {};
  const isMine = isAssignedTo(task, req.user.id);
  if (!req.user.isAdmin && !isMine) {
    return res.status(403).json({ error: 'To zadanie nie jest przypisane do Ciebie.' });
  }

  if (assignees !== undefined) {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Zmianę pełnej listy przypisań może wykonać tylko administrator. Użyj funkcji „Przekaż”.' });
    if (!Array.isArray(assignees) || assignees.some((a) => !TEAM_IDS.has(a))) {
      return res.status(400).json({ error: 'Nieprawidłowa lista przypisanych osób.' });
    }
    db.prepare('UPDATE tasks SET assignees = ? WHERE id = ?').run(JSON.stringify(assignees), task.id);
  }

  if (status !== undefined) {
    if (!VALID_STATUSES.has(status)) return res.status(400).json({ error: 'Nieprawidłowy status.' });
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, task.id);
  }

  const updated = getTask(task.id);
  res.json({
    task: {
      id: updated.id, category: updated.category, title: updated.title, details: updated.details || '',
      assignees: JSON.parse(updated.assignees || '[]'), status: updated.status,
      draftText: updated.draft_text || '', transferLog: JSON.parse(updated.transfer_log || '[]'),
    },
  });
});

// POST /api/tasks/:id/transfer — przekazanie zadania innej osobie z adnotacją
router.post('/:id/transfer', requireAuth, (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Nie znaleziono zadania.' });

  const { toUserId, note } = req.body || {};
  if (!toUserId || !TEAM_IDS.has(toUserId)) return res.status(400).json({ error: 'Wybierz prawidłową osobę odbiorcy.' });

  // Zwykły pracownik przekazuje WYŁĄCZNIE własne przypisanie; admin może
  // przekazać zadanie w imieniu dowolnej osoby (fromUserId w body).
  const fromUserId = req.user.isAdmin && req.body.fromUserId ? req.body.fromUserId : req.user.id;
  if (!req.user.isAdmin && fromUserId !== req.user.id) {
    return res.status(403).json({ error: 'Możesz przekazać tylko zadania przypisane do siebie.' });
  }
  if (!isAssignedTo(task, fromUserId)) {
    return res.status(400).json({ error: 'Osoba przekazująca nie jest przypisana do tego zadania.' });
  }
  if (fromUserId === toUserId) return res.status(400).json({ error: 'Nie można przekazać zadania samemu sobie.' });

  let assignees = JSON.parse(task.assignees || '[]').filter((a) => a !== fromUserId);
  if (!assignees.includes(toUserId)) assignees.push(toUserId);
  const transferLog = JSON.parse(task.transfer_log || '[]');
  transferLog.push({ from: fromUserId, to: toUserId, note: String(note || '').trim(), at: new Date().toISOString() });

  db.prepare('UPDATE tasks SET assignees = ?, transfer_log = ? WHERE id = ?')
    .run(JSON.stringify(assignees), JSON.stringify(transferLog), task.id);

  const fromUser = db.prepare('SELECT name FROM users WHERE id = ?').get(fromUserId);
  const text = `${fromUser ? fromUser.name : fromUserId} przekazał(a) Ci zadanie: „${task.title}”${note ? ' — ' + String(note).trim() : ''}`;
  pushNotification({ userId: toUserId, text, requestId: task.request_id, taskId: task.id });

  const updated = getTask(task.id);
  res.json({
    task: {
      id: updated.id, category: updated.category, title: updated.title, details: updated.details || '',
      assignees: JSON.parse(updated.assignees || '[]'), status: updated.status,
      draftText: updated.draft_text || '', transferLog: JSON.parse(updated.transfer_log || '[]'),
    },
  });
});

module.exports = router;
