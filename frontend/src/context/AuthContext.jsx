import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 'checking' mientras se valida un token guardado; luego 'ready'.
  const [state, setState] = useState(tokenStore.get() ? 'checking' : 'ready');
  const [notice, setNotice] = useState(null);

  const clear = useCallback((message) => {
    tokenStore.clear();
    setUser(null);
    setNotice(message ?? null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => clear('Tu sesión terminó. Inicia sesión de nuevo.'));
    if (!tokenStore.get()) return;
    api
      .me()
      .then((r) => setUser(r.data))
      .catch(() => clear())
      .finally(() => setState('ready'));
  }, [clear]);

  const start = useCallback((payload) => {
    tokenStore.set(payload.token);
    setUser(payload.user);
    setNotice(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      checking: state === 'checking',
      notice,
      async login(email, password) {
        start((await api.login({ email, password })).data);
      },
      async register(name, email, password) {
        start((await api.register({ name, email, password })).data);
      },
      async logout() {
        try {
          await api.logout(); // revoca el token en el servidor
        } finally {
          clear();
        }
      },
    }),
    [user, state, notice, start, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
