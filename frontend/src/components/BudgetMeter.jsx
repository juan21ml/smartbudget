import { percent } from '../utils/format.js';

/**
 * Barra de consumo del presupuesto con la marca del "ritmo ideal":
 * dónde deberías ir hoy si gastaras parejo durante todo el periodo.
 * Si la barra pasa la marca, vas gastando más rápido de lo planeado.
 */
export default function BudgetMeter({ percentageUsed, status, idealPercentage, size = 'md' }) {
  const fill = Math.min(percentageUsed, 100);
  const tone = status === 'EXCEEDED' ? 'over' : status === 'WARNING' ? 'warn' : 'ok';
  const showIdeal = idealPercentage !== undefined && idealPercentage > 0 && idealPercentage < 100;
  const ahead = showIdeal && percentageUsed > idealPercentage;

  return (
    <div
      className={`meter meter--${size} meter--${tone}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(percentageUsed, 100))}
      aria-label={`${percent(percentageUsed)} consumido${showIdeal ? `; el ritmo ideal hoy es ${percent(idealPercentage)}` : ''}`}
    >
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${fill}%` }} />
        <div className="meter-limit meter-limit--80" title="80 %: aviso" />
        {showIdeal && (
          <div className={`meter-ideal ${ahead ? 'is-behind' : ''}`} style={{ left: `${idealPercentage}%` }} title={`Ritmo ideal hoy: ${percent(idealPercentage)}`} />
        )}
      </div>
    </div>
  );
}

/** % del periodo transcurrido (para la marca ideal) a partir de las fechas del presupuesto. */
export function idealFromPeriod(periodStart, periodEnd, todayIso) {
  const t = (d) => Date.parse(`${d}T00:00:00Z`) / 864e5;
  const total = t(periodEnd) - t(periodStart) + 1;
  const elapsed = Math.min(total, Math.max(0, t(todayIso) - t(periodStart) + 1));
  return (elapsed / total) * 100;
}
