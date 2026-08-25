import React, { useState } from 'react';
import { View, Text, FlatList, Alert, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState, StatusPill, Tag, Banner } from '../components/ui';
import { useData } from '../context/DataContext';
import { useTheme, radius } from '../theme';
import { bm, formatDateTime } from '../utils';

/** Dziennik wszystkich zgłoszeń — widok wyłącznie dla administratora. */
export default function RequestsLogScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { requests, loading, refreshVisible, markRequestSeen, deleteRequest } = useData();
  const [error, setError] = useState('');

  const confirmDelete = (req) => {
    // Kasowanie zgłoszenia usuwa też wszystkie zadania z niego wygenerowane —
    // to nie jest operacja do wykonania jednym przypadkowym dotknięciem.
    Alert.alert(
      'Usunąć zgłoszenie?',
      `Zgłoszenie od ${req.name} zniknie razem z ${req.tasks.length} zadaniami. Tej operacji nie da się cofnąć.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRequest(req.id);
            } catch (err) {
              setError(err.message || 'Nie udało się usunąć zgłoszenia.');
            }
          },
        },
      ]
    );
  };

  const statusOf = (req) => {
    if (req.tasks.length > 0 && req.tasks.every((t) => t.status === 'done')) return 'done';
    if (req.tasks.some((t) => t.status !== 'new')) return 'progress';
    return 'new';
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }}
      data={requests}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<Banner message={error} tone="crit" />}
      renderItem={({ item }) => {
        const brandModel = bm(item);
        return (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.rowTop}>
              <Text style={[styles.who, { color: colors.ink }]}>
                {item.name} · {item.department}
              </Text>
              {!item.seen ? <Tag label="Nowe" tone="crit" /> : null}
            </View>
            <Text style={[styles.meta, { color: colors.inkFaint }]}>
              {[item.location, brandModel !== 'nowa oferta' ? brandModel : ''].filter(Boolean).join(' · ')}
              {item.campaignPeriod ? ` · termin: ${item.campaignPeriod}` : ''}
            </Text>
            <Text style={[styles.meta, { color: colors.inkFaint }]}>
              {formatDateTime(item.createdAt)} — {item.tasks.length} zadań
            </Text>

            <View style={styles.actions}>
              <StatusPill status={statusOf(item)} small />
              <View style={{ flex: 1 }} />
              {!item.seen ? <Button title="Zobaczone" onPress={() => markRequestSeen(item.id)} style={styles.action} /> : null}
              <Button title="Usuń" variant="danger" onPress={() => confirmDelete(item)} style={styles.action} />
            </View>
          </View>
        );
      }}
      ListEmptyComponent={<EmptyState title="Brak zgłoszeń" hint="Zgłoszenia z formularza pojawią się tutaj." />}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refreshVisible()} tintColor={colors.accent} />}
    />
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  who: { fontSize: 14.5, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  action: { paddingVertical: 7, paddingHorizontal: 14, minHeight: 36 },
});
