/**
 * Walidacja danych wejściowych. Publiczny formularz przyjmuje ruch z internetu
 * bez logowania, więc każde pole musi mieć twardy limit długości i typu —
 * inaczej pojedyncze żądanie potrafi zapisać w bazie setki kilobajtów śmieci.
 */

/** Przycina do stringa i ogranicza długość; nie-stringi stają się pustym stringiem. */
function str(value, maxLength = 200) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value).trim().slice(0, maxLength);
}

/** Tablica identyfikatorów ograniczona do znanego zbioru (odrzuca nieznane). */
function idList(value, allowed, maxItems = 32) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Wartość ze znanego zbioru; wszystko inne (także brak) staje się `fallback`. */
function oneOf(value, allowed, fallback = '') {
  const raw = str(value, 64);
  return allowed.has(raw) ? raw : fallback;
}

/**
 * Adres URL bezpieczny do wstawienia w atrybut href.
 *
 * Bez tego filtra handlowiec (albo ktokolwiek, kto zna adres publicznego
 * formularza) mógłby wpisać `javascript:...` jako "link do ogłoszenia", a
 * panel wyrenderowałby go jako klikalny odnośnik — czyli wykonanie cudzego
 * skryptu w sesji zalogowanego administratora. Przepuszczamy wyłącznie
 * http(s).
 */
function safeUrl(value, maxLength = 500) {
  const raw = str(value, maxLength);
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    // Użytkownicy często wklejają adres bez schematu ("www.example.pl/…").
    try {
      parsed = new URL('https://' + raw);
    } catch {
      return '';
    }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  return parsed.toString().slice(0, maxLength);
}

/** Data w formacie YYYY-MM-DD (taki wysyła <input type="date">) albo pusty string. */
function isoDate(value) {
  const raw = str(value, 10);
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const parsed = new Date(raw + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime())) return '';
  return raw;
}

module.exports = { str, idList, oneOf, safeUrl, isoDate };
