import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import Modal from './Modal.jsx';
import RequestFields, { EMPTY_REQUEST, normalizeRequest, validateRequest } from './RequestFields.jsx';
import { taskCount } from '../utils.js';

const EMPTY_TASK = { category: 'digital', title: '', details: '', assignees: [] };

/**
 * Okno „Dodaj zadanie” w panelu administratora.
 *
 * Dwie drogi w jednym formularzu, bo w praktyce mieszają się ze sobą:
 * wybór typu zlecenia (dokładnie ta sama lista co na stronie głównej) generuje
 * komplet zadań automatycznie, a sekcja niżej pozwala dopisać zadanie,
 * którego żaden szablon nie obejmuje. Wystarczy jedna z nich.
 */
export default function NewTaskModal({ meta, currentUser, onClose, onCreate, showToast }) {
  // Dział zostaje „Inny dział”: zlecenie wpisane w panelu najczęściej wychodzi
  // od samego marketingu, a nie od handlowców — podstawianie ich działu
  // zapisywałoby w zgłoszeniu nieprawdziwy kontekst.
  const [form, setForm] = useState({ ...EMPTY_REQUEST, name: currentUser.name || '', department: 'Inny dział' });
  const [assigneesOverride, setAssigneesOverride] = useState([]);
  const [customTasks, setCustomTasks] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const teamById = useMemo(() => Object.fromEntries(meta.team.map((t) => [t.id, t])), [meta.team]);

  // Typ zlecenia sam z siebie tworzy zadania — dopiero wtedy pytanie „kto ma to
  // zrobić" ma sens. Przy samym własnym zadaniu wykonawcę wskazuje się przy nim.
  const generatesTasks =
    form.triggers.length > 0 || form.materials.length > 0 || form.materialsOther.trim() !== '';

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }));

  const toggleOverride = (personId) =>
    setAssigneesOverride((list) =>
      list.includes(personId) ? list.filter((a) => a !== personId) : [...list, personId]
    );

  const setTask = (index, key, value) =>
    setCustomTasks((list) => list.map((task, i) => (i === index ? { ...task, [key]: value } : task)));

  const toggleTaskAssignee = (index, personId) =>
    setCustomTasks((list) =>
      list.map((task, i) =>
        i === index
          ? {
              ...task,
              assignees: task.assignees.includes(personId)
                ? task.assignees.filter((a) => a !== personId)
                : [...task.assignees, personId],
            }
          : task
      )
    );

  const addTask = () =>
    setCustomTasks((list) => [...list, { ...EMPTY_TASK, category: meta.cats[0] ? meta.cats[0].id : 'digital' }]);

  const removeTask = (index) => setCustomTasks((list) => list.filter((_, i) => i !== index));

  const submit = async (event) => {
    if (event) event.preventDefault();
    if (busy) return;

    const problem = validateRequest(form, { requireContent: customTasks.length === 0 });
    if (problem) {
      setError(problem);
      return;
    }
    for (const task of customTasks) {
      if (!task.title.trim()) {
        setError('Każde własne zadanie musi mieć tytuł.');
        return;
      }
      if (task.assignees.length === 0) {
        setError(`Zadanie „${task.title.trim()}” musi mieć przynajmniej jedną osobę odpowiedzialną.`);
        return;
      }
    }

    setBusy(true);
    setError('');
    try {
      const tasks = await onCreate({
        ...normalizeRequest(form),
        assigneesOverride: generatesTasks ? assigneesOverride : [],
        customTasks: customTasks.map((task) => ({
          category: task.category,
          title: task.title.trim(),
          details: task.details.trim(),
          assignees: task.assignees,
        })),
      });
      showToast(`Dodano ${taskCount(tasks.length)}`);
      onClose();
    } catch (e) {
      setError(e.message || 'Nie udało się dodać zadań.');
    } finally {
      setBusy(false);
    }
  };

  const overrideLabel =
    assigneesOverride.length === 0
      ? 'Automatycznie — wg ról w zespole'
      : assigneesOverride.map((id) => (teamById[id] ? teamById[id].name : id)).join(', ');

  return (
    <Modal
      title="Dodaj zadanie"
      subtitle="Wybierz typ zlecenia — zadania powstaną automatycznie — albo dopisz własne zadanie niżej."
      onClose={onClose}
      wide
      className="task-modal"
    >
      <form className="td-body" onSubmit={submit} noValidate>
        <section className="nt-step">
          <h4 className="nt-step-head">
            <span className="nt-step-n">1</span> Czego dotyczy zlecenie
          </h4>
          <RequestFields
            meta={meta}
            form={form}
            onSet={set}
            onToggle={toggle}
            idPrefix="nt"
            nameLabel="Zlecający *"
          />
        </section>

        {generatesTasks && (
          <section className="nt-step">
            <h4 className="nt-step-head">
              <span className="nt-step-n">2</span> Kto ma to zrobić
            </h4>
            <p className="hint-small nt-step-hint">
              Zadania z typu zlecenia trafiają domyślnie do osób odpowiedzialnych za dany obszar
              (foto → Piotr, video → Bogdan, social → Inga i Martyna). Wskaż osoby, żeby to nadpisać —
              np. gdy ktoś jest na urlopie.
            </p>
            <div className="row">
              <button
                type="button"
                className="chip person"
                aria-pressed={assigneesOverride.length === 0}
                onClick={() => setAssigneesOverride([])}
              >
                <Users size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                Automatycznie
              </button>
              {meta.team.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="chip person"
                  aria-pressed={assigneesOverride.includes(person.id)}
                  title={person.role}
                  onClick={() => toggleOverride(person.id)}
                >
                  {person.name}
                </button>
              ))}
            </div>
            <p className="hint-small nt-summary">Przypisanie: {overrideLabel}</p>
          </section>
        )}

        <section className="nt-step">
          <h4 className="nt-step-head">
            <span className="nt-step-n">{generatesTasks ? 3 : 2}</span> Własne zadania
            <span className="nt-step-opt">{customTasks.length > 0 ? taskCount(customTasks.length) : 'opcjonalnie'}</span>
          </h4>

          {customTasks.length === 0 && (
            <p className="hint-small nt-step-hint">
              Nic tu nie musi być — jeśli wybrałeś(-aś) typ zlecenia, zadania powstaną same. Dopisz
              zadanie, którego żaden szablon nie obejmuje.
            </p>
          )}

          {customTasks.map((task, index) => (
            <div className="custom-task" key={index}>
              <div className="custom-task-hd">
                <span className="custom-task-n">Zadanie {index + 1}</span>
                <button
                  type="button"
                  className="btn small danger"
                  onClick={() => removeTask(index)}
                  aria-label={`Usuń zadanie ${index + 1}`}
                >
                  <Trash2 size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Usuń
                </button>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`nt-task-${index}-category`}>Kategoria</label>
                  <select
                    id={`nt-task-${index}-category`}
                    value={task.category}
                    onChange={(e) => setTask(index, 'category', e.target.value)}
                  >
                    {meta.cats.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`nt-task-${index}-title`}>Tytuł zadania *</label>
                  <input
                    id={`nt-task-${index}-title`}
                    type="text"
                    value={task.title}
                    onChange={(e) => setTask(index, 'title', e.target.value)}
                    placeholder="np. Sesja foto — Hyundai Tucson"
                    maxLength={200}
                  />
                </div>
                <div className="field full">
                  <label htmlFor={`nt-task-${index}-details`}>Opis (opcjonalnie)</label>
                  <textarea
                    id={`nt-task-${index}-details`}
                    value={task.details}
                    onChange={(e) => setTask(index, 'details', e.target.value)}
                    placeholder="Co dokładnie trzeba zrobić…"
                    maxLength={2000}
                  />
                </div>
              </div>

              <fieldset className="field fieldset" style={{ marginTop: 10 }}>
                <legend>Osoby odpowiedzialne *</legend>
                <div className="row">
                  {meta.team.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className="chip person"
                      aria-pressed={task.assignees.includes(person.id)}
                      title={person.role}
                      onClick={() => toggleTaskAssignee(index, person.id)}
                    >
                      {person.name}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          ))}

          <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={addTask}>
            <Plus size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
            Dodaj własne zadanie
          </button>
        </section>

        {/* Pasek akcji przyklejony do dołu: formularz bywa długi, a przycisk
            „Utwórz zadania” musi być pod ręką bez przewijania na sam koniec. */}
        <div className="nt-actions">
          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}
          <div className="submit-row">
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Zapisywanie…' : 'Utwórz zadania'}
            </button>
            <button className="btn" type="button" onClick={onClose} disabled={busy}>
              Anuluj
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
