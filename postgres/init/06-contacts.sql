CREATE TABLE IF NOT EXISTS contacts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  company          TEXT,
  role             TEXT,
  notes            TEXT,
  tags             TEXT[] DEFAULT '{}',
  last_contact_at  DATE,
  birthday         DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Interactie log per contact
CREATE TABLE IF NOT EXISTS contact_interactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'message', 'note', 'other')),
  summary     TEXT NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  thought_id  UUID REFERENCES thoughts(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contacts_name_idx ON contacts (name);
CREATE INDEX IF NOT EXISTS contacts_tags_idx ON contacts USING gin (tags);
CREATE INDEX IF NOT EXISTS interactions_contact_idx ON contact_interactions (contact_id, date DESC);
