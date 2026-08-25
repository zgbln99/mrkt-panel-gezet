const express = require('express');
const db = require('../db');
const { requireAuth, blockUntilPasswordChanged } = require('../middleware/auth');
const { TEAM } = require('../lib/team');
const { str } = require('../lib/validate');
const store = require('../lib/store');

const router = express.Router();

const TEAM_IDS = new Set(TEAM.map((t) => t.id));
const VALID_STATUSES = new Set(['new', 'progress', 'done']);

const selectTask = db.prepare('SELECT * FROM tasks WHERE id = ?');
const selectUserName = db.prepare('SELECT name FROM users WHERE id = ?');
const updateStatus = db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?');
const updateTransferLog = db.prepare('UPDATE tasks SET transfer_log = ?, updated_at = ? WHERE id = ?');

function taskResponse(taskId) {
  return { task: store.taskRowToJson(selectTask.get(taskId)) };
}

// PATCH /api/tasks/:id — zmiana statusu (osoba przypisana albo administrator);
// podmiana całej listy przypisań — wyłącznie administrator.
router.patch('/:id', requireAuth, blockUntilPasswordChanged, (req, res) => {
  const task = selectTask.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Nie znaleziono zadania.' });

  const { status, assignees } = req.body || {};
  if (status === undefined && assignees === undefined) {
    return res.status(400).json({ error: 'Nie podano żadnej zmiany.' });
  }

  if (!req.user.isAdmin && !store.isAssignedTo(task.id, req.user.id)) {
    return res.status(403).json({ error: 'To zadanie nie jest przypisane do Ciebie.' });
  }

  if (assignees !== undefined) {
    if (!req.user.isAdmin) {
      return res.status(403).json({
        error: 'Zmianę pełnej listy przypisań może wykonać tylko administrator. Użyj funkcji „Przekaż”.',
      });
    }
    if (!Array.isArray(assignees) || assignees.length === 0 || assignees.some((a) => !TEAM_IDS.has(a))) {
      return res.status(400).json({ error: 'Nieprawidłowa lista przypisanych osób — zadanie musi mieć wykonawcę.' });
    }
  }

  if (status !== undefined && !VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Nieprawidłowy status.' });
  }

  const apply = db.transaction(() => {
    if (assignees !== undefined) store.setAssignees(task.id, [...new Set(assignees)]);
    if (status !== undefined) updateStatus.run(status, new Date().toISOString(), task.id);
  });
  apply();

  res.json(taskResponse(task.id));
});

// POST /api/tasks/:id/transfer — przekazanie zadania innej osobie z adnotacją.
router.post('/:id/transfer', requireAuth, blockUntilPasswordChanged, (req, res) => {
  const task = selectTask.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Nie znaleziono zadania.' });

  const toUserId = str(req.body && req.body.toUserId, 64);
  if (!toUserId || !TEAM_IDS.has(toUserId)) {
    return res.status(400).json({ error: 'Wybierz prawidłową osobę odbiorcy.' });
  }

  // Pracownik przekazuje wyłącznie własne przypisanie; administrator może
  // przekazać zadanie w imieniu dowolnej osoby (pole fromUserId).
  const requestedFrom = str(req.body && req.body.fromUserId, 64);
  const fromUserId = req.user.isAdmin && requestedFrom ? requestedFrom : req.user.id;

  if (!req.user.isAdmin && fromUserId !== req.user.id) {
    return res.status(403).json({ error: 'Możesz przekazać tylko zadania przypisane do siebie.' });
  }
  if (!store.isAssignedTo(task.id, fromUserId)) {
    return res.status(400).json({ error: 'Osoba przekazująca nie jest przypisana do tego zadania.' });
  }
  if (fromUserId === toUserId) {
    return res.status(400).json({ error: 'Nie można przekazać zadania samemu sobie.' });
  }

  const note = str(req.body && req.body.note, 500);
  const now = new Date().toISOString();

  const apply = db.transaction(() => {
    const next = store.getAssignees(task.id).filter((a) => a !== fromUserId);
    if (!next.includes(toUserId)) next.push(toUserId);
    store.setAssignees(task.id, next);

    const log = store.parseJson(task.transfer_log, []);
    log.push({ from: fromUserId, to: toUserId, note, at: now });
    // Historia przekazań rośnie w nieskończoność przy odbijaniu zadania
    // między osobami — trzymamy ostatnie 50 wpisów.
    updateTransferLog.run(JSON.stringify(log.slice(-50)), now, task.id);

    const fromUser = selectUserName.get(fromUserId);
    store.pushNotification({
      userId: toUserId,
      text: `${fromUser ? fromUser.name : fromUserId} przekazał(a) Ci zadanie: „${task.title}”${note ? ' — ' + note : ''}`,
      requestId: task.request_id,
      taskId: task.id,
    });
  });
  apply();

  res.json(taskResponse(task.id));
});

module.exports = router;
