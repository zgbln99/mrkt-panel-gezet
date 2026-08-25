import React, { useState, useMemo, useEffect } from 'react';
import TaskCard from './TaskCard.jsx';
import TaskDetailModal from './TaskDetailModal.jsx';

export default function EmployeePanel({ meta, requests, currentUser, onUpdateStatus, onTransfer, showToast }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [openTaskId, setOpenTaskId] = useState(null);

  const myCards = useMemo(() => {
    const list = [];
    requests.forEach((req) =>
      req.tasks.forEach((task) => {
        if (task.assignees.includes(currentUser.id)) list.push({ req, task });
      })
    );
    return list
      .filter(({ task }) => statusFilter === 'all' || task.status === statusFilter)
      .sort((a, b) => (b.req.createdAt || '').localeCompare(a.req.createdAt || ''));
  }, [requests, currentUser, statusFilter]);

  const stats = useMemo(() => {
    let newC = 0;
    let progC = 0;
    let doneC = 0;
    requests.forEach((req) =>
      req.tasks.forEach((task) => {
        if (!task.assignees.includes(currentUser.id)) return;
        if (task.status === 'new') newC++;
        else if (task.status === 'progress') progC++;
        else doneC++;
      })
    );
    return { newC, progC, doneC, total: newC + progC + doneC };
  }, [requests, currentUser]);

  // Identyfikator zamiast kopii zadania — okno pokazuje dane z ostatniego
  // odświeżenia, a nie stan z chwili kliknięcia.
  const openEntry = useMemo(() => {
    if (!openTaskId) return null;
    for (const req of requests) {
      const task = req.tasks.find((t) => t.id === openTaskId);
      if (task) return { req, task };
    }
    return null;
  }, [openTaskId, requests]);

  useEffect(() => {
    if (openTaskId && !openEntry) setOpenTaskId(null);
  }, [openTaskId, openEntry]);

  return (
    <div className="view active">
      <div className="stats">
        <div className="stat accent">
          <div className="n">{stats.total}</div>
          <div className="l">Moje zadania łącznie</div>
        </div>
        <div className="stat warn">
          <div className="n">{stats.newC}</div>
          <div className="l">Nowe</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: 'var(--accent)' }}>
            {stats.progC}
          </div>
          <div className="l">W trakcie</div>
        </div>
        <div className="stat ok">
          <div className="n">{stats.doneC}</div>
          <div className="l">Zrobione</div>
        </div>
      </div>

      <div className="controls">
        <button className="chip status-new" aria-pressed={statusFilter === 'new'} onClick={() => setStatusFilter('new')}>
          Nowe
        </button>
        <button className="chip status-progress" aria-pressed={statusFilter === 'progress'} onClick={() => setStatusFilter('progress')}>
          W trakcie
        </button>
        <button className="chip status-done" aria-pressed={statusFilter === 'done'} onClick={() => setStatusFilter('done')}>
          Zrobione
        </button>
        <button className="chip" aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
          Wszystkie
        </button>
      </div>

      {myCards.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--ink-faint)' }}>
          Brak zadań przypisanych do Ciebie{statusFilter !== 'all' ? ' w tym filtrze' : ''}.
        </div>
      )}

      <div className="task-list">
        {myCards.map(({ req, task }) => (
          <TaskCard key={task.id} meta={meta} req={req} task={task} onOpen={() => setOpenTaskId(task.id)} />
        ))}
      </div>

      {openEntry && (
        <TaskDetailModal
          meta={meta}
          req={openEntry.req}
          task={openEntry.task}
          mode="employee"
          currentUser={currentUser}
          onClose={() => setOpenTaskId(null)}
          onUpdateStatus={onUpdateStatus}
          onTransfer={onTransfer}
          showToast={showToast}
        />
      )}
    </div>
  );
}
