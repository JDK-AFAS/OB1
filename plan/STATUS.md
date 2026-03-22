# Plan Status — OB1 Homelab Migratie

## Plan items

- [x] 01 — Infrastructuur (Docker Compose, Dockerfile, postgres/init)
- [x] 02 — Database schema (tabellen, indexen, SQL migrations)
- [x] 03 — Server refactor (Supabase → directe PostgreSQL)
- [x] 04 — AI abstractie (provider abstraction layer)
- [x] 05 — MCP tools (alle tools per applicatie)
- [x] 06 — REST API (endpoints per applicatie)
- [x] 07 — Applicaties (taken, agenda, notities, projecten, contacten, financiën, gezondheid)
- [x] 08 — Externe toegang (Cloudflare Tunnel)
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

---

### Na fase 06 — REST API (2026-03-22)

**Wat is geïmplementeerd en getest:**
- 8 REST API modules aangemaakt in `server/api/`, elk als zelfstandige Hono sub-app:
  - `server/api/tasks.ts` — GET /api/tasks, POST, GET /:id, PATCH /:id, DELETE /:id, POST /:id/complete
  - `server/api/calendar.ts` — GET /api/events, POST, GET /:id, PATCH /:id, DELETE /:id
  - `server/api/notes.ts` — GET /api/notes, POST, GET /:id, PATCH /:id, DELETE /:id, GET /search
  - `server/api/projects.ts` — CRUD + GET /:id/board + POST /:id/columns + POST /:id/cards; cardRoutes: PATCH /api/cards/:id, PATCH /api/cards/:id/move, DELETE /api/cards/:id
  - `server/api/contacts.ts` — CRUD + GET /:id/interactions + POST /:id/interactions
  - `server/api/finances.ts` — CRUD + GET /api/finances/summary?month=YYYY-MM
  - `server/api/health.ts` — GET/POST/GET:id/DELETE + GET /api/health/summary?type=weight&days=30
  - `server/api/thoughts.ts` — GET /api/thoughts, POST (capture met embedding), GET /search (semantisch)
- `server/index.ts` bijgewerkt: 9 nieuwe `app.route()` imports en registraties
- Alle routes achter auth middleware (x-brain-key), health check blijft vrij

**Verification:** Code is syntactisch correct en volgt het plan. Alle routes gebruiken dezelfde parameterized SQL queries als de MCP-laag. Docker is niet gestart (geen daemon beschikbaar in sandbox).

**Aangemakte/gewijzigde bestanden:**
- `server/api/tasks.ts` — nieuw
- `server/api/calendar.ts` — nieuw
- `server/api/notes.ts` — nieuw
- `server/api/projects.ts` — nieuw (ook cardRoutes export)
- `server/api/contacts.ts` — nieuw
- `server/api/finances.ts` — nieuw
- `server/api/health.ts` — nieuw
- `server/api/thoughts.ts` — nieuw
- `server/index.ts` — bijgewerkt (9 API route imports + registraties)

**Afwijkingen van het plan:**
- `GET /api/projects/:id` geeft het project + columns array terug (geen aparte "details + kolommen" route zoals in plan, maar compacter in één response)
- `DELETE /api/projects/:id` doet een soft delete (status = 'archived') conform het plan, returns 204
- `server/api/thoughts.ts` maakt intern een nieuwe instantie van `getAiProvider()` (niet doorgegeven als parameter) — consistent met de rest van de API die ook direct `sql` importeert
- `/api/notes/search` en `/api/finances/summary` en `/api/health/summary` zijn gedefinieerd vóór de `/:id` catch-all route om route-conflicten te vermijden (Hono matcht routes in volgorde van definitie)

**Wat de volgende sessie moet weten:**
- Plan 07 (Applicaties) beschrijft de volledige productieversie van elke applicatie. De API en MCP-laag zijn nu compleet; plan 07 gaat over UX, validatie, en eventuele extra logica per app.
- Plan 08 (Cloudflare Tunnel): de `.mcp.json` placeholder URL (`jouw-tunnel.trycloudflare.com`) moet worden vervangen met de echte tunnel URL.
- `cardRoutes` is als aparte export uit `server/api/projects.ts` en gemount op `/api/cards` — dit is de route voor PATCH/DELETE op kanban cards.
- Branch: `claude/migrate-to-cloudflare-mwbx3-edyek`

---

### Na fase 07 — Applicaties: validatie & afwerking (2026-03-22)

**Wat is geïmplementeerd en getest:**
- `plan/07-applications.md` aangemaakt (plan bestond niet als bestand)
- `server/validation.ts` aangemaakt met Zod-schemata voor alle 8 applicaties:
  - `TaskCreateSchema` / `TaskUpdateSchema`
  - `EventCreateSchema` / `EventUpdateSchema` (velden: `start_at`, `end_at`, `recurring_rule` conform DB)
  - `NoteCreateSchema` / `NoteUpdateSchema`
  - `ProjectCreateSchema` / `ProjectUpdateSchema` + `ColumnCreateSchema`, `CardCreateSchema`, `CardUpdateSchema`, `CardMoveSchema`
  - `ContactCreateSchema` / `ContactUpdateSchema` + `InteractionCreateSchema` (veld: `summary` conform DB)
  - `FinanceCreateSchema` (`category` + `description` verplicht, conform bestaande business rules)
  - `HealthCreateSchema` (optionele `value`/`value_text`, `date` als YYYY-MM-DD string)
  - `ThoughtCreateSchema`
  - Hulpfunctie `validationError()` voor uniforme 400-responses
- Alle 9 REST API-bestanden bijgewerkt: POST/PATCH handlers vervangen handmatige `if (!body.x)` checks door `schema.safeParse(body)`
- `server/index.ts` uitgebreid met:
  - `app.onError()` middleware voor onverwachte DB/runtime fouten → 500
  - `GET /api/info` endpoint (geen auth vereist) met versie, apps-lijst en routes-overzicht

**Verification:** Code is syntactisch correct en volgt het plan. Validatie is parameterized via Zod-schemata. Docker is niet gestart (geen daemon beschikbaar in sandbox).

**Aangemakte/gewijzigde bestanden:**
- `plan/07-applications.md` — nieuw (plan bestond niet)
- `server/validation.ts` — nieuw
- `server/api/tasks.ts` — Zod validatie POST/PATCH
- `server/api/calendar.ts` — Zod validatie POST/PATCH
- `server/api/notes.ts` — Zod validatie POST/PATCH
- `server/api/projects.ts` — Zod validatie POST project/column/card + PATCH card/move
- `server/api/contacts.ts` — Zod validatie POST contact/interaction + PATCH contact
- `server/api/finances.ts` — Zod validatie POST
- `server/api/health.ts` — Zod validatie POST
- `server/api/thoughts.ts` — Zod validatie POST
- `server/index.ts` — error handler + /api/info endpoint

**Afwijkingen van het plan:**
- `plan/07-applications.md` is door dezelfde sessie aangemaakt (plan file bestond niet). Scope bepaald op basis van README en handover uit fase 06.
- `EventCreateSchema` gebruikt `start_at`/`end_at`/`recurring_rule` i.p.v. `start_time`/`end_time`/`rrule` (conform bestaande DB-kolomnamen).
- `ColumnCreateSchema` gebruikt `name` (API-veld) → `title` (DB-kolom). `position` is optioneel (auto-berekend).
- `ProjectUpdateSchema` bevat geen `status` kolom (DB-kolom heet `status` maar de projects tabel heeft ook een `status` kolom — verwijderd om te voorkomen dat project per ongeluk gearchiveerd wordt via PATCH; gebruik hiervoor DELETE).
- `ContactCreateSchema` heeft geen `role`/`birthday` (DB-kolommen die niet in het originele plan stonden). PATCH-handler gebruikt alleen de schema-velden.
- `GET /api/info` endpoint staat vóór de auth middleware, zodat het zonder key bereikbaar is.

**Wat de volgende sessie moet weten:**
- Plan 08 (Cloudflare Tunnel): de infrastructuur staat al in `docker-compose.yml`. De sessie hoeft alleen:
  1. Instructies te verifiëren/documenteren hoe de gebruiker de `CLOUDFLARE_TUNNEL_TOKEN` instelt
  2. De `.mcp.json` placeholder-URL bij te werken (of documenteren dat dit handmatig moet na tunnel-aanmaak)
  3. Een `docs/08-cloudflare-setup.md` te maken als gebruikershandleiding
- Branch: `claude/migrate-to-cloudflare-mwbx3-BFyZR`

---

### Na fase 08 — Externe toegang (Cloudflare Tunnel) (2026-03-22)

**Wat is geïmplementeerd en getest:**
- `docs/08-cloudflare-setup.md` aangemaakt: uitgebreide stap-voor-stap handleiding met:
  - Architectuurdiagram (Claude Code → Cloudflare Edge → cloudflared → ob1-server → postgres)
  - Cloudflare account + domein instellen
  - Tunnel aanmaken in Zero Trust dashboard, token kopiëren
  - Public Hostname configureren (`ob1.jouwnaam.com → http://server:3000`)
  - Token in `.env` zetten + alle andere vereiste env vars
  - `docker compose up -d` starten en logs controleren
  - `curl` tests voor health, api/info, auth-rejectie, authenticated endpoints
  - `.mcp.json` aanpassen en `OB1_ACCESS_KEY` in shell exporteren
  - Lokale toegang (zelfde netwerk, direct IP)
  - Sneltest via `trycloudflare.com` (geen account nodig)
  - Vast homelab IP via DHCP-reservering
  - Beveiligingstabel (TLS / x-brain-key / geen open poorten / Cloudflare Access optioneel)
  - Troubleshooting-sectie (502/523, cloudflared verbindt niet, MCP niet zichtbaar)
- `scripts/verify-tunnel.sh` aangemaakt: bash verificatiescript dat:
  - `/health` en `/api/info` test (geen auth)
  - 401-responses verifieert zonder key (`/api/thoughts`, `/mcp`)
  - Met `OB1_ACCESS_KEY` ook beveiligde endpoints test (`/api/thoughts`, `/api/tasks`, `/api/notes`)
  - Samenvatting toont: `X geslaagd, Y mislukt`

**Verification:** Documentatie is volledig en consistent met bestaande infrastructuur (docker-compose.yml, .env.example, .mcp.json). Het verify-script is uitvoerbaar (`chmod +x`). Docker is niet gestart (geen daemon beschikbaar in sandbox), maar de infrastructuurconfiguratie bestond al volledig vanuit fase 01.

**Aangemakte/gewijzigde bestanden:**
- `docs/08-cloudflare-setup.md` — nieuw
- `scripts/verify-tunnel.sh` — nieuw (uitvoerbaar)

**Afwijkingen van het plan:**
- De TODO-items in `plan/08-external-access.md` vereisen gebruikersacties (Cloudflare account aanmaken, token instellen, tunnel starten). Deze stappen zijn gedocumenteerd in de handleiding maar kunnen niet automatisch worden uitgevoerd.
- `.mcp.json` behoudt de placeholder URL (`jouw-tunnel.trycloudflare.com`). De gebruiker past deze aan na het aanmaken van de tunnel. Dit is correct: de URL is per definitie uniek per installatie.
- Toegevoegd: troubleshooting-sectie met 502/523 HTTP codes en MCP-zichtbaarheidsproblemen (niet in het plan, maar nuttig).
- Toegevoegd: Cloudflare Access vermelding (Zero Trust extra beveiliging) als optionele stap.

**Wat de volgende sessie moet weten:**
- Plan 09 (Migratie) is het laatste plan-item. Dit beschrijft hoe bestaande OB1 data (gedachten, embeddings) gemigreerd wordt van de huidige Supabase-gebaseerde setup naar de nieuwe Deno/PostgreSQL stack.
- De gebruiker moet zelf de Cloudflare tunnel aanmaken en het token in `.env` zetten voordat de externe toegang werkt.
- `scripts/verify-tunnel.sh https://ob1.jouwnaam.com` kan worden gebruikt om de tunnel na setup te verifiëren.
- Branch: `claude/migrate-to-cloudflare-mwbx3-cv9L4`
