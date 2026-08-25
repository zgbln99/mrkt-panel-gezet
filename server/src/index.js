require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const requestsRoutes = require('./routes/requests.routes');
const tasksRoutes = require('./routes/tasks.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const metaRoutes = require('./routes/meta.routes');
const usersRoutes = require('./routes/users.routes');

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());

app.use(cors({ origin: CLIENT_ORIGIN, credentials: false }));
app.use(express.json({ limit: '512kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/users', usersRoutes);

// Opcjonalnie: serwowanie zbudowanego frontendu (client/dist) bezpośrednio
// z tego samego procesu Node, jeśli katalog istnieje. Wygodne, gdy chcesz
// uruchomić całość jako jeden proces za nginx-em (patrz README.md).
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Centralny handler błędów — nie wyciekamy stack trace do klienta na produkcji.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Wystąpił nieoczekiwany błąd serwera.' });
});

app.listen(PORT, () => {
  console.log(`Gezet Marketing API nasłuchuje na porcie ${PORT}`);
});
