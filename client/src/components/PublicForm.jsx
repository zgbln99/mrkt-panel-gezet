import React, { useState } from 'react';

const EMPTY_FORM = {
  name: '', department: 'Sprzedaż / Handlowy', location: '', brand: '', model: '', campaignPeriod: '',
  triggers: [], materials: [], materialsOther: '', listingLink: '', eventName: '', eventDate: '', notes: '',
};

export default function PublicForm({ meta, onSubmit, showToast }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [hint, setHint] = useState({ text: '', color: '' });
  const [confirmTasks, setConfirmTasks] = useState(null);
  const [busy, setBusy] = useState(false);

  const teamById = Object.fromEntries(meta.team.map((t) => [t.id, t]));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleArr = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  const submit = async () => {
    if (busy) return;
    if (!form.name.trim()) { setHint({ text: 'Podaj imię i nazwisko.', color: 'var(--crit)' }); return; }
    if (form.triggers.length === 0 && form.materials.length === 0 && !form.materialsOther) {
      setHint({ text: 'Zaznacz przynajmniej jeden typ zgłoszenia albo materiał.', color: 'var(--crit)' });
      return;
    }
    setBusy(true);
    setHint({ text: 'Zapisywanie…', color: 'var(--ink-soft)' });
    try {
      const tasks = await onSubmit({
        ...form,
        name: form.name.trim(), location: form.location.trim(), brand: form.brand.trim(), model: form.model.trim(),
      });
      setConfirmTasks(tasks);
      setForm(EMPTY_FORM);
      setHint({ text: 'Zgłoszenie zapisane — widoczne dla zespołu marketingu.', color: 'var(--ok)' });
      showToast('Zgłoszenie wysłane');
    } catch (e) {
      setHint({ text: e.message || 'Nie udało się wysłać zgłoszenia.', color: 'var(--crit)' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view active">
      <div className="card">
        <h3>Nowe zgłoszenie do marketingu</h3>
        <div className="form-grid">
          <div className="field"><label>Imię i nazwisko</label>
            <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="np. Jan Kowalski" />
          </div>
          <div className="field"><label>Dział</label>
            <select value={form.department} onChange={(e) => set('department', e.target.value)}>
              <option>Sprzedaż / Handlowy</option>
              <option>Serwis</option>
              <option>Likwidacja szkód</option>
              <option>Finanse i ubezpieczenia</option>
              <option>Inny dział</option>
            </select>
          </div>
          <div className="field"><label>Salon / lokalizacja</label>
            <input type="text" list="cityList" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="np. Gorzów Wielkopolski" />
            <datalist id="cityList">
              <option value="Gorzów Wielkopolski" /><option value="Szczecin" /><option value="Zielona Góra" /><option value="Gdańsk" /><option value="Piła" />
            </datalist>
          </div>
          <div className="field"><label>Marka</label><input type="text" value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="np. Hyundai" /></div>
          <div className="field"><label>Model (opcjonalnie)</label><input type="text" value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="np. Tucson" /></div>
          <div className="field full"><label>Termin / miesiąc kampanii (opcjonalnie)</label>
            <input type="text" value={form.campaignPeriod} onChange={(e) => set('campaignPeriod', e.target.value)} placeholder="np. wrzesień 2026" />
          </div>
        </div>

        <div className="field full" style={{ marginTop: 14 }}>
          <label>Czego dotyczy zgłoszenie? (zaznacz wszystkie, które pasują)</label>
          <div className="check-grid">
            {meta.triggers.map((tr) => (
              <label className="check-item" key={tr.id}>
                <input type="checkbox" checked={form.triggers.includes(tr.id)} onChange={() => toggleArr('triggers', tr.id)} />
                <span><span className="t">{tr.t}</span><span className="d">{tr.d}</span></span>
              </label>
            ))}
          </div>
        </div>

        {form.triggers.includes('listing_promo') && (
          <div className="conditional show">
            <div className="field"><label>Link do ogłoszenia</label><input type="text" value={form.listingLink} onChange={(e) => set('listingLink', e.target.value)} placeholder="https://…" /></div>
          </div>
        )}
        {form.triggers.includes('event') && (
          <div className="conditional show">
            <div className="form-grid">
              <div className="field"><label>Nazwa eventu</label><input type="text" value={form.eventName} onChange={(e) => set('eventName', e.target.value)} placeholder="np. Dni Otwarte Salonu" /></div>
              <div className="field"><label>Data eventu</label><input type="date" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} /></div>
            </div>
          </div>
        )}

        <div className="field full" style={{ marginTop: 14 }}>
          <label>Potrzebne materiały (opcjonalnie, niezależnie od powyższego)</label>
          <div className="mat-grid">
            {meta.materials.map((m) => (
              <label className="mat-item" key={m.id}>
                <input type="checkbox" checked={form.materials.includes(m.id)} onChange={() => toggleArr('materials', m.id)} /> {m.label}
              </label>
            ))}
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <input type="text" value={form.materialsOther} onChange={(e) => set('materialsOther', e.target.value)} placeholder="Inny materiał — opisz" />
          </div>
        </div>

        <div className="field full" style={{ marginTop: 6 }}>
          <label>Uwagi / kontekst dla marketingu</label>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Dodatkowe informacje, terminy, oczekiwania…" />
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={submit} disabled={busy}>Wyślij zgłoszenie</button>
          <span className="hint" style={{ marginLeft: 10, color: hint.color }}>{hint.text}</span>
        </div>

        {confirmTasks && (
          <div className="confirm-box show">
            <h4>Zgłoszenie wysłane ✓</h4>
            <p style={{ margin: '0 0 8px', fontSize: 13.3, color: 'var(--ink-soft)' }}>Marketing zajmie się:</p>
            <ul>{confirmTasks.map((t) => <li key={t.id}>{t.title} — <i>{t.assignees.map((a) => teamById[a]?.name || a).join(' i ')}</i></li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}
