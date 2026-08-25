import * as SecureStore from 'expo-secure-store';

/**
 * Token sesji trzymamy w SecureStore (Android Keystore), a nie w AsyncStorage.
 * AsyncStorage to zwykły plik w katalogu aplikacji — na urządzeniu z dostępem
 * root albo w kopii zapasowej byłby czytelny jak każdy inny plik.
 */
const TOKEN_KEY = 'gezet_token';
const API_URL_KEY = 'gezet_api_url';
const PUSH_TOKEN_KEY = 'gezet_push_token';
const DEVICE_ID_KEY = 'gezet_device_id';

async function read(key) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key, value) {
  try {
    if (value === null || value === undefined) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, String(value));
  } catch {
    /* brak dostępu do magazynu — sesja nie przetrwa restartu aplikacji */
  }
}

export const storage = {
  getToken: () => read(TOKEN_KEY),
  setToken: (value) => write(TOKEN_KEY, value),
  getApiUrl: () => read(API_URL_KEY),
  setApiUrl: (value) => write(API_URL_KEY, value),
  getPushToken: () => read(PUSH_TOKEN_KEY),
  setPushToken: (value) => write(PUSH_TOKEN_KEY, value),

  /**
   * Stały identyfikator instalacji. Serwer paruje po nim token FCM z tokenem
   * Expo tego samego telefonu i wysyła powiadomienie tylko jedną drogą —
   * bez tego urządzenie zgłaszające oba dostawałoby je podwójnie.
   *
   * To wyłącznie klucz grupujący, nie sekret: losowość z Math.random w zupełności
   * wystarczy, a uniknięcie kolejnej zależności upraszcza aplikację.
   */
  async getDeviceId() {
    const existing = await read(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await write(DEVICE_ID_KEY, generated);
    return generated;
  },
};
