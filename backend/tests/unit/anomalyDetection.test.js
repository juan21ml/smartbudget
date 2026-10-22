import { describe, expect, it } from 'vitest';
import { detectUnusualExpense, mad, median } from '../../src/modules/alerts/anomalyDetection.js';

const pesos = (...values) => values.map((v) => v * 100);

describe('median y MAD', () => {
  it('calcula la mediana con cantidad impar y par de datos', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('calcula la desviación absoluta mediana', () => {
    // mediana 3, desviaciones |1-3|,|2-3|,|3-3|,|4-3|,|100-3| = 2,1,0,1,97 → mediana 1
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });
});

describe('detectUnusualExpense', () => {
  const history = pesos(28000, 30000, 32000, 29000, 31000, 30000, 27000, 33000);

  it('marca como atípico un gasto muy superior al habitual', () => {
    const r = detectUnusualExpense(250000 * 100, history);
    expect(r.isUnusual).toBe(true);
    expect(r.reason).toBe('ABOVE_THRESHOLD');
    expect(r.medianCents).toBe(30000 * 100);
    expect(r.ratio).toBeCloseTo(8.33, 2);
    expect(r.score).toBeGreaterThan(3.5);
  });

  it('no marca un gasto dentro del rango normal', () => {
    expect(detectUnusualExpense(34000 * 100, history).isUnusual).toBe(false);
  });

  it('no marca gastos menores que lo habitual (solo desviaciones hacia arriba)', () => {
    expect(detectUnusualExpense(1000 * 100, history).isUnusual).toBe(false);
  });

  it('no opina con menos de 5 gastos previos', () => {
    const r = detectUnusualExpense(999999 * 100, pesos(10000, 10000, 10000, 10000));
    expect(r).toMatchObject({ isUnusual: false, reason: 'INSUFFICIENT_HISTORY', historySize: 4 });
  });

  it('con historial idéntico (MAD = 0) usa la regla de "el doble de la mediana"', () => {
    const same = pesos(50000, 50000, 50000, 50000, 50000);
    expect(detectUnusualExpense(99000 * 100, same).isUnusual).toBe(false);
    expect(detectUnusualExpense(100000 * 100, same).isUnusual).toBe(true);
  });

  it('un atípico previo no "contamina" la detección (robustez de la mediana)', () => {
    const withOutlier = [...history, 400000 * 100];
    expect(detectUnusualExpense(250000 * 100, withOutlier).isUnusual).toBe(true);
  });
});
