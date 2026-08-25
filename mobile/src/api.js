import Constants from 'expo-constants';
import { storage } from './storage';

/**
 * Klient API.
 *
 * Adres serwera nie może być zaszyty w kodzie jak w aplikacji webowej: telefon
 * nie stoi pod tą samą domeną co backend. Kolejność źródeł:
 *   1. adres wpisany w Ustawieniach aplikacji (zapisany na urządzeniu),
 *   2. EXPO_PUBLIC_API_URL z czasu budowania,
 *   3. extra.apiUrl z app.json.
 */
const BUILD_TIME_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.apiUrl) ||
  '';

let baseUrl = BUILD_TIME_URL;
let token = null;
let onUnauthorized = null;

export class ApiError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Doprowadza wpisany przez użytkownika adres do postaci https://host/api */
export function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  let withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  withScheme = withScheme.replace(/\/+$/, '');
  return /\/api$/i.test(withScheme) ? withScheme : `${withScheme}/api`;
}

export async function loadBaseUrl() {
  const saved = await storage.getApiUrl();
  baseUrl = saved || BUILD_TIME_URL;
  return baseUrl;
}

export async function setBaseUrl(value) {
  baseUrl = normalizeUrl(value);
  await storage.setApiUrl(baseUrl || null);
  return baseUrl;
}

export const getBaseUrl = () => baseUrl;
export const getBuildTimeUrl = () => BUILD_TIME_URL;

export function setAuthToken(value) {
  token = value || null;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(path, { method = 'GET', body, auth = false, timeoutMs = 15000 } = {}) {
  if (!baseUrl) {
    throw new ApiError('Nie ustawiono adresu serwera. Otwórz Ustawienia i podaj adres aplikacji.', {
      code: 'no_base_url',
    });
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  // Telefon regularnie trafia na martwe połączenie (słaby zasięg, wifi bez
  // internetu) — bez limitu czasu żądanie potrafiłoby wisieć w nieskończoność.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError(
      err.name === 'AbortError'
        ? 'Serwer nie odpowiedział na czas. Sprawdź połączenie.'
        : 'Brak połączenia z serwerem. Sprawdź sieć i adres w Ustawieniach.',
      { code: 'network' }
    );
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* odpowiedź bez treści albo nie-JSON */
  }

  if (!res.ok) {
    const code = data && data.code;
    if (res.status === 401 && auth && onUnauthorized) onUnauthorized(code);
    throw new ApiError((data && data.error) || `Błąd serwera (${res.status}).`, { status: res.status, code });
  }

  return data;
}

export const api = {
  health: () => request('/health'),
  getMeta: () => request('/meta'),

  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/auth/me', { auth: true }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'POST', auth: true, body: { currentPassword, newPassword } }),

  getUsers: () => request('/users', { auth: true }),
  resetUserPassword: (userId, newPassword) =>
    request(`/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      auth: true,
      body: newPassword ? { newPassword } : {},
    }),

  submitRequest: (payload) => request('/requests', { method: 'POST', body: payload }),
  getRequests: () => request('/requests', { auth: true }),
  markRequestSeen: (id) => request(`/requests/${encodeURIComponent(id)}/seen`, { method: 'PATCH', auth: true }),
  deleteRequest: (id) => request(`/requests/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  updateTaskStatus: (taskId, status) =>
    request(`/tasks/${encodeURIComponent(taskId)}`, { method: 'PATCH', auth: true, body: { status } }),
  updateTaskAssignees: (taskId, assignees) =>
    request(`/tasks/${encodeURIComponent(taskId)}`, { method: 'PATCH', auth: true, body: { assignees } }),
  transferTask: (taskId, toUserId, note) =>
    request(`/tasks/${encodeURIComponent(taskId)}/transfer`, { method: 'POST', auth: true, body: { toUserId, note } }),

  getNotifications: () => request('/notifications', { auth: true }),
  markNotificationRead: (id) =>
    request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', auth: true }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST', auth: true }),

  registerPushToken: ({ token: pushToken, kind, deviceId, platform }) =>
    request('/push/register', {
      method: 'POST',
      auth: true,
      body: { token: pushToken, kind, deviceId, platform },
    }),
  unregisterPushToken: ({ deviceId, token: pushToken }) =>
    request('/push/unregister', { method: 'POST', auth: true, body: { deviceId, token: pushToken } }),
};
