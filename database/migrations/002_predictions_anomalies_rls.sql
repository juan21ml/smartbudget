-- SmartBudget API · Migración 002
-- 1. Predicciones de gasto guardadas (para analizar su evolución y medir el error).
-- 2. Alertas de gasto atípico asociadas a una transacción.
-- 3. Row Level Security (RLS) para Supabase.

-- ---------------------------------------------------------------------------
-- 1. Predicciones de gasto
-- ---------------------------------------------------------------------------
CREATE TABLE expense_predictions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  period_start      DATE           NOT NULL,
  period_end        DATE           NOT NULL,
  -- Día en que se calculó: permite ver cómo cambia la estimación a lo largo del mes.
  as_of             DATE           NOT NULL,
  spent_to_date     NUMERIC(14, 2) NOT NULL CHECK (spent_to_date >= 0),
  predicted_amount  NUMERIC(14, 2) NOT NULL CHECK (predicted_amount >= 0),
  model_version     VARCHAR(30)    NOT NULL,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT expense_predictions_valid_period CHECK (period_end >= period_start),
  CONSTRAINT expense_predictions_as_of_in_period CHECK (as_of BETWEEN period_start AND period_end)
);

-- Una predicción por usuario, periodo, día y modelo (si se recalcula el mismo día se actualiza).
CREATE UNIQUE INDEX expense_predictions_unique
  ON expense_predictions (user_id, period_start, period_end, as_of, model_version);

-- ---------------------------------------------------------------------------
-- 2. Alertas de gasto atípico
-- ---------------------------------------------------------------------------
ALTER TABLE alerts
  ADD COLUMN transaction_id UUID REFERENCES transactions (id) ON DELETE CASCADE;

ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;
ALTER TABLE alerts
  ADD CONSTRAINT alerts_type_check CHECK (type IN ('BUDGET_WARNING', 'BUDGET_EXCEEDED', 'UNUSUAL_EXPENSE'));

-- Una sola alerta de gasto atípico por transacción.
CREATE UNIQUE INDEX alerts_transaction_type_unique ON alerts (transaction_id, type) WHERE transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
-- Supabase publica automáticamente las tablas del esquema "public" en su API REST
-- (PostgREST) usando la clave "anon". Activar RLS SIN políticas bloquea ese acceso:
-- nadie puede leer ni escribir estas tablas desde la API de Supabase.
-- Nuestro backend se conecta como dueño de las tablas (rol postgres), que no está
-- sujeto a RLS, así que la API de SmartBudget sigue funcionando con normalidad.
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations   ENABLE ROW LEVEL SECURITY;
