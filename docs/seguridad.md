# Pruebas de seguridad · SmartBudget API

Archivo: `backend/tests/integration/security.test.js` (67 pruebas) más las pruebas de seguridad de `auth.test.js`.
Ejecutar: `cd backend && npx vitest run tests/integration/security.test.js`

Las mismas verificaciones, en versión para la demo, están en la carpeta **8. Seguridad** de la colección de Postman.

## 1. Autenticación (JWT)

| Prueba | Ataque que evita | Resultado esperado |
|---|---|---|
| 22 rutas privadas sin token | Acceso anónimo | 401 en todas |
| Esquema `Basic`, `Bearer` vacío, token mal formado | Cabeceras manipuladas | 401 |
| Token firmado con otro secreto | Falsificación de tokens | 401 |
| Token expirado | Reutilización de tokens viejos | 401 |
| `iss` o `aud` incorrectos | Tokens de otro sistema | 401 |
| Token con `alg: none` (sin firma) | Ataque clásico a JWT | 401 (solo se acepta HS256) |
| Token con `sub` cambiado | Suplantar a otro usuario | 401 (la firma no coincide) |
| Token después del logout | Sesión robada tras cerrar sesión | 401 (`token_version` revocado) |
| Token de una cuenta eliminada | Uso de credenciales huérfanas | 401 |
| Token tras cambiar la contraseña (`auth.test.js`) | Sesiones abiertas en otros equipos | 401; el token nuevo sí funciona |

## 2. Contraseñas

| Prueba | Resultado esperado |
|---|---|
| Se guarda con bcrypt (`$2b$…`), nunca en texto plano | Hash en la base |
| Ninguna respuesta contiene `password` ni el hash | Verificado en registro, login y perfil |
| Contraseñas débiles (`1234567`, `abcdefgh`, `12345678`) | 400 |
| Login con email inexistente vs. contraseña errónea | Mismo código y mensaje (no revela cuentas) |

## 3. Autorización: aislamiento entre usuarios (IDOR)

Alice crea una categoría, una transacción, un presupuesto y recibe una alerta. Bob, con su propio token válido, intenta acceder a ellos.

| Prueba | Resultado esperado |
|---|---|
| Bob hace GET / PUT / DELETE sobre la transacción, el presupuesto y la categoría de Alice | 404 (no se revela que existen) |
| Bob pide el análisis o el reporte Excel del presupuesto de Alice | 404 |
| Bob marca como leída o borra una alerta de Alice | 404 |
| Bob usa la categoría de Alice para crear una transacción o un presupuesto | 404 |
| Los listados y estadísticas de Bob no contienen ningún ID de Alice | Verificado |
| Tras todos los intentos, los datos de Alice siguen intactos | 200 con el monto original |

## 4. Validación de entradas e inyección

| Prueba | Resultado esperado |
|---|---|
| `' OR '1'='1' --` en el login | 400 (email inválido) |
| `'; DROP TABLE users; --` en la búsqueda | 200 sin resultados; la tabla `users` sigue existiendo |
| `%` en la búsqueda | No devuelve todo (comodín escapado) |
| `sortBy=amount; DROP TABLE users`, `order=desc; DELETE…` | 400 (lista blanca) |
| `categoryId=1' OR '1'='1`, IDs que no son UUID | 400 |
| `limit=100000`, `page=-1` | 400 |
| Enviar `userId`, `type` o `role` en el cuerpo | 400 (asignación masiva bloqueada) |
| Montos `1e15`, `"1000"`, `null`, `true` | 400 |
| JSON mal formado | 400 `INVALID_JSON`, sin stack trace |
| Cuerpo > 100 KB | 413 |
| `<script>` en la descripción | Se guarda como texto y se responde como JSON con `nosniff` |
| Descripción `=HYPERLINK(...)` en el Excel (`budgets.test.js`) | Se exporta como texto, no como fórmula |

## 5. Infraestructura HTTP

| Prueba | Resultado esperado |
|---|---|
| Más intentos de login que el límite | 429 con cabecera `Retry-After` |
| Cabeceras Helmet | `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy` |
| `X-Powered-By` | Ausente |
| `X-Request-Id` | Presente en cada respuesta |
| CORS con origen permitido | `Access-Control-Allow-Origin` correcto |
| CORS con origen no permitido | 403 sin cabecera CORS |
| Ruta inexistente | 404 con formato de error uniforme |

## 6. Controles fuera de las pruebas automáticas

- **RLS en Supabase** (migración `002`): las tablas quedan bloqueadas para la API REST pública de Supabase. Verificación: en Supabase > Table Editor cada tabla muestra "RLS enabled".
- **TLS hacia la base de datos:** `DB_SSL=true` (o `verify` con el certificado CA).
- **Dependencias:** `npm audit --omit=dev` se ejecuta en cada push en GitHub Actions.
- **Secretos:** `.env` está en `.gitignore`; la aplicación no arranca si `JWT_SECRET` tiene menos de 32 caracteres o conserva el valor de ejemplo en producción.
