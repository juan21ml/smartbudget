# SmartBudget · Frontend

Interfaz web en React (Vite) que consume la API SmartBudget.

## Correr en local

```bash
cd frontend
npm install
cp .env.example .env      # VITE_API_URL apunta a la API (local o Render)
npm run dev               # http://localhost:5173
```

Con la API local (`npm run dev` en `backend`) usa `VITE_API_URL=http://localhost:3000/api/v1`.
Para usar la API en la nube: `VITE_API_URL=https://smartbudget-400w.onrender.com/api/v1`.

## Pantallas

| Ruta | Qué hace |
|---|---|
| `/login`, `/registro` | Inicio de sesión y registro (JWT) |
| `/` | Resumen del mes: presupuestos con su marca de ritmo ideal, gastos por categoría, tendencia, predicción y avisos |
| `/movimientos` | CRUD de ingresos y gastos con filtros, orden y paginación |
| `/presupuestos` | CRUD de presupuestos |
| `/presupuestos/:id` | Análisis del presupuesto, desglose y descarga del Excel |
| `/categorias` | CRUD de categorías |
| `/alertas` | Alertas: marcar como leídas y eliminar |

## Estructura

```
src/
├── main.jsx · App.jsx        Arranque y rutas (las privadas exigen sesión)
├── services/api.js           Cliente Axios: token, cierre de sesión ante 401, mensajes de error
├── context/AuthContext.jsx   Sesión del usuario (login, registro, logout)
├── hooks/useApi.js           Carga de datos con estados de carga y error
├── layouts/AppLayout.jsx     Menú lateral y contador de alertas
├── components/               Medidor de presupuesto, modales, campos
├── pages/                    Una pantalla por archivo
└── utils/format.js           Pesos colombianos, fechas y meses
```

## Sesión

El token se guarda en `sessionStorage`: dura 1 hora y se borra al cerrar la pestaña.
Al cerrar sesión, la API revoca el token. Si la API responde 401, la app vuelve al login.

## Despliegue en Vercel

1. New Project → importar el repositorio → **Root Directory: `frontend`** (Vite se detecta solo).
2. Variable de entorno: `VITE_API_URL=https://smartbudget-400w.onrender.com/api/v1`.
3. Deploy. `vercel.json` hace que las rutas como `/presupuestos/123` funcionen al recargar.
4. En Render, agregar la URL de Vercel a `CORS_ORIGINS` (separada por coma).
