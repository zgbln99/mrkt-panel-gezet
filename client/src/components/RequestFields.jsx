import React from 'react';
import { safeHref } from '../utils.js';

/**
 * Pola zgłoszenia wspólne dla publicznego formularza i okna „Dodaj zadanie”
 * w panelu administratora.
 *
 * Obie ścieżki trafiają do tego samego generatora zadań na serwerze, więc muszą
 * pytać dokładnie o to samo — trzymanie dwóch kopii tego formularza kończyłoby
 * się tym, że nowy typ zlecenia pojawia się tylko w jednym z nich.
 */

export const DEPARTMENTS = ['Sprzedaż / Handlowy', 'Serwis', 'Likwidacja szkód', 'Finanse i ubezpieczenia', 'Inny dział'];
export const LOCATIONS = ['Gorzów Wielkopolski', 'Szczecin', 'Zielona Góra', 'Gdańsk', 'Piła'];
export const NOTES_LIMIT = 4000;

export const EMPTY_REQUEST = {
  name: '',
  department: DEPARTMENTS[0],
  location: '',
  brand: '',
  model: '',
  campaignPeriod: '',
  triggers: [],
  materials: [],
  materialsOther: '',
  photoVideoScope: 'both',
  listingLink: '',
  eventName: '',
  eventDate: '',
  notes: '',
};

/** Pola przycięte do postaci wysyłanej na serwer. */
export function normalizeRequest(form) {
  return {
    ...form,
    name: form.name.trim(),
    location: form.location.trim(),
    brand: form.brand.trim(),
    model: form.model.trim(),
    materialsOther: form.materialsOther.trim(),
    listingLink: form.listingLink.trim(),
    eventName: form.eventName.trim(),
    notes: form.notes.trim(),
  };
}

/**
 * Te same warunki sprawdza serwer — tu chodzi o natychmiastową informację
 * zwrotną, zanim formularz pojedzie na backend i wróci błędem.
 *
 * `requireContent: false` przydaje się w panelu administratora, gdzie zamiast
 * typu zlecenia można dopisać własne zadanie.
 */
export function validateRequest(form, { requireContent = true } = {}) {
  if (!form.name.trim()) return 'Podaj imię i nazwisko.';
  if (requireContent && form.triggers.length === 0 && form.materials.length === 0 && !form.materialsOther.trim()) {
    return 'Zaznacz przynajmniej jeden typ zgłoszenia albo materiał.';
  }
  if (form.triggers.includes('listing_promo') && form.listingLink.trim() && !safeHref(form.listingLink.trim())) {
    return 'Link do ogłoszenia musi być poprawnym adresem http:// lub https://.';
  }
  return '';
}

const DEFAULT_SCOPES = [
  { id: 'both', label: 'Foto i video' },
  { id: 'foto', label: 'Tylko foto' },
  { id: 'video', label: 'Tylko video' },
];

export default function RequestFields({ meta, form, onSet, onToggle, idPrefix = 'rf', nameLabel = 'Imię i nazwisko *' }) {
  const id = (suffix) => `${idPrefix}-${suffix}`;
  const scopes = meta.photoVideoScopes || DEFAULT_SCOPES;

  return (
    <>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={id('name')}>{nameLabel}</label>
          <input
            id={id('name')}
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={(e) => onSet('name', e.target.value)}
            placeholder="np. Jan Kowalski"
            maxLength={120}
            required
          />
        </div>

        <div className="field">
          <label htmlFor={id('department')}>Dział</label>
          <select id={id('department')} value={form.department} onChange={(e) => onSet('department', e.target.value)}>
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={id('location')}>Salon / lokalizacja</label>
          <input
            id={id('location')}
            type="text"
            list={id('cities')}
            value={form.location}
            onChange={(e) => onSet('location', e.target.value)}
            placeholder="np. Gorzów Wielkopolski"
            maxLength={80}
          />
          <datalist id={id('cities')}>
            {LOCATIONS.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label htmlFor={id('brand')}>Marka</label>
          <input
            id={id('brand')}
            type="text"
            value={form.brand}
            onChange={(e) => onSet('brand', e.target.value)}
            placeholder="np. Hyundai"
            maxLength={60}
          />
        </div>

        <div className="field">
          <label htmlFor={id('model')}>Model (opcjonalnie)</label>
          <input
            id={id('model')}
            type="text"
            value={form.model}
            onChange={(e) => onSet('model', e.target.value)}
            placeholder="np. Tucson"
            maxLength={60}
          />
        </div>

        <div className="field full">
          <label htmlFor={id('period')}>Termin / miesiąc kampanii (opcjonalnie)</label>
          <input
            id={id('period')}
            type="text"
            value={form.campaignPeriod}
            onChange={(e) => onSet('campaignPeriod', e.target.value)}
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
                onChange={() => onToggle('triggers', trigger.id)}
              />
              <span>
                <span className="t">{trigger.t}</span>
                <span className="d">{trigger.d}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {form.triggers.includes('photo_video_only') && (
        <div className="conditional show">
          <fieldset className="field fieldset">
            <legend>Zakres — czego dokładnie potrzebujesz?</legend>
            <div className="mat-grid">
              {scopes.map((scope) => (
                <label className="mat-item" key={scope.id}>
                  <input
                    type="radio"
                    name={id('scope')}
                    value={scope.id}
                    checked={form.photoVideoScope === scope.id}
                    onChange={() => onSet('photoVideoScope', scope.id)}
                  />{' '}
                  {scope.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {form.triggers.includes('listing_promo') && (
        <div className="conditional show">
          <div className="field">
            <label htmlFor={id('listing')}>Link do ogłoszenia</label>
            <input
              id={id('listing')}
              type="url"
              inputMode="url"
              value={form.listingLink}
              onChange={(e) => onSet('listingLink', e.target.value)}
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
              <label htmlFor={id('event-name')}>Nazwa eventu</label>
              <input
                id={id('event-name')}
                type="text"
                value={form.eventName}
                onChange={(e) => onSet('eventName', e.target.value)}
                placeholder="np. Dni Otwarte Salonu"
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor={id('event-date')}>Data eventu</label>
              <input
                id={id('event-date')}
                type="date"
                value={form.eventDate}
                onChange={(e) => onSet('eventDate', e.target.value)}
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
                onChange={() => onToggle('materials', material.id)}
              />{' '}
              {material.label}
            </label>
          ))}
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label className="sr-only" htmlFor={id('material-other')}>
            Inny materiał
          </label>
          <input
            id={id('material-other')}
            type="text"
            value={form.materialsOther}
            onChange={(e) => onSet('materialsOther', e.target.value)}
            placeholder="Inny materiał — opisz"
            maxLength={200}
          />
        </div>
      </fieldset>

      <div className="field full" style={{ marginTop: 6 }}>
        <label htmlFor={id('notes')}>Uwagi / kontekst dla marketingu</label>
        <textarea
          id={id('notes')}
          value={form.notes}
          onChange={(e) => onSet('notes', e.target.value.slice(0, NOTES_LIMIT))}
          placeholder="Dodatkowe informacje, terminy, oczekiwania…"
          maxLength={NOTES_LIMIT}
        />
        {form.notes.length > NOTES_LIMIT - 500 && (
          <span className="hint-small">{NOTES_LIMIT - form.notes.length} znaków do limitu</span>
        )}
      </div>
    </>
  );
}
