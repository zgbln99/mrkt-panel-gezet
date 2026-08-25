import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';

/**
 * Zmiana własnego hasła. W trybie `forced` (konto po seedzie lub po resecie
 * przez administratora) okna nie da się zamknąć — serwer i tak odrzuci każdą
 * inną operację, dopóki hasło startowe nie zostanie zmienione.
 */
export default function ChangePasswordModal({ onClose, onChanged, showToast, forced = false, minLength = 10 }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    if (event) event.preventDefault();
    if (busy) return;
    setError('');

    if (!currentPassword || !newPassword) {
      setError('Wypełnij pola hasła.');
      return;
    }
    if (newPassword.length < minLength) {
      setError(`Nowe hasło musi mieć co najmniej ${minLength} znaków.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Powtórzone hasło nie zgadza się z nowym hasłem.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Nowe hasło musi różnić się od dotychczasowego.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      // Serwer unieważnił wszystkie tokeny konta i odesłał świeży —
      // przekazujemy go wyżej, żeby ta sesja pozostała zalogowana.
      onChanged(res);
      showToast('Hasło zostało zmienione');
    } catch (e) {
      setError(e.message || 'Nie udało się zmienić hasła.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={forced ? 'Ustaw własne hasło' : 'Zmień hasło'}
      subtitle={
        forced
          ? 'To konto korzysta z hasła startowego. Zanim przejdziesz do panelu, ustaw hasło znane tylko Tobie.'
          : 'Zmiana dotyczy wyłącznie Twojego konta. Pozostałe zalogowane sesje zostaną wylogowane.'
      }
      onClose={onClose}
      dismissible={!forced}
    >
      <form onSubmit={submit}>
        {/* Ukryte pole loginu — bez niego menedżery haseł nie wiedzą, którego konta dotyczy zmiana. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly value="" />

        <div className="field">
          <label htmlFor="cp-current">{forced ? 'Hasło startowe' : 'Aktualne hasło'}</label>
          <input
            id="cp-current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="cp-new">Nowe hasło (min. {minLength} znaków)</label>
          <input
            id="cp-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="cp-confirm">Powtórz nowe hasło</label>
          <input
            id="cp-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className="modal-error" role="alert">
            {error}
          </div>
        )}

        <button className="btn primary" style={{ width: '100%', marginTop: 14 }} type="submit" disabled={busy}>
          {busy ? 'Zapisywanie…' : 'Zapisz nowe hasło'}
        </button>
      </form>
    </Modal>
  );
}
