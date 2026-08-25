import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import { Input, Choice, CheckItem } from '../components/Field';
import { Button, Banner, Card, SectionTitle, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { api } from '../api';
import { useTheme } from '../theme';
import { nameOf, safeUrl } from '../utils';

const DEPARTMENTS = ['Sprzedaż / Handlowy', 'Serwis', 'Likwidacja szkód', 'Finanse i ubezpieczenia', 'Inny dział'];
const NOTES_LIMIT = 4000;

const EMPTY = {
  name: '',
  department: DEPARTMENTS[0],
  location: '',
  brand: '',
  model: '',
  campaignPeriod: '',
  triggers: [],
  materials: [],
  materialsOther: '',
  listingLink: '',
  eventName: '',
  eventDate: '',
  notes: '',
};

export default function PublicFormScreen() {
  const { colors } = useTheme();
  const { meta, user } = useAuth();
  const data = useData();

  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const team = useMemo(() => (meta && meta.team) || [], [meta]);

  if (!meta) return <Loading label="Wczytywanie formularza…" />;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }));

  const submit = async () => {
    if (busy) return;
    setError('');

    if (!form.name.trim()) {
      setError('Podaj imię i nazwisko.');
      return;
    }
    if (form.triggers.length === 0 && form.materials.length === 0 && !form.materialsOther.trim()) {
      setError('Zaznacz przynajmniej jeden typ zgłoszenia albo materiał.');
      return;
    }
    if (form.triggers.includes('listing_promo') && form.listingLink.trim() && !safeUrl(form.listingLink.trim())) {
      setError('Link do ogłoszenia musi zaczynać się od http:// lub https://.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.submitRequest({
        ...form,
        name: form.name.trim(),
        location: form.location.trim(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        listingLink: form.listingLink.trim(),
        eventName: form.eventName.trim(),
        notes: form.notes.trim(),
      });
      setCreated(res.tasks);
      setForm(EMPTY);
      if (user) data.refresh();
    } catch (err) {
      setError(err.message || 'Nie udało się wysłać zgłoszenia.');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Screen scroll>
        <Card>
          <Text style={[styles.doneTitle, { color: colors.ok }]}>Zgłoszenie wysłane ✓</Text>
          <Text style={[styles.doneLead, { color: colors.inkSoft }]}>Marketing zajmie się:</Text>
          {created.map((task) => (
            <View key={task.id} style={styles.doneRow}>
              <Text style={[styles.doneBullet, { color: colors.accent }]}>•</Text>
              <Text style={[styles.doneText, { color: colors.ink }]}>
                {task.title}
                <Text style={{ color: colors.inkFaint }}>
                  {'  '}
                  {task.assignees.map((id) => nameOf(team, id)).join(' i ')}
                </Text>
              </Text>
            </View>
          ))}
          <Button title="Wyślij kolejne zgłoszenie" variant="primary" onPress={() => setCreated(null)} style={{ marginTop: 16 }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text style={[styles.lead, { color: colors.inkSoft }]}>
        Zgłoś potrzebę (nowy model, rata, wyprzedaż, event, materiały) — aplikacja sama rozdzieli ją na
        zadania dla zespołu marketingu.
      </Text>

      <Card>
        <Input label="Imię i nazwisko *" value={form.name} onChangeText={(v) => set('name', v)} placeholder="np. Jan Kowalski" maxLength={120} />
        <Choice
          label="Dział"
          value={form.department}
          onChange={(v) => set('department', v)}
          options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
        />
        <Input label="Salon / lokalizacja" value={form.location} onChangeText={(v) => set('location', v)} placeholder="np. Gorzów Wielkopolski" maxLength={80} />
        <Input label="Marka" value={form.brand} onChangeText={(v) => set('brand', v)} placeholder="np. Hyundai" maxLength={60} />
        <Input label="Model (opcjonalnie)" value={form.model} onChangeText={(v) => set('model', v)} placeholder="np. Tucson" maxLength={60} />
        <Input
          label="Termin / miesiąc kampanii (opcjonalnie)"
          value={form.campaignPeriod}
          onChangeText={(v) => set('campaignPeriod', v)}
          placeholder="np. wrzesień 2026"
          maxLength={80}
          style={{ marginBottom: 0 }}
        />
      </Card>

      <SectionTitle>Czego dotyczy zgłoszenie?</SectionTitle>
      {meta.triggers.map((trigger) => (
        <CheckItem
          key={trigger.id}
          title={trigger.t}
          description={trigger.d}
          checked={form.triggers.includes(trigger.id)}
          onToggle={() => toggle('triggers', trigger.id)}
        />
      ))}

      {form.triggers.includes('listing_promo') ? (
        <Card style={{ marginTop: 8 }}>
          <Input
            label="Link do ogłoszenia"
            value={form.listingLink}
            onChangeText={(v) => set('listingLink', v)}
            placeholder="https://…"
            autoCapitalize="none"
            keyboardType="url"
            maxLength={500}
            style={{ marginBottom: 0 }}
          />
        </Card>
      ) : null}

      {form.triggers.includes('event') ? (
        <Card style={{ marginTop: 8 }}>
          <Input label="Nazwa eventu" value={form.eventName} onChangeText={(v) => set('eventName', v)} placeholder="np. Dni Otwarte Salonu" maxLength={120} />
          <Input
            label="Data eventu"
            value={form.eventDate}
            onChangeText={(v) => set('eventDate', v)}
            placeholder="RRRR-MM-DD"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            style={{ marginBottom: 0 }}
          />
        </Card>
      ) : null}

      <SectionTitle>Potrzebne materiały</SectionTitle>
      <View style={styles.materials}>
        {meta.materials.map((material) => (
          <CheckItem
            key={material.id}
            title={material.label}
            checked={form.materials.includes(material.id)}
            onToggle={() => toggle('materials', material.id)}
          />
        ))}
      </View>
      <Input
        value={form.materialsOther}
        onChangeText={(v) => set('materialsOther', v)}
        placeholder="Inny materiał — opisz"
        maxLength={200}
      />

      <SectionTitle>Uwagi dla marketingu</SectionTitle>
      <Input
        value={form.notes}
        onChangeText={(v) => set('notes', v.slice(0, NOTES_LIMIT))}
        placeholder="Dodatkowe informacje, terminy, oczekiwania…"
        multiline
        maxLength={NOTES_LIMIT}
      />

      <Banner message={error} tone="crit" />
      <Button title="Wyślij zgłoszenie" variant="primary" onPress={submit} busy={busy} style={{ marginTop: 8 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  materials: { marginBottom: 4 },
  doneTitle: { fontSize: 18, fontWeight: '700' },
  doneLead: { fontSize: 13.5, marginTop: 8, marginBottom: 10 },
  doneRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  doneBullet: { fontSize: 15, lineHeight: 20 },
  doneText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
