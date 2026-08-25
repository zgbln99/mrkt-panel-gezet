import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import { Input } from '../components/Field';
import { Button, Banner, Card } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';

/**
 * Ten sam ekran obsługuje dobrowolną zmianę hasła i wymuszoną zmianę hasła
 * startowego. W trybie wymuszonym nie ma dokąd wyjść — serwer i tak odrzuca
 * każdą inną operację, dopóki hasło nie zostanie zmienione.
 */
export default function ChangePasswordScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { changePassword, meta, user, logout } = useAuth();
  const forced = !!(route && route.params && route.params.forced);
  const minLength = (meta && meta.passwordMinLength) || 10;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError('');

    if (!currentPassword || !newPassword) {
      setError('Wypełnij pola hasła.');
      return;
    }
    if (newPassword.length < minLength) {
      setError(`Nowe hasło musi mieć co najmniej ${minLength} znaków.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Powtórzone hasło nie zgadza się z nowym hasłem.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Nowe hasło musi różnić się od dotychczasowego.');
      return;
    }

    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      if (!forced && navigation.canGoBack()) navigation.goBack();
    } catch (err) {
      setError(err.message || 'Nie udało się zmienić hasła.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={[styles.lead, { color: colors.inkSoft }]}>
        {forced
          ? `Konto ${user ? user.username : ''} korzysta z hasła startowego. Zanim przejdziesz dalej, ustaw hasło znane tylko Tobie.`
          : 'Zmiana dotyczy wyłącznie Twojego konta. Pozostałe zalogowane urządzenia zostaną wylogowane.'}
      </Text>

      <Card>
        <Input
          label={forced ? 'Hasło startowe' : 'Aktualne hasło'}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoComplete="current-password"
        />
        <Input
          label={`Nowe hasło (min. ${minLength} znaków)`}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <Input
          label="Powtórz nowe hasło"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoComplete="new-password"
          onSubmitEditing={submit}
        />
        <Banner message={error} tone="crit" />
        <Button title="Zapisz nowe hasło" variant="primary" onPress={submit} busy={busy} />
        {forced ? (
          <Button title="Wyloguj" variant="ghost" onPress={() => logout()} style={{ marginTop: 8 }} />
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
});
