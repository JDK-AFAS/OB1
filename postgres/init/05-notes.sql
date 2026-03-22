CREATE TABLE IF NOT EXISTS notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT,
  content     TEXT NOT NULL,
  tags        TEXT[] DEFAULT '{}',
  pinned      BOOLEAN DEFAULT FALSE,
  thought_id  UUID REFERENCES thoughts(id) ON DELETE SET NULL,
  -- wanneer een notitie ook als thought in het AI-geheugen staat
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notes_tags_idx ON notes USING gin (tags);
CREATE INDEX IF NOT EXISTS notes_pinned_idx ON notes (pinned) WHERE pinned = TRUE;
CREATE INDEX IF NOT EXISTS notes_created_at_idx ON notes (created_at DESC);
