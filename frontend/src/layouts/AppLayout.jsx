import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

const LINKS = [
  { to: '/', label: 'Resumen', end: true },
  { to: '/movimientos', label: 'Movimientos' },
  { to: '/presupuestos', label: 'Presupuestos' },
  { to: '/categorias', label: 'Categorías' },
  { to: '/alertas', label: 'Alertas', badge: true },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // Contador de alertas sin leer: se refresca al cambiar de página.
  useEffect(() => {
    api
      .alerts({ unread: 'true', limit: 1 })
      .then((r) => setUnread(r.meta.unreadCount))
      .catch(() => {});
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="shell">
      <header className="topbar">
        <Brand />
        <button className="menu-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          {menuOpen ? 'Cerrar' : 'Menú'}
        </button>
      </header>

      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <Brand />
        <nav aria-label="Principal">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">
              {l.label}
              {l.badge && unread > 0 && <span className="nav-badge" aria-label={`${unread} sin leer`}>{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <span className="sidebar-name">{user?.name}</span>
          <span className="sidebar-email">{user?.email}</span>
          <button className="link-button" onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="content" id="contenido">
        <Outlet context={{ refreshUnread: setUnread }} />
      </main>
    </div>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--ink)" />
        <rect x="7" y="18" width="18" height="5" rx="2.5" fill="var(--ok-deep)" />
        <rect x="7" y="18" width="11" height="5" rx="2.5" fill="var(--ok-soft)" />
        <rect x="17" y="9" width="2" height="16" rx="1" fill="var(--bg)" />
      </svg>
      <span>SmartBudget</span>
    </div>
  );
}
