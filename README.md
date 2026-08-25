# Zgłoszenia Marketing Gezet

Aplikacja wewnętrzna Grupa Gezet: **publiczny formularz zgłoszeń** dla handlowców
i kierowników oraz **panel zadań** zespołu marketingu z powiadomieniami,
przekazywaniem zadań i gotowymi szkicami treści.

Zgłoszenie wysłane z formularza aplikacja sama rozkłada na konkretne zadania
(kampanie digital, video, foto, materiały, eventy) i przypisuje je właściwym
osobom razem z gotowym szkicem posta, wpisu na blog albo scenariusza rolki.

---

## Spis treści

1. [Stack i struktura](#1-stack-i-struktura)
2. [Uruchomienie lokalne](#2-uruchomienie-lokalne)
3. [Wdrożenie na VPS](#3-wdrożenie-na-vps)
4. [Codzienna obsługa](#4-codzienna-obsługa)
5. [Bezpieczeństwo](#5-bezpieczeństwo)
6. [Struktura API](#6-struktura-api)
7. [Co zmieniła wersja 2.0](#7-co-zmieniła-wersja-20)

---

## 1. Stack i struktura

| Warstwa | Technologia |
|---|---|
| Backend | Node.js 18+ · Express 4 · SQLite (`better-sqlite3`) |
| Uwierzytelnianie | JWT + bcrypt (koszt 12) |
| Frontend | React 18 · Vite 5 |
| Wdrożenie | Docker Compose **albo** systemd + nginx |

```
gezet-marketing/
├── server/            API (Express + SQLite)
│   ├── src/
│   │   ├── config.js      walidacja konfiguracji przy starcie
│   │   ├── db.js          schemat bazy + migracje
│   │   ├── auth.js        hashowanie haseł, tokeny JWT
│   │   ├── lib/           logika zadań, walidacja, dostęp do danych
│   │   ├── middleware/    kontrola dostępu
│   │   └── routes/        endpointy API
│   └── scripts/       seed, reset hasła, kopia zapasowa, test dymny
├── client/            aplikacja React (Vite)
│   ├── public/fonts/  czcionki hostowane lokalnie
│   └── src/
├── deploy/            nginx, systemd, PM2, skrypty instalacyjne
├── Dockerfile
└── docker-compose.yml
```

---

## 2. Uruchomienie lokalne

Wymagany **Node.js 18 lub nowszy** (`node -v`).

```bash
# 1. zależności
npm run setup

# 2. konfiguracja backendu
cd server
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#   ↑ wklej wynik do JWT_SECRET w pliku .env, ustaw NODE_ENV=development

# 3. konta zespołu (wypisze hasła startowe — zapisz je)
npm run seed

# 4. backend
npm run dev            # http://localhost:4000
```

W drugim terminalu:

```bash
cd client
npm run dev            # http://localhost:5173
```

Frontend nie wymaga konfiguracji — Vite proxuje `/api` na backend
(patrz `client/vite.config.js`).

Otwórz `http://localhost:5173`. Formularz jest publiczny; panel zespołu otwiera
dyskretna ikona kłódki w prawym górnym rogu.

### Testy

```bash
npm test
```

Test dymny startuje serwer na tymczasowej bazie i sprawdza pełną ścieżkę:
wysłanie zgłoszenia, walidację danych z formularza, logowanie, wymuszoną zmianę
hasła startowego, izolację danych między pracownikami, przekazywanie zadań,
reset hasła przez administratora i unieważnianie sesji.

---

## 3. Wdrożenie na VPS

Do wyboru dwie drogi. Obie zakładają VPS z Ubuntu 22.04/24.04 lub Debianem 12,
dostęp `sudo` i domenę wskazującą rekordem A na adres IP serwera.

### Droga A — jeden skrypt (zalecana)

```bash
# na serwerze
sudo apt update && sudo apt install -y git
sudo git clone <adres-repozytorium> /var/www/gezet-marketing
cd /var/www/gezet-marketing
sudo bash deploy/install.sh marketing.twoja-firma.pl
```

Skrypt instaluje Node.js, nginx, certbot i ufw, zakłada systemowe konto `gezet`,
buduje frontend, generuje `.env` z losowym `JWT_SECRET`, zakłada konta zespołu
i wypisuje hasła startowe, uruchamia usługę systemd wraz z codzienną kopią
zapasową, konfiguruje nginx-a, firewall oraz certyfikat HTTPS.

**Zapisz hasła startowe wypisane przez skrypt** — nie da się ich odczytać później
(w bazie leżą wyłącznie hashe). Gdyby przepadły: `npm run set-password -- <login>`.

Jest idempotentny — można go uruchomić ponownie; istniejącej bazy ani `.env`
nie nadpisuje.

### Droga B — Docker Compose

```bash
sudo git clone <adres-repozytorium> /var/www/gezet-marketing
cd /var/www/gezet-marketing

cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#   ↑ wklej do JWT_SECRET w .env

docker compose up -d --build
docker compose exec app node server/scripts/seed.js   # konta + hasła startowe
```

Kontener serwuje API i frontend na `127.0.0.1:4000`. HTTPS dokłada nginx
na hoście:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/gezet-marketing
sudo sed -i 's/TWOJA-DOMENA.PL/marketing.twoja-firma.pl/g' /etc/nginx/sites-available/gezet-marketing
sudo ln -sf /etc/nginx/sites-available/gezet-marketing /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d marketing.twoja-firma.pl

sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

Baza żyje w wolumenie `gezet-data`, więc przetrwa przebudowę obrazu.

### Droga C — ręcznie, krok po kroku

Jeśli wolisz kontrolować każdy etap, warianty konfiguracji leżą gotowe
w katalogu `deploy/`:

| Plik | Do czego |
|---|---|
| `deploy/nginx.conf` | reverse proxy, cache statyki, limit żądań |
| `deploy/gezet-marketing.service` | usługa systemd (z ograniczeniami dostępu do systemu) |
| `deploy/gezet-backup.service` + `.timer` | codzienna kopia zapasowa o 2:30 |
| `deploy/ecosystem.config.js` | konfiguracja PM2, jeśli wolisz PM2 od systemd |
| `deploy/install.sh` | pełna instalacja — można czytać jak instrukcję |
| `deploy/update.sh` | wdrożenie nowej wersji |

Skrócona ścieżka ręczna:

```bash
cd /var/www/gezet-marketing/server
cp .env.example .env && nano .env        # ustaw JWT_SECRET, NODE_ENV=production
npm ci --omit=dev
npm run seed

cd ../client && npm ci && npm run build && rm -rf node_modules

sudo cp deploy/gezet-marketing.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now gezet-marketing
```

Backend serwuje `client/dist` z tego samego procesu, więc nginx ma tylko jeden
cel proxy i nie trzeba mu podawać ścieżki do plików statycznych.

---

## 4. Codzienna obsługa

### Aktualizacja do nowej wersji

```bash
sudo bash /var/www/gezet-marketing/deploy/update.sh
```

Skrypt robi kopię zapasową, pobiera zmiany, przebudowuje frontend, restartuje
usługę i sprawdza, czy aplikacja wstała. W Dockerze:
`docker compose up -d --build`.

Migracje bazy wykonują się automatycznie przy starcie — nie ma osobnego kroku
do zapomnienia.

### Logi i stan

```bash
systemctl status gezet-marketing
journalctl -u gezet-marketing -f          # logi na żywo
journalctl -u gezet-marketing --since today
docker compose logs -f app                # wariant dockerowy
curl -s https://marketing.twoja-firma.pl/api/health
```

### Kopie zapasowe

Timer systemd (`gezet-backup.timer`) wykonuje kopię codziennie o 2:30 do
`/var/www/gezet-marketing/backups/` i kasuje kopie starsze niż 30 dni.
Ręcznie: `npm run backup`.

Kopia powstaje przez `VACUUM INTO`, nie przez `cp` — przy włączonym trybie WAL
skopiowanie samego pliku `.db` podczas pracy aplikacji dałoby kopię niespójną.

Odtworzenie:

```bash
sudo systemctl stop gezet-marketing
sudo -u gezet cp /var/www/gezet-marketing/backups/gezet-2026-08-25-02-30.db \
                 /var/www/gezet-marketing/server/data/gezet.db
sudo rm -f /var/www/gezet-marketing/server/data/gezet.db-wal \
           /var/www/gezet-marketing/server/data/gezet.db-shm
sudo systemctl start gezet-marketing
```

**Kopie warto zabierać poza serwer** (rsync/scp na inną maszynę) — kopia na tym
samym dysku co baza nie chroni przed awarią dysku ani utratą VPS-a.

### Konta i hasła

- Każda osoba zmienia własne hasło ikoną klucza w nagłówku panelu.
- Administrator resetuje hasła w sekcji **Zarządzanie kontami zespołu**
  (przycisk „Wygeneruj hasło jednorazowe" pokazuje hasło raz — przekaż je
  bezpiecznym kanałem).
- Gdy nikt nie może zalogować się jako administrator:

  ```bash
  cd /var/www/gezet-marketing/server
  sudo -u gezet npm run set-password -- karolina
  ```

Reset hasła unieważnia wszystkie aktywne sesje danego konta.

### Zmiana składu zespołu

Lista osób jest w `server/src/lib/team.js` (identyfikator, imię, rola).
Po dodaniu wpisu:

```bash
cd /var/www/gezet-marketing/server
sudo -u gezet npm run seed      # założy tylko brakujące konta
sudo systemctl restart gezet-marketing
```

Uprawnienia administratora ustawia stała `ADMIN_IDS` w `server/scripts/seed.js`.

---

## 5. Bezpieczeństwo

Formularz jest wystawiony publicznie, a panel zawiera dane handlowe całej firmy —
poniżej to, co aplikacja robi, żeby jedno nie stało się drogą do drugiego.

**Hasła i sesje**
- Hasła hashowane bcryptem (koszt 12) — nigdy nie opuszczają serwera i nie ma ich
  w repozytorium; `seed.js` losuje je kryptograficznie i wypisuje jeden raz.
- Konto po założeniu lub po resecie ma flagę „musi zmienić hasło" — do czasu
  ustawienia własnego hasła serwer odrzuca każdą inną operację.
- Każde konto ma licznik `token_version`. Zmiana lub reset hasła podnosi go,
  co natychmiast unieważnia wszystkie wcześniej wydane tokeny — także ten
  w przeglądarce osoby, która przejęła sesję.
- Logowanie: 10 nieudanych prób na 15 minut na adres IP (udane nie liczą się do
  limitu), a odpowiedź trwa tyle samo dla istniejącego i nieistniejącego loginu,
  żeby nie dało się zgadywać, które konta istnieją.

**Dostęp do danych**
- Pracownik **fizycznie nie dostaje z API** zadań innych osób — filtrowanie
  odbywa się w zapytaniu SQL, nie w przeglądarce. Nie da się tego obejść konsolą
  deweloperską ani podglądem ruchu sieciowego.
- Zmiana listy przypisań i usuwanie zgłoszeń: wyłącznie administrator.
  Pracownik może przekazać dalej wyłącznie własne zadanie.

**Dane z formularza**
- Każde pole ma twardy limit długości i typu; nieznane identyfikatory triggerów
  i materiałów są odrzucane.
- Link do ogłoszenia przechodzi tylko jako `http(s)` — adres `javascript:`
  wpisany w formularzu wykonałby się w sesji administratora oglądającego panel.
- Publiczny formularz: 30 zgłoszeń na godzinę na adres IP.

**Warstwa transportowa**
- Nagłówki bezpieczeństwa przez helmet (CSP, HSTS na produkcji, brak
  osadzania w ramkach).
- CORS domyślnie wyłączony — przy wdrożeniu za nginx-em frontend i API dzielą
  domenę, więc żądania cross-origin nie są w ogóle potrzebne.
- Backend nasłuchuje na `127.0.0.1`; port 4000 nie jest wystawiony do internetu.
- Czcionki hostowane lokalnie — przeglądarki użytkowników nie łączą się z żadną
  domeną zewnętrzną, więc nie wysyłają danych do Google (istotne pod RODO).

**Co warto dołożyć przy wrażliwszych danych**
- Kopie zapasowe poza serwerem i szyfrowanie ich w spoczynku.
- Uwierzytelnianie dwuskładnikowe (aplikacja go nie ma).
- `fail2ban` na nginx-a, jeśli aplikacja jest widoczna z całego internetu,
  a nie tylko z firmowego VPN-a.

---

## 6. Struktura API

| Metoda | Endpoint | Dostęp | Opis |
|---|---|---|---|
| GET | `/api/health` | publiczny | stan aplikacji (dla monitoringu) |
| GET | `/api/meta` | publiczny | zespół, kategorie, triggery, materiały |
| POST | `/api/requests` | publiczny | nowe zgłoszenie → generuje zadania |
| GET | `/api/requests` | zalogowany | admin: wszystko; pracownik: tylko swoje zadania |
| PATCH | `/api/requests/:id/seen` | admin | oznacz zgłoszenie jako zobaczone |
| DELETE | `/api/requests/:id` | admin | usuń zgłoszenie wraz z zadaniami |
| PATCH | `/api/tasks/:id` | zalogowany | status (właściciel/admin) lub przypisania (admin) |
| POST | `/api/tasks/:id/transfer` | zalogowany | przekazanie zadania + adnotacja |
| GET | `/api/notifications` | zalogowany | własne powiadomienia |
| POST | `/api/notifications/:id/read` | zalogowany | oznacz jedno jako przeczytane |
| POST | `/api/notifications/read-all` | zalogowany | oznacz wszystkie jako przeczytane |
| POST | `/api/auth/login` | publiczny | logowanie, zwraca token JWT |
| GET | `/api/auth/me` | zalogowany | dane zalogowanego konta |
| POST | `/api/auth/change-password` | zalogowany | zmiana własnego hasła |
| GET | `/api/users` | admin | lista kont zespołu |
| POST | `/api/users/:id/reset-password` | admin | reset hasła (opcjonalnie losowego) |

---

## 7. Co zmieniła wersja 2.0

Wersja 1.0 była poprawną aplikacją klient-serwer; 2.0 domyka to, co dzieliło ją
od wdrożenia produkcyjnego.

**Bezpieczeństwo**
- Hasła startowe znikły z kodu — `seed.js` losuje je i pokazuje raz;
  konto musi je zmienić przy pierwszym logowaniu.
- Zmiana i reset hasła unieważniają wszystkie wcześniejsze sesje (`token_version`).
- Walidacja i limity długości wszystkich pól publicznego formularza.
- Link do ogłoszenia ograniczony do `http(s)` — zamknięta droga do wykonania
  cudzego skryptu w sesji administratora.
- Nagłówki bezpieczeństwa (helmet), limity żądań na logowanie, formularz i całe
  API, poprawna obsługa `X-Forwarded-For` za proxy (bez niej limit per-IP
  obejmował wszystkich łącznie).
- Konfiguracja sprawdzana przy starcie — pusty lub zaślepkowy `JWT_SECRET`
  zatrzymuje aplikację z czytelnym komunikatem, zamiast wpuszczać ją na produkcję.

**Poprawność i wydajność**
- Hashowanie haseł asynchroniczne — logowanie nie blokuje już całego API
  na kilkaset milisekund.
- Przypisania zadań w indeksowanej tabeli: panel pracownika odpytuje bazę
  zamiast pobierać wszystkie zadania i filtrować je w Node.
- Transakcje wokół operacji wieloetapowych, kasowanie kaskadowe, `busy_timeout`.
- Poprawne zamykanie na SIGTERM (restart nie przerywa zapisu w połowie).
- Historia przekazań przycinana do 50 wpisów, stare przeczytane powiadomienia
  kasowane po 30 dniach.

**Interfejs**
- Wygaśnięcie sesji wylogowuje z komunikatem, zamiast po cichu zostawiać otwarty
  panel z nieaktualnymi danymi.
- Okna modalne obsługują Escape, przenoszenie i uwięzienie fokusu; formularze są
  prawdziwymi `<form>` (Enter, menedżery haseł); widoczny zarys fokusu.
- Znacznik „Offline", granica błędu zamiast białego ekranu, odpytywanie
  wstrzymywane na ukrytej karcie.
- Administrator może usunąć zgłoszenie (formularz jest publiczny — spam bywa).
- Kopiowanie szkiców działa też bez HTTPS.

**Wdrożenie**
- `deploy/install.sh` — instalacja całości jedną komendą, `deploy/update.sh` —
  bezpieczna aktualizacja z kopią zapasową.
- Docker Compose, usługa systemd z ograniczeniami dostępu do systemu,
  konfiguracja nginx, timer kopii zapasowych.
- Test dymny (45 asercji) do weryfikacji wdrożenia.
- Czcionki hostowane lokalnie zamiast pobierania z Google Fonts.
