import React from 'react';
import { FileText, MessageSquareWarning, ArrowRightLeft, Link2 } from 'lucide-react';
import { bm } from '../utils.js';

const STATUS_LABEL = { new: 'Nowe', progress: 'W trakcie', done: 'Zrobione' };

/**
 * Zwinięty kafelek zadania — sam tytuł, kontekst zgłoszenia i znaczniki tego,
 * co siedzi w środku. Kliknięcie otwiera pełne szczegóły w oknie.
 *
 * Wcześniej każdy kafelek rozwijał w kolumnie wszystko naraz (opis, kontekst,
 * gotowy szkic, historia przekazań, przyciski statusu i przypisań). Przy
 * kilkunastu zadaniach tablica ciągnęła się na kilka tysięcy pikseli i nie dało
 * się objąć wzrokiem, co w danej kategorii w ogóle jest do zrobienia.
 */
export default function TaskCard({ meta, req, task, onOpen }) {
  const teamById = Object.fromEntries(meta.team.map((t) => [t.id, t]));
  const brandModelLabel = bm(req);

  const context = [req.name, req.location, brandModelLabel !== 'nowa oferta' ? brandModelLabel : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      className={`task-card compact status-${task.status}`}
      onClick={onOpen}
      aria-label={`${task.title} — otwórz szczegóły zadania`}
    >
      <span className="tc-top">
        <span className={`tc-dot status-${task.status}`} aria-hidden="true" />
        <span className="tc-title">{task.title}</span>
      </span>

      <span className="tc-context">{context}</span>

      <span className="tc-badges">
        <span className={`tc-status status-${task.status}`}>{STATUS_LABEL[task.status]}</span>

        {task.assignees.map((id) => (
          <span className="tc-person" key={id}>
            {teamById[id] ? teamById[id].name : id}
          </span>
        ))}

        {/* Ikony zamiast rozwiniętej treści — sygnalizują, co jest w środku,
            nie zajmując miejsca w kolumnie. */}
        {req.campaignPeriod && <span className="tc-icon" title={`Termin: ${req.campaignPeriod}`}>🗓 {req.campaignPeriod}</span>}
        {task.draftText && (
          <span className="tc-icon" title="Zawiera gotową propozycję treści">
            <FileText size={11} /> szkic
          </span>
        )}
        {req.notes && (
          <span className="tc-icon warn" title="Zgłaszający dodał kontekst">
            <MessageSquareWarning size={11} /> kontekst
          </span>
        )}
        {req.listingLink && task.category === 'digital' && (
          <span className="tc-icon" title="Zgłoszenie zawiera link do ogłoszenia">
            <Link2 size={11} /> link
          </span>
        )}
        {task.transferLog && task.transferLog.length > 0 && (
          <span className="tc-icon transfer" title={`Przekazane ${task.transferLog.length}×`}>
            <ArrowRightLeft size={11} /> {task.transferLog.length}
          </span>
        )}
      </span>
    </button>
  );
}
