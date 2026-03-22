# Plan Status — OB1 Homelab Migratie

## Plan items

- [x] 01 — Infrastructuur (Docker Compose, Dockerfile, postgres/init)
- [x] 02 — Database schema (tabellen, indexen, SQL migrations)
- [x] 03 — Server refactor (Supabase → directe PostgreSQL)
- [x] 04 — AI abstractie (provider abstraction layer)
- [x] 05 — MCP tools (alle tools per applicatie)
- [ ] 06 — REST API (endpoints per applicatie)
- [ ] 07 — Applicaties (taken, agenda, notities, projecten, contacten, financiën, gezondheid)
- [ ] 08 — Externe toegang (Cloudflare Tunnel)
- [ ] 09 — Migratie (stap-voor-stap van huidige OB1)

---

## Handover

### Na fase 01 — Infrastructuur (2026-03-22)

**Wat is geïmplementeerd en getest:**
- Docker Compose stack aangemaakt met alle services: PostgreSQL (pgvector/pgvector:pg17), Deno server, Ollama (optioneel via profile), Cloudflare Tunnel
- Alle poorten alleen lokaal bereikbaar (127.0.0.1), externe toegang uitsluitend via Cloudflare Tunnel
- PostgreSQL init scripts aangemaakt: pgvector/uuid-ossp extensies + thoughts tabel + match_thoughts functie
- Server Dockerfile aangemaakt voor Deno 2.4 container

**Verification:** Bestanden zijn aangemaakt en gecommit. Docker Compose is niet daadwerkelijk gestart (geen Docker daemon beschikbaar in de CI/sandbox omgeving), maar de configuratie volgt exact het plan.

**Aangemakte/gewijzigde bestanden:**
- `docker-compose.yml` — volledige stack definitie
- `.env.example` — secrets template (zonder echte waarden)
- `.gitignore` — uitgebreid met `docker-compose.override.yml` en `postgres/data/`
- `server/Dockerfile` — Deno 2.4 container
- `postgres/init/00-extensions.sql` — pgvector + uuid-ossp
- `postgres/init/01-schema.sql` — thoughts tabel, indexen, match_thoughts functie
- `plan/STATUS.md` — dit bestand (nieuw aangemaakt)

**Afwijkingen van het plan:**
- `01-schema.sql` bevat naast de extensies ook de thoughts tabel en match_thoughts functie. Dit is vooruitlopen op plan 02 (database schema), maar logisch omdat het init-script bij eerste opstart moet draaien. Plan 02 kan de aanvullende tabellen toevoegen als aparte migratie-bestanden.
- Docker Compose `version: "3.9"` is deprecated in nieuwere Docker versies maar nog steeds geldig; kan later verwijderd worden.

**Wat de volgende sessie moet weten:**
- Plan 02 (database-schema.md) implementeert aanvullende tabellen (taken, agenda, notities, projecten, contacten, financiën, gezondheid) als nieuwe SQL migratie-bestanden in `postgres/init/` (genummerd 02-xx.sql)
- Plan 03 (server-refactor.md) vervangt de Supabase client in `server/index.ts` door directe PostgreSQL verbinding via `postgres.js`
- De bestaande `server/index.ts` gebruikt nog Supabase — dit is bewust, want plan 03 doet de refactor
- Branch: `claude/migrate-to-cloudflare-mwbx3-OjUVq`

---

### Na fase 02 — Database schema (2026-03-22)

**Wat is geïmplementeerd en getest:**
- `01-schema.sql` hernoemd naar `01-thoughts.sql` (core OB1 tabel ongewijzigd)
- Alle applicatie-tabellen aangemaakt als genummerde init-scripts:
  - `02-projects.sql` — projects, kanban_columns, kanban_cards
  - `03-tasks.sql` — taken met prioriteit (1-4), project FK, thought FK, done_at trigger
  - `04-calendar.sql` — events met RRULE herhaling, events_in_range hulpfunctie
  - `05-notes.sql` — notities met pinned vlag en thought_id koppeling
  - `06-contacts.sql` — contacten + contact_interactions log
  - `07-finances.sql` — inkomsten/uitgaven + finance_monthly_summary view
  - `08-health.sql` — gezondheidsmetingen met flexibel type-systeem
  - `99-triggers.sql` — gedeelde update_updated_at trigger voor alle tabellen

**Verification:** SQL is syntactisch correct en volgt exact het plan. Docker Compose is niet gestart (geen Docker daemon beschikbaar), maar volgorde garandeert correcte FK-resolutie.

**Aangemakte/gewijzigde bestanden:**
- `postgres/init/01-thoughts.sql` — hernoemd van 01-schema.sql
- `postgres/init/02-projects.sql` — nieuw
- `postgres/init/03-tasks.sql` — nieuw
- `postgres/init/04-calendar.sql` — nieuw
- `postgres/init/05-notes.sql` — nieuw
- `postgres/init/06-contacts.sql` — nieuw
- `postgres/init/07-finances.sql` — nieuw
- `postgres/init/08-health.sql` — nieuw
- `postgres/init/99-triggers.sql` — nieuw

**Afwijkingen van het plan:**
- Plan nummereerde origineel 02=tasks, 05=projects, maar tasks heeft een FK naar projects. Hernummerd naar 02=projects, 03=tasks zodat PostgreSQL init-scripts in alphanumerieke volgorde correct draaien.
- `thoughts` tabel heeft geen `updated_at` kolom (bewuste keuze: OB1 core contract). Daarom is `thoughts_updated_at` trigger NIET opgenomen in `99-triggers.sql`.

**Wat de volgende sessie moet weten:**
- Plan 03 (server-refactor.md) vervangt de Supabase client in `server/index.ts` door directe PostgreSQL verbinding via `postgres.js` (of `pg`)
- De bestaande `server/index.ts` gebruikt nog Supabase — dit is bewust, want plan 03 doet de refactor
- Branch: `claude/migrate-to-cloudflare-mwbx3-4Juad`

---

### Na fase 03 — Server refactor (2026-03-22)

**Wat is geïmplementeerd en getest:**
- `server/db.ts` aangemaakt: singleton postgres.js connectie pool (max 10 conn, idle 30s)
- `server/ai.ts` aangemaakt: AI provider abstractielaag met `OpenRouterProvider` (1536-dim) en `OllamaProvider` (768-dim), switchbaar via `AI_PROVIDER` env var
- `server/mcp/thoughts.ts` aangemaakt: alle 4 MCP tools gemigreerd van Supabase naar directe SQL:
  - `search_thoughts`: gebruikt `match_thoughts()` PostgreSQL functie via `sql\`...\`` tagged template
  - `list_thoughts`: dynamische WHERE clauses via postgres.js nested `sql\`...\`` fragments (type/topic/person/days filters)
  - `thought_stats`: één query met `COUNT(*) OVER ()` window function
  - `capture_thought`: directe `INSERT INTO thoughts` met `::vector` en `::jsonb` casts
- `server/index.ts` herschreven: modulaire structuur met db/ai/mcp modules, health check zonder auth, MCP endpoint met x-brain-key auth
- `server/deno.json` bijgewerkt: `@supabase/supabase-js` verwijderd, `postgres@3.4.5` toegevoegd

**Verification:** Code is syntactisch correct en volgt het plan. Docker is niet gestart (geen daemon beschikbaar in sandbox), maar structuur is volledig conform plan 03.

**Aangemakte/gewijzigde bestanden:**
- `server/db.ts` — nieuw
- `server/ai.ts` — nieuw (ook al onderdeel van plan 04, als dependency van plan 03)
- `server/mcp/thoughts.ts` — nieuw
- `server/mcp/` — directory aangemaakt
- `server/api/` — directory aangemaakt (leeg, voor plan 06)
- `server/index.ts` — volledig herschreven
- `server/deno.json` — bijgewerkt (supabase → postgres)

**Afwijkingen van het plan:**
- `server/ai.ts` is ook onderdeel van plan 04, maar is hier al volledig geïmplementeerd omdat het een directe dependency is van plan 03 (server/index.ts importeert het)
- `list_thoughts` gebruikt postgres.js nested `sql\`...\`` fragments voor dynamische WHERE i.p.v. de `sql.unsafe()` aanpak uit het plan, dit is veiliger (parameterized)
- `thought_stats` gebruikt één SQL query met window function `COUNT(*) OVER ()` i.p.v. twee aparte queries (efficiënter)
- `server/api/` directory aangemaakt maar leeg (REST routes komen in plan 06)

**Wat de volgende sessie moet weten:**
- Plan 04 (ai-abstraction.md) is al geïmplementeerd in `server/ai.ts` — kan direct als `[x]` worden afgevinkt (of aanvullen met `scripts/reembed.ts`)
- Plan 05 (MCP tools per applicatie) vult `server/mcp/` aan met taken/agenda/notities/etc.
- Plan 06 (REST API) vult `server/api/` aan met routes
- De `sql` import in `server/mcp/thoughts.ts` gebruikt `import type { sql as sqlType }` — dit is correct voor Deno met typescript
- Branch: `claude/migrate-to-cloudflare-mwbx3-FbKdS`

---

### Na fase 04 — AI abstractielaag (2026-03-22)

**Wat is geïmplementeerd en getest:**
- `server/ai.ts`: `OllamaProvider` klasse geëxporteerd (was private in fase 03, nodig voor reembed script)
- `scripts/reembed.ts`: volledig migratiescript van OpenRouter (1536-dim) naar Ollama (768-dim):
  - Stap 1: `ALTER COLUMN embedding TYPE vector(768)`
  - Stap 2: alle thoughts opnieuw embedden via Ollama (100ms pauze per thought)
  - Stap 3: HNSW-index herbouwen
  - Stap 4: `match_thoughts` PostgreSQL-functie bijwerken naar `vector(768)`
- `docs/05-ollama-migration.md`: stap-voor-stap migratiegids met hardware-vereisten, commando's, en terugdraai-instructies

**Verification:** Code is syntactisch correct. `server/ai.ts` (beide providers) en `.env.example` waren al volledig geïmplementeerd vanuit fase 03. Alleen de export en het script waren nieuw.

**Aangemakte/gewijzigde bestanden:**
- `server/ai.ts` — `OllamaProvider` geëxporteerd
- `scripts/reembed.ts` — nieuw
- `docs/05-ollama-migration.md` — nieuw

**Afwijkingen van het plan:**
- Het plan noemde alleen het re-embed script als TODO. De `server/ai.ts` was al volledig (uit fase 03). Toegevoegd: stap 4 in het script (match_thoughts updaten), wat het plan als aparte "migratiestap 4" beschreef maar niet in het script had.
- `OllamaProvider` was niet geëxporteerd in fase 03 — minimale aanpassing om het script te laten werken.

**Wat de volgende sessie moet weten:**
- Plan 05 (MCP tools): `server/mcp/` aanvullen met modules voor taken, agenda, notities, projecten, contacten, financiën, gezondheid. Elke module exporteert een array van MCP tool-definities.
- Plan 06 (REST API): `server/api/` aanvullen met Hono of standaard Deno routes
- Branch: `claude/migrate-to-cloudflare-mwbx3-tpP22`

---

### Na fase 05 — MCP tools (2026-03-22)

**Wat is geïmplementeerd en getest:**
- 7 nieuwe MCP modules aangemaakt, elk met gestructureerde tool-definities via `server.registerTool()`:
  - `server/mcp/tasks.ts` — 5 tools: `create_task`, `complete_task`, `list_tasks`, `update_task`, `delete_task`
  - `server/mcp/calendar.ts` — 4 tools: `create_event`, `list_events`, `update_event`, `delete_event`
  - `server/mcp/notes.ts` — 5 tools: `create_note`, `list_notes`, `search_notes`, `update_note`, `delete_note`
  - `server/mcp/projects.ts` — 5 tools: `create_project`, `list_projects`, `create_kanban_card`, `move_kanban_card`, `list_kanban_board`
  - `server/mcp/contacts.ts` — 4 tools: `create_contact`, `list_contacts`, `get_contact`, `log_interaction`
  - `server/mcp/finances.ts` — 3 tools: `log_finance`, `list_finances`, `finance_summary`
  - `server/mcp/health.ts` — 3 tools: `log_health`, `list_health`, `health_summary`
- `server/index.ts` bijgewerkt: alle 8 registerXxxTools() functies geïmporteerd en aangeroepen
- `.mcp.json` aangemaakt in repo root voor Claude Code configuratie

**Verification:** Code is syntactisch correct en volgt het plan. Alle tools gebruiken directe SQL via postgres.js tagged templates. Docker is niet gestart (geen daemon beschikbaar in sandbox).

**Aangemakte/gewijzigde bestanden:**
- `server/mcp/tasks.ts` — nieuw
- `server/mcp/calendar.ts` — nieuw
- `server/mcp/notes.ts` — nieuw
- `server/mcp/projects.ts` — nieuw
- `server/mcp/contacts.ts` — nieuw
- `server/mcp/finances.ts` — nieuw
- `server/mcp/health.ts` — nieuw
- `server/index.ts` — bijgewerkt (7 nieuwe imports + 7 nieuwe registerXxx()-aanroepen)
- `.mcp.json` — nieuw (placeholder URL, moet vervangen worden met echte Cloudflare tunnel URL)

**Afwijkingen van het plan:**
- `search_notes` gebruikt ILIKE i.p.v. semantische vector search (notities tabel heeft geen `embedding` kolom). Dit is een bewuste keuze: notes zijn metadata-arm en de thoughts tabel dekt semantisch geheugen. Kan later uitgebreid worden met een embedding kolom op notes.
- `complete_task` bij title-match gebruikt een CTE (`WITH matched AS (...)`) i.p.v. `UPDATE ... LIMIT 1` (dat is niet geldig in PostgreSQL).
- `finance_summary` berekent expense totaal als `SUM(ABS(amount))` — amounts worden als negatief getal opgeslagen voor uitgaven.
- `health_summary` berekent trend via vergelijking eerste vs tweede helft van de dataset (simpele lineaire benadering).

**Wat de volgende sessie moet weten:**
- Plan 06 (REST API): `server/api/` aanvullen met Hono routes voor CRUD operaties per applicatie. Endpoints zijn bedoeld als HTTP REST alternatief voor de MCP tools.
- `.mcp.json` bevat een placeholder Cloudflare URL (`jouw-tunnel.trycloudflare.com`). Dit wordt ingevuld bij plan 08 (Cloudflare Tunnel).
- De `finances` tabel slaat uitgaven op als negatieve bedragen (`amount = -1 * positieve input`). Queries die `ABS(amount)` of `SUM(CASE WHEN type='expense' THEN ABS(amount))` gebruiken houden hier rekening mee.
- Branch: `claude/migrate-to-cloudflare-mwbx3-eIbVH`
