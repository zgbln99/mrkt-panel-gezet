import React, { useState } from 'react';
import { ArrowRightLeft, Send } from 'lucide-react';
import { bm, timeAgo, safeHref } from '../utils.js';

export default function TaskCard({ meta, req, task, mode, currentUser, onUpdateStatus, onUpdateAssignees, onTransfer, showToast }) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [busy, setBusy] = useState(false);

  const teamById = Object.fromEntries(meta.team.map((t) => [t.id, t]));
  const canManage = mode === 'admin' || task.assignees.includes(currentUser.id);
  const others = meta.team.filter((t) => t.id !== currentUser.id);
  const brandModelLabel = bm(req);
  const listingHref = safeHref(req.listingLink);

  const setStatus = async (status) => {
    if (busy || task.status === status) return;
    setBusy(true);
    try {
      await onUpdateStatus(task.id, status);
    } catch (e) {
      showToast(e.message || 'Nie udało się zmienić statusu.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAssignee = async (pid) => {
    if (busy) return;
    const assignees = task.assignees.includes(pid)
      ? task.assignees.filter((a) => a !== pid)
      : [...task.assignees, pid];
    if (assignees.length === 0) {
      showToast('Zadanie musi mieć przynajmniej jedną osobę odpowiedzialną.');
      return;
    }
    setBusy(true);
    try {
      await onUpdateAssignees(task.id, assignees);
    } catch (e) {
      showToast(e.message || 'Nie udało się zmienić przypisania.');
    } finally {
      setBusy(false);
    }
  };

  const doTransfer = async () => {
    if (!transferTo) { showToast('Wybierz osobę, do której przekazujesz zadanie.'); return; }
    setBusy(true);
    try {
      await onTransfer(task.id, transferTo, transferNote.trim());
      setShowTransfer(false); setTransferTo(''); setTransferNote('');
    } catch (e) {
      showToast(e.message || 'Nie udało się przekazać zadania.');
    } finally {
      setBusy(false);
    }
  };

  // navigator.clipboard jest dostępne tylko w bezpiecznym kontekście (HTTPS
  // albo localhost). Na stronie serwowanej po zwykłym HTTP wywołanie rzuca
  // wyjątkiem, dlatego trzymamy zapasową ścieżkę przez ukryte pole tekstowe.
  const copyDraft = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(task.draftText);
        showToast('Skopiowano treść');
        return;
      }
      const helper = document.createElement('textarea');
      helper.value = task.draftText;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(helper);
      showToast(ok ? 'Skopiowano treść' : 'Nie udało się skopiować — zaznacz tekst ręcznie');
    } catch {
      showToast('Nie udało się skopiować — zaznacz tekst ręcznie');
    }
  };

  return (
    <div className="task-card">
      <div className="title">{task.title}</div>
      {req.campaignPeriod && <div className="term-badge">🗓️ Termin: {req.campaignPeriod}</div>}
      {task.details && <div className="details">{task.details}</div>}
      <div className="meta">
        {[req.name, req.department, req.location, brandModelLabel !== 'nowa oferta' ? brandModelLabel : ''].filter(Boolean).join(' · ')}
        {listingHref && task.category === 'digital' && (
          <>
            <br />
            <a href={listingHref} target="_blank" rel="noopener noreferrer">{listingHref}</a>
          </>
        )}
      </div>

      {req.notes && (
        <details className="notes-box">
          <summary>⚠️ Kontekst zgłoszenia — do wglądu, NIE kopiuj bezpośrednio ▾</summary>
          <pre className="notes-text">{req.notes}</pre>
        </details>
      )}

      {task.draftText && (
        <details className="draft-box">
          <summary>Gotowa propozycja treści ▾</summary>
          <pre className="draft-text">{task.draftText}</pre>
          <button className="btn small" onClick={copyDraft}>Kopiuj treść</button>
        </details>
      )}

      {task.transferLog && task.transferLog.length > 0 && (
        <div className="transfer-log">
          {task.transferLog.map((tl, i) => (
            <div key={i} className="transfer-log-row">
              <ArrowRightLeft size={11} /> {teamById[tl.from]?.name || tl.from} → {teamById[tl.to]?.name || tl.to}
              {tl.note ? `: „${tl.note}”` : ''} <span className="transfer-log-time">· {timeAgo(tl.at)}</span>
            </div>
          ))}
        </div>
      )}

      {mode === 'admin' && (
        <div className="row">
          {meta.team.map((p) => (
            <button key={p.id} className="chip person" aria-pressed={task.assignees.includes(p.id)} title={p.role} onClick={() => toggleAssignee(p.id)} disabled={busy}>{p.name}</button>
          ))}
        </div>
      )}

      <div className="row">
        <button className="chip status-new" aria-pressed={task.status === 'new'} disabled={!canManage || busy} onClick={() => setStatus('new')}>Nowe</button>
        <button className="chip status-progress" aria-pressed={task.status === 'progress'} disabled={!canManage || busy} onClick={() => setStatus('progress')}>W trakcie</button>
        <button className="chip status-done" aria-pressed={task.status === 'done'} disabled={!canManage || busy} onClick={() => setStatus('done')}>Zrobione</button>
      </div>

      {canManage && (
        <div className="row" style={{ marginTop: 2 }}>
          <button className="btn small transfer-btn" onClick={() => setShowTransfer((s) => !s)}>
            <ArrowRightLeft size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Przekaż
          </button>
        </div>
      )}

      {showTransfer && (
        <div className="transfer-form">
          <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">Wybierz osobę…</option>
            {others.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
          </select>
          <textarea placeholder="Adnotacja dla odbiorcy (opcjonalnie)…" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} />
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn small primary" onClick={doTransfer} disabled={busy}><Send size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Przekaż zadanie</button>
            <button className="btn small" onClick={() => setShowTransfer(false)}>Anuluj</button>
          </div>
        </div>
      )}
    </div>
  );
}
