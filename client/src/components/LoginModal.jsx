import React, { useState } from 'react';
import Modal from './Modal.jsx';

export default function LoginModal({ onClose, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    if (event) event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await onLogin(username.trim().toLowerCase(), password);
    } catch (e) {
      setError(e.message || 'Nieprawidłowy login lub hasło.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Panel zespołu marketingu"
      subtitle="Zaloguj się loginem i hasłem przypisanym do Twojego konta."
      onClose={onClose}
    >
      {/* Prawdziwy <form> — menedżery haseł rozpoznają logowanie i Enter działa. */}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="login-username">Login</label>
          <input
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="login-password">Hasło</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className="modal-error" role="alert">
            {error}
          </div>
        )}

        <button className="btn primary" style={{ width: '100%', marginTop: 14 }} type="submit" disabled={busy}>
          {busy ? 'Logowanie…' : 'Zaloguj'}
        </button>
      </form>
    </Modal>
  );
}
