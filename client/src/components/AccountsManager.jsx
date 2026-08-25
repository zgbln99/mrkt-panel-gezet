import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { formatDateTime } from '../utils.js';

function AccountRow({ account, showToast, onChanged, minLength }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [generated, setGenerated] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setPassword('');
    setConfirm('');
    setError('');
    setGenerated('');
  };

  const submit = async (useGenerated) => {
    setError('');
    if (!useGenerated) {
      if (password.length < minLength) {
        setError(`Nowe hasło musi mieć co najmniej ${minLength} znaków.`);
        return;
      }
      if (password !== confirm) {
        setError('Hasła nie są identyczne.');
        return;
      }
    }

    setBusy(true);
    try {
      const res = await api.resetUserPassword(account.id, useGenerated ? null : password);
      if (res.generatedPassword) {
        // Hasło pokazujemy tylko tutaj i tylko raz — serwer trzyma sam hash.
        setGenerated(res.generatedPassword);
        setPassword('');
        setConfirm('');
      } else {
        showToast(`Zresetowano hasło: ${account.name}`);
        close();
      }
      onChanged();
    } catch (e) {
      setError(e.message || 'Nie udało się zresetować hasła.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="reqrow account-row">
      <div className="account-head">
        <div>
          <span className="who">{account.name}</span>
          {account.isAdmin && <span className="badge-admin">Administrator</span>}
          {account.mustChangePassword && <span className="badge-new">Hasło startowe</span>}
          <div className="meta">
            login: {account.username} · {account.role}
            {account.lastLoginAt
              ? ` · ostatnie logowanie: ${formatDateTime(account.lastLoginAt)}`
              : ' · jeszcze się nie logował(a)'}
          </div>
        </div>
        <button className="btn small" onClick={() => (open ? close() : setOpen(true))}>
          <KeyRound size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
          {open ? 'Anuluj' : 'Resetuj hasło'}
        </button>
      </div>

      {open && (
        <div className="transfer-form" style={{ marginTop: 10 }}>
          {generated ? (
            <div className="generated-box">
              <p>
                Nowe hasło dla konta <b>{account.username}</b> — przekaż je bezpiecznym kanałem.
                Nie da się go później odczytać.
              </p>
              <code>{generated}</code>
              <p className="hint-small">
                Wszystkie sesje tego konta zostały wylogowane. Przy pierwszym logowaniu aplikacja
                poprosi o ustawienie własnego hasła.
              </p>
              <button className="btn small" onClick={close}>
                Gotowe
              </button>
            </div>
          ) : (
            <>
              <button className="btn small primary" onClick={() => submit(true)} disabled={busy}>
                <Sparkles size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                Wygeneruj hasło jednorazowe
              </button>
              <p className="hint-small">…albo ustaw hasło ręcznie:</p>
              <input
                type="password"
                autoComplete="new-password"
                placeholder={`Nowe hasło (min. ${minLength} znaków)`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Powtórz nowe hasło"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit(false)}
              />
              {error && (
                <div className="modal-error" role="alert">
                  {error}
                </div>
              )}
              <div className="row" style={{ marginTop: 4 }}>
                <button className="btn small" onClick={() => submit(false)} disabled={busy}>
                  {busy ? 'Zapisywanie…' : 'Zapisz podane hasło'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export default function AccountsManager({ showToast, minLength = 10 }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .getUsers()
      .then((res) => {
        setUsers(res.users);
        setError('');
      })
      .catch((e) => setError(e.message || 'Nie udało się wczytać listy kont.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <details className="request-log">
      <summary>Zarządzanie kontami zespołu</summary>
      {error && (
        <p className="hint" style={{ color: 'var(--crit)', fontSize: 13 }}>
          {error}
        </p>
      )}
      {!error && !users && (
        <p className="hint" style={{ color: 'var(--ink-faint)', fontSize: 13 }}>
          Wczytywanie…
        </p>
      )}
      {users && (
        <ul className="reqlist">
          {users.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              showToast={showToast}
              onChanged={load}
              minLength={minLength}
            />
          ))}
        </ul>
      )}
    </details>
  );
}
