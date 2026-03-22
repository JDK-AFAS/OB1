CREATE TABLE IF NOT EXISTS events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  description     TEXT,
  location        TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ,
  all_day         BOOLEAN DEFAULT FALSE,
  recurring_rule  TEXT,
  -- RRULE string formaat (RFC 5545), bijv: "FREQ=WEEKLY;BYDAY=MO,WE,FR"
  -- NULL = niet herhalend
  tags            TEXT[] DEFAULT '{}',
  thought_id      UUID REFERENCES thoughts(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_start_idx ON events (start_at);
CREATE INDEX IF NOT EXISTS events_tags_idx ON events USING gin (tags);

-- Hulpfunctie: events in tijdsbereik
CREATE OR REPLACE FUNCTION events_in_range(
  range_start TIMESTAMPTZ,
  range_end   TIMESTAMPTZ
)
RETURNS SETOF events LANGUAGE sql AS $$
  SELECT * FROM events
  WHERE start_at BETWEEN range_start AND range_end
  ORDER BY start_at;
$$;
