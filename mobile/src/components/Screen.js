import React from 'react';
import { View, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

/**
 * Wspólna powłoka ekranu: tło z motywu i margines na pasek nawigacji systemu.
 * Bez dolnego marginesu ostatni przycisk listy chowa się pod gestem "wstecz"
 * na telefonach bez fizycznych klawiszy.
 */
export default function Screen({ children, scroll = false, onRefresh, refreshing = false, contentStyle }) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const padding = {
    padding: spacing.lg,
    paddingBottom: spacing.lg + insets.bottom,
  };

  if (!scroll) {
    return <View style={[styles.fill, { backgroundColor: colors.bg }]}>{children}</View>;
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: colors.bg }]}
      contentContainerStyle={[padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
