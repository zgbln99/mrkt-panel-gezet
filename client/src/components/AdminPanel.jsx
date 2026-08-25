import React, { useState, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import TaskCard from './TaskCard.jsx';
import AccountsManager from './AccountsManager.jsx';
import { bm, formatDateTime } from '../utils.js';

const EMPTY_FILTERS = { category: 'all', assignee: 'all', status: 'all', q: '' };

export default function AdminPanel({
  meta,
  requests,
  currentUser,
  onUpdateStatus,
  onUpdateAssignees,
  onTransfer,
  onMarkSeen,
  onDeleteRequest,
  showToast,
}) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pendingDelete, setPendingDelete] = useState(null);

  const stats = useMemo(() => {
    let openTasks = 0;
    let doneTasks = 0;
    let unseen = 0;
    requests.forEach((req) => {
      if (!req.seen) unseen++;
      req.tasks.forEach((task) => (task.status === 'done' ? doneTasks++ : openTasks++));
    });
    return { total: requests.length, openTasks, doneTasks, unseen };
  }, [requests]);

  const matches = (req, task) => {
    if (filters.category !== 'all' && task.category !== filters.category) return false;
    if (filters.assignee !== 'all' && !task.assignees.includes(filters.assignee)) return false;
    if (filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.q) {
      const haystack = [req.name, req.department, req.location, req.brand, req.model, task.title, task.details, req.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  };

  // Zadania grupowane po kategoriach w jednym przebiegu — przy filtrowaniu w
  // pętli po kategoriach lista zgłoszeń byłaby przechodzona pięciokrotnie.
  const columns = useMemo(() => {
    const byCategory = new Map(meta.cats.map((cat) => [cat.id, []]));
    requests.forEach((req) =>
      req.tasks.forEach((task) => {
        const bucket = byCategory.get(task.category);
        if (bucket && matches(req, task)) bucket.push({ req, task });
      })
    );
    return byCategory;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.cats, requests, filters]);

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const confirmDelete = async (req) => {
    try {
      await onDeleteRequest(req.id);
      showToast('Zgłoszenie usunięte');
    } catch (e) {
      showToast(e.message || 'Nie udało się usunąć zgłoszenia.');
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="view active">
      <div className="stats">
        <div className="stat accent">
          <div className="n">{stats.total}</div>
          <div className="l">Zgłoszeń łącznie</div>
        </div>
        <div className="stat crit">
          <div className="n">{stats.unseen}</div>
          <div className="l">Nieprzeczytane</div>
        </div>
        <div className="stat warn">
          <div className="n">{stats.openTasks}</div>
          <div className="l">Zadań otwartych</div>
        </div>
        <div className="stat ok">
          <div className="n">{stats.doneTasks}</div>
          <div className="l">Zadań zrobionych</div>
        </div>
      </div>

      <div className="controls">
        <button className="chip" aria-pressed={filters.category === 'all'} onClick={() => setFilters((f) => ({ ...f, category: 'all' }))}>
          Wszystkie
        </button>
        {meta.cats.map((cat) => (
          <button
            key={cat.id}
            className="chip"
            aria-pressed={filters.category === cat.id}
            onClick={() => setFilters((f) => ({ ...f, category: cat.id }))}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="controls">
        <button className="chip person" aria-pressed={filters.assignee === 'all'} onClick={() => setFilters((f) => ({ ...f, assignee: 'all' }))}>
          Cały zespół
        </button>
        {meta.team.map((person) => (
          <button
            key={person.id}
            className="chip person"
            aria-pressed={filters.assignee === person.id}
            onClick={() => setFilters((f) => ({ ...f, assignee: person.id }))}
          >
            {person.name}
          </button>
        ))}
        <button className="chip status-new" aria-pressed={filters.status === 'new'} onClick={() => setFilters((f) => ({ ...f, status: 'new' }))}>
          Nowe
        </button>
        <button className="chip status-progress" aria-pressed={filters.status === 'progress'} onClick={() => setFilters((f) => ({ ...f, status: 'progress' }))}>
          W trakcie
        </button>
        <button className="chip status-done" aria-pressed={filters.status === 'done'} onClick={() => setFilters((f) => ({ ...f, status: 'done' }))}>
          Zrobione
        </button>
        {/* Reset czyści wszystkie filtry, nie tylko status — wcześniej przycisk
            zerował sam status, zostawiając aktywny filtr osoby i kategorii. */}
        <button className="chip" onClick={() => setFilters(EMPTY_FILTERS)} disabled={!filtersActive}>
          Wyczyść filtry
        </button>
        <input
          type="search"
          className="search"
          placeholder="Szukaj (marka, osoba, treść)…"
          aria-label="Szukaj w zgłoszeniach"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
      </div>

      <div className="board">
        {meta.cats.map((cat) => {
          const cards = columns.get(cat.id) || [];
          return (
            <div className="col" key={cat.id}>
              <div className="col-head">
                <span>{cat.label}</span>
                <span className="n">{cards.length}</span>
              </div>
              {cards.length === 0 && <div className="empty-col">Brak zadań</div>}
              {cards.map(({ req, task }) => (
                <TaskCard
                  key={task.id}
                  meta={meta}
                  req={req}
                  task={task}
                  mode="admin"
                  currentUser={currentUser}
                  onUpdateStatus={onUpdateStatus}
                  onUpdateAssignees={onUpdateAssignees}
                  onTransfer={onTransfer}
                  showToast={showToast}
                />
              ))}
            </div>
          );
        })}
      </div>

      <details className="request-log">
        <summary>Wszystkie zgłoszenia (log) — {requests.length}</summary>
        {requests.length === 0 && (
          <p className="hint" style={{ color: 'var(--ink-faint)', fontSize: 13 }}>
            Brak zgłoszeń.
          </p>
        )}
        <ul className="reqlist">
          {requests.map((req) => {
            const done = req.tasks.length > 0 && req.tasks.every((t) => t.status === 'done');
            const inProgress = !done && req.tasks.some((t) => t.status !== 'new');
            const brandModelLabel = bm(req);
            return (
              <li className="reqrow" key={req.id}>
                <div>
                  <span className="who">
                    {req.name} · {req.department}
                  </span>
                  {!req.seen && <span className="badge-new">Nowe</span>}
                  <div className="meta">
                    {[req.location, brandModelLabel !== 'nowa oferta' ? brandModelLabel : ''].filter(Boolean).join(' · ')}
                    {req.campaignPeriod ? ` · termin: ${req.campaignPeriod}` : ''} — {formatDateTime(req.createdAt)} —{' '}
                    {req.tasks.length} zadań
                  </div>
                </div>
                <div className="side">
                  <span className={`chip state-${done ? 'done' : inProgress ? 'progress' : 'new'}`}>
                    {done ? 'Zrobione' : inProgress ? 'W trakcie' : 'Nowe'}
                  </span>
                  {!req.seen && (
                    <button className="btn small" onClick={() => onMarkSeen(req.id)}>
                      Oznacz jako zobaczone
                    </button>
                  )}
                  {/* Formularz jest publiczny, więc administrator musi mieć
                      czym usunąć spam albo pomyłkowe zgłoszenie. */}
                  {pendingDelete === req.id ? (
                    <>
                      <button className="btn small danger" onClick={() => confirmDelete(req)}>
                        Na pewno usuń
                      </button>
                      <button className="btn small" onClick={() => setPendingDelete(null)}>
                        Anuluj
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn small"
                      onClick={() => setPendingDelete(req.id)}
                      title="Usuń zgłoszenie wraz z zadaniami"
                      aria-label={`Usuń zgłoszenie od ${req.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </details>

      <AccountsManager showToast={showToast} minLength={meta.passwordMinLength || 10} />
    </div>
  );
}
