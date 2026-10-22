# SmartBudget API

API REST de análisis de gastos y presupuestos inteligentes · Cloud Computing · Ingeniería de Sistemas
**Grupo 3:** Juan José Martínez Lotero, Fabián Esteban Guevara

Permite registrar ingresos y gastos, definir presupuestos por categoría y periodo, y **analizarlos de forma inteligente**: mide el consumo, proyecta el gasto al final del periodo, genera alertas automáticas (80 %, 100 % y gastos atípicos), estima el gasto del mes y exporta reportes en Excel.

| | |
|---|---|
| Stack | Node.js 22 · Express 5 · PostgreSQL (Supabase) · JWT · Zod · ExcelJS |
| Pruebas | Vitest + Supertest: 171 pruebas (unitarias, integración y seguridad) |
| Documentación | Swagger UI en `/api/v1/docs` · colección de Postman en `postman/` |
| Despliegue | Docker · GitHub Actions (CI) · Render + Supabase |

---

## 1. Puesta en marcha con Supabase

### 1.1 Crear la base de datos
1. Crea un proyecto en [supabase.com](https://supabase.com) y guarda la contraseña de la base de datos.
2. En el proyecto pulsa **Connect** y copia la cadena del **Session pooler** (formato `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-...pooler.supabase.com:5432/postgres`). Verifica en ese panel cuál es la cadena recomendada para tu caso; la conexión directa puede requerir IPv6.

### 1.2 Configurar y ejecutar la API
```bash
cd backend
npm install
cp .env.example .env          # pega DATABASE_URL y genera JWT_SECRET (ver comentarios del archivo)
npm run migrate               # crea las tablas en Supabase
npm run seed                  # opcional: usuario demo con 4 meses de datos
npm run dev                   # http://localhost:3000/api/v1
```

Generar un `JWT_SECRET` seguro:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Usuario demo (tras `npm run seed`): `demo@smartbudget.com` / `Demo12345`.

> **Alternativa sin Supabase:** `docker compose up --build` levanta la API y un PostgreSQL local, y aplica las migraciones automáticamente.

### 1.3 Probar con Postman
1. Importa `postman/SmartBudget.postman_collection.json` y el entorno `postman/SmartBudget-local.postman_environment.json`.
2. Selecciona el entorno **SmartBudget · Local**.
3. Ejecuta la colección completa con el **Runner** (en orden): registra un usuario, guarda el token automáticamente y recorre el CRUD, la funcionalidad especial, las alertas, los reportes y las pruebas de seguridad (95 verificaciones).
4. Para descargar un Excel usa **Send and Download** en las peticiones de reporte.

> El login/registro tiene un límite de intentos por IP. Para ejecutar la colección varias veces seguidas en desarrollo, pon `AUTH_RATE_LIMIT_MAX=100` en tu `.env`.

---

## 2. Endpoints

Prefijo `/api/v1`. Todas las rutas, excepto `health`, `auth/register` y `auth/login`, requieren `Authorization: Bearer <token>`.

| Operación | Método y ruta |
|---|---|
| Estado | `GET /health` |
| **Login y token JWT** | `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` |
| Perfil | `GET /users/me` · `PATCH /users/me` · `PATCH /users/me/password` · `DELETE /users/me` |
| **Crear registros** | `POST /categories` · `POST /transactions` · `POST /budgets` |
| **Listar y consultar por ID** | `GET /categories[/:id]` · `GET /transactions[/:id]` · `GET /budgets[/:id]` |
| **Actualizar** | `PUT /categories/:id` · `PUT /transactions/:id` · `PUT /budgets/:id` |
| **Eliminar** | `DELETE /categories/:id` · `DELETE /transactions/:id` · `DELETE /budgets/:id` |
| **Funcionalidad especial** | `GET /budgets/:id/analysis` · `GET /budgets/:id/report` (Excel) · `GET /reports/monthly` (Excel) |
| Alertas | `GET /alerts` · `PATCH /alerts/:id/read` · `PATCH /alerts/read-all` · `DELETE /alerts/:id` |
| Estadísticas | `GET /analytics/monthly` · `/analytics/categories` · `/analytics/comparison` · `/analytics/trend` |
| Predicciones | `GET /predictions/expenses` · `GET /predictions/accuracy` |

`GET /transactions` admite filtros `type`, `categoryId`, `from`, `to`, `minAmount`, `maxAmount`, `search`, orden `sortBy` (`date|amount|createdAt`) y `order`, y paginación `page`/`limit` (máx. 100). La respuesta incluye los totales del filtro.

Detalle completo de cada ruta, con ejemplos: **Swagger UI en `/api/v1/docs`**.

---

## 3. Funcionalidad especial: análisis inteligente del presupuesto

### Entrada
Un presupuesto (`POST /budgets`) y los gastos de su categoría en el periodo:
```json
{ "categoryId": "<uuid de Alimentación>", "amountLimit": 500000, "month": "2026-10" }
```
`GET /budgets/:id/analysis?groupBy=day|week|month&asOf=2026-10-20` (`asOf` es la fecha de referencia; por defecto, hoy).

### Reglas
| Cálculo | Fórmula |
|---|---|
| Gastado | Suma de gastos de la categoría dentro del periodo |
| Disponible | límite − gastado |
| % consumido | gastado ÷ límite × 100 |
| Estado | `OK` < 80 % · `WARNING` 80–99,99 % · `EXCEEDED` ≥ 100 % |
| Promedio diario | gastado ÷ días transcurridos |
| Proyección al cierre | promedio diario × días del periodo |
| Gasto diario recomendado | disponible ÷ días restantes |
| Fecha de agotamiento | hoy + disponible ÷ promedio diario (si cae dentro del periodo) |
| Desglose | gasto por día, semana o mes, con % del límite |

Todas las operaciones usan **centavos enteros**: `0.1 + 0.2` da exactamente `0.3`.

### Caso de referencia (verificable)
Límite **$500.000**, gastos **$150.000 + $200.000 + $100.000**, analizado el 20/10/2026:

| Resultado | Valor |
|---|---|
| Gastado / disponible | $450.000 / $50.000 |
| % consumido · estado | 90 % · `WARNING` |
| Promedio diario · proyección | $22.500 · $697.500 → `EXCEEDED` proyectado |
| Alerta generada | `BUDGET_WARNING` (al registrar el tercer gasto) |
| Mensajes | "Has consumido el 90% del presupuesto de Alimentación…", "A este ritmo gastarás $697.500…" |

### Alertas automáticas
- **80 % y 100 %** del presupuesto, generadas al registrar o editar un gasto y al crear o editar el presupuesto. La respuesta de `POST /transactions` incluye las alertas nuevas en `alerts`.
- **Sin duplicados:** un índice único en la base (`budget_id, type`) y `ON CONFLICT DO NOTHING` garantizan una sola alerta por condición, incluso con solicitudes simultáneas.
- **Gasto atípico (`UNUSUAL_EXPENSE`):** compara el gasto con los últimos gastos de la categoría usando la **mediana y la MAD** (puntaje Z modificado > 3,5 y al menos 1,5 veces la mediana; mínimo 5 gastos de historial). Se usa la mediana porque un gasto extremo no la distorsiona, a diferencia del promedio.

### Reportes Excel
| Reporte | Hojas |
|---|---|
| `GET /budgets/:id/report` | Resumen (con semáforo) · Desglose · Movimientos · Alertas |
| `GET /reports/monthly?month=2026-10` | Resumen · Por categoría · Presupuestos · Movimientos · Alertas |

Los totales son **fórmulas reales de Excel** (`SUM`, `SUMIF`, `IF`) con el resultado precalculado, así que se pueden auditar en Excel. Los textos del usuario se protegen contra la inyección de fórmulas (`=`, `+`, `-`, `@`).

### Predicción del gasto del mes
`GET /predictions/expenses?month=2026-10`
- `runrate-v1`: ritmo de gasto actual × días del mes.
- `blend-v1` (con ≥ 3 meses de historial): combina el ritmo actual con el promedio histórico; el peso del ritmo crece con el avance del mes.
- Cada cálculo se guarda (uno por día) para ver la **evolución**; en un mes terminado se compara con el gasto real (**error porcentual y MAPE**). `GET /predictions/accuracy` resume la precisión de los últimos meses.
- La respuesta indica la confianza (`LOW`/`MEDIUM`/`HIGH`) y las limitaciones de los datos.

### Errores
Formato único: `{ "error": { "code", "message", "details", "requestId" } }`

| Caso | Código | Mensaje |
|---|---|---|
| Monto ≤ 0 | 400 | `Ingrese un monto positivo` |
| Faltan campos | 400 | `details` lista cada campo |
| Fecha final antes de la inicial | 400 | `La fecha final debe ser igual o posterior a la fecha inicial` |
| Sin token / token inválido, expirado o revocado | 401 | `Token de autenticación requerido`, `Token inválido`… |
| Recurso inexistente o de otro usuario | 404 | `Presupuesto no encontrado` |
| Email repetido, presupuesto solapado, categoría en uso | 409 | Mensaje específico |
| Demasiados intentos de login | 429 | `Demasiados intentos…` |
| Presupuesto sin gastos | 200 | Aviso `NO_EXPENSES` en `messages` |

---

## 4. Seguridad

| Control | Implementación |
|---|---|
| Contraseñas | Hash bcrypt (12 rondas); mínimo 8 caracteres con letras y números; nunca se devuelven |
| JWT | HS256 fijo (bloquea `alg: none`), expiración, emisor y audiencia verificados |
| Cierre de sesión real | `token_version` en la base: logout, cambio de contraseña o borrado de cuenta revocan los tokens anteriores |
| Aislamiento de usuarios | Todas las consultas filtran por `user_id`; recursos ajenos responden 404 (no se revela su existencia) |
| IDs | UUID: no se pueden adivinar ni enumerar |
| Validación | Zod en body, query y params; objetos `strict` (impide asignación masiva de `userId`, `type`, `role`…) |
| Inyección SQL | Consultas parametrizadas; columnas de orden por lista blanca; `%` y `_` escapados en búsquedas |
| Fuerza bruta | Rate limit en login/registro y límite global |
| Enumeración de cuentas | Mismo mensaje y tiempo de respuesta si el email no existe o la contraseña falla |
| Cabeceras HTTP | Helmet (CSP, HSTS, nosniff, frame-options); sin `X-Powered-By` |
| CORS | Solo orígenes de `CORS_ORIGINS` |
| Errores | Sin stack traces ni mensajes internos de PostgreSQL; `requestId` para trazabilidad |
| Logs | JSON estructurado (pino); se ocultan `Authorization` y contraseñas |
| Supabase | RLS activado en todas las tablas: la API REST pública de Supabase no puede leerlas |
| Conexión a BD | TLS (`DB_SSL=true`, o `verify` con certificado CA) |
| Secretos | Solo en variables de entorno; la app no arranca sin `JWT_SECRET` de 32+ caracteres |
| Excel | Protección contra inyección de fórmulas |

El detalle de cada prueba de seguridad está en [`docs/seguridad.md`](docs/seguridad.md).

---

## 5. Pruebas

```bash
cd backend
npm test                  # todas (171)
npm run test:unit         # cálculos puros, sin base de datos
npm run test:integration  # API completa contra PostgreSQL
npm run test:coverage     # con cobertura
```

| Archivo | Qué prueba |
|---|---|
| `tests/unit/budgetAnalysis.test.js` | Umbrales, proyección, desglose, mensajes del análisis |
| `tests/unit/anomalyDetection.test.js` | Mediana, MAD y detección de gastos atípicos |
| `tests/unit/expensePrediction.test.js` | Modelos de predicción, error y MAPE |
| `tests/unit/utils.test.js` | Dinero en centavos y fechas |
| `tests/integration/auth.test.js` | Registro, login, logout, perfil, cambio de contraseña, borrado de cuenta |
| `tests/integration/crud.test.js` | CRUD de categorías y transacciones, filtros, paginación, persistencia |
| `tests/integration/budgets.test.js` | CRUD de presupuestos, análisis, alertas sin duplicados, gasto atípico, Excel |
| `tests/integration/analytics.test.js` | Estadísticas y predicciones |
| `tests/integration/security.test.js` | 67 pruebas de seguridad (ver `docs/seguridad.md`) |

**Base de datos de pruebas:** las pruebas de integración **borran y recrean las tablas**, así que necesitan una base exclusiva cuya URL contenga `test`. Nunca uses la base de Supabase de producción. Lo más simple es PostgreSQL local con Docker:
```bash
docker compose up -d db
docker compose exec db createdb -U smartbudget smartbudget_test
cp .env.test.example .env.test   # TEST_DATABASE_URL=postgresql://smartbudget:smartbudget@localhost:5432/smartbudget_test
npm test
```
GitHub Actions ejecuta la suite completa en cada push (`.github/workflows/ci.yml`).

---

## 6. Despliegue

| Componente | Servicio | Notas |
|---|---|---|
| Base de datos | Supabase | `npm run migrate` con la `DATABASE_URL` de Supabase |
| Backend | Render (Web Service, Docker) | Dockerfile `backend/Dockerfile`, contexto: raíz del repo |
| CI | GitHub Actions | Pruebas en cada push |

Variables de entorno en Render: `NODE_ENV=production`, `DATABASE_URL`, `DB_SSL=true`, `JWT_SECRET`, `CORS_ORIGINS`, `TRUST_PROXY=1` (Render pone un proxy delante; sin esto el rate limit no ve la IP real). El contenedor aplica las migraciones pendientes al arrancar.

Antes de desplegar, revisa las condiciones actuales del plan gratuito de Render y de Supabase (por ejemplo, suspensión por inactividad, que hace lenta la primera petición de la demo).

---

## 7. Arquitectura

Monolito modular: cada módulo tiene rutas, esquemas de validación y servicio. La lógica de cálculo está en **funciones puras** sin base de datos, que es lo que se prueba con casos exactos:

```
backend/src/
├── app.js · server.js            Aplicación Express y arranque
├── config/                       Variables de entorno (validadas) y logger
├── database/                     Pool de conexiones, migrador y datos demo
├── middlewares/                  JWT, validación Zod, rate limit, errores
├── modules/
│   ├── auth · users              Registro, login, sesión, perfil
│   ├── categories · transactions CRUD
│   ├── budgets/
│   │   └── budgetAnalysis.js     ★ Análisis del presupuesto (función pura)
│   ├── alerts/
│   │   └── anomalyDetection.js   ★ Detección de gastos atípicos (función pura)
│   ├── predictions/
│   │   └── expensePrediction.js  ★ Predicción del gasto (función pura)
│   ├── analytics · reports       Estadísticas y Excel
│   └── health
├── docs/openapi.yaml             Especificación OpenAPI (Swagger)
└── utils/                        Dinero en centavos, fechas, esquemas comunes
database/migrations/              Esquema SQL versionado
postman/                          Colección y entornos de Postman
```

### Modelo de datos
`users` → `categories` → `transactions` · `budgets` → `alerts` · `expense_predictions`
Montos en `NUMERIC(14,2)`, fechas `DATE`, IDs `UUID`, claves foráneas con índices y restricciones `CHECK` (montos positivos, periodos válidos).
