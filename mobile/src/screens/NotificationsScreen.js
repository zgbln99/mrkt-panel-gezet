import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState } from '../components/ui';
import { useData } from '../context/DataContext';
import { useTheme, radius } from '../theme';
import { timeAgo } from '../utils';

export default function NotificationsScreen({ navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { notifications, unread, loading, refreshVisible, markNotificationRead, markAllNotificationsRead } = useData();

  const open = (notification) => {
    if (!notification.read) markNotificationRead(notification.id);
    // Powiadomienie o konkretnym zadaniu prowadzi wprost do niego; te dotyczące
    // całego zgłoszenia zostawiają użytkownika na liście zadań.
    if (notification.taskId) navigation.navigate('TaskDetail', { taskId: notification.taskId });
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }}
      data={notifications}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        unread > 0 ? (
          <Button title={`Oznacz wszystkie jako przeczytane (${unread})`} onPress={markAllNotificationsRead} style={{ marginBottom: 14 }} />
        ) : null
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => open(item)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.item,
            {
              backgroundColor: item.read ? colors.surface : colors.accentTint,
              borderColor: item.read ? colors.line : colors.accent,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={styles.itemTop}>
            {!item.read ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
            <Text style={[styles.text, { color: colors.ink, fontWeight: item.read ? '400' : '600' }]}>{item.text}</Text>
          </View>
          <Text style={[styles.time, { color: colors.inkFaint }]}>{timeAgo(item.at)}</Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <EmptyState
          title="Brak powiadomień"
          hint="Tu trafiają informacje o nowych zadaniach i zadaniach przekazanych przez zespół."
        />
      }
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refreshVisible()} tintColor={colors.accent} />}
    />
  );
}

const styles = StyleSheet.create({
  item: { borderWidth: 1, borderRadius: radius.md, padding: 13, marginBottom: 9 },
  itemTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  text: { flex: 1, fontSize: 14, lineHeight: 20 },
  time: { fontSize: 11.5, marginTop: 6, textAlign: 'right' },
});
