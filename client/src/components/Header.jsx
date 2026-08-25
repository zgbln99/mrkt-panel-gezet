import React, { useState, useEffect, useRef } from 'react';
import { Bell, LogOut, Lock, KeyRound } from 'lucide-react';
import { timeAgo } from '../utils.js';

export default function Header({ user, view, setView, onOpenLogin, onLogout, onOpenChangePassword, unread, notifications, onMarkAllRead, onMarkOneRead }) {
  const [showBell, setShowBell] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    if (!showBell) return;
    const onDocClick = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showBell]);

  return (
    <header className="masthead">
      <div>
        <p className="eyebrow">Grupa Gezet · Marketing</p>
        <h1>Zgłoszenia do marketingu</h1>
        <p>
          Zgłoś handlowcowi/kierownikowi potrzebę (nowy model, rata, wyprzedaż, event, materiały) — aplikacja sama
          rozdzieli to na zamówienia, kampanie digital, video i eventy dla zespołu marketingu.
        </p>
      </div>

      <div className="hdr-right">
        {user && (
          <>
            <div className="viewswitch">
              <button className={`vs-btn ${view === 'form' ? 'active' : ''}`} onClick={() => setView('form')}>Formularz</button>
              <button className={`vs-btn ${view === 'panel' ? 'active' : ''}`} onClick={() => setView('panel')}>Panel</button>
            </div>

            <div className="bell-wrap" ref={bellRef}>
              <button className="bell-btn" onClick={() => setShowBell((s) => !s)} title="Powiadomienia">
                <Bell size={17} />
                {unread > 0 && <span className="bell-badge">{unread}</span>}
              </button>
              {showBell && (
                <div className="bell-dropdown">
                  <div className="bell-dropdown-hd">
                    <span>Powiadomienia</span>
                    {notifications.length > 0 && <button className="mark-all" onClick={onMarkAllRead}>Oznacz wszystkie</button>}
                  </div>
                  <div className="bell-list">
                    {notifications.length === 0 && <div className="bell-empty">Brak powiadomień.</div>}
                    {notifications.map((n) => (
                      <button key={n.id} className={`bell-item ${n.read ? '' : 'unread'}`} onClick={() => onMarkOneRead(n.id)}>
                        {!n.read && <span className="dot" />}
                        <span className="bell-text">{n.text}</span>
                        <span className="bell-time">{timeAgo(n.at)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="plate user-plate">
              {user.name}
              <b>{user.role}</b>
            </div>
            <button className="btn small logout-btn" onClick={onOpenChangePassword} title="Zmień hasło"><KeyRound size={13} /></button>
            <button className="btn small logout-btn" onClick={onLogout} title="Wyloguj"><LogOut size={13} /></button>
          </>
        )}

        {!user && (
          <>
            <div className="plate">Narzędzie wewnętrzne<b>Marketing Gezet</b></div>
            <button className="hidden-gate" onClick={onOpenLogin} title="Panel zespołu marketingu" aria-label="Panel zespołu marketingu">
              <Lock size={13} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
