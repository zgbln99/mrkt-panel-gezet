import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import { Input } from '../components/Field';
import { Button, Banner, Card } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';
import { normalizeUrl } from '../api';

/**
 * Pierwsze uruchomienie: telefon musi wiedzieć, gdzie stoi serwer.
 * Aplikacja webowa tego nie potrzebuje (jest serwowana z tej samej domeny co
 * API), ale zainstalowana aplikacja nie ma skąd tego wiedzieć.
 */
export default function SetupScreen() {
  const { colors } = useTheme();
  const { changeApiUrl, metaError, apiUrl } = useAuth();
  const [value, setValue] = useState(apiUrl ? apiUrl.replace(/\/api$/, '') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    if (!value.trim()) {
      setError('Podaj adres serwera.');
      return;
    }
    setBusy(true);
    try {
      const { ok } = await changeApiUrl(value);
      if (!ok) setError('Pod tym adresem nie odpowiada aplikacja Zgłoszenia Marketing. Sprawdź adres.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll contentStyle={styles.center}>
      <Text style={[styles.title, { color: colors.ink }]}>Zgłoszenia Marketing</Text>
      <Text style={[styles.subtitle, { color: colors.inkSoft }]}>
        Podaj adres, pod którym działa aplikacja w Waszej firmie. Znajdziesz go w pasku przeglądarki,
        gdy otwierasz panel na komputerze.
      </Text>

      <Card style={{ marginTop: 20 }}>
        <Input
          label="Adres serwera"
          value={value}
          onChangeText={setValue}
          placeholder="marketing.twoja-firma.pl"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint={value ? `Aplikacja połączy się z: ${normalizeUrl(value)}` : 'Można wpisać sam adres, bez https://'}
        />
        <Banner message={error || metaError} tone="crit" />
        <Button title="Połącz" variant="primary" onPress={save} busy={busy} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14.5, textAlign: 'center', marginTop: 10, lineHeight: 21 },
});
