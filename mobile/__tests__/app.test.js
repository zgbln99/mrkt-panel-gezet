import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import App from '../App';
import { createFakeServer } from '../test-utils/fakeServer';

jest.setTimeout(30000);

async function bootWithServer(server, { savedUrl = null, savedToken = null } = {}) {
  global.fetch = jest.fn(server.fetchImpl);
  SecureStore.__store.clear();
  if (savedUrl) SecureStore.__store.set('gezet_api_url', savedUrl);
  if (savedToken) SecureStore.__store.set('gezet_token', savedToken);
  // Start aplikacji jest asynchroniczny (odczyt magazynu, pobranie
  // metadanych) — na wynik czekają zapytania findBy* w samych testach.
  return render(<App />);
}

describe('pierwsze uruchomienie', () => {
  it('pyta o adres serwera, gdy aplikacja nie ma jeszcze konfiguracji', async () => {
    const server = createFakeServer();
    await bootWithServer(server);
    expect(await screen.findByText('Zgłoszenia Marketing')).toBeTruthy();
    expect(screen.getByText(/Podaj adres, pod którym działa aplikacja/)).toBeTruthy();
  });

  it('po podaniu adresu pokazuje publiczny formularz zgłoszeń', async () => {
    const server = createFakeServer();
    await bootWithServer(server);

    fireEvent.changeText(
      await screen.findByPlaceholderText('marketing.twoja-firma.pl'),
      'marketing.firma.pl'
    );
    fireEvent.press(screen.getByText('Połącz'));

    expect(await screen.findByText('Imię i nazwisko *')).toBeTruthy();
    expect(server.state.calls).toContain('GET /meta');
  });
});

describe('logowanie i wymuszona zmiana hasła startowego', () => {
  it('konto z hasłem startowym trafia na ekran zmiany hasła, nie do panelu', async () => {
    const server = createFakeServer();
    await bootWithServer(server, { savedUrl: 'https://firma.test/api' });

    fireEvent.press(await screen.findByText('Zaloguj'));
    fireEvent.changeText(await screen.findByLabelText('Login'), 'karolina');
    fireEvent.changeText(screen.getByLabelText('Hasło'), 'Startowe-Haslo-123');
    fireEvent.press(screen.getByText('Zaloguj'));

    expect(await screen.findByText(/korzysta z hasła startowego/)).toBeTruthy();
    expect(screen.queryByText('Zadania')).toBeNull();
  });

  it('po zmianie hasła wpuszcza do panelu z zakładkami', async () => {
    const server = createFakeServer();
    await bootWithServer(server, { savedUrl: 'https://firma.test/api' });

    fireEvent.press(await screen.findByText('Zaloguj'));
    fireEvent.changeText(await screen.findByLabelText('Login'), 'karolina');
    fireEvent.changeText(screen.getByLabelText('Hasło'), 'Startowe-Haslo-123');
    fireEvent.press(screen.getByText('Zaloguj'));

    await screen.findByText(/korzysta z hasła startowego/);
    fireEvent.changeText(screen.getByLabelText('Hasło startowe'), 'Startowe-Haslo-123');
    fireEvent.changeText(screen.getByLabelText('Nowe hasło (min. 10 znaków)'), 'Nowe-Haslo-Karoliny');
    fireEvent.changeText(screen.getByLabelText('Powtórz nowe hasło'), 'Nowe-Haslo-Karoliny');
    fireEvent.press(screen.getByText('Zapisz nowe hasło'));

    expect(await screen.findByText('Zadania')).toBeTruthy();
    expect(await screen.findByText('Powiadomienia')).toBeTruthy();
  });

  it('błędne hasło pokazuje komunikat z serwera i nie wpuszcza dalej', async () => {
    const server = createFakeServer();
    await bootWithServer(server, { savedUrl: 'https://firma.test/api' });

    fireEvent.press(await screen.findByText('Zaloguj'));
    fireEvent.changeText(await screen.findByLabelText('Login'), 'karolina');
    fireEvent.changeText(screen.getByLabelText('Hasło'), 'zle-haslo');
    fireEvent.press(screen.getByText('Zaloguj'));

    expect(await screen.findByText('Nieprawidłowy login lub hasło.')).toBeTruthy();
  });
});

describe('panel zalogowanego użytkownika', () => {
  async function loggedIn(overrides) {
    const server = createFakeServer({ mustChangePassword: false, ...overrides });
    await bootWithServer(server, { savedUrl: 'https://firma.test/api', savedToken: 'token-1' });
    await screen.findByText('Zadania');
    return server;
  }

  it('administrator widzi zadania całego zespołu wraz z filtrami', async () => {
    await loggedIn();
    expect(await screen.findByText('Post social media — nowość Hyundai Tucson')).toBeTruthy();
    expect(screen.getByText('Reels — nowość: Hyundai Tucson')).toBeTruthy();
    expect(screen.getByText('Cały zespół')).toBeTruthy();
  });

  it('pracownik dostaje tylko własne zadania i nie widzi filtrów zespołu', async () => {
    await loggedIn({ isAdmin: false });
    expect(await screen.findByText('Post social media — nowość Hyundai Tucson')).toBeTruthy();
    expect(screen.queryByText('Reels — nowość: Hyundai Tucson')).toBeNull();
    expect(screen.queryByText('Cały zespół')).toBeNull();
  });

  it('filtr statusu zawęża listę zadań', async () => {
    await loggedIn();
    await screen.findByText('Post social media — nowość Hyundai Tucson');

    fireEvent.press(screen.getByText('Zrobione'));
    await waitFor(() => expect(screen.queryByText('Post social media — nowość Hyundai Tucson')).toBeNull());
    expect(screen.getByText('Nic nie pasuje do filtrów')).toBeTruthy();
  });

  it('wyszukiwarka filtruje po treści zgłoszenia', async () => {
    await loggedIn();
    await screen.findByText('Reels — nowość: Hyundai Tucson');

    fireEvent.changeText(screen.getByLabelText('Szukaj w zadaniach'), 'reels');
    await waitFor(() => expect(screen.queryByText('Post social media — nowość Hyundai Tucson')).toBeNull());
    expect(screen.getByText('Reels — nowość: Hyundai Tucson')).toBeTruthy();
  });

  it('otwiera szczegóły zadania z pełną treścią i kontekstem', async () => {
    await loggedIn();
    fireEvent.press(await screen.findByText('Post social media — nowość Hyundai Tucson'));

    expect(await screen.findByText('Anna Testowa · Sprzedaż / Handlowy')).toBeTruthy();
    expect(screen.getByText('Hyundai Tucson właśnie wjechał do salonu.')).toBeTruthy();
    expect(screen.getByText('Kontekst wewnętrzny — nie publikować.')).toBeTruthy();
    expect(screen.getByText('Gotowa propozycja treści')).toBeTruthy();
  });

  it('zmiana statusu z ekranu szczegółów trafia na serwer', async () => {
    const server = await loggedIn();
    fireEvent.press(await screen.findByText('Post social media — nowość Hyundai Tucson'));
    await screen.findByText('Status');

    fireEvent.press(screen.getByText('Zrobione'));

    await waitFor(() => expect(server.state.tasks[0].status).toBe('done'));
    expect(server.state.calls).toContain('PATCH /tasks/task-1');
  });

  it('licznik nieprzeczytanych powiadomień jest widoczny na zakładce', async () => {
    await loggedIn();
    fireEvent.press(await screen.findByText('Powiadomienia'));
    expect(await screen.findByText('Nowe zgłoszenie od Anna Testowa')).toBeTruthy();
  });

  it('rejestruje urządzenie do powiadomień push po zalogowaniu', async () => {
    const server = await loggedIn();
    await waitFor(() => expect(server.state.calls).toContain('POST /push/register'));
  });

  it('zgłasza token FCM i token Expo pod wspólnym identyfikatorem urządzenia', async () => {
    const server = await loggedIn();
    // Wspólny deviceId jest tym, po czym serwer poznaje, że to jeden telefon,
    // i wysyła powiadomienie tylko jedną drogą zamiast dwóch.
    await waitFor(() => expect(server.state.pushTokens.length).toBe(2));

    const kinds = server.state.pushTokens.map((t) => t.kind).sort();
    expect(kinds).toEqual(['expo', 'fcm']);

    const deviceIds = new Set(server.state.pushTokens.map((t) => t.deviceId));
    expect(deviceIds.size).toBe(1);
    expect([...deviceIds][0]).toBeTruthy();
  });

  it('wylogowanie wyrejestrowuje urządzenie, zanim token przestanie działać', async () => {
    const server = await loggedIn();
    await waitFor(() => expect(server.state.pushTokens.length).toBe(2));

    // Alert.alert nie renderuje w testach przycisków — podglądamy wywołanie
    // i uruchamiamy potwierdzenie tak, jak zrobiłby to użytkownik.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    fireEvent.press(screen.getByText('Więcej'));
    fireEvent.press(await screen.findByText('Wyloguj'));

    const confirm = alertSpy.mock.calls.at(-1)[2].find((button) => button.text === 'Wyloguj');
    await confirm.onPress();
    alertSpy.mockRestore();

    await waitFor(() => expect(server.state.calls).toContain('POST /push/unregister'));
    expect(server.state.pushTokens).toHaveLength(0);
  });
});
