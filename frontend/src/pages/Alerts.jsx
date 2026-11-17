import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Empty, ErrorBox, Loading, PageHeader } from '../components/ui.jsx';
import { useApi } from '../hooks/useApi.js';
import { api, apiError } from '../services/api.js';
import { timeAgo } from '../utils/format.js';

const TYPES = {
  BUDGET_WARNING: 'Llegaste al 80 %',
  BUDGET_EXCEEDED: 'Presupuesto excedido',
  UNUSUAL_EXPENSE: 'Gasto fuera de lo normal',
};

export default function Alerts() {
  const { refreshUnread } = useOutletContext();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [error, setError] = useState(null);
  const list = useApi(() => api.alerts({ limit: 50, ...(onlyUnread ? { unread: 'true' } : {}) }), [onlyUnread]);

  async function act(fn) {
    setError(null);
    try {
      await fn();
      await list.reload();
      const r = await api.alerts({ unread: 'true', limit: 1 });
      refreshUnread(r.meta.unreadCount);
    } catch (err) {
      setError(apiError(err));
    }
  }

  const unread = list.data?.meta.unreadCount ?? 0;

  return (
    <div className="page page--narrow">
      <PageHeader
        title="Alertas"
        lead="Se generan solas al registrar gastos: una vez por presupuesto al 80 % y al 100 %, y cuando un gasto se sale de tu patrón."
      >
        {unread > 0 && <button className="btn btn--ghost" onClick={() => act(api.readAllAlerts)}>Marcar todas como leídas</button>}
      </PageHeader>

      <label className="toggle">
        <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
        Ver solo las no leídas ({unread})
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading />}

      {list.data && list.data.data.length === 0 && (
        <Empty title={onlyUnread ? 'Estás al día' : 'Todavía no hay alertas'}>
          {onlyUnread ? 'No tienes alertas por leer.' : 'Aparecerán cuando un gasto acerque un presupuesto a su límite o se salga de lo normal.'}
        </Empty>
      )}

      {list.data && list.data.data.length > 0 && (
        <ul className="alert-list">
          {list.data.data.map((a) => (
            <li key={a.id} className={`alert-item alert--${a.type} ${a.read ? 'is-read' : ''}`}>
              <div className="alert-body">
                <p className="alert-type">{TYPES[a.type]}{!a.read && <span className="unread-dot" aria-label="sin leer" />}</p>
                <p>{a.message}</p>
                <p className="muted small">
                  {timeAgo(a.createdAt)}
                  {a.budgetId && <> · <Link to={`/presupuestos/${a.budgetId}`}>Ver presupuesto</Link></>}
                </p>
              </div>
              <div className="row-actions">
                {!a.read && <button className="link-button" onClick={() => act(() => api.readAlert(a.id))}>Marcar leída</button>}
                <button className="link-button danger" onClick={() => act(() => api.deleteAlert(a.id))}>Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
