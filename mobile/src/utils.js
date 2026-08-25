export function bm(req) {
  return [req.brand, req.model].filter(Boolean).join(' ') || 'nowa oferta';
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'przed chwilą';
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} godz. temu`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `${days} dni temu`;
  return new Date(iso).toLocaleDateString('pl-PL');
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pl-PL');
}

/** Wpuszczamy do przeglądarki wyłącznie adresy http(s) — patrz komentarz w wersji webowej. */
export function safeUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  return /^https?:\/\//i.test(raw) ? raw : null;
}

export function nameOf(team, id) {
  const person = team.find((t) => t.id === id);
  return person ? person.name : id;
}
