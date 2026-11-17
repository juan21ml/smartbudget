import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import Alerts from './pages/Alerts.jsx';
import BudgetDetail from './pages/BudgetDetail.jsx';
import Budgets from './pages/Budgets.jsx';
import Categories from './pages/Categories.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Register from './pages/Register.jsx';
import Transactions from './pages/Transactions.jsx';

function Private({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <div className="boot">Cargando tu sesión…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function PublicOnly({ children }) {
  const { user, checking } = useAuth();
  if (checking) return <div className="boot">Cargando tu sesión…</div>;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/registro" element={<PublicOnly><Register /></PublicOnly>} />
      <Route element={<Private><AppLayout /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="movimientos" element={<Transactions />} />
        <Route path="presupuestos" element={<Budgets />} />
        <Route path="presupuestos/:id" element={<BudgetDetail />} />
        <Route path="categorias" element={<Categories />} />
        <Route path="alertas" element={<Alerts />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
