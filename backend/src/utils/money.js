/**
 * Utilidades monetarias.
 *
 * PostgreSQL guarda los montos como NUMERIC(14,2) y el driver los entrega como texto
 * ("450000.50"). Para calcular sin errores de punto flotante (0.1 + 0.2 !== 0.3)
 * se trabaja con centavos enteros y solo al final se convierte a decimal.
 * El máximo de NUMERIC(14,2) (≈ 10^14 centavos) está por debajo de Number.MAX_SAFE_INTEGER.
 */

/** Convierte "450000.50" | 450000.5 a 45000050 centavos. */
export function toCents(value) {
  if (value === null || value === undefined) return 0;
  const str = typeof value === 'number' ? value.toFixed(2) : String(value).trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(str);
  if (!match) throw new Error(`Monto inválido: ${value}`);
  const [, sign, intPart, decPart = ''] = match;
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'));
  return sign ? -cents : cents;
}

/** Convierte centavos enteros a número decimal con 2 cifras (para JSON). */
export function fromCents(cents) {
  return Math.round(cents) / 100;
}

/** Convierte centavos a texto para enviar a PostgreSQL ("450000.50"). */
export function centsToDb(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Porcentaje con 2 decimales. Devuelve 0 si el total es 0. */
export function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 10000) / 100;
}
