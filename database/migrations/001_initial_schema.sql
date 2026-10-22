-- SmartBudget API · Esquema inicial
-- Compatible con PostgreSQL 13+ (Supabase usa 15+). gen_random_uuid() es nativo desde PG 13.
-- Se usan UUID como identificadores para que no se puedan adivinar ni enumerar los recursos.

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  -- Se incrementa al cerrar sesión o cambiar contraseña: invalida todos los JWT emitidos antes.
  token_version  INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

CREATE UNIQUE INDEX users_email_unique ON users (email);

-- ---------------------------------------------------------------------------
-- Categorías (cada usuario tiene las suyas)
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name        VARCHAR(60)  NOT NULL,
  type        VARCHAR(10)  NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- No se permiten dos categorías con el mismo nombre (sin distinguir mayúsculas) y tipo por usuario.
CREATE UNIQUE INDEX categories_user_name_type_unique ON categories (user_id, lower(name), type);

-- ---------------------------------------------------------------------------
-- Transacciones (ingresos y gastos)
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- RESTRICT: no se puede borrar una categoría que tenga transacciones.
  category_id  UUID           NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  type         VARCHAR(10)    NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  amount       NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  date         DATE           NOT NULL,
  description  VARCHAR(255),
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX transactions_user_date_idx     ON transactions (user_id, date DESC);
CREATE INDEX transactions_user_category_idx ON transactions (user_id, category_id, date);

-- ---------------------------------------------------------------------------
-- Presupuestos (límite de gasto por categoría y periodo)
-- ---------------------------------------------------------------------------
CREATE TABLE budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id   UUID           NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  amount_limit  NUMERIC(14, 2) NOT NULL CHECK (amount_limit > 0),
  period_start  DATE           NOT NULL,
  period_end    DATE           NOT NULL,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT budgets_valid_period CHECK (period_end >= period_start)
);

CREATE INDEX budgets_user_category_period_idx ON budgets (user_id, category_id, period_start, period_end);

-- ---------------------------------------------------------------------------
-- Alertas
-- ---------------------------------------------------------------------------
CREATE TABLE alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  budget_id   UUID          REFERENCES budgets (id) ON DELETE CASCADE,
  type        VARCHAR(30)   NOT NULL CHECK (type IN ('BUDGET_WARNING', 'BUDGET_EXCEEDED')),
  message     VARCHAR(500)  NOT NULL,
  metadata    JSONB         NOT NULL DEFAULT '{}'::jsonb,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Garantiza en la base de datos que la misma alerta no se genere dos veces
-- para el mismo presupuesto (incluso con solicitudes simultáneas).
CREATE UNIQUE INDEX alerts_budget_type_unique ON alerts (budget_id, type) WHERE budget_id IS NOT NULL;
CREATE INDEX alerts_user_created_idx ON alerts (user_id, created_at DESC);
