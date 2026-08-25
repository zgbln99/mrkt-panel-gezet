const { v4: uuidv4 } = require('uuid');

function bm(req) { return [req.brand, req.model].filter(Boolean).join(' ') || 'nowa oferta'; }
function loc(req) { return req.location || 'naszym salonie'; }
function hashtag(s) { return '#' + String(s || 'GrupaGezet').replace(/[^a-zA-Z0-9]+/g, ''); }
function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function atLoc(req) { return req.location ? ' w ' + req.location : ''; }
function commaLoc(req) { return req.location ? ', ' + req.location : ''; }
const DETAIL_PROMPT = '[wstaw tu konkretny, bezpieczny do publikacji szczegół oferty — np. cenę/ratę/wyposażenie; NIE kopiuj kontekstu w całości]';

function blogTemplate(req, o) {
  const slugv = slugify([req.brand, req.model, o.slugSuffix].filter(Boolean).join('-'));
  const tags = [req.brand, req.model, ...o.tagsExtra].filter(Boolean);
  let out = 'SEKCJA SEO (do wklejenia w CMS)\n';
  out += `Title tag: ${o.titleTag}\n`;
  out += `Meta description: ${o.metaDesc}\n`;
  out += `Proponowany slug: /blog/post/${slugv}\n`;
  out += `Tagi: ${tags.join(', ')}\n\n---\n\n`;
  out += `${o.h1}\n\n${o.intro}\n\n[MIEJSCE: zdjęcia]\n\n`;
  o.sections.forEach((s) => { out += `${s.h2}\n${s.body}\n\n`; });
  out += '[MIEJSCE: ogłoszenia]\n\n';
  out += `${bm(req)} w Grupa Gezet\nModel dostępny w salonie Grupa Gezet${atLoc(req)}. Zapraszamy do kontaktu i umówienia jazdy testowej.\n\n`;
  out += '[MIEJSCE: formularz kontaktowy]\n\nFAQ\n\n';
  o.faq.forEach((f) => { out += `P: ${f.q}\nO: ${f.a}\n\n`; });
  out += 'Uwaga redakcyjna: przed publikacją zweryfikuj ceny, dane techniczne i dostępność wersji z aktualnymi materiałami importera oraz upewnij się, że tekst nie zawiera żadnych informacji wewnętrznych z kontekstu zgłoszenia.';
  return out;
}

const DRAFTS = {
  new_model: (req) => ({
    blog: blogTemplate(req, {
      slugSuffix: 'nowosc',
      titleTag: `${bm(req)} – cena, wyposażenie i opinie | Grupa Gezet`,
      metaDesc: `${bm(req)} już w salonie Grupa Gezet${atLoc(req)}. Sprawdź wyposażenie, warunki zakupu i umów jazdę testową online.`,
      tagsExtra: ['nowość', 'premiera'],
      h1: `${bm(req)} w Grupa Gezet — co warto wiedzieć o nowym modelu?`,
      intro: `${bm(req)} trafił do oferty Grupa Gezet${atLoc(req)} i poszerza gamę marki ${req.brand || ''} o nowe rozwiązania. ${DETAIL_PROMPT}`,
      sections: [
        { h2: `Jakie wersje wyposażenia ${req.model || bm(req)} są dostępne w Polsce?`, body: '[uzupełnić na podstawie materiałów importera — warianty wyposażenia, jednostki napędowe, ceny]' },
        { h2: `Dlaczego warto rozważyć ${bm(req)}?`, body: '[uzupełnić: 2–3 kluczowe argumenty — technologia, bezpieczeństwo, koszt użytkowania]' },
      ],
      faq: [
        { q: `Czy można umówić jazdę testową ${bm(req)}?`, a: `Tak — jazdę testową można umówić w salonie Grupa Gezet${atLoc(req)}, kontaktując się z naszym doradcą.` },
        { q: `Jakie są warunki finansowania ${req.model || bm(req)}?`, a: 'Grupa Gezet oferuje elastyczne opcje finansowania (kredyt, leasing, wynajem długoterminowy) — szczegóły warto ustalić indywidualnie z doradcą.' },
        { q: `Gdzie kupić ${bm(req)}?`, a: `${bm(req)} dostępny jest w salonie Grupa Gezet${atLoc(req)}.` },
      ],
    }),
    social: `${bm(req)} właśnie wjechał do salonu Grupa Gezet${atLoc(req)} 👀\n\n${DETAIL_PROMPT}\n\nBądź jednym z pierwszych, którzy usiądą za kierownicą.\n👉 Umów jazdę testową i przekonaj się sam.\n\n${hashtag(req.brand)} #GrupaGezet #premiera`,
    gmb: `${bm(req)} już dostępny w salonie Grupa Gezet${atLoc(req)}. ${DETAIL_PROMPT} Zapraszamy do kontaktu.`,
  }),
  financing: (req) => ({
    social: `${bm(req)} — rata, która realnie coś zmienia 🔑\n\n${DETAIL_PROMPT}\n\n📍 Grupa Gezet${commaLoc(req)}${req.campaignPeriod ? ' — oferta ograniczona czasowo: ' + req.campaignPeriod : ''}\n👉 Napisz lub zadzwoń, żeby zarezerwować auto.\n\n${hashtag(req.brand)} #GrupaGezet #Rata #Leasing`,
    gmb: `${bm(req)} — sprawdź aktualne warunki finansowania w Grupa Gezet${atLoc(req)}.${req.campaignPeriod ? ' Oferta obowiązuje: ' + req.campaignPeriod + '.' : ''} ${DETAIL_PROMPT}`,
  }),
  clearance_stock: (req) => ({
    social: `Ostatnie egzemplarze ${bm(req)} w wyjątkowo dobrej cenie 🔥\n\n${DETAIL_PROMPT}\n\n${req.campaignPeriod ? '⏳ Oferta tylko do: ' + req.campaignPeriod + '\n' : ''}📍 Grupa Gezet${commaLoc(req)}\n👉 Zarezerwuj, zanim zrobi to ktoś inny.\n\n${hashtag(req.brand)} #GrupaGezet #Wyprzedaż`,
    gmb: `Wyprzedaż ${bm(req)} w Grupa Gezet${atLoc(req)}.${req.campaignPeriod ? ' Oferta do: ' + req.campaignPeriod + '.' : ''} ${DETAIL_PROMPT}`,
  }),
  new_brand: (req) => ({
    blog: blogTemplate(req, {
      slugSuffix: 'nowa-marka',
      titleTag: `${req.brand || 'Nowa marka'} w Grupa Gezet — oferta i salony | Grupa Gezet`,
      metaDesc: `Marka ${req.brand || ''} dołącza do oferty Grupa Gezet${atLoc(req)}. Sprawdź pełną gamę modeli i warunki zakupu.`,
      tagsExtra: ['nowa marka'],
      h1: `${req.brand || 'Nowa marka'} w Grupa Gezet`,
      intro: `Do Grupa Gezet dołącza marka ${req.brand || ''}${commaLoc(req)}. ${DETAIL_PROMPT}`,
      sections: [
        { h2: `Jakie modele ${req.brand || ''} są dostępne w Grupa Gezet?`, body: '[uzupełnić — pełna gama modeli dostępnych w salonie]' },
        { h2: `Dlaczego warto zainteresować się marką ${req.brand || ''}?`, body: '[uzupełnić: korzyści dla klienta]' },
      ],
      faq: [
        { q: `Gdzie znajduje się salon ${req.brand || ''} Grupa Gezet?`, a: `Salon marki ${req.brand || ''} działa w Grupa Gezet${atLoc(req)}.` },
        { q: `Czy można umówić jazdę testową modeli ${req.brand || ''}?`, a: 'Tak, jazdę testową można zarezerwować kontaktując się z salonem.' },
        { q: `Jakie są warunki serwisowe dla marki ${req.brand || ''}?`, a: `Grupa Gezet zapewnia autoryzowany serwis marki ${req.brand || ''}.` },
      ],
    }),
    social: `${req.brand || 'Nowa marka'} właśnie wjechał do Grupa Gezet 🎉\n\n${DETAIL_PROMPT}\n📍 Salon ${req.brand || ''} — Grupa Gezet${commaLoc(req)}\n👉 Zapraszamy na pierwsze spotkanie z marką.\n\n${hashtag(req.brand)} #GrupaGezet #nowamarka`,
    gmb: `Marka ${req.brand || ''} już w Grupa Gezet${atLoc(req)}. ${DETAIL_PROMPT}`,
  }),
  test_drives: (req) => ({
    social: `Nie musisz wierzyć nam na słowo — wystarczy jedna jazda 🚘\n\n${bm(req)} czeka na Ciebie w Grupa Gezet${atLoc(req)}.\n\n👉 Umów jazdę testową.\n\n${hashtag(req.brand)} #GrupaGezet #JazdaTestowa`,
    gmb: `Umów jazdę testową ${bm(req)} w Grupa Gezet${atLoc(req)}.`,
  }),
  listing_promo: (req) => ({
    social: `Masz na oku konkretny egzemplarz? Ten może być Twój 👇\n\n${bm(req)}${req.listingLink ? '\n' + req.listingLink : ''}\n\n👉 Napisz do nas.\n\n${hashtag(req.brand)} #GrupaGezet`,
    gmb: `Sprawdź naszą aktualną ofertę: ${bm(req)}. Zapytaj w Grupa Gezet${atLoc(req)}.`,
  }),
  event: (req) => ({
    social: `Będziemy na ${req.eventName || 'evencie'}${req.eventDate ? ' — ' + req.eventDate : ''} — wpadnij! 🎪\n\n${DETAIL_PROMPT}\n📍 ${loc(req)}\n\n#GrupaGezet #Event`,
  }),
};

function reelBeats(beats) { return beats.map((b) => `${b.t}: ${b.desc}`).join('\n'); }

const REEL_SCRIPTS = {
  new_model: (req) => `SCENARIUSZ ROLKI (15–20 s)\n\n${reelBeats([
    { t: '0–3 s', desc: `Zbliżenie na detal auta w salonie. Tekst na ekranie: "${bm(req)} już tutaj"` },
    { t: '3–9 s', desc: `Krótkie ujęcia wnętrza i wyposażenia. Tekst na ekranie: ${DETAIL_PROMPT}` },
    { t: '9–15 s', desc: 'Obrót 360° wokół auta. Tekst na ekranie: "Zobacz to na żywo"' },
    { t: '15–18 s', desc: 'Sprzedawca w kadrze, zaproszenie na jazdę testową.' },
  ])}\n\nCTA: "Umów jazdę testową — link w bio / DM"`,
  financing: (req) => `SCENARIUSZ ROLKI (12–15 s)\n\n${reelBeats([
    { t: '0–2 s', desc: 'Zbliżenie na kalkulator z ratą.' },
    { t: '2–6 s', desc: `Obrót kamery wokół ${bm(req)}. Tekst: ${DETAIL_PROMPT}` },
    { t: '6–11 s', desc: 'Wypunktowanie warunków oferty.' },
    { t: '11–15 s', desc: 'Sprzedawca z gestem zaproszenia.' },
  ])}\n\nCTA: "Zapytaj o warunki — telefon/DM w opisie"`,
  clearance_stock: (req) => `SCENARIUSZ ROLKI (12–15 s)\n\n${reelBeats([
    { t: '0–2 s', desc: 'Licznik odliczający sztuki.' },
    { t: '2–8 s', desc: `Szybkie cięcia ${bm(req)}.` },
    { t: '8–13 s', desc: `Cena/rabat na ekranie: ${DETAIL_PROMPT}` },
    { t: '13–15 s', desc: 'Sprzedawca wskazuje na auto.' },
  ])}\n\nCTA: "Zarezerwuj, zanim zabraknie"`,
  new_brand: (req) => `SCENARIUSZ ROLKI (15–20 s)\n\n${reelBeats([
    { t: '0–3 s', desc: `Odsłonięcie auta marki ${req.brand || ''}.` },
    { t: '3–10 s', desc: `Ujęcia modeli z gamy marki. Tekst: ${DETAIL_PROMPT}` },
    { t: '10–16 s', desc: 'Sprzedawca — dlaczego ta marka trafiła do oferty.' },
    { t: '16–18 s', desc: 'Logo marki + logo Grupa Gezet.' },
  ])}\n\nCTA: "Umów pierwsze spotkanie z marką"`,
};

const MAT_LABELS = { business_cards: 'Wizytówki', flags: 'Flagi', rollups: 'Rollupy', wraps: 'Oklejenie/okleiny', leaflets: 'Ulotki', gadgets: 'Gadżety' };

/** Zwraca tablicę nowych zadań (obiekty gotowe do zapisu w tabeli `tasks`, bez request_id). */
function buildTasks(req) {
  const tasks = [];
  const brandModel = bm(req);
  const add = (category, title, details, assignees, draftText) =>
    tasks.push({ id: uuidv4(), category, title, details: details || '', assignees: [...assignees], status: 'new', draftText: draftText || '', transferLog: [] });

  const triggers = req.triggers || [];
  const materials = req.materials || [];

  if (triggers.includes('new_model')) {
    const d = DRAFTS.new_model(req);
    add('video', 'Reels — nowość: ' + brandModel, 'Krótka forma na social media.', ['bogdan'], REEL_SCRIPTS.new_model(req));
    add('digital', 'Post social media — nowość ' + brandModel, 'Gotowa propozycja tekstu.', ['inga', 'martyna'], d.social);
    add('digital', 'Wpis na blogu — ' + brandModel, 'Gotowy szkic artykułu.', ['inga', 'martyna'], d.blog);
    add('digital', 'Wpis Google Moja Firma — ' + brandModel, 'Gotowa propozycja treści posta.', ['zbigniew'], d.gmb);
    add('foto', 'Sesja foto — ' + brandModel, 'Zdjęcia produktowe na potrzeby kampanii.', ['piotr']);
  }
  if (triggers.includes('financing')) {
    const d = DRAFTS.financing(req);
    const period = req.campaignPeriod ? ` (termin: ${req.campaignPeriod})` : '';
    add('digital', 'Kampania leadowa — rata/oferta finansowa ' + brandModel + period, 'Cel leadowy, nie tylko zasięgowy.', ['inga', 'martyna'], d.social);
    add('digital', 'Wpis Google Moja Firma — oferta finansowa', 'Gotowa propozycja treści posta.', ['zbigniew'], d.gmb);
    add('video', 'Reels — oferta ratalna ' + brandModel, '', ['bogdan'], REEL_SCRIPTS.financing(req));
    add('foto', 'Sesja foto — ' + brandModel + ' (do kreacji z ceną raty)', 'Świeże zdjęcia realnego egzemplarza.', ['piotr']);
  }
  if (triggers.includes('clearance_stock')) {
    const d = DRAFTS.clearance_stock(req);
    const period = req.campaignPeriod ? ` (termin: ${req.campaignPeriod})` : '';
    add('digital', 'Kampania leadowa — wyprzedaż ' + brandModel + period, 'Cel: leady na wyprzedaż stocku.', ['inga', 'martyna']);
    add('digital', 'Reklamy social media — wyprzedaż ' + brandModel, 'Gotowa propozycja tekstu.', ['inga', 'martyna'], d.social);
    add('digital', 'Wpis Google Moja Firma — wyprzedaż', 'Gotowa propozycja treści posta.', ['zbigniew'], d.gmb);
    add('video', 'Reels — wyprzedaż ' + brandModel, '', ['bogdan'], REEL_SCRIPTS.clearance_stock(req));
    add('foto', 'Sesja foto — ' + brandModel + ' (realne egzemplarze)', 'Pokaż faktyczny stan/roczniki.', ['piotr']);
  }
  if (triggers.includes('new_brand')) {
    const d = DRAFTS.new_brand(req);
    add('digital', 'Kampania leadowa — otwarcie marki ' + (req.brand || ''), 'Świadomość + leady.', ['inga', 'martyna']);
    add('digital', 'Wpis na blogu — nowa marka ' + (req.brand || ''), 'Gotowy szkic artykułu.', ['inga', 'martyna'], d.blog);
    add('digital', 'Post social media — nowa marka ' + (req.brand || ''), 'Gotowa propozycja tekstu.', ['inga', 'martyna'], d.social);
    add('digital', 'Wpis Google Moja Firma — nowa marka ' + (req.brand || ''), 'Gotowa propozycja treści posta.', ['zbigniew'], d.gmb);
    add('video', 'Reels — nowa marka ' + (req.brand || ''), '', ['bogdan'], REEL_SCRIPTS.new_brand(req));
    add('materials', 'Oklejenie / rollupy / wizytówki — otwarcie ' + (req.brand || ''), 'Pełny zestaw materiałów na otwarcie.', ['inga', 'martyna']);
  }
  if (triggers.includes('test_drives')) {
    const d = DRAFTS.test_drives(req);
    add('digital', 'Kampania leadowa — zapisy na jazdy testowe ' + brandModel, '', ['inga', 'martyna'], d.social);
    add('digital', 'Wpis Google Moja Firma — jazdy testowe', 'CTA: zapisz się na jazdę testową.', ['zbigniew'], d.gmb);
  }
  if (triggers.includes('listing_promo')) {
    const d = DRAFTS.listing_promo(req);
    add('digital', 'Reklama social media — konkretne ogłoszenie', 'Gotowa propozycja tekstu.', ['inga', 'martyna'], d.social);
    add('digital', 'Wpis Google Moja Firma — promocja ogłoszenia', 'Gotowa propozycja treści posta.', ['zbigniew'], d.gmb);
  }
  if (triggers.includes('event')) {
    const en = req.eventName || 'event';
    const d = DRAFTS.event(req);
    add('events', 'Rezerwacja flag — ' + en, req.eventDate ? 'Termin: ' + req.eventDate : '', ['zbigniew']);
    add('events', 'Oklejenie / ulotki — ' + en, 'Przygotowanie materiałów.', ['inga', 'martyna']);
    add('events', 'Gadżety — ' + en, '', ['inga', 'martyna']);
    add('digital', 'Social przed/po evencie — ' + en, 'Gotowa propozycja tekstu.', ['inga', 'martyna'], d.social);
  }
  Object.keys(MAT_LABELS).forEach((k) => {
    if (materials.includes(k)) add('materials', 'Zamów: ' + MAT_LABELS[k], req.brand || req.model ? 'Dot. ' + brandModel : '', ['inga', 'martyna']);
  });
  if (req.materialsOther) add('materials', 'Zamów: ' + req.materialsOther, '', ['inga', 'martyna']);
  if (tasks.length === 0) add('digital', 'Do ustalenia z zespołem marketingu', req.notes || '', ['karolina']);
  return tasks;
}

module.exports = { buildTasks, bm };
