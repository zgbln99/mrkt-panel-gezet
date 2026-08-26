import React, { useState } from 'react';
import { ArrowRightLeft, Send, Copy, ExternalLink } from 'lucide-react';
import Modal from './Modal.jsx';
import { bm, timeAgo, formatDateTime, safeHref } from '../utils.js';

/**
 * Pełne szczegóły zadania — wszystko, co wcześniej rozpychało kafelek
 * w kolumnie: opis, kontekst zgłoszenia, gotowy szkic treści, historia
 * przekazań oraz akcje (status, przypisania, przekazanie).
 *
 * Okno dostaje `task` wyliczone na nowo przy każdym odświeżeniu danych, więc
 * przy otwartych szczegółach widać zmiany wprowadzone przez inne osoby.
 */
export default function TaskDetailModal({
  meta,
  req,
  task,
  mode,
  currentUser,
  onClose,
  onUpdateStatus,
  onUpdateAssignees,
  onTransfer,
  showToast,
}) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [busy, setBusy] = useState(false);

  const teamById = Object.fromEntries(meta.team.map((t) => [t.id, t]));
  const category = meta.cats.find((c) => c.id === task.category);
  const canManage = mode === 'admin' || task.assignees.includes(currentUser.id);
  const others = meta.team.filter((t) => t.id !== currentUser.id);
  const brandModelLabel = bm(req);
  const listingHref = safeHref(req.listingLink);
  // Zakres ma sens tylko przy zgłoszeniu „tylko foto / video” — przy pozostałych
  // typach niósłby wartość domyślną, która niczego nie mówi.
  const photoVideoScope = (req.triggers || []).includes('photo_video_only')
    ? (meta.photoVideoScopes || []).find((s) => s.id === (req.photoVideoScope || 'both'))
    : null;

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

  const toggleAssignee = async (personId) => {
    if (busy) return;
    const assignees = task.assignees.includes(personId)
      ? task.assignees.filter((a) => a !== personId)
      : [...task.assignees, personId];
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
    if (!transferTo) {
      showToast('Wybierz osobę, do której przekazujesz zadanie.');
      return;
    }
    setBusy(true);
    try {
      await onTransfer(task.id, transferTo, transferNote.trim());
      setShowTransfer(false);
      setTransferTo('');
      setTransferNote('');
      // Pracownik po oddaniu swojego jedynego przypisania traci dostęp do
      // zadania — trzymanie okna otwartego pokazywałoby nieaktualne dane.
      if (mode !== 'admin') onClose();
    } catch (e) {
      showToast(e.message || 'Nie udało się przekazać zadania.');
    } finally {
      setBusy(false);
    }
  };

  // navigator.clipboard działa tylko w bezpiecznym kontekście (HTTPS albo
  // localhost); na stronie po zwykłym HTTP potrzebna jest ścieżka zapasowa.
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
    <Modal title={task.title} onClose={onClose} wide>
      <div className="td-body">
        <div className="td-tags">
          {category && <span className="td-tag">{category.label}</span>}
          {req.campaignPeriod && <span className="td-tag warn">🗓 Termin: {req.campaignPeriod}</span>}
          {req.eventName && <span className="td-tag">🎪 {req.eventName}{req.eventDate ? ` — ${req.eventDate}` : ''}</span>}
        </div>

        <section className="td-section">
          <h4>Zgłoszenie</h4>
          <dl className="td-facts">
            <dt>Zgłaszający</dt>
            <dd>{[req.name, req.department].filter(Boolean).join(' · ')}</dd>
            {req.location && (
              <>
                <dt>Salon</dt>
                <dd>{req.location}</dd>
              </>
            )}
            {brandModelLabel !== 'nowa oferta' && (
              <>
                <dt>Marka / model</dt>
                <dd>{brandModelLabel}</dd>
              </>
            )}
            {photoVideoScope && (
              <>
                <dt>Zakres</dt>
                <dd>{photoVideoScope.label}</dd>
              </>
            )}
            <dt>Wpłynęło</dt>
            <dd>{formatDateTime(req.createdAt)}</dd>
            {listingHref && (
              <>
                <dt>Ogłoszenie</dt>
                <dd>
                  <a href={listingHref} target="_blank" rel="noopener noreferrer">
                    {listingHref} <ExternalLink size={11} style={{ verticalAlign: -1 }} />
                  </a>
                </dd>
              </>
            )}
          </dl>
        </section>

        {task.details && (
          <section className="td-section">
            <h4>Opis zadania</h4>
            <p className="td-text">{task.details}</p>
          </section>
        )}

        {req.notes && (
          <section className="td-section">
            <h4 className="td-warn-head">⚠️ Kontekst zgłoszenia — do wglądu, NIE kopiuj bezpośrednio</h4>
            <pre className="notes-text">{req.notes}</pre>
          </section>
        )}

        {task.draftText && (
          <section className="td-section">
            <h4>
              Gotowa propozycja treści
              <button className="btn small td-copy" onClick={copyDraft}>
                <Copy size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                Kopiuj
              </button>
            </h4>
            <pre className="draft-text">{task.draftText}</pre>
          </section>
        )}

        {task.transferLog && task.transferLog.length > 0 && (
          <section className="td-section">
            <h4>Historia przekazań</h4>
            <div className="transfer-log">
              {task.transferLog.map((entry, index) => (
                <div key={index} className="transfer-log-row">
                  <ArrowRightLeft size={11} />
                  {teamById[entry.from] ? teamById[entry.from].name : entry.from} →{' '}
                  {teamById[entry.to] ? teamById[entry.to].name : entry.to}
                  {entry.note ? `: „${entry.note}”` : ''}
                  <span className="transfer-log-time">· {timeAgo(entry.at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="td-section">
          <h4>Status</h4>
          <div className="row">
            <button className="chip status-new" aria-pressed={task.status === 'new'} disabled={!canManage || busy} onClick={() => setStatus('new')}>
              Nowe
            </button>
            <button className="chip status-progress" aria-pressed={task.status === 'progress'} disabled={!canManage || busy} onClick={() => setStatus('progress')}>
              W trakcie
            </button>
            <button className="chip status-done" aria-pressed={task.status === 'done'} disabled={!canManage || busy} onClick={() => setStatus('done')}>
              Zrobione
            </button>
          </div>
          {!canManage && <p className="hint-small">To zadanie nie jest przypisane do Ciebie — możesz je tylko podejrzeć.</p>}
        </section>

        <section className="td-section">
          <h4>{mode === 'admin' ? 'Osoby odpowiedzialne' : 'Przypisane do'}</h4>
          {mode === 'admin' ? (
            <div className="row">
              {meta.team.map((person) => (
                <button
                  key={person.id}
                  className="chip person"
                  aria-pressed={task.assignees.includes(person.id)}
                  title={person.role}
                  onClick={() => toggleAssignee(person.id)}
                  disabled={busy}
                >
                  {person.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="td-text">
              {task.assignees.map((id) => (teamById[id] ? teamById[id].name : id)).join(', ')}
            </p>
          )}
        </section>

        {canManage && (
          <section className="td-section">
            {!showTransfer ? (
              <button className="btn small transfer-btn" onClick={() => setShowTransfer(true)}>
                <ArrowRightLeft size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                Przekaż zadanie innej osobie
              </button>
            ) : (
              <div className="transfer-form">
                <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} aria-label="Osoba odbierająca zadanie">
                  <option value="">Wybierz osobę…</option>
                  {others.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} — {person.role}
                    </option>
                  ))}
                </select>
                <textarea
                  placeholder="Adnotacja dla odbiorcy (opcjonalnie)…"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  maxLength={500}
                />
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn small primary" onClick={doTransfer} disabled={busy}>
                    <Send size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Przekaż
                  </button>
                  <button className="btn small" onClick={() => setShowTransfer(false)}>
                    Anuluj
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
