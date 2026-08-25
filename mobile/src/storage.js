import * as SecureStore from 'expo-secure-store';

/**
 * Token sesji trzymamy w SecureStore (Android Keystore), a nie w AsyncStorage.
 * AsyncStorage to zwykły plik w katalogu aplikacji — na urządzeniu z dostępem
 * root albo w kopii zapasowej byłby czytelny jak każdy inny plik.
 */
const TOKEN_KEY = 'gezet_token';
const API_URL_KEY = 'gezet_api_url';
const PUSH_TOKEN_KEY = 'gezet_push_token';

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
};
