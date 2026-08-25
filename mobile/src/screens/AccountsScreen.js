import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input } from '../components/Field';
import { Button, Card, Banner, Tag, Loading, EmptyState } from '../components/ui';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme, radius } from '../theme';
import { formatDateTime } from '../utils';

/** Zarządzanie kontami zespołu — wyłącznie dla administratora. */
export default function AccountsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { meta } = useAuth();
  const minLength = (meta && meta.passwordMinLength) || 10;

  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getUsers();
      setUsers(res.users);
      setError('');
    } catch (err) {
      setError(err.message || 'Nie udało się wczytać listy kont.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.getUsers().catch((err) => ({ error: err }));
      if (cancelled) return;
      if (res.error) setError(res.error.message || 'Nie udało się wczytać listy kont.');
      else setUsers(res.users);
    })();
    // Ekran można zamknąć, zanim odpowiedź wróci — zapis stanu po odmontowaniu
    // nic by nie dał poza ostrzeżeniem w konsoli.
    return () => {
      cancelled = true;
    };
  }, []);

  if (error && !users) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
        <Banner message={error} tone="crit" />
        <Button title="Spróbuj ponownie" onPress={load} />
      </ScrollView>
    );
  }

  if (!users) return <Loading label="Wczytywanie kont…" />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }}
    >
      <Banner message={error} tone="crit" />
      {users.length === 0 ? <EmptyState title="Brak kont" /> : null}
      {users.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          minLength={minLength}
          open={openId === account.id}
          onToggle={() => setOpenId(openId === account.id ? null : account.id)}
          onChanged={load}
        />
      ))}
    </ScrollView>
  );
}

function AccountRow({ account, minLength, open, onToggle, onChanged }) {
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [generated, setGenerated] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPassword('');
    setConfirm('');
    setGenerated('');
    setError('');
    setNotice('');
    onToggle();
  };

  const reset = async (useGenerated) => {
    setError('');
    if (!useGenerated) {
      if (password.length < minLength) {
        setError(`Nowe hasło musi mieć co najmniej ${minLength} znaków.`);
        return;
      }
      if (password !== confirm) {
        setError('Hasła nie są identyczne.');
        return;
      }
    }
    setBusy(true);
    try {
      const res = await api.resetUserPassword(account.id, useGenerated ? null : password);
      if (res.generatedPassword) {
        // Serwer trzyma wyłącznie hash — to jedyny moment, w którym hasło
        // można odczytać i przekazać właścicielowi konta.
        setGenerated(res.generatedPassword);
        setPassword('');
        setConfirm('');
      } else {
        close();
      }
      onChanged();
    } catch (err) {
      setError(err.message || 'Nie udało się zresetować hasła.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: 10 }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.ink }]}>{account.name}</Text>
            {account.isAdmin ? <Tag label="Administrator" tone="accent" /> : null}
            {account.mustChangePassword ? <Tag label="Hasło startowe" tone="crit" /> : null}
          </View>
          <Text style={[styles.meta, { color: colors.inkFaint }]}>
            login: {account.username} · {account.role}
          </Text>
          <Text style={[styles.meta, { color: colors.inkFaint }]}>
            {account.lastLoginAt ? `ostatnie logowanie: ${formatDateTime(account.lastLoginAt)}` : 'jeszcze się nie logował(a)'}
          </Text>
        </View>
      </View>

      <Button title={open ? 'Anuluj' : 'Resetuj hasło'} onPress={close} style={{ marginTop: 12 }} />

      {open ? (
        <View style={{ marginTop: 12 }}>
          {generated ? (
            <View style={[styles.generated, { backgroundColor: colors.accentTint, borderColor: colors.accent }]}>
              <Text style={[styles.meta, { color: colors.inkSoft }]}>
                Nowe hasło dla konta {account.username} — przekaż je bezpiecznym kanałem. Nie da się go
                później odczytać.
              </Text>
              <Text selectable style={[styles.code, { color: colors.ink, backgroundColor: colors.surface }]}>
                {generated}
              </Text>
              <Banner message={notice} tone="ok" />
              <Button
                title="Kopiuj hasło"
                onPress={async () => {
                  await Clipboard.setStringAsync(generated);
                  setNotice('Skopiowano do schowka');
                }}
              />
              <Text style={[styles.meta, { color: colors.inkFaint, marginTop: 8 }]}>
                Wszystkie sesje tego konta zostały wylogowane. Przy najbliższym logowaniu aplikacja
                poprosi o ustawienie własnego hasła.
              </Text>
              <Button title="Gotowe" variant="primary" onPress={close} style={{ marginTop: 10 }} />
            </View>
          ) : (
            <>
              <Button title="Wygeneruj hasło jednorazowe" variant="primary" onPress={() => reset(true)} busy={busy} />
              <Text style={[styles.meta, { color: colors.inkFaint, marginVertical: 10 }]}>…albo ustaw hasło ręcznie:</Text>
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder={`Nowe hasło (min. ${minLength} znaków)`}
                secureTextEntry
                autoComplete="new-password"
              />
              <Input value={confirm} onChangeText={setConfirm} placeholder="Powtórz nowe hasło" secureTextEntry autoComplete="new-password" />
              <Banner message={error} tone="crit" />
              <Button title="Zapisz podane hasło" onPress={() => reset(false)} busy={busy} />
            </>
          )}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 15.5, fontWeight: '700' },
  meta: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  generated: { borderWidth: 1, borderRadius: radius.md, padding: 12, gap: 9 },
  code: { fontSize: 19, fontWeight: '700', letterSpacing: 1.5, padding: 12, borderRadius: radius.sm, textAlign: 'center' },
});
