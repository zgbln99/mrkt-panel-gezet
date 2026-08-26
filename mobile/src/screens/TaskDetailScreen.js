import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Linking, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Screen from '../components/Screen';
import { Input } from '../components/Field';
import { Button, Chip, Card, SectionTitle, Banner, Tag, EmptyState } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme, radius } from '../theme';
import { bm, timeAgo, formatDateTime, safeUrl, nameOf } from '../utils';

export default function TaskDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { taskId } = route.params;
  const { meta, user, isAdmin } = useAuth();
  const { findTask, updateStatus, updateAssignees, transferTask } = useData();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);

  // Zadanie odczytujemy z bieżących danych po identyfikatorze, a nie z
  // parametru nawigacji — dzięki temu odświeżanie w tle aktualizuje ten ekran.
  const entry = findTask(taskId);
  const team = (meta && meta.team) || [];

  // Zadanie mogło zniknąć: administrator usunął zgłoszenie albo pracownik
  // przekazał je komuś innemu i stracił do niego dostęp.
  useEffect(() => {
    if (!entry && navigation.canGoBack()) navigation.goBack();
  }, [entry, navigation]);

  const category = useMemo(
    () => (meta && entry ? meta.cats.find((c) => c.id === entry.task.category) : null),
    [meta, entry]
  );

  if (!entry) {
    return (
      <Screen scroll>
        <EmptyState title="Zadanie nie jest już dostępne" hint="Mogło zostać usunięte albo przekazane innej osobie." />
      </Screen>
    );
  }

  const { req, task } = entry;
  const canManage = isAdmin || task.assignees.includes(user.id);
  const listingUrl = safeUrl(req.listingLink);
  const others = team.filter((t) => t.id !== user.id);
  // Zakres pokazujemy wyłącznie przy zgłoszeniu „tylko foto / video” — przy
  // pozostałych typach niósłby wartość domyślną, która niczego nie mówi.
  const photoVideoScope = (req.triggers || []).includes('photo_video_only')
    ? ((meta && meta.photoVideoScopes) || []).find((s) => s.id === (req.photoVideoScope || 'both'))
    : null;

  const run = async (fn, successMessage) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      if (successMessage) setNotice(successMessage);
    } catch (err) {
      setError(err.message || 'Operacja się nie powiodła.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status) => {
    if (task.status === status) return;
    run(() => updateStatus(task.id, status));
  };

  const toggleAssignee = (personId) => {
    const next = task.assignees.includes(personId)
      ? task.assignees.filter((a) => a !== personId)
      : [...task.assignees, personId];
    if (next.length === 0) {
      setError('Zadanie musi mieć przynajmniej jedną osobę odpowiedzialną.');
      return;
    }
    run(() => updateAssignees(task.id, next));
  };

  const doTransfer = () => {
    if (!transferTo) {
      setError('Wybierz osobę, do której przekazujesz zadanie.');
      return;
    }
    run(async () => {
      await transferTask(task.id, transferTo, transferNote.trim());
      setShowTransfer(false);
      setTransferTo('');
      setTransferNote('');
      // Pracownik po oddaniu zadania traci do niego dostęp — nie ma czego oglądać.
      if (!isAdmin && navigation.canGoBack()) navigation.goBack();
    }, 'Zadanie przekazane');
  };

  const copyDraft = async () => {
    await Clipboard.setStringAsync(task.draftText);
    setNotice('Skopiowano treść do schowka');
  };

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: colors.ink }]}>{task.title}</Text>

      <View style={styles.tags}>
        {category ? <Tag label={category.label} /> : null}
        {req.campaignPeriod ? <Tag label={`🗓 ${req.campaignPeriod}`} tone="warn" /> : null}
        {req.eventName ? <Tag label={`🎪 ${req.eventName}${req.eventDate ? ` — ${req.eventDate}` : ''}`} /> : null}
      </View>

      <Banner message={error} tone="crit" />
      <Banner message={notice} tone="ok" />

      <SectionTitle>Zgłoszenie</SectionTitle>
      <Card>
        <Fact label="Zgłaszający" value={[req.name, req.department].filter(Boolean).join(' · ')} />
        {req.location ? <Fact label="Salon" value={req.location} /> : null}
        {bm(req) !== 'nowa oferta' ? <Fact label="Marka / model" value={bm(req)} /> : null}
        {photoVideoScope ? <Fact label="Zakres" value={photoVideoScope.label} /> : null}
        <Fact label="Wpłynęło" value={formatDateTime(req.createdAt)} last={!listingUrl} />
        {listingUrl ? (
          <View style={styles.fact}>
            <Text style={[styles.factLabel, { color: colors.inkFaint }]}>Ogłoszenie</Text>
            <Text style={[styles.factValue, { color: colors.accentStrong }]} onPress={() => Linking.openURL(listingUrl)}>
              {listingUrl}
            </Text>
          </View>
        ) : null}
      </Card>

      {task.details ? (
        <>
          <SectionTitle>Opis zadania</SectionTitle>
          <Card>
            <Text style={[styles.body, { color: colors.ink }]}>{task.details}</Text>
          </Card>
        </>
      ) : null}

      {req.notes ? (
        <>
          <SectionTitle>⚠️ Kontekst zgłoszenia — nie kopiuj bezpośrednio</SectionTitle>
          <Card style={{ backgroundColor: colors.critTint, borderColor: colors.crit }}>
            <Text style={[styles.body, { color: colors.ink }]} selectable>
              {req.notes}
            </Text>
          </Card>
        </>
      ) : null}

      {task.draftText ? (
        <>
          <SectionTitle right={<Button title="Kopiuj" onPress={copyDraft} style={styles.copyButton} />}>
            Gotowa propozycja treści
          </SectionTitle>
          <Card style={{ backgroundColor: colors.accentTint, borderColor: colors.accent }}>
            <Text style={[styles.draft, { color: colors.ink }]} selectable>
              {task.draftText}
            </Text>
          </Card>
        </>
      ) : null}

      {task.transferLog && task.transferLog.length > 0 ? (
        <>
          <SectionTitle>Historia przekazań</SectionTitle>
          <Card style={{ backgroundColor: colors.thinTint, borderColor: 'transparent' }}>
            {task.transferLog.map((entryLog, index) => (
              <Text key={index} style={[styles.logRow, { color: colors.thin }]}>
                {nameOf(team, entryLog.from)} → {nameOf(team, entryLog.to)}
                {entryLog.note ? `: „${entryLog.note}”` : ''} · {timeAgo(entryLog.at)}
              </Text>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Status</SectionTitle>
      <View style={styles.row}>
        <Chip label="Nowe" tone="new" active={task.status === 'new'} disabled={!canManage || busy} onPress={() => setStatus('new')} />
        <Chip label="W trakcie" tone="progress" active={task.status === 'progress'} disabled={!canManage || busy} onPress={() => setStatus('progress')} />
        <Chip label="Zrobione" tone="done" active={task.status === 'done'} disabled={!canManage || busy} onPress={() => setStatus('done')} />
      </View>
      {!canManage ? (
        <Text style={[styles.hint, { color: colors.inkFaint }]}>
          To zadanie nie jest przypisane do Ciebie — możesz je tylko podejrzeć.
        </Text>
      ) : null}

      <SectionTitle>{isAdmin ? 'Osoby odpowiedzialne' : 'Przypisane do'}</SectionTitle>
      {isAdmin ? (
        <View style={styles.row}>
          {team.map((person) => (
            <Chip
              key={person.id}
              label={person.name}
              tone="person"
              active={task.assignees.includes(person.id)}
              disabled={busy}
              onPress={() => toggleAssignee(person.id)}
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.body, { color: colors.ink }]}>
          {task.assignees.map((id) => nameOf(team, id)).join(', ')}
        </Text>
      )}

      {canManage ? (
        <>
          <SectionTitle>Przekazanie</SectionTitle>
          {!showTransfer ? (
            <Button title="Przekaż zadanie innej osobie" onPress={() => setShowTransfer(true)} />
          ) : (
            <Card>
              <Text style={[styles.label, { color: colors.inkSoft }]}>Komu przekazujesz?</Text>
              <View style={[styles.row, { marginBottom: 14 }]}>
                {others.map((person) => (
                  <Chip
                    key={person.id}
                    label={person.name}
                    tone="person"
                    active={transferTo === person.id}
                    onPress={() => setTransferTo(person.id)}
                  />
                ))}
              </View>
              <Input
                label="Adnotacja dla odbiorcy (opcjonalnie)"
                value={transferNote}
                onChangeText={setTransferNote}
                placeholder="np. jestem na urlopie do piątku"
                multiline
                maxLength={500}
              />
              <View style={styles.row}>
                <Button title="Przekaż" variant="primary" onPress={doTransfer} busy={busy} style={{ flex: 1 }} />
                <Button title="Anuluj" onPress={() => setShowTransfer(false)} style={{ flex: 1 }} />
              </View>
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Fact({ label, value, last }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fact, last && { marginBottom: 0 }]}>
      <Text style={[styles.factLabel, { color: colors.inkFaint }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', lineHeight: 26 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 6 },
  fact: { marginBottom: 10 },
  factLabel: { fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  factValue: { fontSize: 14.5, marginTop: 2, lineHeight: 20 },
  body: { fontSize: 14.5, lineHeight: 21 },
  draft: { fontSize: 14, lineHeight: 21 },
  logRow: { fontSize: 12.5, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 12.5, marginTop: 8, lineHeight: 17 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  copyButton: { paddingVertical: 6, paddingHorizontal: 14, minHeight: 32, borderRadius: radius.pill },
});
