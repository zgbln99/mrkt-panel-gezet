const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const db = require('./db');

const authRoutes = require('./routes/auth.routes');
const requestsRoutes = require('./routes/requests.routes');
const tasksRoutes = require('./routes/tasks.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const metaRoutes = require('./routes/meta.routes');
const usersRoutes = require('./routes/users.routes');
const pushRoutes = require('./routes/push.routes');

const pkg = require('../package.json');

const app = express();

// Za nginx-em prawdziwy adres klienta jest w nagłówku X-Forwarded-For.
// Bez tego ustawienia Express widzi wyłącznie 127.0.0.1 i limity per-IP
// obejmowałyby wszystkich użytkowników łącznie.
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Vite wstrzykuje style komponentów jako <style>; skrypty ładowane są
        // wyłącznie z własnego origin (żadnych CDN-ów).
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", ...config.clientOrigins],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    // Aplikacja bywa otwierana pod adresem IP przed konfiguracją HTTPS —
    // HSTS włączamy dopiero na produkcji, gdzie certyfikat już działa.
    hsts: config.isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'same-origin' },
  })
);

app.use(compression());

// CORS jest potrzebny tylko wtedy, gdy frontend stoi pod innym adresem niż API
// (np. lokalny `vite dev` na porcie 5173). Przy wdrożeniu za nginx-em, gdzie
// oba dzielą domenę, lista bywa pusta i żadne żądanie cross-origin nie przejdzie.
if (config.clientOrigins.length > 0) {
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Origin niedozwolony przez konfigurację CORS.'));
      },
      credentials: false,
    })
  );
}

app.use(express.json({ limit: '256kb' }));

/* --------------------------------- logi --------------------------------- */

if (config.logRequests) {
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      // Bez treści żądania — w body są dane osobowe zgłaszających i hasła.
      console.log(
        `${new Date().toISOString()} ${req.method} ${req.originalUrl.split('?')[0]} ` +
          `${res.statusCode} ${ms.toFixed(0)}ms ${req.ip}`
      );
    });
    next();
  });
}

/* ------------------------------ rate limiting ------------------------------ */

const limiterOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.' },
};

// Ogólny bezpiecznik na całe API — chroni przed przypadkową pętlą w kliencie
// i prymitywnym floodem. Panel odpytuje serwer co ~15 s, więc limit jest
// wielokrotnie wyższy niż normalne użycie.
const apiLimiter = rateLimit({ ...limiterOptions, windowMs: 5 * 60 * 1000, limit: 600 });

// Logowanie: liczymy wyłącznie nieudane próby, więc normalna praca zespołu
// nigdy nie zbliża się do limitu, a zgadywanie haseł zatrzymuje się po 10.
const loginLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za kilkanaście minut.' },
});

// Publiczny formularz jest dostępny bez logowania — bez limitu jedna osoba
// mogłaby zapchać bazę (i skrzynkę powiadomień zespołu) tysiącami zgłoszeń.
const submitLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  message: { error: 'Wysłano zbyt wiele zgłoszeń z tego adresu. Spróbuj ponownie za godzinę.' },
});

app.use('/api', apiLimiter);

/* --------------------------------- trasy --------------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: pkg.version, uptime: Math.round(process.uptime()) });
});

app.post('/api/auth/login', loginLimiter, (req, _res, next) => {
  // Po udanym logowaniu kasujemy licznik prób, żeby literówka w haśle
  // sprzed chwili nie zabierała limitu na kolejne kwadranse.
  req.resetLoginAttempts = () => loginLimiter.resetKey(req.ip);
  next();
});
app.post('/api/requests', submitLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/push', pushRoutes);

// Nieznana ścieżka pod /api to błąd API — musi wrócić JSON-em, nie stroną
// HTML z frontendu (inaczej klient próbuje sparsować HTML jako odpowiedź).
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Nie znaleziono takiego zasobu API.' });
});

/* --------------------------- statyczny frontend --------------------------- */

// Jeśli obok leży zbudowany frontend (client/dist), serwujemy go z tego samego
// procesu. Dzięki temu na VPS-ie wystarczy jeden proces Node i prosta
// konfiguracja nginx (albo sam kontener) — patrz README.
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');

if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  // Pliki z hashem w nazwie (JS/CSS/czcionki z Vite) są niezmienne — można je
  // cache'ować na rok. index.html musi być świeży, inaczej po wdrożeniu
  // przeglądarki trzymałyby się starej wersji aplikacji.
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        res.setHeader(
          'Cache-Control',
          filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable'
        );
      },
    })
  );

  app.get('*', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.type('text/plain').send(
      'API działa. Frontend nie został zbudowany — uruchom `npm run build` w katalogu client/.'
    );
  });
}

/* ------------------------------ obsługa błędów ------------------------------ */

app.use((err, _req, res, _next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Przesłane dane są zbyt duże.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Nieprawidłowy format danych (oczekiwano JSON).' });
  }
  // Szczegóły trafiają wyłącznie do logu serwera — klient dostaje komunikat
  // bez ścieżek plików i stack trace'ów.
  console.error('[błąd]', err);
  res.status(500).json({ error: 'Wystąpił nieoczekiwany błąd serwera.' });
});

/* --------------------------------- start --------------------------------- */

const server = app.listen(config.port, config.host, () => {
  console.log(
    `Gezet Marketing API v${pkg.version} — nasłuchuje na http://${config.host}:${config.port} ` +
      `(tryb: ${config.nodeEnv}, baza: ${config.dbPath})`
  );
  if (!config.isProduction) {
    console.log('Uwaga: NODE_ENV nie jest ustawione na "production" — na serwerze produkcyjnym ustaw je w .env.');
  }
});

/**
 * Zamknięcie na sygnał — pm2/systemd/docker wysyłają SIGTERM przy restarcie.
 * Domykamy trwające żądania i bazę, żeby restart nie przerywał zapisu w pół
 * transakcji i nie zostawiał plików WAL w stanie wymagającym naprawy.
 */
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Otrzymano ${signal} — zamykam serwer…`);

  const force = setTimeout(() => {
    console.error('Nie udało się zamknąć w 10 s — wymuszam zakończenie.');
    process.exit(1);
  }, 10000);
  force.unref();

  server.close(() => {
    try {
      db.close();
    } catch (e) {
      console.error('Błąd przy zamykaniu bazy:', e);
    }
    clearTimeout(force);
    console.log('Zamknięto poprawnie.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[nieobsłużone odrzucenie promise]', reason);
});

module.exports = app;
