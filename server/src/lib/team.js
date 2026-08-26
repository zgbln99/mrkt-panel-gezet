const CATS = [
  { id: 'materials', label: '📦 Materiały do zamówienia' },
  { id: 'digital', label: '💻 Kampanie digital' },
  { id: 'video', label: '🎬 Video' },
  { id: 'foto', label: '📸 Foto' },
  { id: 'events', label: '🎪 Eventy' },
];

const TRIGGERS = [
  { id: 'new_model', t: 'Nowy model / nowość w ofercie', d: 'social, blog, foto, reels + film 4:3 na YT' },
  { id: 'financing', t: 'Rata / promocja finansowa', d: 'kampania social, Google Moja Firma, reels' },
  { id: 'clearance_stock', t: 'Wyprzedaż stanu / rocznika', d: 'kampania leadowa, reklamy social, reels' },
  { id: 'new_brand', t: 'Nowa marka / otwarcie salonu', d: 'kampania leadowa, pełny pakiet materiałów i video' },
  { id: 'test_drives', t: 'Za mało jazd testowych', d: 'kampania leadowa, Google Moja Firma z CTA' },
  { id: 'listing_promo', t: 'Promocja konkretnego ogłoszenia', d: 'wklej link — reklama social + GMF' },
  { id: 'event', t: 'Udział w evencie', d: 'flagi, oklejenie/ulotki, gadżety, social' },
  { id: 'photo_video_only', t: 'Tylko foto / video', d: 'sama sesja zdjęciowa lub materiał video — bez kampanii i publikacji' },
  { id: 'materials_only', t: 'Tylko materiały / inna potrzeba', d: 'zaznacz materiały poniżej albo opisz w uwagach' },
];

// Zakres zgłoszenia „tylko foto / video”. Bez tego wyboru zaznaczenie jednej
// opcji tworzyłoby zawsze dwa zadania — także dla osoby, która potrzebuje
// wyłącznie zdjęć albo wyłącznie filmu.
const PHOTO_VIDEO_SCOPES = [
  { id: 'both', label: 'Foto i video' },
  { id: 'foto', label: 'Tylko foto' },
  { id: 'video', label: 'Tylko video' },
];

const MATERIALS = [
  { id: 'business_cards', label: 'Wizytówki' },
  { id: 'flags', label: 'Flagi' },
  { id: 'rollups', label: 'Rollupy' },
  { id: 'wraps', label: 'Oklejenie / okleiny' },
  { id: 'leaflets', label: 'Ulotki' },
  { id: 'gadgets', label: 'Gadżety' },
];

// UWAGA: to tylko metadane (imię/rola) do wyświetlenia w UI.
// Loginy/hasła i uprawnienia admina żyją WYŁĄCZNIE w tabeli `users` w bazie
// (patrz scripts/seed.js) — ta lista nigdy nie jest źródłem prawdy dla auth.
const TEAM = [
  { id: 'piotr', name: 'Piotr', role: 'Foto' },
  { id: 'bogdan', name: 'Bogdan', role: 'Video' },
  { id: 'inga', name: 'Inga', role: 'Social / eventy / agencje' },
  { id: 'martyna', name: 'Martyna', role: 'Social / eventy / agencje' },
  { id: 'zbigniew', name: 'Zbigniew', role: 'Google Moja Firma / eventy' },
  { id: 'karolina', name: 'Karolina Lisowska-Kycia', role: 'Dyrektor Marketingu' },
];

module.exports = { CATS, TRIGGERS, MATERIALS, PHOTO_VIDEO_SCOPES, TEAM };
