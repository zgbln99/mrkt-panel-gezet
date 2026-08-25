import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { api } from '../api';
import { useAuth } from './AuthContext';

const DataContext = createContext(null);
const POLL_MS = 20000;

export function DataProvider({ children }) {
  const { user, needsPasswordChange } = useAuth();
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  // Zaczynamy od "wczytywanie": provider montuje się razem z zalogowaną sesją,
  // więc pierwsze pobranie danych jest już w drodze, zanim ekran się pokaże.
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const inFlight = useRef(false);

  const active = !!user && !needsPasswordChange;

  /**
   * Ciche pobranie danych. Nie zapisuje stanu synchronicznie (pierwsza
   * instrukcja po ustawieniu strażnika to `await`), dzięki czemu można je
   * bezpiecznie wywołać z efektu i z interwału.
   */
  const refresh = useCallback(async () => {
    if (!active || inFlight.current) return;
    inFlight.current = true;
    try {
      const [r, n] = await Promise.all([api.getRequests(), api.getNotifications()]);
      setRequests(r.requests);
      setNotifications(n.notifications);
      setOffline(false);
    } catch (err) {
      // Utrata zasięgu jest na telefonie normalna — pokazujemy znacznik
      // zamiast wyrzucać użytkownika z ekranu.
      if (err.code === 'network') setOffline(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [active]);

  /** Odświeżenie gestem „pociągnij w dół" — z widocznym wskaźnikiem postępu. */
  const refreshVisible = useCallback(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    // Brak czyszczenia stanu w tym miejscu jest zamierzony: provider dostaje
    // w App.js klucz z identyfikatorem konta, więc przelogowanie montuje go
    // od nowa z pustym stanem. Czyszczenie tutaj byłoby zapisem stanu
    // w trakcie efektu, czyli dodatkowym przebiegiem renderowania.
    if (!active) return undefined;

    // `refresh` jest funkcją asynchroniczną: po sprawdzeniu strażnika jej
    // pierwszą instrukcją jest `await`, więc żaden stan nie zostaje zapisany
    // synchronicznie w trakcie efektu. Reguła poniżej nie odróżnia tego
    // przypadku od zwykłego wywołania setState w ciele efektu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    let timer = setInterval(refresh, POLL_MS);

    // Odpytywanie serwera przy aplikacji w tle zjada baterię i transfer,
    // a i tak nikt tych danych nie ogląda. Po powrocie odświeżamy od razu.
    const sub = AppState.addEventListener('change', (state) => {
      clearInterval(timer);
      if (state === 'active') {
        refresh();
        timer = setInterval(refresh, POLL_MS);
      }
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [active, refresh]);

  /** Akcja + natychmiastowe odświeżenie, żeby ekran nie pokazywał starego stanu. */
  const withRefresh = useCallback(
    (fn) => async (...args) => {
      const result = await fn(...args);
      await refresh();
      return result;
    },
    [refresh]
  );

  const value = {
    requests,
    notifications,
    unread: notifications.filter((n) => !n.read).length,
    loading,
    offline,
    refresh,
    refreshVisible,
    updateStatus: withRefresh(api.updateTaskStatus),
    updateAssignees: withRefresh(api.updateTaskAssignees),
    transferTask: withRefresh(api.transferTask),
    markRequestSeen: withRefresh(api.markRequestSeen),
    deleteRequest: withRefresh(api.deleteRequest),
    markNotificationRead: withRefresh(api.markNotificationRead),
    markAllNotificationsRead: withRefresh(api.markAllNotificationsRead),
    /** Zadanie wyszukiwane po identyfikatorze — ekran szczegółów pokazuje bieżący stan. */
    findTask: (taskId) => {
      for (const req of requests) {
        const task = req.tasks.find((t) => t.id === taskId);
        if (task) return { req, task };
      }
      return null;
    },
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData musi być użyte wewnątrz DataProvider');
  return ctx;
}
