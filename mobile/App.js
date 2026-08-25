import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import RootNavigator from './src/navigation/RootNavigator';
import { openTask } from './src/navigation/navigationRef';
import ErrorBoundary from './src/components/ErrorBoundary';
import { ensureAndroidChannel } from './src/push';

/**
 * Zakres danych jednej sesji. Klucz z identyfikatorem konta sprawia, że po
 * przelogowaniu DataProvider montuje się od nowa — dane poprzedniej osoby nie
 * mogą przez moment mignąć w panelu następnej.
 */
function SessionScope() {
  const { user } = useAuth();
  return (
    <DataProvider key={user ? user.id : 'anon'}>
      <StatusBar style="auto" />
      <RootNavigator />
    </DataProvider>
  );
}

/** Wyciąga identyfikator zadania z danych doklejonych do powiadomienia. */
function taskIdOf(response) {
  const data =
    response &&
    response.notification &&
    response.notification.request &&
    response.notification.request.content &&
    response.notification.request.content.data;
  return data && data.taskId ? String(data.taskId) : null;
}

export default function App() {
  const responseListener = useRef(null);

  useEffect(() => {
    // Kanał tworzymy przy starcie, a nie dopiero przy rejestracji urządzenia:
    // powiadomienie, które przyjdzie przed nadaniem uprawnień, i tak musi mieć
    // kanał z dźwiękiem, inaczej Android pokaże je po cichu.
    ensureAndroidChannel();

    // Aplikacja uruchomiona dotknięciem powiadomienia (była zamknięta).
    // Nawigator nie jest wtedy jeszcze gotowy, więc zapamiętujemy zadanie
    // i otwieramy je, gdy tylko będzie.
    // openTask sam zapamiętuje zadanie, gdy nawigator nie jest jeszcze gotowy,
    // i otwiera je przy onReady (patrz navigationRef.js).
    Notifications.getLastNotificationResponseAsync()
      .then((response) => openTask(taskIdOf(response)))
      .catch(() => {});

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      openTask(taskIdOf(response));
    });

    return () => {
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <SessionScope />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
