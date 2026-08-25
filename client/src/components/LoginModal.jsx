import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function LoginModal({ onClose, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await onLogin(username.trim().toLowerCase(), password);
    } catch (e) {
      setError(e.message || 'Nieprawidłowy login lub hasło.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <h3>Panel zespołu marketingu</h3>
          <button className="modal-x" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="modal-sub">Zaloguj się loginem i hasłem przypisanym do Twojego konta.</p>
        <div className="field">
          <label>Login</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus />
        </div>
        <div className="field">
          <label>Hasło</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        {error && <div className="modal-error">{error}</div>}
        <button className="btn primary" style={{ width: '100%', marginTop: 6 }} onClick={submit} disabled={busy}>
          {busy ? 'Logowanie…' : 'Zaloguj'}
        </button>
      </div>
    </div>
  );
}
