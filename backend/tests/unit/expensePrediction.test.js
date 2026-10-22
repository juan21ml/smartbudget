import { describe, expect, it } from 'vitest';
import { mape, predictMonthEnd, predictionError } from '../../src/modules/predictions/expensePrediction.js';

const OCT = { periodStart: '2026-10-01', periodEnd: '2026-10-31' };

describe('predictMonthEnd', () => {
  it('runrate-v1: proyecta con el ritmo actual cuando no hay historial', () => {
    // 1.000.000 en 10 días → 100.000/día × 31 días = 3.100.000
    const r = predictMonthEnd({ ...OCT, spentToDateCents: 1_000_000_00, asOf: '2026-10-10' });
    expect(r.modelVersion).toBe('runrate-v1');
    expect(r.predicted).toBe(3_100_000);
    expect(r.remainingToSpend).toBe(2_100_000);
    expect(r.elapsedDays).toBe(10);
    expect(r.historyMonthsUsed).toBe(0);
  });

  it('blend-v1: combina ritmo actual y promedio histórico según el avance del mes', () => {
    const history = [2_000_000_00, 2_000_000_00, 2_000_000_00];
    // Día 10 de 31: peso del ritmo 10/31, peso del historial 21/31
    const r = predictMonthEnd({ ...OCT, spentToDateCents: 1_000_000_00, asOf: '2026-10-10', historyCents: history });
    const expected = (10 / 31) * 3_100_000 + (21 / 31) * 2_000_000;
    expect(r.modelVersion).toBe('blend-v1');
    expect(r.predicted).toBeCloseTo(expected, 2);
    expect(r.historicalAverage).toBe(2_000_000);
    expect(r.weights.currentPace + r.weights.history).toBeCloseTo(1, 4);
  });

  it('al último día del mes la predicción es igual a lo gastado', () => {
    const r = predictMonthEnd({
      ...OCT,
      spentToDateCents: 2_500_000_00,
      asOf: '2026-10-31',
      historyCents: [9_000_000_00, 9_000_000_00, 9_000_000_00],
    });
    expect(r.predicted).toBe(2_500_000);
  });

  it('nunca predice menos de lo ya gastado', () => {
    const r = predictMonthEnd({
      ...OCT,
      spentToDateCents: 3_000_000_00,
      asOf: '2026-10-05',
      historyCents: [100_000_00, 100_000_00, 100_000_00],
    });
    expect(r.predicted).toBeGreaterThanOrEqual(3_000_000);
  });

  it('indica baja confianza y limitaciones al inicio del mes sin historial', () => {
    const r = predictMonthEnd({ ...OCT, spentToDateCents: 50_000_00, asOf: '2026-10-02' });
    expect(r.confidence).toBe('LOW');
    expect(r.limitations.length).toBeGreaterThanOrEqual(2);
  });
});

describe('predictionError y MAPE', () => {
  it('calcula error absoluto, porcentual y dirección', () => {
    expect(predictionError(110_00, 100_00)).toEqual({ absoluteError: 10, percentageError: 10, direction: 'OVERESTIMATED' });
    expect(predictionError(90_00, 100_00).direction).toBe('UNDERESTIMATED');
    expect(predictionError(5_00, 0).percentageError).toBeNull();
  });

  it('promedia los errores porcentuales ignorando nulos', () => {
    expect(mape([10, 20, null])).toBe(15);
    expect(mape([])).toBeNull();
  });
});
