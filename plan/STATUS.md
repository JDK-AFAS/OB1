# Plan Status — OB1 Homelab Migratie

## Plan items

- [x] 01 — Infrastructuur (Docker Compose, Dockerfile, postgres/init)
- [ ] 02 — Database schema (tabellen, indexen, SQL migrations)
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
