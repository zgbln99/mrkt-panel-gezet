import React, { useState, useMemo } from 'react';
import TaskCard from './TaskCard.jsx';
import AccountsManager from './AccountsManager.jsx';
import { bm } from '../utils.js';

export default function AdminPanel({ meta, requests, currentUser, onUpdateStatus, onUpdateAssignees, onTransfer, onMarkSeen, showToast }) {
  const [filters, setFilters] = useState({ category: 'all', assignee: 'all', status: 'all', q: '' });

  const stats = useMemo(() => {
    let openTasks = 0, doneTasks = 0, unseen = 0;
    requests.forEach((r) => {
      if (!r.seen) unseen++;
      r.tasks.forEach((t) => (t.status === 'done' ? doneTasks++ : openTasks++));
    });
    return { total: requests.length, openTasks, doneTasks, unseen };
  }, [requests]);

  const matches = (req, task) => {
    if (filters.category !== 'all' && task.category !== filters.category) return false;
    if (filters.assignee !== 'all' && !task.assignees.includes(filters.assignee)) return false;
    if (filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.q) {
      const hay = [req.name, req.department, req.location, req.brand, req.model, task.title, task.details, req.notes].join(' ').toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  };

  return (
    <div className="view active">
      <div className="stats">
        <div className="stat accent"><div className="n">{stats.total}</div><div className="l">Zgłoszeń łącznie</div></div>
        <div className="stat crit"><div className="n">{stats.unseen}</div><div className="l">Nieprzeczytane</div></div>
        <div className="stat warn"><div className="n">{stats.openTasks}</div><div className="l">Zadań otwartych</div></div>
        <div className="stat ok"><div className="n">{stats.doneTasks}</div><div className="l">Zadań zrobionych</div></div>
      </div>

      <div className="controls">
        <button className="chip" aria-pressed={filters.category === 'all'} onClick={() => setFilters((f) => ({ ...f, category: 'all' }))}>Wszystkie</button>
        {meta.cats.map((c) => (
          <button key={c.id} className="chip" aria-pressed={filters.category === c.id} onClick={() => setFilters((f) => ({ ...f, category: c.id }))}>{c.label}</button>
        ))}
      </div>
      <div className="controls">
        <button className="chip person" aria-pressed={filters.assignee === 'all'} onClick={() => setFilters((f) => ({ ...f, assignee: 'all' }))}>Cały zespół</button>
        {meta.team.map((p) => (
          <button key={p.id} className="chip person" aria-pressed={filters.assignee === p.id} onClick={() => setFilters((f) => ({ ...f, assignee: p.id }))}>{p.name}</button>
        ))}
        <button className="chip status-new" aria-pressed={filters.status === 'new'} onClick={() => setFilters((f) => ({ ...f, status: 'new' }))}>Nowe</button>
        <button className="chip status-progress" aria-pressed={filters.status === 'progress'} onClick={() => setFilters((f) => ({ ...f, status: 'progress' }))}>W trakcie</button>
        <button className="chip status-done" aria-pressed={filters.status === 'done'} onClick={() => setFilters((f) => ({ ...f, status: 'done' }))}>Zrobione</button>
        <button className="chip" aria-pressed={filters.status === 'all'} onClick={() => setFilters((f) => ({ ...f, status: 'all' }))}>Reset</button>
        <input type="text" className="search" placeholder="Szukaj (marka, osoba, treść)…" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
      </div>

      <div className="board">
        {meta.cats.map((cat) => {
          const cards = [];
          requests.forEach((req) => req.tasks.forEach((task) => { if (task.category === cat.id && matches(req, task)) cards.push({ req, task }); }));
          return (
            <div className="col" key={cat.id}>
              <div className="col-head"><span>{cat.label}</span><span className="n">{cards.length}</span></div>
              {cards.length === 0 && <div className="empty-col">Brak zadań</div>}
              {cards.map(({ req, task }) => (
                <TaskCard key={req.id + task.id} meta={meta} req={req} task={task} mode="admin" currentUser={currentUser}
                  onUpdateStatus={onUpdateStatus} onUpdateAssignees={onUpdateAssignees} onTransfer={onTransfer} showToast={showToast} />
              ))}
            </div>
          );
        })}
      </div>

      <details className="request-log">
        <summary>Wszystkie zgłoszenia (log) — {requests.length}</summary>
        {requests.length === 0 && <p className="hint" style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Brak zgłoszeń jeszcze.</p>}
        <ul className="reqlist">
          {requests.map((req) => {
            const done = req.tasks.every((t) => t.status === 'done');
            const inprog = !done && req.tasks.some((t) => t.status !== 'new');
            const brandModelLabel = bm(req);
            return (
              <li className="reqrow" key={req.id}>
                <div>
                  <span className="who">{req.name} · {req.department}</span>
                  {!req.seen && <span className="badge-new">Nowe</span>}
                  <div className="meta">
                    {[req.name, req.department, req.location, brandModelLabel !== 'nowa oferta' ? brandModelLabel : ''].filter(Boolean).join(' · ')}
                    {req.campaignPeriod ? ' · termin: ' + req.campaignPeriod : ''} — {new Date(req.createdAt).toLocaleString('pl-PL')} — {req.tasks.length} zadań
                  </div>
                </div>
                <div className="side">
                  <span className="chip" style={{
                    background: done ? 'var(--ok-tint)' : inprog ? 'var(--accent-tint)' : 'var(--warn-tint)',
                    color: done ? 'var(--ok)' : inprog ? 'var(--accent-strong)' : 'var(--warn)', borderColor: 'transparent',
                  }}>
                    {done ? 'Zrobione' : inprog ? 'W trakcie' : 'Nowe'}
                  </span>
                  {!req.seen && <button className="btn small" onClick={() => onMarkSeen(req.id)}>Oznacz jako zobaczone</button>}
                </div>
              </li>
            );
          })}
        </ul>
      </details>

      <AccountsManager showToast={showToast} />
    </div>
  );
}
