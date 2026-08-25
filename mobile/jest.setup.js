
// Moduły natywne Expo nie mają implementacji w środowisku testowym —
// podstawiamy minimalne atrapy, żeby testy sprawdzały nasz kod, a nie mostek
// do Androida.
// SafeAreaProvider mierzy wcięcia ekranu przez moduł natywny i dopóki nie
// dostanie wyniku, nie renderuje dzieci — w testach drzewo byłoby puste.
// Podmieniamy wyłącznie wartości początkowe (reszta modułu zostaje prawdziwa,
// bo React Navigation korzysta też z jego kontekstów).
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const React = require('react');
  const metrics = {
    insets: { top: 24, left: 0, right: 0, bottom: 16 },
    frame: { x: 0, y: 0, width: 390, height: 844 },
  };
  return {
    ...actual,
    initialWindowMetrics: metrics,
    SafeAreaProvider: ({ children, ...props }) =>
      React.createElement(actual.SafeAreaProvider, { ...props, initialMetrics: metrics }, children),
  };
});

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
    __store: store,
  };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExpoPushToken[test]' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { HIGH: 4 },
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

// Wyciszamy ostrzeżenia Reacta o aktualizacjach stanu poza act() — testy
// czekają na zakończenie żądań przez findBy*, a nie przez ręczne act().
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('not wrapped in act')) return;
  originalError(...args);
};
