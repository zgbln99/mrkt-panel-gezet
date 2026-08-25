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
4a. [Aplikacja mobilna (Android)](#4a-aplikacja-mobilna-android)
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
| Aplikacja mobilna | React Native 0.86 · Expo SDK 57 (Android) |
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
├── mobile/            aplikacja Android (React Native + Expo)
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

**Zanim zaczniesz — rekordy DNS.** Adres serwera odczytasz na nim samym:

```bash
ip -4 addr show scope global | awk '/inet /{sub(/\/.*/,"",$2); print $2}'   # IPv4
ip -6 addr show scope global | awk '/inet6 /{sub(/\/.*/,"",$2); print $2}'  # IPv6 (jeśli jest)
```

Załóż rekord **A** dla subdomeny wskazujący na ten adres IPv4 i odczekaj na
propagację (TTL warto na start ustawić nisko, np. 300 s):

```
A     panel.twojafirma.pl   →   203.0.113.10
```

**Rekord AAAA zakładaj tylko wtedy, gdy serwer ma globalne IPv6** — skrypt
wykrywa to sam i włącza wtedy nasłuch IPv6 w nginx. Rekord AAAA bez tego
nasłuchu kieruje część urządzeń (te wolące IPv6) na port, którego nikt nie
słucha: dla nich strona po prostu się nie otworzy, a z komputera testującego
po IPv4 wszystko wygląda dobrze.

Bez poprawnego DNS Let's Encrypt nie wystawi certyfikatu — skrypt sprawdza to
sam i pominie ten krok z czytelnym komunikatem (wypisując, jakie rekordy
założyć), zamiast zużywać limit prób.

```bash
# na serwerze — WSTAW WŁASNĄ DOMENĘ zamiast panel.twojafirma.pl
sudo apt update && sudo apt install -y git
sudo git clone <adres-repozytorium> /var/www/gezet-marketing
cd /var/www/gezet-marketing
sudo bash deploy/install.sh panel.twojafirma.pl
```

Jeśli domena stoi za Cloudflare, na czas wystawiania certyfikatu wyłącz proxy
(szara chmurka) — inaczej walidacja trafia do Cloudflare, a nie do serwera.

Skrypt instaluje Node.js, nginx, certbot i ufw, zakłada systemowe konto `gezet`,
buduje frontend, generuje `.env` z losowym `JWT_SECRET`, zakłada konta zespołu
i wypisuje hasła startowe, uruchamia usługę systemd wraz z codzienną kopią
zapasową, konfiguruje nginx-a, firewall oraz certyfikat HTTPS.

**Zapisz hasła startowe wypisane przez skrypt** — nie da się ich odczytać później
(w bazie leżą wyłącznie hashe). Gdyby przepadły: `npm run set-password -- <login>`.

Jest idempotentny — można go uruchomić ponownie; istniejącej bazy ani `.env`
nie nadpisuje.

### Hosting bez portów 80 i 443 (współdzielony adres IPv4)

Część tanich hostingów — m.in. **Mikr.us** — nie daje własnego adresu IPv4.
Adres jest współdzielony między klientów, a Ty dostajesz kilka własnych portów
TCP (np. `20145`, `30145`) oraz **pełny, własny adres IPv6**.

Portów 80 i 443 na IPv4 nie da się w takiej sytuacji użyć. Działa natomiast
układ, w którym:

- aplikacja stoi na **przydzielonym porcie** — dostępna po IPv4 i po IPv6,
- certyfikat Let's Encrypt wydaje się przez **walidację po IPv6**, gdzie port 80
  należy już do Ciebie,
- dodatkowo aplikacja słucha na standardowym `443` po IPv6.

Instalacja — port podaje się zmienną `HTTPS_PORT`:

```bash
sudo HTTPS_PORT=30145 bash deploy/install.sh mrkt.gezet.pl
```

Skrypt sam wykryje port z powitania serwera, jeśli go tam zapisano; zmienna ma
pierwszeństwo.

**Rekordy DNS — oba są potrzebne:**

```
A     mrkt.gezet.pl  →  <współdzielony adres IPv4 hostingu>
AAAA  mrkt.gezet.pl  →  <adres IPv6 Twojego serwera>
```

Rekord **AAAA nie jest tu opcjonalny**: to jedyna droga, którą Let's Encrypt
potwierdzi, że serwer należy do Ciebie. Na współdzielonym IPv4 port 80 obsługuje
dostawca hostingu, więc walidacja po IPv4 nigdy nie trafi do Twojej aplikacji.

**Adres dla zespołu:** `https://mrkt.gezet.pl:30145` — działa w każdej sieci.
Numer portu bywa blokowany przez restrykcyjne firewalle firmowe, więc warto to
sprawdzić z sieci, z której zespół faktycznie korzysta, zanim rozda się adres
wszystkim.

#### Dostęp tymczasowy, zanim stanie HTTPS

Żeby wejść do panelu i skonfigurować konta, zanim domena i certyfikat będą
gotowe:

```bash
sudo NO_TLS=1 HTTPS_PORT=30145 bash deploy/install.sh 37.27.117.117
```

Aplikacja odpowiada wtedy po zwykłym HTTP na przydzielonym porcie i przyjmuje
każdą nazwę hosta, więc wejdziesz zarówno po adresie IP, jak i po dowolnej
nazwie wskazującej na ten serwer.

Ten tryb ustawia w `.env` opcję `ALLOW_INSECURE_HTTP=true`, która wyłącza HSTS
i dyrektywę CSP `upgrade-insecure-requests`. Bez tego przeglądarka próbowałaby
pobrać pliki aplikacji po HTTPS, którego pod tym adresem nie ma — i pokazałaby
**pustą stronę**. Kolejne uruchomienie skryptu w trybie z certyfikatem samo
usuwa tę opcję z `.env`.

> **Hasła jadą wtedy otwartym tekstem.** To konfiguracja na chwilę, do wstępnego
> ustawienia kont — najlepiej z sieci firmowej. Po uruchomieniu HTTPS zmień
> wszystkie hasła ustawione w tym trybie.

#### Jak własne domeny podpina się do takiego hostingu

Dokumentacja Mikr.usa zna dokładnie jedną drogę na własną domenę pod
standardowym portem: **Cloudflare**, w dwóch wariantach.

- **Cloudflare jako proxy** — rekord AAAA z włączonym proxy (pomarańczowa
  chmurka). Cloudflare przyjmuje ruch po IPv4 i łączy się z serwerem po IPv6,
  a regułą *Origin Rules* można wskazać port inny niż 443.
- **Cloudflare Tunnel** (`cloudflared` na serwerze) — połączenie wychodzi
  z serwera, więc nie trzeba mieć otwartego żadnego portu przychodzącego.

Oba wymagają, żeby domena była w Cloudflare — czyli przeniesienia serwerów
nazw **całej** strefy. Natywnego sposobu (bez Cloudflare) na własną domenę pod
portem 443 ten rodzaj hostingu nie ma; darmowa subdomena `*.wykr.es` działa
tylko dla ich własnej nazwy.

#### Dlaczego nie Cloudflare dla samej subdomeny

Naturalny pomysł — „przekieruję na Cloudflare tylko `mrkt.gezet.pl`, a reszty
domeny nie ruszam" — na darmowym planie nie działa:

| Sposób | Co daje | Plan |
|---|---|---|
| Pełne przeniesienie domeny | serwery nazw całego `gezet.pl` u Cloudflare | każdy, także darmowy |
| Subdomain setup | subdomena jako osobna strefa (delegacja NS) | **tylko Enterprise** |
| CNAME setup (partial) | pojedyncze nazwy bez przenoszenia strefy | **Business lub Enterprise** |

Czyli albo cała domena idzie na serwery nazw Cloudflare, albo nic. Gdyby jednak
przeniesienie całego `gezet.pl` wchodziło w grę, Cloudflare rozwiązuje sprawę
w całości: przyjmuje ruch po IPv4 i przekazuje go do serwera po IPv6, więc
adres bez portu działa wtedy w każdej sieci.

#### Adres bez numeru portu — wariant wyłącznie IPv6

Numer portu w adresie da się pominąć, ale tylko po IPv6 — na współdzielonym
IPv4 port 443 należy do dostawcy hostingu i nic tego nie zmieni.

```bash
sudo IPV6_ONLY=1 bash deploy/install.sh mrkt.gezet.pl
```

W DNS zostaje wtedy **wyłącznie rekord AAAA**; rekord A trzeba usunąć. Osoby bez
IPv6 dostaną wtedy czytelne „nie znaleziono serwera" zamiast błędu certyfikatu
cudzej maszyny — skrypt ostrzeże, jeśli rekord A nadal istnieje.

Cena jest jednak realna: **kto nie ma IPv6, nie wejdzie w ogóle** — dotyczy to
także aplikacji mobilnej w sieci Wi-Fi bez IPv6. Zanim wybierzesz ten wariant,
sprawdź na sprzęcie zespołu:

```bash
curl -6 https://ifconfig.me      # adres = IPv6 jest, błąd = nie ma
```

Polskie sieci komórkowe zwykle mają IPv6; biurowe łącza i sieci firmowe bywają
wyłącznie na IPv4. Jeśli choć część zespołu jest bez IPv6, wariant z portem jest
jedynym, który obsłuży wszystkich — na tym hostingu.

#### Podsumowanie: czysty adres dla wszystkich

Na hostingu ze współdzielonym IPv4 nie da się mieć jednocześnie adresu bez portu
i dostępności dla sieci bez IPv6. Trzeba wybrać:

| Wariant | Adres | Kto wejdzie | Koszt |
|---|---|---|---|
| Port na przydzielonym numerze | `https://domena:30145` | wszyscy | bez zmian |
| Wyłącznie IPv6 | `https://domena` | tylko z IPv6 | bez zmian |
| Cała domena na Cloudflare | `https://domena` | wszyscy | darmowy plan, ale przenosi całą strefę |
| VPS z własnym IPv4 | `https://domena` | wszyscy | ok. 4 €/mies. |

Ostatni wariant nie wymaga żadnych zmian w aplikacji — instalator w trybie
domenowym obsługuje go od początku.

### Serwer za NAT-em (adres prywatny)

Jeśli `ip -4 addr` pokazuje adres z puli prywatnej (`192.168.x.x`, `10.x.x.x`,
`172.16–31.x.x`), serwer nie jest widoczny z internetu bezpośrednio. W DNS
trzeba wtedy wpisać **publiczny adres sieci**, a na routerze przekierować porty.

Wszystko potrzebne wypisze:

```bash
bash deploy/dns-info.sh mrkt.gezet.pl
```

Skrypt niczego nie zmienia — pokazuje adresy serwera, adres publiczny sieci,
gotowe wartości do formularza DNS i sprawdza, na co domena wskazuje w tej chwili.

Potrzebne będą dwie rzeczy:

1. **Przekierowanie portów na routerze** — `80/TCP` i `443/TCP` na adres
   prywatny serwera. Port 80 musi zostać otwarty na stałe: tędy idzie
   walidacja przy każdym odnawianiu certyfikatu, nie tylko przy pierwszym.
2. **Rekord A** wskazujący na publiczny adres sieci.

Dwie rzeczy potrafią to uniemożliwić — warto sprawdzić je zawczasu:

- **CGNAT.** Gdy adres publiczny zaczyna się od `100.64.`–`100.127.`, operator
  współdzieli go między wielu klientów i nie da się przekierować na niego
  połączeń przychodzących. Rozwiązania: publiczny adres IP od operatora
  (zwykle płatna opcja) albo tunel, np. Cloudflare Tunnel.
- **Zmienny adres publiczny.** Na łączach bez stałego IP rekord A przestanie
  pasować po każdej zmianie. Wtedy potrzebny jest DDNS.

**IPv6 to osobna sprawa niż NAT na IPv4.** Serwer schowany za NAT-em może mieć
jednocześnie w pełni publiczny, routowany adres IPv6 — wtedy działa po IPv6 bez
żadnego przekierowania portów. Rekord **AAAA** zakładaj jednak dopiero po
uruchomieniu wszystkiego na IPv4: Let's Encrypt przy istniejącym rekordzie AAAA
próbuje walidacji **najpierw po IPv6** i jeśli ruch przychodzący po IPv6 nie
dochodzi, certyfikat nie powstanie — mimo poprawnie działającego IPv4.

**Jeden rekord A, nie kilka.** Jeżeli domena wskazywała wcześniej na hosting
u rejestratora, podmień istniejący rekord zamiast dodawać kolejny. Przy dwóch
adresach ruch rozkłada się między nie: część osób trafi w stary serwer,
a walidacja certyfikatu będzie się udawać losowo.

### Kilka aplikacji na jednym serwerze

nginx obsługuje wiele aplikacji naraz — rozdziela je po nazwie domeny. Ta
aplikacja nie przeszkadza innym, trzeba jednak pamiętać o dwóch rzeczach:

- **Nasz plik konfiguracyjny zawiera blok `default_server`**, który odrzuca
  żądania z niepasującą nazwą hosta (patrz sekcja Bezpieczeństwo). W nginx
  `default_server` może istnieć tylko raz na port, więc **druga aplikacja nie
  może go deklarować** — ma zwyczajnie ustawić własne `server_name`.
- **Druga aplikacja musi słuchać na innym porcie lokalnym niż 4000.**

Konfiguracja drugiej aplikacji to osobny plik w `/etc/nginx/sites-available/`
z własnym `server_name` i własnym `proxy_pass`, a certyfikat wydaje się dla niej
osobno (`sudo certbot --nginx -d druga.domena.pl`). Uruchomienie
`deploy/install.sh` nie rusza cudzych plików — nadpisuje wyłącznie własny
`gezet-marketing`.

### Wdrożenie bez domeny — sam adres IPv4

Gdy domeny jeszcze nie ma, podaj skryptowi adres IP serwera zamiast nazwy:

```bash
sudo bash deploy/install.sh 203.0.113.10        # ← adres tego serwera
```

Let's Encrypt wydaje certyfikaty **także dla samych adresów IP** (ogólnie
dostępne od 15 stycznia 2026), więc panel działa po zwykłym, zaufanym HTTPS —
bez ostrzeżeń w przeglądarce i bez sztuczek w aplikacji mobilnej. Skrypt
załatwia to sam; warto jednak wiedzieć, na czym rzecz polega:

| | Certyfikat dla domeny | Certyfikat dla adresu IP |
|---|---|---|
| Ważność | 90 dni | **160 godzin (~6,5 dnia)** |
| Wymagany certbot | dowolny | **5.4 lub nowszy** |
| Profil ACME | domyślny | `shortlived` |
| Instalacja w nginx | wtyczka `--nginx` | ręcznie (wtyczka nie obsługuje IP) |

Praktyczne konsekwencje:

- **Certbot z Ubuntu 24.04 (2.9) jest za stary.** Skrypt instaluje nowszego
  w osobnym środowisku Pythona (`/opt/certbot`), nie ruszając systemowego.
- **Odnawianie musi działać.** Przy 90-dniowym certyfikacie zepsuty timer bywa
  niezauważony tygodniami; tutaj położyłby aplikację w niecały tydzień. Skrypt
  zakłada własny timer chodzący cztery razy na dobę:

  ```bash
  systemctl list-timers gezet-certbot-renew.timer
  sudo certbot certificates          # data ważności
  ```

- **Port 80 musi być osiągalny z internetu** — tędy idzie walidacja przy
  każdym odnowieniu, nie tylko przy pierwszym wydaniu.
- Gdyby certyfikat się nie udał, aplikacja zostaje na HTTP i skrypt mówi o tym
  wprost. Nie logujcie się wtedy z sieci publicznych — hasło idzie otwartym
  tekstem.

W aplikacji mobilnej wpisz jako adres serwera po prostu `203.0.113.10` —
uzupełni go do `https://203.0.113.10/api`.

**Przejście na domenę później** to jedna komenda; certyfikat dla IP i wpis
nginx zostaną zastąpione:

```bash
sudo bash deploy/install.sh panel.twojafirma.pl
```

Baza, konta i `.env` pozostają nietknięte. Pamiętajcie tylko zmienić adres
serwera w aplikacji mobilnej (Więcej → Ustawienia).

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
sudo sed -i 's/TWOJA-DOMENA.PL/panel.twojafirma.pl/g' /etc/nginx/sites-available/gezet-marketing
sudo ln -sf /etc/nginx/sites-available/gezet-marketing /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d panel.twojafirma.pl

sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

Baza żyje w wolumenie `gezet-data`, więc przetrwa przebudowę obrazu.

### Droga C — ręcznie, krok po kroku

Jeśli wolisz kontrolować każdy etap, warianty konfiguracji leżą gotowe
w katalogu `deploy/`:

| Plik | Do czego |
|---|---|
| `deploy/nginx.conf` | reverse proxy dla domeny — cache statyki, limit żądań |
| `deploy/nginx-ip.conf` | wariant bez domeny: HTTPS pod samym adresem IPv4 |
| `deploy/nginx-mikrus.conf` | hosting bez portów 80/443: HTTPS na przydzielonym porcie |
| `deploy/nginx-ipv6.conf` | wariant wyłącznie IPv6: adres bez numeru portu |
| `deploy/gezet-marketing.service` | usługa systemd (z ograniczeniami dostępu do systemu) |
| `deploy/gezet-backup.service` + `.timer` | codzienna kopia zapasowa o 2:30 |
| `deploy/gezet-certbot-renew.service` + `.timer` | odnawianie krótkiego certyfikatu dla adresu IP |
| `deploy/ecosystem.config.js` | konfiguracja PM2, jeśli wolisz PM2 od systemd |
| `deploy/install.sh` | pełna instalacja — można czytać jak instrukcję |
| `deploy/dns-info.sh` | co wpisać w DNS: adresy serwera, NAT, stan propagacji |
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

> **Instalacje sprzed tej zmiany uprawnień** mają cały katalog przypisany do
> konta usługi, przez co `git pull` jako root kończy się komunikatem
> *„detected dubious ownership"*. Jednorazowo:
>
> ```bash
> sudo git config --global --add safe.directory /var/www/gezet-marketing
> ```
>
> Najbliższe uruchomienie `install.sh` albo `update.sh` poprawi układ własności
> i komunikat zniknie na dobre.

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

## 4a. Aplikacja mobilna (Android)

W katalogu `mobile/` leży natywna aplikacja Android (React Native + Expo)
korzystająca z tego samego backendu. Ma pełny zakres funkcji panelu oraz
powiadomienia push — czego przeglądarka na telefonie nie zapewni przy
zamkniętej karcie.

```bash
cd mobile
npm install
npx expo start          # podgląd w aplikacji Expo Go
npm test                # 24 testy
```

Zbudowanie pliku APK do rozdania zespołowi:

```bash
npm install -g eas-cli && eas login && eas init
eas build --platform android --profile preview
```

Szczegóły (adres serwera, konfiguracja powiadomień, build lokalny) —
[`mobile/README.md`](mobile/README.md).

### Powiadomienia push przez Firebase

Aplikacja jest podpięta do projektu Firebase `gezet-mrkt-app` (pakiet
`com.gezetmrkt.app`). Powiadomienia przychodzą z **dźwiękiem i banerem na
ekranie**, są widoczne na ekranie blokady, budzą telefon w trybie oszczędzania
energii, a dotknięcie otwiera konkretne zadanie.

Żeby serwer wysyłał je bezpośrednio do Google (a nie przez darmowy przekaźnik
Expo, przez który przechodziłaby ich treść), wgraj klucz konta usługi Firebase:

```bash
sudo mkdir -p /etc/gezet
sudo install -o gezet -g gezet -m 600 ~/klucz-firebase.json /etc/gezet/fcm.json
echo 'FCM_SERVICE_ACCOUNT=/etc/gezet/fcm.json' | sudo tee -a /var/www/gezet-marketing/server/.env
sudo systemctl restart gezet-marketing

curl -s https://marketing.twoja-firma.pl/api/health   # pole "push" pokaże wybraną drogę
```

Klucz pobierzesz z konsoli Firebase: **Ustawienia projektu → Konta usługi →
Wygeneruj nowy klucz prywatny**. Bez niego powiadomienia nadal działają — idą
tylko przekaźnikiem Expo. Wyłączenie wysyłki: `PUSH_ENABLED=false`.

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
- Kod aplikacji należy do roota — konto usługi `gezet` tylko go czyta. Zapis ma
  wyłącznie tam, gdzie aplikacja naprawdę pisze: `server/data/` i `backups/`.
  Przejęty proces aplikacji nie nadpisze więc własnego kodu ani nie podłoży
  hooka w `.git/hooks`, który wykonałby się z prawami roota przy najbliższym
  `git pull` podczas aktualizacji.
- `server/.env` (z sekretem JWT i kluczem Firebase) jest czytelny dla konta
  usługi przez grupę, ale niezapisywalny: `root:gezet`, tryb `640`.
- nginx odrzuca żądania z nazwą hosta inną niż skonfigurowana domena (wejścia po
  samym adresie IP, skanery, cudze domeny wskazujące na serwer). Bez tego panel
  byłby dostępny po adresie IP przez zwykłe HTTP — czyli z hasłem lecącym
  otwartym tekstem mimo poprawnego certyfikatu dla domeny.
- Czcionki hostowane lokalnie — przeglądarki użytkowników nie łączą się z żadną
  domeną zewnętrzną, więc nie wysyłają danych do Google (istotne pod RODO).

**Powiadomienia push**
- Klucz konta usługi Firebase trzyma się poza katalogiem aplikacji, z prawami
  `600` dla konta usługi — w przeciwieństwie do `google-services.json`, który
  trafia do każdego pliku APK i sekretem nie jest.
- Z kluczem Firebase treść powiadomień (nazwiska, tytuły zadań) idzie wprost do
  Google. Bez niego przechodzi przez przekaźnik Expo — warto to wiedzieć, decydując
  o konfiguracji.
- Wylogowanie na telefonie kasuje tokeny urządzenia, zanim token sesji przestanie
  działać; inaczej powiadomienia trafiałyby do poprzedniego użytkownika telefonu.

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
| POST | `/api/push/register` | zalogowany | rejestracja tokenu urządzenia (FCM albo Expo) |
| POST | `/api/push/unregister` | zalogowany | wyrejestrowanie urządzenia (wylogowanie na telefonie) |

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
- Kafelki zadań zwinięte do tytułu, kontekstu zgłoszenia i znaczników; pełna
  treść (opis, kontekst, gotowy szkic, historia przekazań, akcje) otwiera się
  w oknie szczegółów. Wcześniej każdy kafelek rozwijał wszystko w kolumnie
  i tablica ciągnęła się na kilka tysięcy pikseli.
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
