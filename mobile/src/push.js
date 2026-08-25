import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { storage } from './storage';
import { api } from './api';

/**
 * Powiadomienia push.
 *
 * Telefon zgłasza serwerowi DWA tokeny opisane tym samym identyfikatorem
 * urządzenia:
 *   • natywny token FCM — używany, gdy serwer ma klucz konta usługi Firebase
 *     (treść powiadomienia nie przechodzi wtedy przez firmę trzecią),
 *   • token Expo — droga zapasowa, działająca bez konfiguracji Firebase.
 * Serwer wybiera jedną z nich, więc telefon nigdy nie dostaje dwóch kopii.
 *
 * Każdy krok jest opcjonalny: brak zgody użytkownika, emulator bez usług
 * Google czy brak konfiguracji EAS nie mogą przeszkodzić w korzystaniu
 * z aplikacji — lista powiadomień w aplikacji działa niezależnie.
 */

Notifications.setNotificationHandler({
  // Zachowanie przy aplikacji otwartej na pierwszym planie. Bez tego Android
  // wyciszyłby powiadomienie, zakładając, że użytkownik i tak je widzi —
  // a przy otwartym innym ekranie aplikacji wcale nie musi.
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Kanał powiadomień. Od Androida 8 to kanał — nie aplikacja — decyduje
 * o dźwięku, wibracji i tym, czy powiadomienie wyskakuje banerem.
 * Ustawienia kanału są zapisywane przy pierwszym utworzeniu: późniejsza zmiana
 * w kodzie nie nadpisze wyboru, którego użytkownik dokonał w ustawieniach
 * systemu (i słusznie).
 */
export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Zadania i zgłoszenia',
    description: 'Nowe zadania, przekazania i nowe zgłoszenia z formularza.',
    // HIGH = baner na wierzchu ekranu razem z dźwiękiem. Przy DEFAULT
    // powiadomienie wpadałoby tylko na pasek, po cichu.
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2B6777',
    enableLights: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
  });
}

function projectId() {
  const expoConfig = Constants.expoConfig || {};
  const extra = expoConfig.extra || {};
  return (extra.eas && extra.eas.projectId) || (Constants.easConfig && Constants.easConfig.projectId) || null;
}

export async function registerForPush() {
  const result = { granted: false, fcm: false, expo: false, reason: null };

  try {
    if (!Device.isDevice) {
      result.reason = 'emulator';
      return result;
    }

    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') {
      result.reason = 'denied';
      return result;
    }
    result.granted = true;

    const deviceId = await storage.getDeviceId();

    // Oba tokeny pobieramy niezależnie: telefon z google-services.json, ale bez
    // skonfigurowanego projektu EAS, dostanie token FCM i nie dostanie Expo —
    // wspólny try zablokowałby wtedy jedyną działającą drogę.
    try {
      const native = await Notifications.getDevicePushTokenAsync();
      if (native && native.data) {
        await api.registerPushToken({ token: native.data, kind: 'fcm', deviceId, platform: Platform.OS });
        result.fcm = true;
      }
    } catch (err) {
      console.warn('[push] token FCM niedostępny:', err.message);
    }

    try {
      const id = projectId();
      const expo = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : undefined);
      if (expo && expo.data) {
        await api.registerPushToken({ token: expo.data, kind: 'expo', deviceId, platform: Platform.OS });
        result.expo = true;
      }
    } catch (err) {
      console.warn('[push] token Expo niedostępny:', err.message);
    }

    if (!result.fcm && !result.expo) result.reason = 'no_token';
    return result;
  } catch (err) {
    console.warn('[push] rejestracja nieudana:', err.message);
    result.reason = 'error';
    result.message = err.message;
    return result;
  }
}

/** Wywoływane przy wylogowaniu — powiadomienia nie mogą trafiać do poprzedniej osoby. */
export async function unregisterFromPush() {
  try {
    const deviceId = await storage.getDeviceId();
    await api.unregisterPushToken({ deviceId });
  } catch {
    /* wylogowanie nie może się wywalić przez błąd sieci */
  }
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    /* nie każdy launcher obsługuje plakietki */
  }
}

/** Liczba nieprzeczytanych na ikonie aplikacji (o ile launcher to obsługuje). */
export async function setBadge(count) {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Number(count) || 0));
  } catch {
    /* bez znaczenia dla działania aplikacji */
  }
}
