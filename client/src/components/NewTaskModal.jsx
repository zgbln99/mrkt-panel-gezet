import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from './Modal.jsx';
import RequestFields, { EMPTY_REQUEST, normalizeRequest, validateRequest } from './RequestFields.jsx';
import { taskCount } from '../utils.js';

const EMPTY_TASK = { category: 'digital', title: '', details: '', assignees: [] };

/**
 * Okno „Dodaj zadanie” w panelu administratora.
 *
 * Dwie drogi w jednym formularzu, bo w praktyce mieszają się ze sobą:
 * wybór typu zlecenia (dokładnie ta sama lista co na stronie głównej) generuje
 * komplet zadań automatycznie, a sekcja poniżej pozwala dopisać zadanie,
 * którego żaden szablon nie obejmuje. Wystarczy jedna z nich.
 */
export default function NewTaskModal({ meta, currentUser, onClose, onCreate, showToast }) {
  // Dział zostaje „Inny dział”: zlecenie wpisane w panelu najczęściej wychodzi
  // od samego marketingu, a nie od handlowców — podstawianie ich działu
  // zapisywałoby w zgłoszeniu nieprawdziwy kontekst.
  const [form, setForm] = useState({ ...EMPTY_REQUEST, name: currentUser.name || '', department: 'Inny dział' });
  const [customTasks, setCustomTasks] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }));

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

  return (
    <Modal
      title="Dodaj zadanie"
      subtitle="Wybierz typ zlecenia — zadania powstaną automatycznie — albo dopisz własne zadanie na dole."
      onClose={onClose}
      wide
    >
      <form className="td-body" onSubmit={submit} noValidate>
        <RequestFields
          meta={meta}
          form={form}
          onSet={set}
          onToggle={toggle}
          idPrefix="nt"
          nameLabel="Zlecający *"
        />

        <fieldset className="field full fieldset" style={{ marginTop: 18 }}>
          <legend>Własne zadania (opcjonalnie)</legend>

          {customTasks.length === 0 && (
            <p className="hint-small" style={{ margin: '0 0 8px' }}>
              Nic tu nie musi być — jeśli wybrałeś(-aś) typ zlecenia, zadania powstaną same.
            </p>
          )}

          {customTasks.map((task, index) => (
            <div className="custom-task" key={index}>
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

              <fieldset className="field fieldset" style={{ marginTop: 8 }}>
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

              <button
                type="button"
                className="btn small danger"
                style={{ marginTop: 10 }}
                onClick={() => removeTask(index)}
              >
                <Trash2 size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                Usuń to zadanie
              </button>
            </div>
          ))}

          <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={addTask}>
            <Plus size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
            Dodaj własne zadanie
          </button>
        </fieldset>

        <div className="submit-row">
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Utwórz zadania'}
          </button>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Anuluj
          </button>
        </div>
        {error && (
          <p className="modal-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
