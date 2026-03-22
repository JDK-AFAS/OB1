CREATE TABLE IF NOT EXISTS finance_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency    TEXT NOT NULL DEFAULT 'EUR',
  description TEXT NOT NULL,
  category    TEXT NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  tags        TEXT[] DEFAULT '{}',
  recurring   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_date_idx ON finance_entries (date DESC);
CREATE INDEX IF NOT EXISTS finance_type_idx ON finance_entries (type);
CREATE INDEX IF NOT EXISTS finance_category_idx ON finance_entries (category);

-- Maandoverzicht view
CREATE OR REPLACE VIEW finance_monthly_summary AS
SELECT
  DATE_TRUNC('month', date) AS month,
  type,
  category,
  SUM(amount)               AS total,
  COUNT(*)                  AS count
FROM finance_entries
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;
