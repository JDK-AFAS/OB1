# Plan Status — OB1 Homelab Migratie

## Plan items

- [x] 01 — Infrastructuur (Docker Compose, Dockerfile, postgres/init)
- [x] 02 — Database schema (tabellen, indexen, SQL migrations)
- [ ] 03 — Server refactor (Supabase → directe PostgreSQL)
- [ ] 04 — AI abstractie (provider abstraction layer)
- [ ] 05 — MCP tools (alle tools per applicatie)
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
