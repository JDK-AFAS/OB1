CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT NOT NULL,
  description  TEXT,
  done         BOOLEAN NOT NULL DEFAULT FALSE,
  done_at      TIMESTAMPTZ,
  due_date     DATE,
  priority     SMALLINT DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),
  -- 1=urgent, 2=high, 3=normal, 4=low
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  tags         TEXT[] DEFAULT '{}',
  thought_id   UUID REFERENCES thoughts(id) ON DELETE SET NULL,
  -- koppeling met AI-geheugen (optioneel)
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Taken afvinken trigger: sla done_at op
CREATE OR REPLACE FUNCTION set_done_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.done = TRUE AND OLD.done = FALSE THEN
    NEW.done_at = NOW();
  ELSIF NEW.done = FALSE THEN
    NEW.done_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_done_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_done_at();

CREATE INDEX IF NOT EXISTS tasks_done_idx ON tasks (done);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks (due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_tags_idx ON tasks USING gin (tags);
