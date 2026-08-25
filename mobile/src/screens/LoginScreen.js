import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import { Input } from '../components/Field';
import { Button, Banner, Card } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const { login, sessionMessage, clearSessionMessage } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError('');
    clearSessionMessage();
    setBusy(true);
    try {
      await login(username.trim().toLowerCase(), password);
      navigation.goBack();
    } catch (err) {
      setError(err.message || 'Nieprawidłowy login lub hasło.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={[styles.lead, { color: colors.inkSoft }]}>
        Zaloguj się loginem i hasłem przypisanym do Twojego konta w zespole marketingu.
      </Text>

      <Card>
        <Banner message={sessionMessage} tone="warn" />
        <Input
          label="Login"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
        />
        <Input
          label="Hasło"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Banner message={error} tone="crit" />
        <Button title="Zaloguj" variant="primary" onPress={submit} busy={busy} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
});
