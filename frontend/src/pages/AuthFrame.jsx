import BudgetMeter from '../components/BudgetMeter.jsx';
import { Brand } from '../layouts/AppLayout.jsx';

/** Marco de las pantallas de login y registro: formulario + explicación del medidor. */
export default function AuthFrame({ title, subtitle, children }) {
  return (
    <div className="auth">
      <section className="auth-card">
        <Brand />
        <h1>{title}</h1>
        <p className="lead">{subtitle}</p>
        {children}
      </section>

      <aside className="auth-aside" aria-label="Cómo leer un presupuesto">
        <p className="auth-aside-title">Saber a mitad de mes si vas a llegar</p>
        <div className="auth-example">
          <div className="auth-example-row">
            <span>Alimentación</span>
            <span className="num">$ 450.000 de $ 500.000</span>
          </div>
          <BudgetMeter percentageUsed={90} status="WARNING" idealPercentage={64.5} size="lg" />
          <p className="auth-example-note">
            La línea marca dónde deberías ir hoy, día 20 de 31. Vas por encima: a este ritmo terminarías el mes en $ 697.500.
          </p>
        </div>
        <ul className="auth-points">
          <li>Avisos al llegar al 80 % y al 100 % de cada presupuesto.</li>
          <li>Detección de gastos fuera de lo normal.</li>
          <li>Reporte en Excel de cada mes.</li>
        </ul>
      </aside>
    </div>
  );
}
