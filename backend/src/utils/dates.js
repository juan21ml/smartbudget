/**
 * Fechas como texto 'YYYY-MM-DD' calculadas en UTC.
 * Así un día siempre es un día, sin importar la zona horaria del servidor.
 */
const DAY_MS = 86_400_000;

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function formatDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(str, days) {
  return formatDate(parseDate(str) + days * DAY_MS);
}

/** Días entre dos fechas, ambos extremos incluidos. */
export function daysInclusive(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS) + 1;
}

export function minDate(a, b) {
  return a <= b ? a : b;
}

export function maxDate(a, b) {
  return a >= b ? a : b;
}

/** Fecha de hoy en la zona horaria indicada (por defecto America/Bogota). */
export function todayIn(timeZone) {
  // en-CA produce el formato YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Primer y último día de un mes 'YYYY-MM'. */
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const start = formatDate(Date.UTC(y, m - 1, 1));
  const end = formatDate(Date.UTC(y, m, 0));
  return { start, end };
}

export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return formatDate(Date.UTC(y, m - 2, 1)).slice(0, 7);
}

/** Valida que un string sea una fecha real (rechaza 2026-02-30). */
export function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  return formatDate(parseDate(str)) === str;
}
