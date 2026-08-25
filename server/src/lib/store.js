const crypto = require('crypto');
const db = require('../db');

const newId = () => crypto.randomUUID();

/* ----------------------------- przypisania ----------------------------- */

const selectAssignees = db.prepare('SELECT user_id FROM task_assignees WHERE task_id = ? ORDER BY user_id');
const insertAssignee = db.prepare('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)');
const deleteAssignees = db.prepare('DELETE FROM task_assignees WHERE task_id = ?');
const touchTask = db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?');

function getAssignees(taskId) {
  return selectAssignees.all(taskId).map((r) => r.user_id);
}

/** Mapa taskId → [userId] dla wielu zadań naraz (jedno zapytanie zamiast N). */
function getAssigneesFor(taskIds) {
  const map = new Map();
  if (taskIds.length === 0) return map;
  // SQLite ma limit ~999 parametrów w zapytaniu — dzielimy na paczki.
  for (let i = 0; i < taskIds.length; i += 500) {
    const chunk = taskIds.slice(i, i + 500);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT task_id, user_id FROM task_assignees WHERE task_id IN (${placeholders}) ORDER BY user_id`)
      .all(...chunk);
    for (const row of rows) {
      if (!map.has(row.task_id)) map.set(row.task_id, []);
      map.get(row.task_id).push(row.user_id);
    }
  }
  return map;
}

/** Nadpisuje listę osób przypisanych do zadania (wywoływać wewnątrz transakcji). */
function setAssignees(taskId, userIds) {
  deleteAssignees.run(taskId);
  for (const userId of userIds) insertAssignee.run(taskId, userId);
  touchTask.run(new Date().toISOString(), taskId);
}

function isAssignedTo(taskId, userId) {
  return db.prepare('SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?').get(taskId, userId) !== undefined;
}

/* ------------------------------ serializacja ------------------------------ */

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function taskRowToJson(row, assignees) {
  return {
    id: row.id,
    requestId: row.request_id,
    category: row.category,
    title: row.title,
    details: row.details || '',
    assignees: assignees || getAssignees(row.id),
    status: row.status,
    draftText: row.draft_text || '',
    transferLog: parseJson(row.transfer_log, []),
    updatedAt: row.updated_at || null,
  };
}

function requestRowToJson(row, tasks) {
  return {
    id: row.id,
    createdAt: row.created_at,
    seen: !!row.seen,
    name: row.name,
    department: row.department,
    location: row.location,
    brand: row.brand,
    model: row.model,
    campaignPeriod: row.campaign_period,
    triggers: parseJson(row.triggers, []),
    materials: parseJson(row.materials, []),
    materialsOther: row.materials_other,
    listingLink: row.listing_link,
    eventName: row.event_name,
    eventDate: row.event_date,
    notes: row.notes,
    tasks,
  };
}

/* ------------------------------ powiadomienia ------------------------------ */

const insertNotification = db.prepare(
  'INSERT INTO notifications (id, user_id, text, read, at, request_id, task_id) VALUES (?, ?, ?, 0, ?, ?, ?)'
);

function pushNotification({ userId, text, requestId, taskId }) {
  insertNotification.run(newId(), userId, text, new Date().toISOString(), requestId || null, taskId || null);
}

module.exports = {
  newId,
  getAssignees,
  getAssigneesFor,
  setAssignees,
  isAssignedTo,
  taskRowToJson,
  requestRowToJson,
  pushNotification,
  parseJson,
};
