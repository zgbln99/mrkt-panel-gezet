/**
 * Warstwa komunikacji z API.
 *
 * Domyślny adres to względne `/api` — przy wdrożeniu, gdzie frontend i backend
 * dzielą domenę (nginx albo serwowanie statyki przez Node), aplikacja działa
 * bez ustawiania czegokolwiek w .env i bez ryzyka, że produkcyjny build zostanie
 * zbudowany z adresem localhost.
 */
const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
const TOKEN_KEY = 'gezet_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage zablokowany (tryb prywatny) — sesja nie przetrwa odświeżenia */
  }
}

// Wywoływane, gdy serwer odrzuci token (wygasł, konto skasowane, hasło
// zmienione gdzie indziej). Aplikacja podpina tu wylogowanie, dzięki czemu
// nie zostaje pusty panel z komunikatami błędów w tle.
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Brak połączenia z serwerem. Sprawdź sieć i spróbuj ponownie.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* odpowiedź bez treści albo nie-JSON */
  }

  if (!res.ok) {
    const code = data && data.code;
    // Konto wymagające zmiany hasła nie jest błędem sesji — obsługuje je
    // aplikacja, pokazując okno zmiany hasła zamiast wylogowywać.
    if (res.status === 401 && auth) {
      setToken(null);
      if (onUnauthorized) onUnauthorized(code);
    }
    throw new ApiError((data && data.error) || `Błąd serwera (${res.status}).`, { status: res.status, code });
  }

  return data;
}

export const api = {
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
  createManualRequest: (payload) => request('/requests/manual', { method: 'POST', auth: true, body: payload }),
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
};
