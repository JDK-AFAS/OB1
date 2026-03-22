# Plan 09 — Migratie: Stap-voor-stap

## Overzicht

Dit plan beschrijft de exacte volgorde van implementatie. Elke fase is zelfstandig testbaar voordat je verder gaat.

---

## Fase 1 — Fundament (Docker + Database)

**Doel:** PostgreSQL met pgvector draait lokaal, alle tabellen aanwezig.

### Stappen

1. **Repository structuur aanmaken**
   ```
   docker-compose.yml
   .env.example
   .gitignore (updaten: .env, postgres/data/)
   postgres/init/
   server/Dockerfile
   ```

2. **SQL init scripts aanmaken** (zie plan 02)
   - Volgorde: extensions → projects → thoughts → tasks → calendar → notes → contacts → finances → health → triggers

3. **Docker Compose opstarten**
   ```bash
   cp .env.example .env
   # Vul POSTGRES_PASSWORD en MCP_ACCESS_KEY in
   docker compose up -d postgres
   docker compose logs postgres  # wacht op "ready to accept connections"
   ```

4. **Verifiëren**
   ```bash
   docker exec -it ob1-postgres psql -U ob1 -d ob1 -c "\dt"
   # Moet alle tabellen tonen
   ```

**Klaar als:** alle tabellen aanwezig, pgvector extensie actief.

---

## Fase 2 — Server Refactor (Supabase → PostgreSQL)

**Doel:** Bestaande 4 MCP tools werken op nieuwe stack zonder Supabase.

### Stappen

1. **`server/db.ts` aanmaken** — directe PostgreSQL verbinding

2. **`server/ai.ts` aanmaken** — AI provider abstractie (zie plan 04)
   - Start met OpenRouterProvider
   - OllamaProvider alvast implementeren (nog niet activeren)

3. **`server/mcp/thoughts.ts` aanmaken**
   - Kopieer bestaande 4 tools uit `index.ts`
   - Vervang `supabase.*` calls door `sql\`...\`` queries
   - Geen nieuwe functionaliteit

4. **`server/index.ts` herschrijven**
   - Verwijder Supabase import en client
   - Importeer `db.ts`, `ai.ts`, `mcp/thoughts.ts`
   - Houd Hono + auth middleware intact

5. **`server/deno.json` updaten**
   - Verwijder `@supabase/supabase-js`
   - Voeg `postgres` toe

6. **Server bouwen en testen**
   ```bash
   docker compose up -d server
   docker compose logs server  # "Listening on port 3000"

   # Test health endpoint
   curl http://localhost:3000/health

   # Test MCP (vervang KEY met jouw MCP_ACCESS_KEY)
   curl -H "x-brain-key: KEY" http://localhost:3000/mcp
   ```

**Klaar als:** alle 4 bestaande tools werken, Claude Code herkent ze.

---

## Fase 3 — Applicatie MCP tools

**Doel:** Alle apps bedienbaar via Claude Code.

Implementeer per app in deze volgorde (eenvoudigst → complexst):

### 3a — Taken
- `server/mcp/tasks.ts` — 5 tools
- Test: "Maak taak: boodschappen halen" → "Toon mijn taken" → "Vink boodschappen af"

### 3b — Agenda
- `server/mcp/calendar.ts` — 4 tools
- Test: "Maak event: tandarts maandag 10u" → "Wat staat er deze week?"

### 3c — Notities
- `server/mcp/notes.ts` — 5 tools
- Test: "Sla op als notitie: recept voor pasta" → "Toon mijn notities"

### 3d — Projecten
- `server/mcp/projects.ts` — 5 tools
- Test: "Maak project: Website redesign" → "Toon kanban bord"

### 3e — Contacten
- `server/mcp/contacts.ts` — 4 tools
- Test: "Voeg contact toe: Thomas, thomas@example.com" → "Log gesprek met Thomas"

### 3f — Financiën
- `server/mcp/finances.ts` — 3 tools
- Test: "Log uitgave: €45 boodschappen" → "Toon maandoverzicht"

### 3g — Gezondheid
- `server/mcp/health.ts` — 3 tools
- Test: "Log gewicht: 81.5 kg" → "Toon gewicht laatste 30 dagen"

**Per app werkwijze:**
```bash
# Na elke app: server herstarten
docker compose restart server

# Test in Claude Code:
# claude --mcp ob1
# > [gebruik de nieuwe tools]
```

---

## Fase 4 — REST API

**Doel:** Alle data ook via HTTP bereikbaar (voorbereiding op frontend).

1. `server/api/` directory aanmaken
2. Per resource: een Hono router bestand
3. Routes registreren in `index.ts`
4. Testen met curl:
   ```bash
   curl -H "x-brain-key: KEY" http://localhost:3000/api/tasks
   curl -H "x-brain-key: KEY" \
     -X POST http://localhost:3000/api/tasks \
     -H "Content-Type: application/json" \
     -d '{"title": "Test taak", "priority": 2}'
   ```

---

## Fase 5 — Externe toegang

**Doel:** Claude Code bereikt de server van buiten het thuisnetwerk.

1. Cloudflare Tunnel aanmaken (zie plan 08)
2. Token toevoegen aan `.env`
3. `docker compose up -d cloudflared`
4. `.mcp.json` aanmaken in repo root
5. Test van buiten thuisnetwerk:
   ```bash
   curl https://ob1.jouwnaam.com/health
   ```

---

## Fase 6 — Ollama (selfhosted LLM)

**Timing:** Doe dit nadat alle andere fases stabiel zijn.

1. Hardware beoordelen: heb je voldoende RAM/GPU?
2. Ollama container starten:
   ```bash
   docker compose --profile ollama up -d ollama
   docker exec -it ob1-ollama ollama pull nomic-embed-text
   docker exec -it ob1-ollama ollama pull llama3.1:8b
   ```
3. Testen of Ollama werkt:
   ```bash
   curl http://localhost:11434/api/embeddings \
     -d '{"model":"nomic-embed-text","prompt":"test"}'
   ```
4. Re-embedding script draaien (zie plan 04)
5. `.env` aanpassen: `AI_PROVIDER=ollama`
6. Server herstarten: `docker compose restart server`

---

## Rollback plan

**Als een fase faalt:**

- Fase 1: `docker compose down -v` en begin opnieuw
- Fase 2: `git checkout server/index.ts` — terug naar Supabase versie
- Fase 3-6: Elk bestand staat los, verwijder het problematische bestand en restart

**Database backup voor kritieke operaties:**
```bash
docker exec ob1-postgres pg_dump -U ob1 ob1 > backup-pre-migration.sql
```

---

## Checklist per fase

| Fase | Getest | Notities |
|---|---|---|
| 1 — Docker + Database | ☐ | |
| 2 — Server refactor (bestaande tools) | ☐ | |
| 3a — Taken | ☐ | |
| 3b — Agenda | ☐ | |
| 3c — Notities | ☐ | |
| 3d — Projecten | ☐ | |
| 3e — Contacten | ☐ | |
| 3f — Financiën | ☐ | |
| 3g — Gezondheid | ☐ | |
| 4 — REST API | ☐ | |
| 5 — Externe toegang | ☐ | |
| 6 — Ollama | ☐ | |
