import React, { useState, useMemo } from 'react';
import { safeHref } from '../utils.js';

const EMPTY_FORM = {
  name: '',
  department: 'Sprzedaż / Handlowy',
  location: '',
  brand: '',
  model: '',
  campaignPeriod: '',
  triggers: [],
  materials: [],
  materialsOther: '',
  listingLink: '',
  eventName: '',
  eventDate: '',
  notes: '',
};

const DEPARTMENTS = ['Sprzedaż / Handlowy', 'Serwis', 'Likwidacja szkód', 'Finanse i ubezpieczenia', 'Inny dział'];
const LOCATIONS = ['Gorzów Wielkopolski', 'Szczecin', 'Zielona Góra', 'Gdańsk', 'Piła'];
const NOTES_LIMIT = 4000;

export default function PublicForm({ meta, onSubmit, showToast }) {
  const [form, setForm] = useState(EMPTY_FORM);
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

    if (!form.name.trim()) {
      setHint({ text: 'Podaj imię i nazwisko.', tone: 'error' });
      return;
    }
    if (form.triggers.length === 0 && form.materials.length === 0 && !form.materialsOther.trim()) {
      setHint({ text: 'Zaznacz przynajmniej jeden typ zgłoszenia albo materiał.', tone: 'error' });
      return;
    }
    // Ten sam warunek sprawdza serwer — tu chodzi o natychmiastową informację
    // zwrotną, zanim formularz pojedzie na backend i wróci błędem.
    if (form.triggers.includes('listing_promo') && form.listingLink.trim() && !safeHref(form.listingLink.trim())) {
      setHint({ text: 'Link do ogłoszenia musi być poprawnym adresem http:// lub https://.', tone: 'error' });
      return;
    }

    setBusy(true);
    setHint({ text: 'Zapisywanie…', tone: 'muted' });
    try {
      const tasks = await onSubmit({
        ...form,
        name: form.name.trim(),
        location: form.location.trim(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        listingLink: form.listingLink.trim(),
        eventName: form.eventName.trim(),
        notes: form.notes.trim(),
      });
      setConfirmTasks(tasks);
      setForm(EMPTY_FORM);
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

        <div className="form-grid">
          <div className="field">
            <label htmlFor="pf-name">Imię i nazwisko *</label>
            <input
              id="pf-name"
              type="text"
              autoComplete="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="np. Jan Kowalski"
              maxLength={120}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="pf-department">Dział</label>
            <select id="pf-department" value={form.department} onChange={(e) => set('department', e.target.value)}>
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="pf-location">Salon / lokalizacja</label>
            <input
              id="pf-location"
              type="text"
              list="cityList"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="np. Gorzów Wielkopolski"
              maxLength={80}
            />
            <datalist id="cityList">
              {LOCATIONS.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label htmlFor="pf-brand">Marka</label>
            <input
              id="pf-brand"
              type="text"
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
              placeholder="np. Hyundai"
              maxLength={60}
            />
          </div>

          <div className="field">
            <label htmlFor="pf-model">Model (opcjonalnie)</label>
            <input
              id="pf-model"
              type="text"
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              placeholder="np. Tucson"
              maxLength={60}
            />
          </div>

          <div className="field full">
            <label htmlFor="pf-period">Termin / miesiąc kampanii (opcjonalnie)</label>
            <input
              id="pf-period"
              type="text"
              value={form.campaignPeriod}
              onChange={(e) => set('campaignPeriod', e.target.value)}
              placeholder="np. wrzesień 2026"
              maxLength={80}
            />
          </div>
        </div>

        <fieldset className="field full fieldset" style={{ marginTop: 14 }}>
          <legend>Czego dotyczy zgłoszenie? (zaznacz wszystkie, które pasują)</legend>
          <div className="check-grid">
            {meta.triggers.map((trigger) => (
              <label className="check-item" key={trigger.id}>
                <input
                  type="checkbox"
                  checked={form.triggers.includes(trigger.id)}
                  onChange={() => toggle('triggers', trigger.id)}
                />
                <span>
                  <span className="t">{trigger.t}</span>
                  <span className="d">{trigger.d}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {form.triggers.includes('listing_promo') && (
          <div className="conditional show">
            <div className="field">
              <label htmlFor="pf-listing">Link do ogłoszenia</label>
              <input
                id="pf-listing"
                type="url"
                inputMode="url"
                value={form.listingLink}
                onChange={(e) => set('listingLink', e.target.value)}
                placeholder="https://…"
                maxLength={500}
              />
            </div>
          </div>
        )}

        {form.triggers.includes('event') && (
          <div className="conditional show">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="pf-event-name">Nazwa eventu</label>
                <input
                  id="pf-event-name"
                  type="text"
                  value={form.eventName}
                  onChange={(e) => set('eventName', e.target.value)}
                  placeholder="np. Dni Otwarte Salonu"
                  maxLength={120}
                />
              </div>
              <div className="field">
                <label htmlFor="pf-event-date">Data eventu</label>
                <input
                  id="pf-event-date"
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => set('eventDate', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <fieldset className="field full fieldset" style={{ marginTop: 14 }}>
          <legend>Potrzebne materiały (opcjonalnie, niezależnie od powyższego)</legend>
          <div className="mat-grid">
            {meta.materials.map((material) => (
              <label className="mat-item" key={material.id}>
                <input
                  type="checkbox"
                  checked={form.materials.includes(material.id)}
                  onChange={() => toggle('materials', material.id)}
                />{' '}
                {material.label}
              </label>
            ))}
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label className="sr-only" htmlFor="pf-material-other">
              Inny materiał
            </label>
            <input
              id="pf-material-other"
              type="text"
              value={form.materialsOther}
              onChange={(e) => set('materialsOther', e.target.value)}
              placeholder="Inny materiał — opisz"
              maxLength={200}
            />
          </div>
        </fieldset>

        <div className="field full" style={{ marginTop: 6 }}>
          <label htmlFor="pf-notes">Uwagi / kontekst dla marketingu</label>
          <textarea
            id="pf-notes"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value.slice(0, NOTES_LIMIT))}
            placeholder="Dodatkowe informacje, terminy, oczekiwania…"
            maxLength={NOTES_LIMIT}
          />
          {form.notes.length > NOTES_LIMIT - 500 && (
            <span className="hint-small">
              {NOTES_LIMIT - form.notes.length} znaków do limitu
            </span>
          )}
        </div>

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
