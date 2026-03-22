CREATE TABLE IF NOT EXISTS health_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        TEXT NOT NULL,
  -- Voorbeelden: 'weight', 'sleep', 'steps', 'workout', 'blood_pressure',
  -- 'mood', 'water', 'custom' — vrij uitbreidbaar
  value       NUMERIC,
  value_text  TEXT,
  -- gebruik value voor meetwaarden, value_text voor beschrijvingen
  unit        TEXT,
  notes       TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  time_of_day TIME,
  tags        TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS health_type_date_idx ON health_entries (type, date DESC);
CREATE INDEX IF NOT EXISTS health_date_idx ON health_entries (date DESC);
