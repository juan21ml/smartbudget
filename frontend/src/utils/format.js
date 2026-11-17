const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const copDecimals = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });

/** $ 450.000 (sin decimales si el monto es entero). */
export const money = (n) => (Number.isInteger(n) ? cop : copDecimals).format(n ?? 0);
export const moneyShort = (n) => `$${compact.format(n ?? 0)}`;
export const percent = (n) => `${pct.format(n ?? 0)} %`;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-11' → 'noviembre 2026' */
export function monthName(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export const monthShort = (ym) => MONTHS_SHORT[Number(ym.slice(5, 7)) - 1];

/** '2026-11-07' → '7 nov' (sin pasar por Date para evitar desfases de zona horaria). */
export function dayShort(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}
export function dateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** Fecha de hoy y mes actual en la zona horaria de Colombia. */
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}
export const currentMonth = () => today().slice(0, 7);

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function timeAgo(isoDateTime) {
  const diff = (Date.now() - new Date(isoDateTime).getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

export const STATUS = {
  OK: { label: 'Al día', tone: 'ok' },
  WARNING: { label: 'Cerca del límite', tone: 'warn' },
  EXCEEDED: { label: 'Excedido', tone: 'over' },
};
