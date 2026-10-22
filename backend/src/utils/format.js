import { fromCents } from './money.js';

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 45000000 centavos → "$ 450.000" */
export function formatMoney(cents) {
  return currencyFormatter.format(fromCents(cents));
}

/** 2026-10-07 → "07/10" */
export function shortDate(str) {
  const [, m, d] = str.split('-');
  return `${d}/${m}`;
}
