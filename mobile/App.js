import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';

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

export default function App() {
  const responseListener = useRef(null);

  useEffect(() => {
    // Dotknięcie powiadomienia systemowego. Nawigacja do konkretnego zadania
    // wymagałaby referencji do nawigatora; na razie wystarcza samo otwarcie
    // aplikacji — lista zadań i powiadomień odświeża się przy wejściu.
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});
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
