# ─── etap 1: build frontendu ────────────────────────────────────────────
FROM node:22-slim AS client-build

WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ─── etap 2: zależności backendu ────────────────────────────────────────
FROM node:22-slim AS server-deps

WORKDIR /build/server
COPY server/package*.json ./
# --omit=dev: obraz produkcyjny nie potrzebuje narzędzi developerskich.
# better-sqlite3 pobiera gotowy plik binarny dla glibc — brak kompilacji.
RUN npm ci --omit=dev

# ─── etap 3: obraz uruchomieniowy ───────────────────────────────────────
FROM node:22-slim AS runtime

# tini poprawnie przekazuje sygnały (SIGTERM) do procesu Node, dzięki czemu
# `docker stop` uruchamia nasze zamykanie z domknięciem bazy, a nie ubija
# procesu w połowie zapisu.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini curl \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DB_PATH=/data/gezet.db

WORKDIR /app

COPY --from=server-deps /build/server/node_modules ./server/node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY --from=client-build /build/client/dist ./client/dist

# Baza leży w wolumenie, więc przetrwa `docker compose up --build`.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/src/index.js"]
