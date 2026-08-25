import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TaskListItem from '../components/TaskListItem';
import { Chip, Banner, EmptyState, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme, radius } from '../theme';

const STATUS_FILTERS = [
  { id: 'all', label: 'Wszystkie', tone: 'default' },
  { id: 'new', label: 'Nowe', tone: 'new' },
  { id: 'progress', label: 'W trakcie', tone: 'progress' },
  { id: 'done', label: 'Zrobione', tone: 'done' },
];

/**
 * Jeden ekran obsługuje oba tryby: administrator widzi zadania całego zespołu
 * z filtrami po kategorii i osobie, pracownik — wyłącznie swoje.
 * Serwer i tak wysyła pracownikowi tylko jego zadania, więc filtry po osobie
 * nie miałyby dla niego czego filtrować.
 */
export default function TasksScreen({ navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { meta, isAdmin } = useAuth();
  const { requests, offline, loading, refreshVisible } = useData();

  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [assignee, setAssignee] = useState('all');
  const [query, setQuery] = useState('');

  const cats = (meta && meta.cats) || [];
  const team = (meta && meta.team) || [];

  const items = useMemo(() => {
    const out = [];
    requests.forEach((req) =>
      req.tasks.forEach((task) => {
        if (status !== 'all' && task.status !== status) return;
        if (category !== 'all' && task.category !== category) return;
        if (assignee !== 'all' && !task.assignees.includes(assignee)) return;
        if (query) {
          const haystack = [req.name, req.department, req.location, req.brand, req.model, task.title, task.details]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(query.toLowerCase())) return;
        }
        out.push({ req, task });
      })
    );
    return out.sort((a, b) => (b.req.createdAt || '').localeCompare(a.req.createdAt || ''));
  }, [requests, status, category, assignee, query]);

  const stats = useMemo(() => {
    let open = 0;
    let done = 0;
    requests.forEach((req) => req.tasks.forEach((task) => (task.status === 'done' ? done++ : open++)));
    return { open, done, total: open + done };
  }, [requests]);

  const header = (
    <View>
      <Banner
        message={offline ? 'Brak połączenia z serwerem — dane mogą być nieaktualne.' : ''}
        tone="warn"
      />

      <View style={styles.stats}>
        <Stat value={stats.total} label={isAdmin ? 'Zadań łącznie' : 'Moich zadań'} tone="accent" />
        <Stat value={stats.open} label="Otwartych" tone="warn" />
        <Stat value={stats.done} label="Zrobionych" tone="ok" />
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Szukaj (marka, osoba, treść)…"
        placeholderTextColor={colors.inkFaint}
        style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.lineStrong, color: colors.ink }]}
        accessibilityLabel="Szukaj w zadaniach"
      />

      <FilterRow>
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.id} label={f.label} tone={f.tone} active={status === f.id} onPress={() => setStatus(f.id)} />
        ))}
      </FilterRow>

      {isAdmin ? (
        <>
          <FilterRow>
            <Chip label="Wszystkie kategorie" active={category === 'all'} onPress={() => setCategory('all')} />
            {cats.map((cat) => (
              <Chip key={cat.id} label={cat.label} active={category === cat.id} onPress={() => setCategory(cat.id)} />
            ))}
          </FilterRow>
          <FilterRow>
            <Chip label="Cały zespół" tone="person" active={assignee === 'all'} onPress={() => setAssignee('all')} />
            {team.map((person) => (
              <Chip
                key={person.id}
                label={person.name}
                tone="person"
                active={assignee === person.id}
                onPress={() => setAssignee(person.id)}
              />
            ))}
          </FilterRow>
        </>
      ) : null}

      <Text style={[styles.count, { color: colors.inkFaint }]}>
        {items.length === 1 ? '1 zadanie' : `${items.length} zadań`}
      </Text>
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }}
      data={items}
      keyExtractor={(item) => item.task.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <TaskListItem
          team={team}
          req={item.req}
          task={item.task}
          onPress={() => navigation.navigate('TaskDetail', { taskId: item.task.id })}
        />
      )}
      ListEmptyComponent={
        <EmptyState
          title={requests.length === 0 ? 'Brak zadań' : 'Nic nie pasuje do filtrów'}
          hint={
            requests.length === 0
              ? isAdmin
                ? 'Zadania pojawią się tutaj, gdy ktoś wyśle zgłoszenie.'
                : 'Gdy dostaniesz zadanie, zobaczysz je tutaj i dostaniesz powiadomienie.'
              : 'Zmień filtry albo wyczyść wyszukiwanie.'
          }
        />
      }
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refreshVisible()} tintColor={colors.accent} />}
    />
  );
}

function FilterRow({ children }) {
  return <View style={styles.filterRow}>{children}</View>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  search: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14.5, minHeight: 44 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  count: { fontSize: 12, marginTop: 16, marginBottom: 8 },
});
