import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { storage } from './storage';
import { api } from './api';

/**
 * Rejestracja urządzenia do powiadomień push.
 *
 * Wszystko tutaj jest opcjonalne: brak zgody użytkownika, emulator bez usług
 * Google albo błąd sieci nie mogą przeszkodzić w korzystaniu z aplikacji —
 * lista powiadomień w aplikacji działa niezależnie od pushy.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  // Android od wersji 8 wymaga kanału; bez niego powiadomienie nie ma dźwięku
  // ani nie pojawia się jako baner.
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Zadania i zgłoszenia',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2B6777',
  });
}

export async function registerForPush() {
  try {
    if (!Device.isDevice) return { ok: false, reason: 'emulator' };

    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    const projectId =
      (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.eas && Constants.expoConfig.extra.eas.projectId) ||
      (Constants.easConfig && Constants.easConfig.projectId);

    const { data: pushToken } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!pushToken) return { ok: false, reason: 'no_token' };

    await api.registerPushToken(pushToken, Platform.OS);
    await storage.setPushToken(pushToken);
    return { ok: true, token: pushToken };
  } catch (err) {
    // Najczęstsza przyczyna: aplikacja uruchomiona bez konfiguracji EAS/FCM.
    console.warn('[push] rejestracja nieudana:', err.message);
    return { ok: false, reason: 'error', message: err.message };
  }
}

/** Wywoływane przy wylogowaniu — kolejne powiadomienia nie mogą trafiać do poprzedniej osoby. */
export async function unregisterFromPush() {
  try {
    const pushToken = await storage.getPushToken();
    if (!pushToken) return;
    await api.unregisterPushToken(pushToken);
  } catch {
    /* wylogowanie nie może się wywalić przez błąd sieci */
  } finally {
    await storage.setPushToken(null);
  }
}
