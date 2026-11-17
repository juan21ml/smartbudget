import { useCallback, useEffect, useRef, useState } from 'react';
import { apiError } from '../services/api.js';

/**
 * Carga datos de la API y expone { data, error, loading, reload }.
 * `deps` controla cuándo se vuelve a cargar (por ejemplo, al cambiar de mes o de filtro).
 */
export function useApi(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader();
      if (id === latest.current) setState({ data, error: null, loading: false });
    } catch (err) {
      if (id === latest.current) setState({ data: null, error: apiError(err), loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
