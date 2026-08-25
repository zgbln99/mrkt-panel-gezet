/**
 * Atrapa backendu dla testów: odpowiada na te same ścieżki co prawdziwe API
 * i pilnuje tych samych reguł (token, wymuszona zmiana hasła, zakres danych
 * pracownika). Dzięki temu testy sprawdzają aplikację, a nie własne założenia.
 */
export function createFakeServer(options = {}) {
  const state = {
    mustChangePassword: options.mustChangePassword !== false,
    isAdmin: options.isAdmin !== false,
    password: 'Startowe-Haslo-123',
    token: 'token-1',
    calls: [],
    pushTokens: [],
    tasks: [
      {
        id: 'task-1',
        requestId: 'req-1',
        category: 'digital',
        title: 'Post social media — nowość Hyundai Tucson',
        details: 'Gotowa propozycja tekstu.',
        assignees: ['inga'],
        status: 'new',
        draftText: 'Hyundai Tucson właśnie wjechał do salonu.',
        transferLog: [],
      },
      {
        id: 'task-2',
        requestId: 'req-1',
        category: 'video',
        title: 'Reels — nowość: Hyundai Tucson',
        details: '',
        assignees: ['bogdan'],
        status: 'progress',
        draftText: '',
        transferLog: [],
      },
    ],
    notifications: [
      { id: 'n-1', text: 'Nowe zgłoszenie od Anna Testowa', read: false, at: new Date().toISOString(), requestId: 'req-1', taskId: null },
    ],
  };

  const request = {
    id: 'req-1',
    createdAt: new Date().toISOString(),
    seen: false,
    name: 'Anna Testowa',
    department: 'Sprzedaż / Handlowy',
    location: 'Szczecin',
    brand: 'Hyundai',
    model: 'Tucson',
    campaignPeriod: 'wrzesień 2026',
    triggers: ['new_model'],
    materials: [],
    materialsOther: '',
    listingLink: '',
    eventName: '',
    eventDate: '',
    notes: 'Kontekst wewnętrzny — nie publikować.',
  };

  const meta = {
    team: [
      { id: 'karolina', name: 'Karolina Lisowska-Kycia', role: 'Dyrektor Marketingu' },
      { id: 'inga', name: 'Inga', role: 'Social / eventy / agencje' },
      { id: 'bogdan', name: 'Bogdan', role: 'Video' },
    ],
    cats: [
      { id: 'digital', label: 'Kampanie digital' },
      { id: 'video', label: 'Video' },
    ],
    triggers: [{ id: 'new_model', t: 'Nowy model / nowość w ofercie', d: 'social, blog, foto, reels' }],
    materials: [{ id: 'flags', label: 'Flagi' }],
    passwordMinLength: 10,
  };

  const user = () => ({
    id: state.isAdmin ? 'karolina' : 'inga',
    username: state.isAdmin ? 'karolina' : 'inga',
    name: state.isAdmin ? 'Karolina Lisowska-Kycia' : 'Inga',
    role: state.isAdmin ? 'Dyrektor Marketingu' : 'Social / eventy / agencje',
    isAdmin: state.isAdmin,
    mustChangePassword: state.mustChangePassword,
  });

  const json = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  const visibleTasks = () =>
    state.isAdmin ? state.tasks : state.tasks.filter((t) => t.assignees.includes(user().id));

  async function fetchImpl(url, init = {}) {
    const path = String(url).replace(/^https?:\/\/[^/]+\/api/, '');
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    const authorized = (init.headers || {}).Authorization === `Bearer ${state.token}`;
    state.calls.push(`${method} ${path}`);

    if (path === '/meta') return json(200, meta);
    if (path === '/health') return json(200, { ok: true });

    if (path === '/auth/login' && method === 'POST') {
      if (body.password !== state.password) return json(401, { error: 'Nieprawidłowy login lub hasło.' });
      return json(200, { token: state.token, user: user() });
    }

    if (!authorized) return json(401, { error: 'Brak tokenu autoryzacji.', code: 'no_token' });

    if (path === '/auth/me') return json(200, { user: user() });

    if (path === '/auth/change-password' && method === 'POST') {
      if (body.currentPassword !== state.password) return json(401, { error: 'Aktualne hasło jest nieprawidłowe.' });
      state.password = body.newPassword;
      state.mustChangePassword = false;
      state.token = 'token-2';
      return json(200, { ok: true, token: state.token, user: user() });
    }

    // Serwer blokuje wszystko, dopóki hasło startowe nie zostanie zmienione.
    if (state.mustChangePassword) {
      return json(403, { error: 'Ustaw własne hasło.', code: 'password_change_required' });
    }

    if (path === '/requests' && method === 'GET') {
      const tasks = visibleTasks();
      return json(200, { requests: tasks.length ? [{ ...request, tasks }] : [] });
    }
    if (path === '/notifications' && method === 'GET') {
      return json(200, { unread: state.notifications.filter((n) => !n.read).length, notifications: state.notifications });
    }
    if (path === '/notifications/read-all') {
      state.notifications = state.notifications.map((n) => ({ ...n, read: true }));
      return json(200, { ok: true });
    }
    if (path.startsWith('/notifications/') && path.endsWith('/read')) {
      const id = path.split('/')[2];
      state.notifications = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
      return json(200, { ok: true });
    }
    if (path.startsWith('/tasks/') && method === 'PATCH') {
      const id = path.split('/')[2];
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return json(404, { error: 'Nie znaleziono zadania.' });
      if (!state.isAdmin && !task.assignees.includes(user().id)) {
        return json(403, { error: 'To zadanie nie jest przypisane do Ciebie.' });
      }
      if (body.status) task.status = body.status;
      if (body.assignees) task.assignees = body.assignees;
      return json(200, { task });
    }
    if (path.startsWith('/tasks/') && path.endsWith('/transfer')) {
      const id = path.split('/')[2];
      const task = state.tasks.find((t) => t.id === id);
      task.assignees = [body.toUserId];
      task.transferLog = [...task.transferLog, { from: user().id, to: body.toUserId, note: body.note, at: new Date().toISOString() }];
      return json(200, { task });
    }
    if (path === '/push/register') {
      if (!body || !body.token || !body.kind) return json(400, { error: 'Nieprawidłowy token urządzenia.' });
      state.pushTokens.push({ token: body.token, kind: body.kind, deviceId: body.deviceId });
      return json(200, { ok: true, transport: 'przekaźnik Expo' });
    }
    if (path === '/push/unregister') {
      state.pushTokens = state.pushTokens.filter((t) => t.deviceId !== (body && body.deviceId));
      return json(200, { ok: true });
    }
    if (path === '/users') return json(200, { users: [] });

    return json(404, { error: 'Nie znaleziono takiego zasobu API.' });
  }

  return { state, fetchImpl, meta, request };
}
