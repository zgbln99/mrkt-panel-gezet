# Zgłoszenia Marketing — aplikacja mobilna (Android)

Natywna aplikacja Android (React Native + Expo) do tego samego backendu, co
aplikacja webowa. Ma pełny zakres funkcji panelu oraz powiadomienia push,
których przeglądarka na telefonie nie potrafi dostarczyć przy zamkniętej karcie.

## Co potrafi

| Funkcja | Kto | Uwagi |
|---|---|---|
| Publiczny formularz zgłoszeń | każdy, bez logowania | wszystkie pola z wersji webowej wraz z polami warunkowymi |
| Lista zadań z filtrami | zespół | status, kategoria, osoba, wyszukiwarka |
| Szczegóły zadania | zespół | opis, kontekst zgłoszenia, gotowy szkic treści z kopiowaniem, historia przekazań |
| Zmiana statusu | osoba przypisana lub administrator | |
| Zmiana przypisań | administrator | |
| Przekazanie zadania | osoba przypisana | z adnotacją dla odbiorcy |
| Powiadomienia w aplikacji | zespół | licznik nieprzeczytanych na zakładce |
| **Powiadomienia push** | zespół | nowe zadanie i zadanie przekazane |
| Wszystkie zgłoszenia + usuwanie | administrator | |
| Konta zespołu i reset haseł | administrator | hasło jednorazowe do skopiowania |
| Zmiana własnego hasła | zespół | wymuszona przy haśle startowym |
| Adres serwera | każdy | konfigurowany w aplikacji, patrz niżej |

Motyw jasny i ciemny wybiera system telefonu.

## Adres serwera

Aplikacja webowa jest serwowana z tej samej domeny co API, więc nie musi
wiedzieć, gdzie ono jest. Zainstalowana aplikacja musi — dlatego przy pierwszym
uruchomieniu pyta o adres (ten sam, pod którym otwieracie panel w przeglądarce).

Kolejność źródeł adresu:

1. adres wpisany w **Ustawieniach** aplikacji (zapisany na urządzeniu),
2. zmienna `EXPO_PUBLIC_API_URL` z czasu budowania,
3. `extra.apiUrl` z `app.json`.

Chcąc zbudować aplikację z adresem wpisanym na sztywno (użytkownik nie zobaczy
wtedy ekranu konfiguracji), ustaw `EXPO_PUBLIC_API_URL` w `eas.json` albo
`extra.apiUrl` w `app.json`.

## Praca lokalna

```bash
cd mobile
npm install
npx expo start
```

Zeskanuj kod QR aplikacją **Expo Go** na telefonie. Backend musi być osiągalny
z telefonu — w sieci lokalnej podaj w aplikacji adres komputera, np.
`http://192.168.1.10:4000`, i uruchom backend z `HOST=0.0.0.0`.

> W Expo Go powiadomienia push nie działają (od SDK 53 wymagają własnego
> buildu — Expo Go nie ma dostępu do konfiguracji Firebase tej aplikacji).
> Cała reszta działa normalnie. Żeby przetestować powiadomienia, zbuduj plik
> APK profilem `preview` (niżej).

### Testy i lint

```bash
npm test     # 26 testów: klient API + renderowanie ekranów na atrapie backendu
npm run lint
```

Testy renderują prawdziwe drzewo komponentów na atrapie serwera, która pilnuje
tych samych reguł co backend (token, wymuszona zmiana hasła, zakres danych
pracownika) — sprawdzają więc zachowanie aplikacji, a nie własne założenia.

## Budowanie pliku APK

### Wariant A — EAS Build (bez lokalnego Android SDK)

```bash
npm install -g eas-cli
eas login                 # konto Expo (darmowe)
eas init                  # uzupełni extra.eas.projectId w app.json
eas build --platform android --profile preview
```

Po kilku minutach EAS zwróci link do pliku `.apk` — do pobrania na telefony
zespołu (wymaga zgody na instalację z nieznanego źródła). Profil `production`
buduje `.aab` pod Google Play.

### Wariant B — build lokalny

Wymaga Android SDK i JDK 17:

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# plik: android/app/build/outputs/apk/release/app-release.apk
```

## Powiadomienia push (Firebase)

Aplikacja jest podpięta do projektu Firebase **`gezet-mrkt-app`**, pakiet
**`com.gezetmrkt.app`**. Plik `google-services.json` leży w repozytorium —
bez niego biblioteka FCM nie wie, z jakim projektem się rejestrować.

> Ten plik nie jest sekretem: trafia do każdego pliku APK, a klucz w nim zawarty
> jest ograniczony do pakietu aplikacji. Sekretem jest **klucz konta usługi**
> (sekcja niżej) — tego nigdy nie wolno wrzucać do repozytorium.

### Jak to działa

Telefon po zalogowaniu zgłasza serwerowi **dwa tokeny** opisane tym samym
identyfikatorem urządzenia:

| Token | Do czego |
|---|---|
| natywny FCM | droga główna — serwer wysyła prosto do Google |
| Expo | droga zapasowa, gdy serwer nie ma klucza Firebase |

Serwer wybiera **jedną** z nich na urządzenie, więc telefon nigdy nie dostaje
dwóch kopii tego samego powiadomienia. Wylogowanie kasuje oba tokeny — inaczej
powiadomienia trafiałyby na telefon osoby, która się już wylogowała.

### Włączenie drogi przez Firebase (na serwerze)

1. Konsola Firebase → **Ustawienia projektu → Konta usługi → Wygeneruj nowy
   klucz prywatny**. Pobierzesz plik JSON.
2. Wgraj go na VPS poza katalogiem aplikacji i ogranicz uprawnienia:

   ```bash
   sudo mkdir -p /etc/gezet
   sudo install -o gezet -g gezet -m 600 ~/klucz-firebase.json /etc/gezet/fcm.json
   ```

3. W `server/.env` dopisz ścieżkę i zrestartuj usługę:

   ```bash
   echo 'FCM_SERVICE_ACCOUNT=/etc/gezet/fcm.json' | sudo tee -a /var/www/gezet-marketing/server/.env
   sudo systemctl restart gezet-marketing
   ```

4. Sprawdź, którą drogą idą powiadomienia:

   ```bash
   curl -s https://marketing.twoja-firma.pl/api/health
   # {"ok":true,...,"push":"Firebase Cloud Messaging (projekt gezet-mrkt-app)"}
   ```

   Jeśli widzisz `"push":"przekaźnik Expo"`, klucz nie został wczytany —
   przyczynę wypisze `journalctl -u gezet-marketing -n 30`.

Bez tego kroku aplikacja działa normalnie, tylko powiadomienia idą przez
darmowy przekaźnik Expo (ich treść przechodzi wtedy przez serwery firmy
trzeciej). Wyłączenie wysyłki w ogóle: `PUSH_ENABLED=false`.

### Jak wyglądają na telefonie

- baner na wierzchu ekranu razem z dźwiękiem i wibracją (kanał
  „Zadania i zgłoszenia" o wysokiej ważności),
- widoczne na ekranie blokady,
- wysoki priorytet — telefon budzi się także w trybie oszczędzania energii,
- dotknięcie powiadomienia otwiera **konkretne zadanie**, również gdy aplikacja
  była zamknięta,
- liczba nieprzeczytanych jako plakietka na ikonie (o ile launcher to obsługuje).

Tytuł mówi, czego rzecz dotyczy („Nowe zadanie", „Zadanie od: Bogdan",
„Nowe zgłoszenie"), a treść go nie powtarza — na ekranie blokady widać wtedy
konkret, a nie samą nazwę aplikacji.

### Jeśli powiadomienia nie przychodzą

1. **Ustawienia → Powiadomienia** aplikacji: czy kanał „Zadania i zgłoszenia"
   nie został wyciszony. Android zapamiętuje wybór użytkownika i późniejsza
   zmiana w kodzie go nie nadpisze.
2. **Oszczędzanie baterii** — nakładki Xiaomi, Samsunga, Huawei i OnePlusa
   potrafią wstrzymywać powiadomienia uśpionych aplikacji. Ustaw dla aplikacji
   „bez ograniczeń".
3. W aplikacji: **Więcej → Ustawienia → Zarejestruj to urządzenie ponownie** —
   pokaże, czy urządzenie ma token Firebase, czy tylko Expo.
4. Na emulatorze bez usług Google powiadomienia push nie działają w ogóle.

## Struktura

```
mobile/
├── App.js                    providery + granica błędu
├── app.json                  konfiguracja Expo (nazwa, ikony, wtyczki)
├── eas.json                  profile budowania
├── google-services.json      konfiguracja Firebase (projekt gezet-mrkt-app)
├── src/
│   ├── api.js                klient API (adres serwera, token, błędy)
│   ├── push.js               rejestracja urządzenia (token FCM + Expo)
│   ├── storage.js            token w SecureStore (Android Keystore)
│   ├── theme.js              paleta wspólna z aplikacją webową
│   ├── context/              sesja i dane (odpytywanie, stan offline)
│   ├── components/           elementy interfejsu
│   ├── screens/              ekrany
│   └── navigation/           nawigacja (zakładki + stos)
├── __tests__/                testy
└── test-utils/fakeServer.js  atrapa backendu do testów
```

## Decyzje, które warto znać

- **Token w SecureStore, nie w AsyncStorage.** AsyncStorage to zwykły plik
  w katalogu aplikacji — czytelny na urządzeniu z dostępem root i w kopii
  zapasowej. SecureStore korzysta z Android Keystore.
- **Odpytywanie wstrzymywane w tle.** Aplikacja w tle nie odpytuje serwera
  (bateria, transfer), a po powrocie odświeża dane natychmiast.
- **Dane sesji nie przeżywają przelogowania.** Provider danych dostaje klucz
  z identyfikatorem konta, więc po zmianie użytkownika montuje się od nowa —
  dane poprzedniej osoby nie mogą mignąć w panelu następnej.
- **Ekran szczegółów czyta zadanie po identyfikatorze** z bieżących danych,
  a nie z parametru nawigacji: przy odświeżeniu w tle widać zmiany innych osób,
  a zadanie usunięte lub przekazane zamyka ekran zamiast pokazywać nieaktualny stan.
- **Ikony importowane z konkretnej rodziny** (`@expo/vector-icons/Ionicons`),
  bo import z indeksu paczki dołączał do aplikacji ponad 3 MB niepotrzebnych
  plików czcionek.
- **Dwa tokeny push pod jednym identyfikatorem urządzenia.** Gdyby serwer nie
  umiał ich sparować, telefon zgłaszający oba dostawałby każde powiadomienie
  dwa razy.
- **Kanał powiadomień tworzony przy starcie aplikacji**, a nie dopiero przy
  rejestracji urządzenia — powiadomienie, które przyjdzie wcześniej, i tak musi
  mieć kanał z dźwiękiem, inaczej Android pokaże je po cichu.
