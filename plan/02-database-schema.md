# Plan 02 — Database Schema

## Strategie

- De `thoughts` tabel blijft **ongewijzigd** (OB1 core contract)
- Alle app-tabellen worden toegevoegd in dezelfde PostgreSQL database
- Embedding-dimensie: **1536** (OpenRouter `text-embedding-3-small`) nu, later migratie naar 768 bij Ollama switch (zie plan 04)
- Geen user_id kolommen (single-user, later uitbreidbaar)
- Alle tabellen krijgen `created_at` en `updated_at`

---

## Migration bestanden (volgorde)

```
postgres/init/
├── 00-extensions.sql      ← pgvector, uuid-ossp
├── 01-thoughts.sql        ← bestaande OB1 core tabel (ongewijzigd)
├── 02-tasks.sql
├── 03-calendar.sql
├── 04-notes.sql
├── 05-projects.sql
├── 06-contacts.sql
├── 07-finances.sql
└── 08-health.sql
```

---

## 00-extensions.sql

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## 01-thoughts.sql (bestaande OB1 tabel — niet wijzigen)

```sql
CREATE TABLE IF NOT EXISTS thoughts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content     TEXT NOT NULL,
  embedding   vector(1536),
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS thoughts_embedding_idx
  ON thoughts USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS thoughts_metadata_idx
  ON thoughts USING gin (metadata);

CREATE INDEX IF NOT EXISTS thoughts_created_at_idx
  ON thoughts (created_at DESC);

-- Semantische zoekfunctie (ongewijzigd van OB1)
CREATE OR REPLACE FUNCTION match_thoughts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count     int   DEFAULT 10,
  filter          jsonb DEFAULT '{}'
)
RETURNS TABLE (
  id         UUID,
  content    TEXT,
  metadata   JSONB,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.content, t.metadata,
    1 - (t.embedding <=> query_embedding) AS similarity,
    t.created_at
  FROM thoughts t
  WHERE
    (filter = '{}' OR t.metadata @> filter)
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## 02-tasks.sql

```sql
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
```

**Priority waarden:**
- 1 = Urgent (vandaag)
- 2 = Hoog
- 3 = Normaal
- 4 = Laag

---

## 03-calendar.sql

```sql
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
```

**Opmerking over herhalingen:** `recurring_rule` slaat de RRULE string op. De server-laag berekent occurrences. We breiden dit later uit als het nodig is.

---

## 04-notes.sql

```sql
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
```

---

## 05-projects.sql

> **Let op:** Deze tabel wordt gerefereerd door `tasks` (project_id), dus moet vóór `tasks` aangemaakt worden. Volgorde in init scripts is belangrijk.

```sql
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
```

---

## 06-contacts.sql

```sql
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
```

---

## 07-finances.sql

```sql
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
```

**Standaard categorieën (niet afgedwongen, vrij invoerbaar):**
- Inkomen: salaris, freelance, diversen
- Uitgaven: wonen, boodschappen, vervoer, gezondheid, abonnementen, entertainment, sport, diversen

---

## 08-health.sql

```sql
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
```

**Flexibel type-systeem:** Geen vaste enum — jij bepaalt welke types je gebruikt. Voorbeelden:
- `weight` + `value=81.5` + `unit=kg`
- `sleep` + `value=7.5` + `unit=hours`
- `workout` + `value_text='5km hardlopen, 28 minuten'`
- `mood` + `value=7` + `unit=1-10`
- `steps` + `value=8420` + `unit=steps`

---

## Updated_at trigger (gedeeld voor alle tabellen)

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Voor elke tabel met updated_at:
CREATE TRIGGER thoughts_updated_at BEFORE UPDATE ON thoughts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER kanban_cards_updated_at BEFORE UPDATE ON kanban_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER finance_entries_updated_at BEFORE UPDATE ON finance_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## Volgorde init scripts (belangrijk voor foreign keys)

```
00-extensions.sql
01-thoughts.sql
05-projects.sql        ← vóór tasks (tasks.project_id FK)
02-tasks.sql
03-calendar.sql
04-notes.sql
06-contacts.sql
07-finances.sql
08-health.sql
99-triggers.sql        ← updated_at triggers voor alle tabellen
```

---

## TODO bij implementatie

- [ ] `postgres/init/` directory aanmaken met alle SQL bestanden
- [ ] Volgorde van bestanden controleren (nummering bijwerken voor FK volgorde)
- [ ] Testen: `docker compose down -v && docker compose up -d` en alle tabellen aanwezig
- [ ] pgAdmin of DBeaver verbinden voor visuele verificatie
- [ ] Testen: een testrecord in elke tabel inserteren en ophalen
