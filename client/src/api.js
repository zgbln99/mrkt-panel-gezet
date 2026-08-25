const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'gezet_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* localStorage niedostępny — sesja nie przetrwa odświeżenia */ }
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
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
  } catch (e) {
    throw new Error('Nie można połączyć się z serwerem. Sprawdź połączenie internetowe.');
  }

  let data = null;
  try { data = await res.json(); } catch { /* pusta odpowiedź */ }

  if (res.status === 401 && auth) {
    setToken(null);
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Błąd serwera (${res.status}).`);
  }
  return data;
}

export const api = {
  getMeta: () => request('/meta'),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/auth/me', { auth: true }),
  changePassword: (currentPassword, newPassword) => request('/auth/change-password', { method: 'POST', auth: true, body: { currentPassword, newPassword } }),

  getUsers: () => request('/users', { auth: true }),
  resetUserPassword: (userId, newPassword) => request(`/users/${userId}/reset-password`, { method: 'POST', auth: true, body: { newPassword } }),

  submitRequest: (payload) => request('/requests', { method: 'POST', body: payload }),
  getRequests: () => request('/requests', { auth: true }),
  markRequestSeen: (id) => request(`/requests/${id}/seen`, { method: 'PATCH', auth: true }),

  updateTaskStatus: (taskId, status) => request(`/tasks/${taskId}`, { method: 'PATCH', auth: true, body: { status } }),
  updateTaskAssignees: (taskId, assignees) => request(`/tasks/${taskId}`, { method: 'PATCH', auth: true, body: { assignees } }),
  transferTask: (taskId, toUserId, note) => request(`/tasks/${taskId}/transfer`, { method: 'POST', auth: true, body: { toUserId, note } }),

  getNotifications: () => request('/notifications', { auth: true }),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST', auth: true }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST', auth: true }),
};
