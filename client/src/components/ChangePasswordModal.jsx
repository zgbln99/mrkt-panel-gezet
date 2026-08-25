import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api.js';

export default function ChangePasswordModal({ onClose, showToast }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError('');
    if (!currentPassword || !newPassword) { setError('Wypełnij oba pola hasła.'); return; }
    if (newPassword.length < 8) { setError('Nowe hasło musi mieć co najmniej 8 znaków.'); return; }
    if (newPassword !== confirmPassword) { setError('Powtórzone hasło nie zgadza się z nowym hasłem.'); return; }

    setBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      showToast('Hasło zostało zmienione');
      onClose();
    } catch (e) {
      setError(e.message || 'Nie udało się zmienić hasła.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <h3>Zmień hasło</h3>
          <button className="modal-x" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="modal-sub">Zmiana dotyczy tylko Twojego konta.</p>

        <div className="field">
          <label>Aktualne hasło</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Nowe hasło (min. 8 znaków)</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Powtórz nowe hasło</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>

        {error && <div className="modal-error">{error}</div>}
        <button className="btn primary" style={{ width: '100%', marginTop: 14 }} onClick={submit} disabled={busy}>
          {busy ? 'Zapisywanie…' : 'Zapisz nowe hasło'}
        </button>
      </div>
    </div>
  );
}
