import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Field } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiError } from '../services/api.js';
import AuthFrame from './AuthFrame.jsx';

export default function Login() {
  const { login, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.email.trim(), form.password);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Inicia sesión" subtitle="Revisa cómo vas con tus presupuestos de este mes.">
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <form onSubmit={submit} className="form" noValidate>
        <Field label="Correo">
          <input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Contraseña">
          <input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</button>
      </form>
      <p className="auth-switch">
        ¿No tienes cuenta? <Link to="/registro">Crea una</Link>
      </p>
      <button
        type="button"
        className="link-button demo-fill"
        onClick={() => setForm({ email: 'demo@smartbudget.com', password: 'Demo12345' })}
      >
        Usar la cuenta de demostración
      </button>
    </AuthFrame>
  );
}
