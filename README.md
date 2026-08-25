# Zgłoszenia Marketing Gezet

Aplikacja wewnętrzna: publiczny formularz zgłoszeń dla handlowców + panel
zespołu marketingu (admin i pracownicy) z powiadomieniami i przekazywaniem
zadań.

Stack:
- **Backend**: Node.js + Express + SQLite (`better-sqlite3`), auth przez JWT, hasła hashowane `bcrypt`.
- **Frontend**: React + Vite.

```
gezet-marketing/
  server/     ← API (Node/Express + SQLite)
  client/     ← aplikacja React (Vite)
```

## 1. Uruchomienie lokalne (development)

### Backend

```bash
cd server
cp .env.example .env
# wygeneruj i wklej do .env silny JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm install
npm run seed      # tworzy domyślne konta (zobacz hasła startowe w konsoli)
npm run dev        # http://localhost:4000
```

### Frontend

```bash
cd client
cp .env.example .env   # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev             # http://localhost:5173
```

Otwórz `http://localhost:5173`. Formularz jest publiczny. Panel zespołu
otwiera się przez małą, dyskretną ikonkę kłódki w prawym rogu nagłówka.

Domyślne konta zakłada `npm run seed` (patrz `server/scripts/seed.js`) —
**zmień hasła startowe przed wdrożeniem produkcyjnym** (patrz sekcja 4).

## 2. Architektura i bezpieczeństwo — co się zmieniło względem wersji "artefaktowej"

Wcześniejsza wersja (artefakt HTML/React w Claude.ai) trzymała listę
loginów i haseł wprost w kodzie JS wysyłanym do przeglądarki — dopuszczalne
tylko w zamkniętym środowisku podglądu, **nie do publicznego internetu**:
każdy odwiedzający mógłby otworzyć konsolę i odczytać wszystkie hasła.

Ta wersja to prawdziwa architektura klient-serwer:
- Hasła są **hashowane** (bcrypt, koszt 12) i nigdy nie opuszczają serwera.
- Logowanie zwraca **token JWT** (podpisany sekretem znanym tylko serwerowi), ważny 7 dni.
- Każdy request do panelu (`/api/requests`, `/api/tasks/...`, `/api/notifications/...`) wymaga nagłówka `Authorization: Bearer <token>` i jest weryfikowany po stronie serwera.
- Pracownik **fizycznie nie otrzymuje** z API zadań innych osób — filtrowanie dzieje się w bazie/serwerze, nie w przeglądarce, więc nie da się tego obejść przez konsolę deweloperską.
- Prosty rate-limit na logowanie (8 nieudanych prób / 10 min / IP) ogranicza brute-force.
- **Zmiana hasła**: każdy zalogowany (ikonka kłódki z kluczem obok "Wyloguj") może zmienić własne hasło — wymaga podania aktualnego hasła. Administrator dodatkowo widzi w panelu sekcję "Zarządzanie kontami zespołu", gdzie może zresetować hasło dowolnej osobie (np. gdy ktoś je zapomni) bez znajomości starego hasła.

## 3. Wdrożenie na VPS (Ubuntu/Debian, przykład)

Zakładam: masz VPS z dostępem SSH, domenę wskazującą na jego IP, oraz prawa `sudo`.

### 3.1. Zależności systemowe

```bash
sudo apt update
sudo apt install -y nodejs npm nginx
sudo npm install -g pm2
```

(Jeśli repozytorium systemowe ma za starego node/npm, użyj [nvm](https://github.com/nvm-sh/nvm) albo NodeSource — aplikacja wymaga **Node 18+**.)

### 3.2. Pliki aplikacji

```bash
sudo mkdir -p /var/www/gezet-marketing
sudo chown $USER:$USER /var/www/gezet-marketing
# skopiuj tam zawartość tego projektu (scp/rsync/git clone)
cd /var/www/gezet-marketing
```

### 3.3. Backend

```bash
cd server
cp .env.example .env
nano .env
```

W `.env` ustaw:
- `JWT_SECRET` — wygeneruj: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `PORT=4000` (albo inny wolny port)
- `CLIENT_ORIGIN=https://twoja-domena.pl`
- `DB_PATH=./data/gezet.db`

```bash
npm install --omit=dev
npm run seed
```

**Zaraz po seedowaniu zaloguj się jako każdy użytkownik i zmień hasło**
(patrz sekcja 4 — w tej wersji zmiana hasła to na razie: edycja bazy albo
ponowne uruchomienie `seed.js` z innymi hasłami przed pierwszym użyciem
produkcyjnym).

Uruchom przez PM2 (automatyczny restart, przetrwa reboot):

```bash
pm2 start src/index.js --name gezet-api
pm2 save
pm2 startup   # wykonaj komendę, którą PM2 wypisze, żeby wystartował po reboot VPS-a
```

### 3.4. Frontend (build statyczny)

```bash
cd ../client
cp .env.example .env
```

W `.env` ustaw docelowy adres API, np. `VITE_API_URL=https://twoja-domena.pl/api`
(zakładamy, że nginx przekieruje `/api` do backendu — patrz niżej).

```bash
npm install
npm run build     # tworzy client/dist — statyczne pliki gotowe do serwowania
```

### 3.5. nginx — reverse proxy + serwowanie statyki + HTTPS

Przykładowa konfiguracja `/etc/nginx/sites-available/gezet-marketing`:

```nginx
server {
    listen 80;
    server_name twoja-domena.pl;

    # Statyczny frontend (zbudowany przez Vite)
    root /var/www/gezet-marketing/client/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    # API — proxy do backendu Node/Express na porcie 4000
    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/gezet-marketing /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3.6. HTTPS (Let's Encrypt / certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d twoja-domena.pl
```

Certbot sam zaktualizuje konfigurację nginx pod HTTPS i ustawi automatyczne odnawianie certyfikatu.

### 3.7. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # 80 + 443
sudo ufw enable
```

Port 4000 (backend) **nie powinien** być otwarty na świat — dostęp do niego
idzie wyłącznie przez nginx (`proxy_pass` powyżej), które łączy się lokalnie
na `127.0.0.1`.

### 3.8. Aktualizacje w przyszłości

```bash
cd /var/www/gezet-marketing
git pull   # albo scp nowych plików
cd server && npm install --omit=dev && pm2 restart gezet-api
cd ../client && npm install && npm run build   # nginx serwuje nowy dist od razu
```

## 4. Dalsze kroki bezpieczeństwa (zalecane przed produkcją)

Ta wersja celowo trzyma się prostoty tam, gdzie to bezpieczne, ale zanim
udostępnisz to szerzej, rozważ:

1. **Zmiana haseł startowych** — `seed.js` ustawia hasła jawnym tekstem tylko
   raz, w trakcie zakładania kont. Zmień je na silne, unikalne hasła
   (edytuj listę w `server/scripts/seed.js` przed pierwszym uruchomieniem
   `npm run seed` na produkcji, albo dodaj endpoint zmiany hasła).
2. **HTTPS wszędzie** (sekcja 3.6) — token JWT w nagłówku `Authorization` nie
   powinien nigdy podróżować po zwykłym HTTP.
3. **Kopie zapasowe** pliku `server/data/gezet.db` (to zwykły plik SQLite —
   wystarczy go okresowo kopiować, np. `cron` + `cp`/`rsync` na zewnętrzny dysk).
4. **Monitorowanie** — `pm2 logs gezet-api` do bieżącego podglądu, `pm2 monit` do zasobów.
5. Jeśli ruch znacząco wzrośnie, SQLite nadal wystarczy dla dziesiątek
   równoczesnych użytkowników (typowa skala zespołu marketingu w firmie) —
   migracja do Postgresa byłaby potrzebna dopiero przy znacznie większej skali.

## 5. Struktura API (skrót)

| Metoda | Endpoint | Dostęp | Opis |
|---|---|---|---|
| GET | `/api/meta` | publiczny | zespół, kategorie, triggery, materiały |
| POST | `/api/requests` | publiczny | nowe zgłoszenie → generuje zadania |
| GET | `/api/requests` | zalogowany | admin: wszystko; pracownik: tylko swoje zadania |
| PATCH | `/api/requests/:id/seen` | admin | oznacz zgłoszenie jako zobaczone |
| PATCH | `/api/tasks/:id` | zalogowany | zmiana statusu (właściciel/admin) lub przypisań (admin) |
| POST | `/api/tasks/:id/transfer` | zalogowany | przekazanie zadania innej osobie + adnotacja |
| GET | `/api/notifications` | zalogowany | własne powiadomienia |
| POST | `/api/notifications/:id/read` | zalogowany | oznacz jedno jako przeczytane |
| POST | `/api/notifications/read-all` | zalogowany | oznacz wszystkie jako przeczytane |
| POST | `/api/auth/login` | publiczny | logowanie, zwraca token JWT |
| GET | `/api/auth/me` | zalogowany | dane zalogowanego konta |
| POST | `/api/auth/change-password` | zalogowany | zmiana własnego hasła (wymaga aktualnego hasła) |
| GET | `/api/users` | admin | lista kont zespołu |
| POST | `/api/users/:id/reset-password` | admin | reset hasła dowolnej osobie |
