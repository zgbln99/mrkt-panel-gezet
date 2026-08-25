import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api, loadBaseUrl, setBaseUrl, setAuthToken, setUnauthorizedHandler, getBaseUrl } from '../api';
import { storage } from '../storage';
import { registerForPush, unregisterFromPush } from '../push';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState('');
  const [apiUrl, setApiUrlState] = useState('');
  const [sessionMessage, setSessionMessage] = useState('');
  const pushRegistered = useRef(false);

  const loadMeta = useCallback(async () => {
    try {
      const data = await api.getMeta();
      setMeta(data);
      setMetaError('');
      return true;
    } catch (err) {
      setMetaError(err.message || 'Nie udało się połączyć z serwerem.');
      return false;
    }
  }, []);

  const applySession = useCallback((token, nextUser) => {
    setAuthToken(token);
    setUser(nextUser);
    return storage.setToken(token);
  }, []);

  const logout = useCallback(
    async (message) => {
      // Wyrejestrowanie urządzenia MUSI pójść przed skasowaniem tokenu —
      // inaczej żądanie poleci bez autoryzacji i powiadomienia dalej trafiałyby
      // na telefon osoby, która się wylogowała.
      if (pushRegistered.current) {
        await unregisterFromPush();
        pushRegistered.current = false;
      }
      setAuthToken(null);
      await storage.setToken(null);
      setUser(null);
      setSessionMessage(message || '');
    },
    []
  );

  // Serwer odrzucił token: wygasł, konto skasowane albo hasło zmienione gdzie indziej.
  useEffect(() => {
    setUnauthorizedHandler((code) => {
      setAuthToken(null);
      storage.setToken(null);
      pushRegistered.current = false;
      setUser(null);
      setSessionMessage(
        code === 'token_revoked'
          ? 'Hasło do Twojego konta zostało zmienione — zaloguj się ponownie.'
          : 'Sesja wygasła — zaloguj się ponownie.'
      );
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
      const url = await loadBaseUrl();
      setApiUrlState(url);
      if (url) {
        await loadMeta();
        const token = await storage.getToken();
        if (token) {
          setAuthToken(token);
          try {
            const res = await api.me();
            setUser(res.user);
          } catch {
            setAuthToken(null);
            await storage.setToken(null);
          }
        }
      }
      setBooting(false);
    })();
  }, [loadMeta]);

  // Push rejestrujemy dopiero, gdy konto ma pełny dostęp — konto z hasłem
  // startowym i tak nie dostanie żadnego powiadomienia, bo serwer blokuje
  // wszystkie operacje do czasu zmiany hasła.
  useEffect(() => {
    if (!user || user.mustChangePassword || pushRegistered.current) return;
    pushRegistered.current = true;
    registerForPush();
  }, [user]);

  const login = useCallback(
    async (username, password) => {
      const res = await api.login(username, password);
      await applySession(res.token, res.user);
      setSessionMessage('');
      return res.user;
    },
    [applySession]
  );

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      const res = await api.changePassword(currentPassword, newPassword);
      // Serwer unieważnił dotychczasowe tokeny i odesłał świeży — bez jego
      // zapisania aplikacja wyleciałaby na ekran logowania zaraz po zmianie.
      await applySession(res.token, res.user);
      return res.user;
    },
    [applySession]
  );

  const changeApiUrl = useCallback(
    async (value) => {
      const url = await setBaseUrl(value);
      setApiUrlState(url);
      await logout();
      const ok = await loadMeta();
      return { url, ok };
    },
    [loadMeta, logout]
  );

  const value = {
    booting,
    user,
    meta,
    metaError,
    apiUrl: apiUrl || getBaseUrl(),
    sessionMessage,
    clearSessionMessage: () => setSessionMessage(''),
    login,
    logout,
    changePassword,
    changeApiUrl,
    reloadMeta: loadMeta,
    isAdmin: !!(user && user.isAdmin),
    needsPasswordChange: !!(user && user.mustChangePassword),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth musi być użyte wewnątrz AuthProvider');
  return ctx;
}
