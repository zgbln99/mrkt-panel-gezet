import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import Screen from '../components/Screen';
import { Button, Card, SectionTitle, Tag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../theme';

export default function MoreScreen({ navigation }) {
  const { colors } = useTheme();
  const { user, isAdmin, logout } = useAuth();
  const { offline } = useData();

  const confirmLogout = () => {
    Alert.alert('Wylogować się?', 'Powiadomienia push przestaną przychodzić na to urządzenie.', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Wyloguj', style: 'destructive', onPress: () => logout('Wylogowano') },
    ]);
  };

  return (
    <Screen scroll>
      <Card>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.ink }]}>{user.name}</Text>
          {isAdmin ? <Tag label="Administrator" tone="accent" /> : null}
          {offline ? <Tag label="Offline" tone="warn" /> : null}
        </View>
        <Text style={[styles.meta, { color: colors.inkFaint }]}>
          {user.role} · login: {user.username}
        </Text>
      </Card>

      <SectionTitle>Konto</SectionTitle>
      <Button title="Zmień hasło" onPress={() => navigation.navigate('ChangePassword', { forced: false })} />

      {isAdmin ? (
        <>
          <SectionTitle>Administracja</SectionTitle>
          <Button title="Wszystkie zgłoszenia" onPress={() => navigation.navigate('RequestsLog')} style={styles.spaced} />
          <Button title="Konta zespołu" onPress={() => navigation.navigate('Accounts')} style={styles.spaced} />
        </>
      ) : null}

      <SectionTitle>Aplikacja</SectionTitle>
      <Button title="Ustawienia" onPress={() => navigation.navigate('Settings')} />

      <Button title="Wyloguj" variant="danger" onPress={confirmLogout} style={{ marginTop: 24 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 18, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 4 },
  spaced: { marginBottom: 10 },
});
