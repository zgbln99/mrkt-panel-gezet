export function bm(req) {
  return [req.brand, req.model].filter(Boolean).join(' ') || 'nowa oferta';
}

export function timeAgo(iso) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'przed chwilą';
  if (m < 60) return `${m} min temu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} godz. temu`;
  const days = Math.floor(h / 24);
  return `${days} dni temu`;
}
