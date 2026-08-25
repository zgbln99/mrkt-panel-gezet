import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTheme, radius, spacing } from '../theme';

export function Field({ label, hint, children, style }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={[styles.label, { color: colors.inkSoft }]}>{label}</Text> : null}
      {children}
      {hint ? <Text style={[styles.hint, { color: colors.inkFaint }]}>{hint}</Text> : null}
    </View>
  );
}

export function Input({ label, hint, style, multiline, ...props }) {
  const { colors } = useTheme();
  return (
    <Field label={label} hint={hint}>
      <TextInput
        // Napis nad polem jest osobnym elementem, więc TalkBack sam go z polem
        // nie powiąże — bez tego czytnik ekranu ogłasza „pole edycji" bez nazwy.
        accessibilityLabel={label}
        placeholderTextColor={colors.inkFaint}
        multiline={multiline}
        style={[
          styles.input,
          { backgroundColor: colors.surface, borderColor: colors.lineStrong, color: colors.ink },
          multiline && styles.inputMultiline,
          style,
        ]}
        {...props}
      />
    </Field>
  );
}

/**
 * Wybór jednej wartości z krótkiej listy. Natywny <Picker> wymaga osobnej
 * biblioteki i na Androidzie wygląda obco względem reszty ekranu — lista
 * przycisków jest przewidywalna i dostępna dla czytnika ekranu.
 */
export function Choice({ label, options, value, onChange }) {
  const { colors } = useTheme();
  return (
    <Field label={label}>
      <View style={styles.choiceRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.choice,
                {
                  backgroundColor: selected ? colors.accent : colors.surface,
                  borderColor: selected ? colors.accent : colors.lineStrong,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.choiceText, { color: selected ? colors.onAccent : colors.inkSoft }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

/** Pole wielokrotnego wyboru z opisem — odpowiednik listy triggerów z formularza webowego. */
export function CheckItem({ title, description, checked, onToggle }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={({ pressed }) => [
        styles.checkItem,
        {
          backgroundColor: checked ? colors.accentTint : colors.surface2,
          borderColor: checked ? colors.accent : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.checkBox,
          { borderColor: checked ? colors.accent : colors.lineStrong, backgroundColor: checked ? colors.accent : 'transparent' },
        ]}
      >
        {checked ? <Text style={[styles.checkMark, { color: colors.onAccent }]}>✓</Text> : null}
      </View>
      <View style={styles.checkTexts}>
        <Text style={[styles.checkTitle, { color: colors.ink }]}>{title}</Text>
        {description ? <Text style={[styles.checkDesc, { color: colors.inkFaint }]}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  hint: { fontSize: 12, marginTop: 5, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    minHeight: 46,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, minHeight: 38, justifyContent: 'center' },
  choiceText: { fontSize: 13.5, fontWeight: '600' },
  checkItem: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkMark: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  checkTexts: { flex: 1, gap: 2 },
  checkTitle: { fontSize: 14.5, fontWeight: '600' },
  checkDesc: { fontSize: 12.5, lineHeight: 17 },
});
