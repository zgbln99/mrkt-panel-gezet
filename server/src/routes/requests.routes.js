const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireAuth, requireAdmin, blockUntilPasswordChanged } = require('../middleware/auth');
const { buildTasks, bm } = require('../lib/tasksBuilder');
const { TEAM, CATS, TRIGGERS, MATERIALS, PHOTO_VIDEO_SCOPES } = require('../lib/team');
const { str, idList, oneOf, safeUrl, isoDate } = require('../lib/validate');
const store = require('../lib/store');

const router = express.Router();

const TEAM_IDS = new Set(TEAM.map((t) => t.id));
const CAT_IDS = new Set(CATS.map((c) => c.id));
const TRIGGER_IDS = new Set(TRIGGERS.map((t) => t.id));
const MATERIAL_IDS = new Set(MATERIALS.map((m) => m.id));
const SCOPE_IDS = new Set(PHOTO_VIDEO_SCOPES.map((s) => s.id));

const DEPARTMENTS = new Set([
  'Sprzedaż / Handlowy',
  'Serwis',
  'Likwidacja szkód',
  'Finanse i ubezpieczenia',
  'Inny dział',
]);

const insertRequest = db.prepare(`
  INSERT INTO requests (id, created_at, seen, name, department, location, brand, model, campaign_period,
                        triggers, materials, materials_other, photo_video_scope,
                        listing_link, event_name, event_date, notes)
  VALUES (@id, @createdAt, @seen, @name, @department, @location, @brand, @model, @campaignPeriod,
          @triggers, @materials, @materialsOther, @photoVideoScope,
          @listingLink, @eventName, @eventDate, @notes)
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

/* ------------------------- wspólna obsługa zgłoszeń ------------------------- */

/**
 * Sprowadza treść żądania do bezpiecznego zgłoszenia.
 *
 * Ten sam zestaw pól przyjmuje publiczny formularz i panel administratora —
 * limity długości oraz białe listy identyfikatorów muszą być identyczne,
 * dlatego żyją w jednym miejscu, a nie w dwóch kopiach obok siebie.
 *
 * Zwraca `{ payload }` albo `{ error }` z komunikatem dla użytkownika.
 */
function readRequestPayload(body) {
  const name = str(body.name, 120);
  if (!name) return { error: 'Podaj imię i nazwisko.' };

  const department = str(body.department, 60);
  const listingLinkRaw = str(body.listingLink, 500);
  const listingLink = safeUrl(listingLinkRaw);
  if (listingLinkRaw && !listingLink) {
    return { error: 'Link do ogłoszenia musi być poprawnym adresem http:// lub https://.' };
  }

  return {
    payload: {
      name,
      department: DEPARTMENTS.has(department) ? department : 'Inny dział',
      location: str(body.location, 80),
      brand: str(body.brand, 60),
      model: str(body.model, 60),
      campaignPeriod: str(body.campaignPeriod, 80),
      triggers: idList(body.triggers, TRIGGER_IDS, TRIGGERS.length),
      materials: idList(body.materials, MATERIAL_IDS, MATERIALS.length),
      materialsOther: str(body.materialsOther, 200),
      photoVideoScope: oneOf(body.photoVideoScope, SCOPE_IDS, 'both'),
      listingLink,
      eventName: str(body.eventName, 120),
      eventDate: isoDate(body.eventDate),
      notes: str(body.notes, 4000),
    },
  };
}

/** Czy ze zgłoszenia da się cokolwiek wygenerować (typ zlecenia albo materiał). */
function hasContent(payload) {
  return payload.triggers.length > 0 || payload.materials.length > 0 || !!payload.materialsOther;
}

/**
 * Zadania dopisane ręcznie w panelu administratora — poza tym, co wynika
 * z typu zlecenia. Każde musi mieć tytuł, znaną kategorię i wykonawcę,
 * inaczej wpadłoby do tablicy jako kafelek bez adresata.
 */
function readCustomTasks(value) {
  if (value === undefined || value === null) return { tasks: [] };
  if (!Array.isArray(value)) return { error: 'Nieprawidłowa lista zadań.' };
  if (value.length > 20) return { error: 'Za dużo zadań naraz — maksymalnie 20.' };

  const tasks = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return { error: 'Nieprawidłowe zadanie.' };
    const title = str(item.title, 200);
    if (!title) return { error: 'Każde zadanie musi mieć tytuł.' };
    const category = oneOf(item.category, CAT_IDS);
    if (!category) return { error: `Wybierz kategorię dla zadania „${title}”.` };
    const assignees = idList(item.assignees, TEAM_IDS, TEAM.length);
    if (assignees.length === 0) {
      return { error: `Zadanie „${title}” musi mieć przynajmniej jedną osobę odpowiedzialną.` };
    }
    tasks.push({
      id: store.newId(),
      category,
      title,
      details: str(item.details, 2000),
      assignees,
      status: 'new',
      draftText: '',
      transferLog: [],
    });
  }
  return { tasks };
}

/**
 * Zapisuje zgłoszenie razem z zadaniami i powiadomieniami.
 *
 * Wszystko w jednej transakcji: albo zapisujemy komplet, albo nic — bez stanów
 * pośrednich w bazie. `seen` odróżnia zgłoszenie z formularza (czeka na
 * przeczytanie) od zlecenia wpisanego w panelu, a `skipNotifyUserId` chroni
 * administratora przed powiadomieniem o własnym wpisie.
 */
function saveRequest(payload, tasks, { adminIds, seen = false, skipNotifyUserId = null } = {}) {
  const known = knownUserIds();
  const id = store.newId();
  const createdAt = new Date().toISOString();
  const { name } = payload;

  const save = db.transaction(() => {
    insertRequest.run({
      id,
      createdAt,
      seen: seen ? 1 : 0,
      name: payload.name,
      department: payload.department,
      location: payload.location,
      brand: payload.brand,
      model: payload.model,
      campaignPeriod: payload.campaignPeriod,
      triggers: JSON.stringify(payload.triggers),
      materials: JSON.stringify(payload.materials),
      materialsOther: payload.materialsOther,
      photoVideoScope: payload.photoVideoScope,
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
    if (skipNotifyUserId) notified.add(skipNotifyUserId);

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
  return id;
}

function tasksResponse(id, tasks) {
  return {
    requestId: id,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, category: t.category, assignees: t.assignees })),
  };
}

/* --------------------------- publiczny formularz --------------------------- */

// POST /api/requests — dostępny bez logowania (formularz dla handlowców).
router.post('/', (req, res) => {
  const parsed = readRequestPayload(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const payload = parsed.payload;
  if (!hasContent(payload)) {
    return res.status(400).json({ error: 'Zaznacz przynajmniej jeden typ zgłoszenia albo materiał.' });
  }

  const adminIds = selectAdminIds.all().map((u) => u.id);
  const tasks = buildTasks(payload, { fallbackAssignees: adminIds });
  const id = saveRequest(payload, tasks, { adminIds });

  res.status(201).json(tasksResponse(id, tasks));
});

/* --------------------- zlecenie wpisane w panelu admina --------------------- */

// POST /api/requests/manual — administrator dodaje zlecenie z panelu: wybiera
// typ zlecenia z tej samej listy co formularz publiczny (zadania powstają
// automatycznie) i/lub dopisuje własne zadania z kategorią i wykonawcą.
//
// Zgłoszenie od razu jest oznaczone jako przeczytane — administrator właśnie je
// wpisał, więc nie ma czego „zauważać” na liście nieprzeczytanych.
router.post('/manual', requireAuth, blockUntilPasswordChanged, requireAdmin, (req, res) => {
  const body = req.body || {};
  // Pole „zlecający” bywa puste, gdy zadanie wychodzi od samego marketingu —
  // wtedy podpisujemy je kontem, które je utworzyło.
  const parsed = readRequestPayload({ ...body, name: str(body.name, 120) || req.user.name });
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const custom = readCustomTasks(body.customTasks);
  if (custom.error) return res.status(400).json({ error: custom.error });

  // Zadania z typu zlecenia rozdzielają się domyślnie wg ról (foto → Piotr,
  // video → Bogdan itd.). Administrator może to nadpisać i skierować komplet
  // do wskazanych osób — np. gdy ktoś jest na urlopie.
  const assigneesOverride = idList(body.assigneesOverride, TEAM_IDS, TEAM.length);

  const payload = parsed.payload;
  if (!hasContent(payload) && custom.tasks.length === 0) {
    return res.status(400).json({ error: 'Wybierz typ zlecenia albo dopisz własne zadanie.' });
  }

  const adminIds = selectAdminIds.all().map((u) => u.id);
  const generated = hasContent(payload)
    ? buildTasks(payload, { fallbackAssignees: adminIds, allowFallback: custom.tasks.length === 0 })
    : [];
  if (assigneesOverride.length > 0) {
    for (const task of generated) task.assignees = [...assigneesOverride];
  }
  const tasks = [...generated, ...custom.tasks];

  const id = saveRequest(payload, tasks, { adminIds, seen: true, skipNotifyUserId: req.user.id });

  res.status(201).json(tasksResponse(id, tasks));
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
