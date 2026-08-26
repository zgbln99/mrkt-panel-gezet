import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import Header from './components/Header.jsx';
import PublicForm from './components/PublicForm.jsx';
import LoginModal from './components/LoginModal.jsx';
import ChangePasswordModal from './components/ChangePasswordModal.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import EmployeePanel from './components/EmployeePanel.jsx';

const POLL_MS = 15000;

export default function App() {
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState('');
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState('form');
  const [showLogin, setShowLogin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const logout = useCallback(
    (message) => {
      setToken(null);
      setUser(null);
      setView('form');
      setRequests([]);
      setNotifications([]);
      setShowChangePassword(false);
      if (message) showToast(message);
    },
    [showToast]
  );

  // Serwer odrzucił token (wygasł, hasło zmienione gdzie indziej, konto
  // usunięte). Bez tego panel zostawał otwarty i po cichu przestawał się
  // odświeżać — użytkownik pracował na nieaktualnych danych.
  useEffect(() => {
    setUnauthorizedHandler((code) => {
      const message =
        code === 'token_revoked'
          ? 'Hasło do Twojego konta zostało zmienione — zaloguj się ponownie.'
          : 'Sesja wygasła — zaloguj się ponownie.';
      logout(message);
      setShowLogin(true);
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    api
      .getMeta()
      .then(setMeta)
      .catch((e) => setMetaError(e.message || 'Nie udało się połączyć z serwerem.'));
  }, []);

  // Odtworzenie sesji z zapisanego tokenu przy wejściu na stronę.
  useEffect(() => {
    if (!getToken()) {
      setAuthChecked(true);
      return;
    }
    api
      .me()
      .then((res) => {
        setUser(res.user);
        setView('panel');
        if (res.user.mustChangePassword) setShowChangePassword(true);
      })
      .catch(() => setToken(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const refreshData = useCallback(async () => {
    if (!user || user.mustChangePassword) return;
    try {
      const [r, n] = await Promise.all([api.getRequests(), api.getNotifications()]);
      setRequests(r.requests);
      setNotifications(n.notifications);
      setOffline(false);
    } catch (e) {
      // Chwilowy brak sieci nie może przerywać pracy — pokazujemy dyskretny
      // znacznik i próbujemy dalej przy kolejnym cyklu.
      if (e.status === 0) setOffline(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.mustChangePassword) return undefined;

    refreshData();
    let timer = setInterval(refreshData, POLL_MS);

    // Odpytywanie w tle na ukrytej karcie tylko obciąża serwer i baterię.
    const onVisibility = () => {
      clearInterval(timer);
      if (document.visibilityState === 'visible') {
        refreshData();
        timer = setInterval(refreshData, POLL_MS);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, refreshData]);

  const handleLogin = async (username, password) => {
    const res = await api.login(username, password);
    setToken(res.token);
    setUser(res.user);
    setShowLogin(false);
    setView('panel');
    if (res.user.mustChangePassword) setShowChangePassword(true);
  };

  const handlePasswordChanged = (res) => {
    setToken(res.token);
    setUser(res.user);
    setShowChangePassword(false);
  };

  const handleSubmitRequest = async (payload) => {
    const res = await api.submitRequest(payload);
    if (user && !user.mustChangePassword) refreshData();
    return res.tasks;
  };

  // Zlecenie wpisane w panelu przechodzi tą samą drogą co formularz publiczny:
  // serwer generuje z niego zadania i rozsyła powiadomienia.
  const handleCreateManualRequest = async (payload) => {
    const res = await api.createManualRequest(payload);
    await refreshData();
    return res.tasks;
  };

  const withRefresh = (fn) => async (...args) => {
    const result = await fn(...args);
    await refreshData();
    return result;
  };

  const handleUpdateStatus = withRefresh(api.updateTaskStatus);
  const handleUpdateAssignees = withRefresh(api.updateTaskAssignees);
  const handleMarkSeen = withRefresh(api.markRequestSeen);
  const handleDeleteRequest = withRefresh(api.deleteRequest);
  const handleMarkAllRead = withRefresh(api.markAllNotificationsRead);
  const handleMarkOneRead = withRefresh(api.markNotificationRead);

  const handleTransfer = async (taskId, toUserId, note) => {
    await api.transferTask(taskId, toUserId, note);
    await refreshData();
    showToast('Zadanie przekazane');
  };

  if (!authChecked || !meta) {
    return (
      <div className="boot-screen">
        {metaError ? (
          <div className="card boot-card">
            <h3>Brak połączenia z API</h3>
            <p style={{ color: 'var(--ink-soft)', margin: '0 0 14px' }}>{metaError}</p>
            <p style={{ color: 'var(--ink-faint)', fontSize: 13, margin: '0 0 14px' }}>
              Sprawdź, czy backend jest uruchomiony i czy adres API (VITE_API_URL / konfiguracja nginx)
              jest poprawny.
            </p>
            <button className="btn primary" onClick={() => window.location.reload()}>
              Spróbuj ponownie
            </button>
          </div>
        ) : (
          <span style={{ color: 'var(--ink-faint)' }}>Wczytywanie…</span>
        )}
      </div>
    );
  }

  const unread = notifications.filter((n) => !n.read).length;
  const panelReady = user && !user.mustChangePassword;

  return (
    <div className="gz-root">
      <div className="wrap">
        <Header
          user={user}
          view={view}
          setView={setView}
          onOpenLogin={() => setShowLogin(true)}
          onOpenChangePassword={() => setShowChangePassword(true)}
          onLogout={() => logout('Wylogowano')}
          unread={unread}
          notifications={notifications}
          onMarkAllRead={handleMarkAllRead}
          onMarkOneRead={handleMarkOneRead}
          offline={offline}
        />

        {view === 'form' && <PublicForm meta={meta} onSubmit={handleSubmitRequest} showToast={showToast} />}

        {view === 'panel' && panelReady && user.isAdmin && (
          <AdminPanel
            meta={meta}
            requests={requests}
            currentUser={user}
            onUpdateStatus={handleUpdateStatus}
            onUpdateAssignees={handleUpdateAssignees}
            onTransfer={handleTransfer}
            onMarkSeen={handleMarkSeen}
            onDeleteRequest={handleDeleteRequest}
            onCreateTasks={handleCreateManualRequest}
            showToast={showToast}
          />
        )}

        {view === 'panel' && panelReady && !user.isAdmin && (
          <EmployeePanel
            meta={meta}
            requests={requests}
            currentUser={user}
            onUpdateStatus={handleUpdateStatus}
            onTransfer={handleTransfer}
            showToast={showToast}
          />
        )}
      </div>

      {showLogin && !user && <LoginModal onClose={() => setShowLogin(false)} onLogin={handleLogin} />}

      {showChangePassword && user && (
        <ChangePasswordModal
          forced={!!user.mustChangePassword}
          minLength={meta.passwordMinLength || 10}
          onClose={() => setShowChangePassword(false)}
          onChanged={handlePasswordChanged}
          showToast={showToast}
        />
      )}

      {/* aria-live: komunikat trafia też do czytnika ekranu, nie tylko na ekran */}
      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
