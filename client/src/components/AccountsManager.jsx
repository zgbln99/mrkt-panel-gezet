import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../api.js';

function ResetPasswordRow({ u, showToast }) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (pwd.length < 8) { setError('Nowe hasło musi mieć co najmniej 8 znaków.'); return; }
    if (pwd !== confirm) { setError('Hasła nie są identyczne.'); return; }
    setBusy(true);
    try {
      await api.resetUserPassword(u.id, pwd);
      showToast(`Zresetowano hasło: ${u.name}`);
      setOpen(false); setPwd(''); setConfirm('');
    } catch (e) {
      setError(e.message || 'Nie udało się zresetować hasła.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="reqrow" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <span className="who">{u.name}</span>{u.isAdmin && <span className="badge-new" style={{ background: 'var(--accent-tint)', color: 'var(--accent-strong)' }}>Admin</span>}
          <div className="meta">login: {u.username} · {u.role}</div>
        </div>
        <button className="btn small" onClick={() => setOpen((s) => !s)}>
          <KeyRound size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Resetuj hasło
        </button>
      </div>
      {open && (
        <div className="transfer-form" style={{ marginTop: 10 }}>
          <input type="password" placeholder="Nowe hasło (min. 8 znaków)" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <input type="password" placeholder="Powtórz nowe hasło" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          {error && <div className="modal-error">{error}</div>}
          <div className="row" style={{ marginTop: 4 }}>
            <button className="btn small primary" onClick={submit} disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz nowe hasło'}</button>
            <button className="btn small" onClick={() => setOpen(false)}>Anuluj</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function AccountsManager({ showToast }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.getUsers().then((res) => setUsers(res.users)).catch((e) => setError(e.message || 'Nie udało się wczytać listy kont.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <details className="request-log">
      <summary>Zarządzanie kontami zespołu</summary>
      {error && <p className="hint" style={{ color: 'var(--crit)', fontSize: 13 }}>{error}</p>}
      {!error && !users && <p className="hint" style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Wczytywanie…</p>}
      {users && (
        <ul className="reqlist">
          {users.map((u) => <ResetPasswordRow key={u.id} u={u} showToast={showToast} />)}
        </ul>
      )}
    </details>
  );
}
