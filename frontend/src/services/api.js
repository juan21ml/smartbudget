import axios from 'axios';

/**
 * Cliente HTTP de la API SmartBudget.
 * - Agrega el token JWT a cada petición.
 * - Si la API responde 401 (token vencido o revocado), cierra la sesión.
 * - Convierte los errores de la API en un mensaje legible (apiError).
 */

const TOKEN_KEY = 'smartbudget.token';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

// sessionStorage: la sesión termina al cerrar la pestaña y el token dura 1 hora.
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export const http = axios.create({ baseURL: API_URL, timeout: 60_000 });

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url ?? '';
    if (err.response?.status === 401 && !url.startsWith('/auth/login')) onUnauthorized();
    return Promise.reject(err);
  },
);

/** Mensaje legible de un error de la API. */
export function apiError(err) {
  if (!err.response) {
    return 'No se pudo conectar con la API. Si está en Render, puede estar despertando: espera unos segundos e inténtalo de nuevo.';
  }
  const e = err.response.data?.error;
  if (e?.details?.length > 1) return e.details.map((d) => d.message).join(' · ');
  return e?.message ?? `Error ${err.response.status}`;
}

const data = (p) => p.then((r) => r.data);

export const api = {
  // Autenticación
  login: (body) => data(http.post('/auth/login', body)),
  register: (body) => data(http.post('/auth/register', body)),
  logout: () => data(http.post('/auth/logout')),
  me: () => data(http.get('/auth/me')),

  // Categorías
  categories: (params) => data(http.get('/categories', { params })),
  createCategory: (body) => data(http.post('/categories', body)),
  updateCategory: (id, body) => data(http.put(`/categories/${id}`, body)),
  deleteCategory: (id) => http.delete(`/categories/${id}`),

  // Transacciones
  transactions: (params) => data(http.get('/transactions', { params })),
  createTransaction: (body) => data(http.post('/transactions', body)),
  updateTransaction: (id, body) => data(http.put(`/transactions/${id}`, body)),
  deleteTransaction: (id) => http.delete(`/transactions/${id}`),

  // Presupuestos
  budgets: (params) => data(http.get('/budgets', { params })),
  budget: (id) => data(http.get(`/budgets/${id}`)),
  createBudget: (body) => data(http.post('/budgets', body)),
  updateBudget: (id, body) => data(http.put(`/budgets/${id}`, body)),
  deleteBudget: (id) => http.delete(`/budgets/${id}`),
  analysis: (id, params) => data(http.get(`/budgets/${id}/analysis`, { params })),

  // Análisis, predicciones y alertas
  monthly: (month) => data(http.get('/analytics/monthly', { params: { month } })),
  comparison: (month) => data(http.get('/analytics/comparison', { params: { month } })),
  trend: (months = 6) => data(http.get('/analytics/trend', { params: { months } })),
  prediction: (month) => data(http.get('/predictions/expenses', { params: { month } })),
  alerts: (params) => data(http.get('/alerts', { params })),
  readAlert: (id) => data(http.patch(`/alerts/${id}/read`)),
  readAllAlerts: () => data(http.patch('/alerts/read-all')),
  deleteAlert: (id) => http.delete(`/alerts/${id}`),
};

/** Descarga un reporte Excel (la ruta exige token, por eso no basta un enlace). */
export async function downloadFile(path, params, fallbackName) {
  const res = await http.get(path, { params, responseType: 'blob' });
  const header = res.headers['content-disposition'] ?? '';
  const name = /filename="([^"]+)"/.exec(header)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
