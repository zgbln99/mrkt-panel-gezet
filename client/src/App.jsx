import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, getToken, setToken } from './api';
import Header from './components/Header.jsx';
import PublicForm from './components/PublicForm.jsx';
import LoginModal from './components/LoginModal.jsx';
import ChangePasswordModal from './components/ChangePasswordModal.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import EmployeePanel from './components/EmployeePanel.jsx';

const POLL_MS = 15000;

export default function App() {
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState(false);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState('form');
  const [showLogin, setShowLogin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  }, []);

  // Metadane publiczne (zespół/kategorie/triggery/materiały)
  useEffect(() => {
    api.getMeta().then(setMeta).catch(() => setMetaError(true));
  }, []);

  // Próba odtworzenia sesji z zapisanego tokenu
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthChecked(true); return; }
    api.me()
      .then((res) => { setUser(res.user); setView('panel'); })
      .catch(() => setToken(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const refreshData = useCallback(async () => {
    if (!user) return;
    try {
      const [r, n] = await Promise.all([api.getRequests(), api.getNotifications()]);
      setRequests(r.requests);
      setNotifications(n.notifications);
    } catch (e) {
      // cichy błąd odświeżania w tle — nie przerywamy pracy użytkownika
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshData();
    const id = setInterval(refreshData, POLL_MS);
    return () => clearInterval(id);
  }, [user, refreshData]);

  const handleLogin = async (username, password) => {
    const res = await api.login(username, password);
    setToken(res.token);
    setUser(res.user);
    setShowLogin(false);
    setView('panel');
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setView('form');
    setRequests([]);
    setNotifications([]);
  };

  const handleSubmitRequest = async (payload) => {
    const res = await api.submitRequest(payload);
    if (user) refreshData();
    return res.tasks;
  };

  const handleUpdateStatus = async (taskId, status) => {
    await api.updateTaskStatus(taskId, status);
    await refreshData();
  };
  const handleUpdateAssignees = async (taskId, assignees) => {
    await api.updateTaskAssignees(taskId, assignees);
    await refreshData();
  };
  const handleTransfer = async (taskId, toUserId, note) => {
    await api.transferTask(taskId, toUserId, note);
    await refreshData();
    showToast('Zadanie przekazane');
  };
  const handleMarkSeen = async (reqId) => {
    await api.markRequestSeen(reqId);
    await refreshData();
  };
  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead();
    await refreshData();
  };
  const handleMarkOneRead = async (id) => {
    await api.markNotificationRead(id);
    await refreshData();
  };

  const unread = notifications.filter((n) => !n.read).length;

  if (!authChecked || !meta) {
    return (
      <div className="gz-root">
        <style>{'.gz-root{min-height:200px;display:flex;align-items:center;justify-content:center;font-family:sans-serif;color:#7C877E;}'}</style>
        {metaError ? 'Nie udało się połączyć z serwerem API. Sprawdź, czy backend działa i czy adres VITE_API_URL jest poprawny.' : 'Wczytywanie…'}
      </div>
    );
  }

  return (
    <div className="gz-root">
      <div className="wrap">
        <Header
          user={user}
          view={view}
          setView={setView}
          onOpenLogin={() => setShowLogin(true)}
          onOpenChangePassword={() => setShowChangePassword(true)}
          onLogout={handleLogout}
          unread={unread}
          notifications={notifications}
          onMarkAllRead={handleMarkAllRead}
          onMarkOneRead={handleMarkOneRead}
        />

        {view === 'form' && (
          <PublicForm meta={meta} onSubmit={handleSubmitRequest} showToast={showToast} />
        )}

        {view === 'panel' && user && user.isAdmin && (
          <AdminPanel
            meta={meta}
            requests={requests}
            currentUser={user}
            onUpdateStatus={handleUpdateStatus}
            onUpdateAssignees={handleUpdateAssignees}
            onTransfer={handleTransfer}
            onMarkSeen={handleMarkSeen}
            showToast={showToast}
          />
        )}

        {view === 'panel' && user && !user.isAdmin && (
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

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={handleLogin} />}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} showToast={showToast} />}

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
