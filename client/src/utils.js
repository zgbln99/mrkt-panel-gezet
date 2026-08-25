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

/**
 * Przepuszcza wyłącznie adresy http(s).
 *
 * Serwer odrzuca już inne schematy przy zapisie, ale ta sama kontrola po
 * stronie klienta chroni rekordy zapisane starszą wersją aplikacji: adres typu
 * `javascript:` wstawiony w atrybut href wykonałby cudzy kod w sesji osoby
 * przeglądającej panel.
 */
export function safeHref(url) {
  if (!url) return null;
  try {
    const parsed = new URL(String(url), window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
