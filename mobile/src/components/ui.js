import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme, STATUS, radius, spacing } from '../theme';

export function Button({ title, onPress, variant = 'default', disabled, busy, icon, style }) {
  const { colors } = useTheme();

  const palette = {
    default: { bg: colors.surface, border: colors.lineStrong, text: colors.ink },
    primary: { bg: colors.accent, border: colors.accent, text: colors.onAccent },
    danger: { bg: colors.critTint, border: colors.crit, text: colors.crit },
    ghost: { bg: 'transparent', border: 'transparent', text: colors.accentStrong },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled || busy ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={palette.text} />
      ) : (
        <>
          {icon}
          <Text style={[styles.buttonText, { color: palette.text }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, tone = 'default', disabled }) {
  const { colors } = useTheme();

  const activeTone = {
    default: { bg: colors.ink, text: colors.surface },
    person: { bg: colors.accent, text: colors.onAccent },
    new: { bg: colors.warn, text: '#fff' },
    progress: { bg: colors.accent, text: colors.onAccent },
    done: { bg: colors.ok, text: '#fff' },
  }[tone];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? activeTone.bg : colors.surface,
          borderColor: active ? activeTone.bg : colors.lineStrong,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? activeTone.text : colors.inkSoft }]}>{label}</Text>
    </Pressable>
  );
}

export function StatusPill({ status, small }) {
  const { colors } = useTheme();
  const meta = STATUS[status] || STATUS.new;
  return (
    <View style={[styles.pill, { backgroundColor: colors[meta.tint] }, small && styles.pillSmall]}>
      <Text style={[styles.pillText, { color: colors[meta.color] }, small && styles.pillTextSmall]}>{meta.label}</Text>
    </View>
  );
}

export function Tag({ label, tone = 'neutral' }) {
  const { colors } = useTheme();
  const tones = {
    neutral: { bg: colors.surface2, text: colors.inkSoft },
    warn: { bg: colors.warnTint, text: colors.warn },
    crit: { bg: colors.critTint, text: colors.crit },
    accent: { bg: colors.accentTint, text: colors.accentStrong },
    thin: { bg: colors.thinTint, text: colors.thin },
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: tones.bg }]}>
      <Text style={[styles.tagText, { color: tones.text }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, style]}>{children}</View>;
}

export function SectionTitle({ children, right }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionTitleText, { color: colors.inkFaint }]}>{children}</Text>
      {right}
    </View>
  );
}

export function Banner({ message, tone = 'crit', action }) {
  const { colors } = useTheme();
  if (!message) return null;
  const tones = {
    crit: { bg: colors.critTint, text: colors.crit },
    warn: { bg: colors.warnTint, text: colors.warn },
    ok: { bg: colors.okTint, text: colors.ok },
    accent: { bg: colors.accentTint, text: colors.accentStrong },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: tones.bg }]} accessibilityLiveRegion="polite">
      <Text style={[styles.bannerText, { color: tones.text }]}>{message}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ title, hint }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.inkSoft }]}>{title}</Text>
      {hint ? <Text style={[styles.emptyHint, { color: colors.inkFaint }]}>{hint}</Text> : null}
    </View>
  );
}

export function Loading({ label }) {
  const { colors } = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      {label ? <Text style={[styles.emptyHint, { color: colors.inkFaint, marginTop: 10 }]}>{label}</Text> : null}
    </View>
  );
}

export function Stat({ value, label, tone = 'accent' }) {
  const { colors } = useTheme();
  const toneColor = { accent: colors.accent, warn: colors.warn, ok: colors.ok, crit: colors.crit }[tone];
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Text style={[styles.statValue, { color: toneColor }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.inkSoft }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minHeight: 46,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 13, minHeight: 34, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 10 },
  pillSmall: { paddingVertical: 2, paddingHorizontal: 8 },
  pillText: { fontSize: 12, fontWeight: '700' },
  pillTextSmall: { fontSize: 10.5 },
  tag: { borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
  tagText: { fontSize: 11, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.lg },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, marginTop: spacing.lg },
  sectionTitleText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  banner: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  bannerText: { fontSize: 13.5, lineHeight: 19 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  stat: { flex: 1, minWidth: 80, borderWidth: 1, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 10 },
  statValue: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11.5, marginTop: 2 },
});
