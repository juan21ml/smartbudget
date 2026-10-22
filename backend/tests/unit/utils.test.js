import { describe, expect, it } from 'vitest';
import { daysInclusive, isValidDate, monthRange, previousMonth } from '../../src/utils/dates.js';
import { centsToDb, fromCents, percentage, toCents } from '../../src/utils/money.js';
import { safeFilename, safeText } from '../../src/modules/reports/excelStyles.js';

describe('money', () => {
  it('convierte texto de PostgreSQL a centavos', () => {
    expect(toCents('450000.50')).toBe(45000050);
    expect(toCents('0.5')).toBe(50);
    expect(toCents('12')).toBe(1200);
    expect(toCents(19.99)).toBe(1999);
  });

  it('convierte centavos a decimal y a texto para la BD', () => {
    expect(fromCents(45000050)).toBe(450000.5);
    expect(centsToDb(45000050)).toBe('450000.50');
    expect(centsToDb(-5)).toBe('-0.05');
  });

  it('rechaza montos mal formados', () => {
    expect(() => toCents('12,50')).toThrow();
    expect(() => toCents('abc')).toThrow();
  });

  it('calcula porcentajes con 2 decimales y sin dividir por cero', () => {
    expect(percentage(1, 3)).toBe(33.33);
    expect(percentage(5, 0)).toBe(0);
  });
});

describe('dates', () => {
  it('valida fechas reales', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('20-10-2026')).toBe(false);
  });

  it('calcula rangos de mes, incluido febrero bisiesto', () => {
    expect(monthRange('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(daysInclusive('2026-10-01', '2026-10-31')).toBe(31);
  });
});

describe('seguridad de reportes Excel', () => {
  it('neutraliza textos que Excel interpretaría como fórmulas', () => {
    expect(safeText('=HYPERLINK("http://malo")')).toBe('\'=HYPERLINK("http://malo")');
    expect(safeText('+57 300')).toBe("'+57 300");
    expect(safeText('Mercado')).toBe('Mercado');
  });

  it('genera nombres de archivo seguros para el encabezado HTTP', () => {
    expect(safeFilename('presupuesto', 'Alimentación "x"\r\n', '2026-10-01')).toBe('presupuesto-alimentacion-x-2026-10-01');
  });
});
