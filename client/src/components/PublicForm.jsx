import React, { useState, useMemo } from 'react';
import RequestFields, { EMPTY_REQUEST, normalizeRequest, validateRequest } from './RequestFields.jsx';

export default function PublicForm({ meta, onSubmit, showToast }) {
  const [form, setForm] = useState(EMPTY_REQUEST);
  const [hint, setHint] = useState({ text: '', tone: '' });
  const [confirmTasks, setConfirmTasks] = useState(null);
  const [busy, setBusy] = useState(false);

  const teamById = useMemo(() => Object.fromEntries(meta.team.map((t) => [t.id, t])), [meta.team]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }));

  const submit = async (event) => {
    if (event) event.preventDefault();
    if (busy) return;

    const problem = validateRequest(form);
    if (problem) {
      setHint({ text: problem, tone: 'error' });
      return;
    }

    setBusy(true);
    setHint({ text: 'Zapisywanie…', tone: 'muted' });
    try {
      const tasks = await onSubmit(normalizeRequest(form));
      setConfirmTasks(tasks);
      setForm(EMPTY_REQUEST);
      setHint({ text: 'Zgłoszenie zapisane — widoczne dla zespołu marketingu.', tone: 'ok' });
      showToast('Zgłoszenie wysłane');
    } catch (e) {
      setHint({ text: e.message || 'Nie udało się wysłać zgłoszenia.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const hintColor =
    hint.tone === 'error' ? 'var(--crit)' : hint.tone === 'ok' ? 'var(--ok)' : 'var(--ink-soft)';

  return (
    <div className="view active">
      <form className="card" onSubmit={submit} noValidate>
        <h3>Nowe zgłoszenie do marketingu</h3>

        <RequestFields meta={meta} form={form} onSet={set} onToggle={toggle} idPrefix="pf" />

        <div className="submit-row">
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Wysyłanie…' : 'Wyślij zgłoszenie'}
          </button>
          <span className="hint" style={{ color: hintColor }} role="status" aria-live="polite">
            {hint.text}
          </span>
        </div>

        {confirmTasks && (
          <div className="confirm-box show">
            <h4>Zgłoszenie wysłane ✓</h4>
            <p style={{ margin: '0 0 8px', fontSize: 13.3, color: 'var(--ink-soft)' }}>Marketing zajmie się:</p>
            <ul>
              {confirmTasks.map((task) => (
                <li key={task.id}>
                  {task.title} — <i>{task.assignees.map((a) => (teamById[a] ? teamById[a].name : a)).join(' i ')}</i>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </div>
  );
}
