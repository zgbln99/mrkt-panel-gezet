import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, STATUS, radius } from '../theme';
import { StatusPill, Tag } from './ui';
import { bm, nameOf } from '../utils';

/**
 * Zwinięty wiersz zadania — odpowiednik kafelka z aplikacji webowej.
 * Cała treść (opis, kontekst, szkic, akcje) mieszka na ekranie szczegółów;
 * tutaj zostaje tyle, ile trzeba, żeby zadanie rozpoznać na liście.
 */
export default function TaskListItem({ team, req, task, onPress }) {
  const { colors } = useTheme();
  const meta = STATUS[task.status] || STATUS.new;
  const brandModel = bm(req);

  const context = [req.name, req.location, brandModel !== 'nowa oferta' ? brandModel : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}. ${meta.label}. Otwórz szczegóły.`}
      style={({ pressed }) => [
        styles.item,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          borderLeftColor: colors[meta.color],
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.title, { color: task.status === 'done' ? colors.inkSoft : colors.ink }]} numberOfLines={2}>
        {task.title}
      </Text>
      <Text style={[styles.context, { color: colors.inkFaint }]} numberOfLines={1}>
        {context}
      </Text>

      <View style={styles.badges}>
        <StatusPill status={task.status} small />
        {task.assignees.map((id) => (
          <Tag key={id} label={nameOf(team, id)} />
        ))}
        {req.campaignPeriod ? <Tag label={`🗓 ${req.campaignPeriod}`} tone="warn" /> : null}
        {task.draftText ? <Tag label="szkic" tone="accent" /> : null}
        {req.notes ? <Tag label="kontekst" tone="crit" /> : null}
        {task.transferLog && task.transferLog.length > 0 ? (
          <Tag label={`przekazane ${task.transferLog.length}×`} tone="thin" />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { borderWidth: 1, borderLeftWidth: 4, borderRadius: radius.md, padding: 13, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  context: { fontSize: 12, marginTop: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 },
});
