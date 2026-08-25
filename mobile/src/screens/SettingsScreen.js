import React, { useState, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import Screen from '../components/Screen';
import { Input } from '../components/Field';
import { Button, Card, Banner, SectionTitle } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';
import { normalizeUrl } from '../api';
import { registerForPush } from '../push';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { apiUrl, changeApiUrl, user, metaError } = useAuth();
  const [value, setValue] = useState(apiUrl ? apiUrl.replace(/\/api$/, '') : '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('ok');
  const [pushStatus, setPushStatus] = useState('sprawdzanie…');

  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then(({ status }) =>
        setPushStatus(
          status === 'granted'
            ? 'włączone'
            : status === 'denied'
              ? 'zablokowane w ustawieniach systemu'
              : 'jeszcze niepotwierdzone'
        )
      )
      .catch(() => setPushStatus('niedostępne na tym urządzeniu'));
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      // Zmiana adresu serwera to zmiana instancji aplikacji — dotychczasowa
      // sesja przestaje mieć sens, więc changeApiUrl wylogowuje.
      const { ok } = await changeApiUrl(value);
      setMessageTone(ok ? 'ok' : 'crit');
      setMessage(
        ok
          ? 'Zapisano adres serwera. Zaloguj się ponownie.'
          : 'Pod tym adresem nie odpowiada aplikacja Zgłoszenia Marketing.'
      );
    } finally {
      setBusy(false);
    }
  };

  const retryPush = async () => {
    setBusy(true);
    const result = await registerForPush();
    setBusy(false);
    setMessageTone(result.ok ? 'ok' : 'warn');
    setMessage(
      result.ok
        ? 'Urządzenie zarejestrowane do powiadomień.'
        : result.reason === 'denied'
          ? 'Powiadomienia są zablokowane — włącz je w ustawieniach systemu Android dla tej aplikacji.'
          : result.reason === 'emulator'
            ? 'Powiadomienia push działają wyłącznie na fizycznym urządzeniu.'
            : 'Nie udało się zarejestrować urządzenia do powiadomień.'
    );
    const { status } = await Notifications.getPermissionsAsync();
    setPushStatus(status === 'granted' ? 'włączone' : 'zablokowane w ustawieniach systemu');
  };

  return (
    <Screen scroll>
      <SectionTitle>Serwer</SectionTitle>
      <Card>
        <Input
          label="Adres aplikacji"
          value={value}
          onChangeText={setValue}
          placeholder="marketing.twoja-firma.pl"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint={value ? `Połączenie z: ${normalizeUrl(value)}` : 'Adres, pod którym otwierasz panel w przeglądarce.'}
        />
        <Banner message={message} tone={messageTone} />
        <Banner message={metaError} tone="crit" />
        <Button title="Zapisz adres" variant="primary" onPress={save} busy={busy} />
      </Card>

      <SectionTitle>Powiadomienia</SectionTitle>
      <Card>
        <Text style={[styles.row, { color: colors.inkSoft }]}>
          Stan uprawnień: <Text style={{ color: colors.ink, fontWeight: '600' }}>{pushStatus}</Text>
        </Text>
        <Text style={[styles.hint, { color: colors.inkFaint }]}>
          Powiadomienia informują o nowym zadaniu i o zadaniu przekazanym przez kogoś z zespołu.
          Lista powiadomień w aplikacji działa niezależnie od uprawnień systemowych.
        </Text>
        <Button title="Zarejestruj to urządzenie ponownie" onPress={retryPush} busy={busy} style={{ marginTop: 12 }} />
      </Card>

      <SectionTitle>O aplikacji</SectionTitle>
      <Card>
        <Text style={[styles.row, { color: colors.inkSoft }]}>
          Wersja: <Text style={{ color: colors.ink }}>{Constants.expoConfig ? Constants.expoConfig.version : '—'}</Text>
        </Text>
        {user ? (
          <Text style={[styles.row, { color: colors.inkSoft }]}>
            Zalogowano jako: <Text style={{ color: colors.ink }}>{user.name} ({user.username})</Text>
          </Text>
        ) : null}
        <Text style={[styles.hint, { color: colors.inkFaint }]}>
          Aplikacja wewnętrzna Grupa Gezet. Dane pozostają na Waszym serwerze — aplikacja nie łączy się
          z żadną usługą zewnętrzną poza serwisem powiadomień push.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { fontSize: 14, marginBottom: 6, lineHeight: 20 },
  hint: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
});
