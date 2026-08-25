const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { buildTasks, bm } = require('../lib/tasksBuilder');
const { TEAM } = require('../lib/team');

const router = express.Router();
const TEAM_IDS = new Set(TEAM.map((t) => t.id));

function taskRowToJson(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    details: row.details || '',
    assignees: JSON.parse(row.assignees || '[]'),
    status: row.status,
    draftText: row.draft_text || '',
    transferLog: JSON.parse(row.transfer_log || '[]'),
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
    triggers: JSON.parse(row.triggers || '[]'),
    materials: JSON.parse(row.materials || '[]'),
    materialsOther: row.materials_other,
    listingLink: row.listing_link,
    eventName: row.event_name,
    eventDate: row.event_date,
    notes: row.notes,
    tasks,
  };
}

function pushNotification({ id, userId, text, requestId, taskId }) {
  db.prepare(
    'INSERT INTO notifications (id, user_id, text, read, at, request_id, task_id) VALUES (?, ?, ?, 0, ?, ?, ?)'
  ).run(id, userId, text, new Date().toISOString(), requestId || null, taskId || null);
}

// POST /api/requests — publiczny formularz zgłoszeniowy, bez logowania
router.post('/', (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Podaj imię i nazwisko.' });

  const triggers = Array.isArray(body.triggers) ? body.triggers : [];
  const materials = Array.isArray(body.materials) ? body.materials : [];
  const materialsOther = String(body.materialsOther || '').trim();
  if (triggers.length === 0 && materials.length === 0 && !materialsOther) {
    return res.status(400).json({ error: 'Zaznacz przynajmniej jeden typ zgłoszenia albo materiał.' });
  }

  const reqObj = {
    brand: String(body.brand || '').trim(),
    model: String(body.model || '').trim(),
    location: String(body.location || '').trim(),
    campaignPeriod: String(body.campaignPeriod || '').trim(),
    triggers,
    materials,
    materialsOther,
    listingLink: String(body.listingLink || '').trim(),
    eventName: String(body.eventName || '').trim(),
    eventDate: String(body.eventDate || '').trim(),
    notes: String(body.notes || '').trim(),
  };

  const tasks = buildTasks(reqObj);
  const id = uuidv4();
  const createdAt = new Date().toISOString();

  const insertRequest = db.prepare(`
    INSERT INTO requests (id, created_at, seen, name, department, location, brand, model, campaign_period, triggers, materials, materials_other, listing_link, event_name, event_date, notes)
    VALUES (@id, @createdAt, 0, @name, @department, @location, @brand, @model, @campaignPeriod, @triggers, @materials, @materialsOther, @listingLink, @eventName, @eventDate, @notes)
  `);
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, request_id, category, title, details, assignees, status, draft_text, transfer_log)
    VALUES (@id, @requestId, @category, @title, @details, @assignees, 'new', @draftText, '[]')
  `);

  const txn = db.transaction(() => {
    insertRequest.run({
      id, createdAt, name,
      department: String(body.department || '').trim(),
      location: reqObj.location, brand: reqObj.brand, model: reqObj.model,
      campaignPeriod: reqObj.campaignPeriod,
      triggers: JSON.stringify(triggers), materials: JSON.stringify(materials),
      materialsOther, listingLink: reqObj.listingLink, eventName: reqObj.eventName,
      eventDate: reqObj.eventDate, notes: reqObj.notes,
    });
    tasks.forEach((t) => insertTask.run({
      id: t.id, requestId: id, category: t.category, title: t.title, details: t.details,
      assignees: JSON.stringify(t.assignees), draftText: t.draftText,
    }));

    const assigneeSet = new Set();
    tasks.forEach((t) => t.assignees.forEach((a) => { if (TEAM_IDS.has(a)) assigneeSet.add(a); }));
    const brandModelLabel = bm(reqObj);
    assigneeSet.forEach((a) => {
      const myTasks = tasks.filter((t) => t.assignees.includes(a));
      const text = myTasks.length === 1
        ? `Nowe zadanie: „${myTasks[0].title}” (zgłoszenie: ${name}${reqObj.brand ? ', ' + brandModelLabel : ''})`
        : `${myTasks.length} nowych zadań ze zgłoszenia: ${name}${reqObj.brand ? ', ' + brandModelLabel : ''}`;
      pushNotification({ id: uuidv4(), userId: a, text, requestId: id });
    });
    if (!assigneeSet.has('karolina')) {
      pushNotification({ id: uuidv4(), userId: 'karolina', text: `Nowe zgłoszenie od ${name}: ${brandModelLabel} — ${tasks.length} zadań utworzonych`, requestId: id });
    }
  });
  txn();

  res.status(201).json({ tasks });
});

// GET /api/requests — panel (admin widzi wszystko, pracownik tylko swoje zadania)
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
  const allTasks = db.prepare('SELECT * FROM tasks').all();
  const tasksByRequest = new Map();
  allTasks.forEach((t) => {
    if (!tasksByRequest.has(t.request_id)) tasksByRequest.set(t.request_id, []);
    tasksByRequest.get(t.request_id).push(t);
  });

  const out = [];
  rows.forEach((row) => {
    let taskRows = tasksByRequest.get(row.id) || [];
    if (!req.user.isAdmin) {
      taskRows = taskRows.filter((t) => JSON.parse(t.assignees || '[]').includes(req.user.id));
      if (taskRows.length === 0) return; // pracownik nie widzi zgłoszeń bez swoich zadań
    }
    out.push(requestRowToJson(row, taskRows.map(taskRowToJson)));
  });
  res.json({ requests: out });
});

// PATCH /api/requests/:id/seen — tylko admin
router.patch('/:id/seen', requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare('UPDATE requests SET seen = 1 WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
  res.json({ ok: true });
});

module.exports = router;
