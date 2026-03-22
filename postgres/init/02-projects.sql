CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  color       TEXT DEFAULT '#6366f1',  -- hex kleur voor visuele herkenning
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Kanban kolommen per project
CREATE TABLE IF NOT EXISTS kanban_columns (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  position    SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Kanban kaarten
CREATE TABLE IF NOT EXISTS kanban_cards (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  column_id   UUID NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  position    SMALLINT NOT NULL DEFAULT 0,
  done        BOOLEAN DEFAULT FALSE,
  due_date    DATE,
  tags        TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);
CREATE INDEX IF NOT EXISTS kanban_columns_project_idx ON kanban_columns (project_id, position);
CREATE INDEX IF NOT EXISTS kanban_cards_column_idx ON kanban_cards (column_id, position);
