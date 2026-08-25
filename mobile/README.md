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

> W Expo Go powiadomienia push nie działają w pełni (od SDK 53 wymagają
> własnego buildu). Cała reszta aplikacji działa normalnie.

### Testy i lint

```bash
npm test     # 24 testy: klient API + renderowanie ekranów na atrapie backendu
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

## Powiadomienia push — co jest potrzebne

Backend wysyła powiadomienia przez usługę Expo (`exp.host`) — endpointy
`POST /api/push/register` i `/api/push/unregister` są już po stronie serwera,
a aplikacja rejestruje urządzenie po zalogowaniu i wyrejestrowuje przy
wylogowaniu (inaczej powiadomienia trafiałyby na telefon poprzedniej osoby).

Żeby push działał w zbudowanej aplikacji, trzeba jednorazowo:

1. założyć projekt Firebase i pobrać `google-services.json`,
2. wgrać dane FCM do EAS: `eas credentials` → Android → *FCM V1 service account key*,
3. zbudować aplikację przez EAS.

Bez tego aplikacja działa normalnie — powiadomienia widać w zakładce
**Powiadomienia**, po prostu telefon nie zadzwoni przy zamkniętej aplikacji.

Wyłączenie wysyłki po stronie serwera: `PUSH_ENABLED=false` w `server/.env`.

## Struktura

```
mobile/
├── App.js                    providery + granica błędu
├── app.json                  konfiguracja Expo (nazwa, ikony, wtyczki)
├── eas.json                  profile budowania
├── src/
│   ├── api.js                klient API (adres serwera, token, błędy)
│   ├── push.js               rejestracja urządzenia do powiadomień
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
