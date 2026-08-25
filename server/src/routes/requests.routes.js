const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireAuth, requireAdmin, blockUntilPasswordChanged } = require('../middleware/auth');
const { buildTasks, bm } = require('../lib/tasksBuilder');
const { TEAM, TRIGGERS, MATERIALS } = require('../lib/team');
const { str, idList, safeUrl, isoDate } = require('../lib/validate');
const store = require('../lib/store');

const router = express.Router();

const TEAM_IDS = new Set(TEAM.map((t) => t.id));
const TRIGGER_IDS = new Set(TRIGGERS.map((t) => t.id));
const MATERIAL_IDS = new Set(MATERIALS.map((m) => m.id));

const DEPARTMENTS = new Set([
  'Sprzedaż / Handlowy',
  'Serwis',
  'Likwidacja szkód',
  'Finanse i ubezpieczenia',
  'Inny dział',
]);

const insertRequest = db.prepare(`
  INSERT INTO requests (id, created_at, seen, name, department, location, brand, model, campaign_period,
                        triggers, materials, materials_other, listing_link, event_name, event_date, notes)
  VALUES (@id, @createdAt, 0, @name, @department, @location, @brand, @model, @campaignPeriod,
          @triggers, @materials, @materialsOther, @listingLink, @eventName, @eventDate, @notes)
`);

const insertTask = db.prepare(`
  INSERT INTO tasks (id, request_id, category, title, details, assignees, status, draft_text, transfer_log, updated_at)
  VALUES (@id, @requestId, @category, @title, @details, '[]', 'new', @draftText, '[]', @createdAt)
`);

const selectAdminIds = db.prepare('SELECT id FROM users WHERE is_admin = 1');
const selectKnownUserIds = db.prepare('SELECT id FROM users');

/** Osoby, które faktycznie mają konto — do nich trafiają powiadomienia. */
function knownUserIds() {
  return new Set(selectKnownUserIds.all().map((u) => u.id));
}

/* --------------------------- publiczny formularz --------------------------- */

// POST /api/requests — dostępny bez logowania (formularz dla handlowców).
router.post('/', (req, res) => {
  const body = req.body || {};

  const name = str(body.name, 120);
  if (!name) return res.status(400).json({ error: 'Podaj imię i nazwisko.' });

  const triggers = idList(body.triggers, TRIGGER_IDS, TRIGGERS.length);
  const materials = idList(body.materials, MATERIAL_IDS, MATERIALS.length);
  const materialsOther = str(body.materialsOther, 200);

  if (triggers.length === 0 && materials.length === 0 && !materialsOther) {
    return res.status(400).json({ error: 'Zaznacz przynajmniej jeden typ zgłoszenia albo materiał.' });
  }

  const department = str(body.department, 60);
  const listingLinkRaw = str(body.listingLink, 500);
  const listingLink = safeUrl(listingLinkRaw);
  if (listingLinkRaw && !listingLink) {
    return res.status(400).json({ error: 'Link do ogłoszenia musi być poprawnym adresem http:// lub https://.' });
  }

  const payload = {
    name,
    department: DEPARTMENTS.has(department) ? department : 'Inny dział',
    location: str(body.location, 80),
    brand: str(body.brand, 60),
    model: str(body.model, 60),
    campaignPeriod: str(body.campaignPeriod, 80),
    triggers,
    materials,
    materialsOther,
    listingLink,
    eventName: str(body.eventName, 120),
    eventDate: isoDate(body.eventDate),
    notes: str(body.notes, 4000),
  };

  const adminIds = selectAdminIds.all().map((u) => u.id);
  const tasks = buildTasks(payload, { fallbackAssignees: adminIds });
  const known = knownUserIds();

  const id = store.newId();
  const createdAt = new Date().toISOString();

  // Wszystko w jednej transakcji: albo zapisujemy zgłoszenie razem z zadaniami
  // i powiadomieniami, albo nic — bez stanów pośrednich w bazie.
  const save = db.transaction(() => {
    insertRequest.run({
      id,
      createdAt,
      name: payload.name,
      department: payload.department,
      location: payload.location,
      brand: payload.brand,
      model: payload.model,
      campaignPeriod: payload.campaignPeriod,
      triggers: JSON.stringify(triggers),
      materials: JSON.stringify(materials),
      materialsOther: payload.materialsOther,
      listingLink: payload.listingLink,
      eventName: payload.eventName,
      eventDate: payload.eventDate,
      notes: payload.notes,
    });

    for (const task of tasks) {
      insertTask.run({
        id: task.id,
        requestId: id,
        category: task.category,
        title: task.title,
        details: task.details,
        draftText: task.draftText,
        createdAt,
      });
      store.setAssignees(task.id, task.assignees.filter((a) => TEAM_IDS.has(a)));
    }

    const brandModelLabel = bm(payload);
    const notified = new Set();

    for (const task of tasks) {
      for (const assignee of task.assignees) {
        if (!known.has(assignee) || notified.has(assignee)) continue;
        notified.add(assignee);
        const own = tasks.filter((t) => t.assignees.includes(assignee));
        const suffix = payload.brand ? `, ${brandModelLabel}` : '';
        const single = own.length === 1;
        store.pushNotification({
          userId: assignee,
          text: single
            ? `Nowe zadanie: „${own[0].title}” (zgłoszenie: ${name}${suffix})`
            : `${own.length} nowych zadań ze zgłoszenia: ${name}${suffix}`,
          title: single ? 'Nowe zadanie' : `${own.length} nowych zadań`,
          pushBody: single ? `${own[0].title} — od ${name}${suffix}` : `Zgłoszenie od ${name}${suffix}`,
          requestId: id,
          taskId: single ? own[0].id : null,
        });
      }
    }

    // Administrator zawsze dowiaduje się o nowym zgłoszeniu, nawet jeśli
    // żadne zadanie nie trafiło bezpośrednio do niego.
    for (const adminId of adminIds) {
      if (notified.has(adminId)) continue;
      store.pushNotification({
        userId: adminId,
        text: `Nowe zgłoszenie od ${name}: ${brandModelLabel} — utworzono ${tasks.length} zadań`,
        title: 'Nowe zgłoszenie',
        pushBody: `${name}: ${brandModelLabel} — ${tasks.length} zadań`,
        requestId: id,
      });
    }
  });

  save();

  res.status(201).json({
    requestId: id,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, category: t.category, assignees: t.assignees })),
  });
});

/* ------------------------------- panel zespołu ------------------------------- */

// GET /api/requests — admin widzi wszystkie zgłoszenia, pracownik wyłącznie te,
// w których ma przypisane zadanie (i tylko własne zadania w środku).
//
// Filtrowanie odbywa się w zapytaniu SQL, a nie w przeglądarce: dane innych
// osób nigdy nie opuszczają serwera, więc nie da się ich odczytać z konsoli
// deweloperskiej ani z ruchu sieciowego.
router.get('/', requireAuth, blockUntilPasswordChanged, (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || config.requestsPageSize, 1), 500);

  let requestRows;
  let taskRows;

  if (req.user.isAdmin) {
    requestRows = db.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT ?').all(limit);
    const ids = requestRows.map((r) => r.id);
    taskRows = ids.length
      ? db.prepare(`SELECT * FROM tasks WHERE request_id IN (${ids.map(() => '?').join(',')})`).all(...ids)
      : [];
  } else {
    requestRows = db
      .prepare(
        `SELECT r.* FROM requests r
          WHERE EXISTS (
            SELECT 1 FROM tasks t
              JOIN task_assignees ta ON ta.task_id = t.id
             WHERE t.request_id = r.id AND ta.user_id = ?
          )
          ORDER BY r.created_at DESC
          LIMIT ?`
      )
      .all(req.user.id, limit);
    const ids = requestRows.map((r) => r.id);
    taskRows = ids.length
      ? db
          .prepare(
            `SELECT t.* FROM tasks t
               JOIN task_assignees ta ON ta.task_id = t.id
              WHERE ta.user_id = ? AND t.request_id IN (${ids.map(() => '?').join(',')})`
          )
          .all(req.user.id, ...ids)
      : [];
  }

  const assigneesByTask = store.getAssigneesFor(taskRows.map((t) => t.id));
  const tasksByRequest = new Map();
  for (const row of taskRows) {
    if (!tasksByRequest.has(row.request_id)) tasksByRequest.set(row.request_id, []);
    tasksByRequest.get(row.request_id).push(store.taskRowToJson(row, assigneesByTask.get(row.id) || []));
  }

  res.json({
    requests: requestRows.map((row) => store.requestRowToJson(row, tasksByRequest.get(row.id) || [])),
  });
});

// PATCH /api/requests/:id/seen — oznaczenie zgłoszenia jako obsłużonego
router.patch('/:id/seen', requireAuth, blockUntilPasswordChanged, requireAdmin, (req, res) => {
  const result = db.prepare('UPDATE requests SET seen = 1 WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
  res.json({ ok: true });
});

// DELETE /api/requests/:id — usunięcie zgłoszenia wraz z zadaniami.
// Formularz jest publiczny, więc administrator musi mieć czym sprzątnąć spam
// albo pomyłkowe zgłoszenie bez sięgania do bazy przez SSH.
router.delete('/:id', requireAuth, blockUntilPasswordChanged, requireAdmin, (req, res) => {
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM notifications WHERE request_id = ?').run(req.params.id);
    return db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
  });
  const result = remove();
  if (result.changes === 0) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
  res.json({ ok: true });
});

module.exports = router;
