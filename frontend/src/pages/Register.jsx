import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Field } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiError } from '../services/api.js';
import AuthFrame from './AuthFrame.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const weak = form.password && !(form.password.length >= 8 && /[a-zA-Z]/.test(form.password) && /\d/.test(form.password));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Crea tu cuenta" subtitle="Te creamos 10 categorías para que empieces a registrar de una vez.">
      <form onSubmit={submit} className="form" noValidate>
        <Field label="Nombre">
          <input autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Correo">
          <input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres, con letras y números." error={weak ? 'Usa al menos 8 caracteres con letras y números.' : null}>
          <input type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={busy || weak}>{busy ? 'Creando cuenta…' : 'Crear cuenta'}</button>
      </form>
      <p className="auth-switch">
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </p>
    </AuthFrame>
  );
}
