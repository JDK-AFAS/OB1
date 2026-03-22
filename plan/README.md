# Refactorplan: OB1 → Persoonlijk Homelab Platform

## Visie

OB1 wordt omgebouwd van een community-gedreven AI-geheugen template naar een **volledig zelfgehost persoonlijk platform** dat AI-geheugen combineert met gestructureerde applicaties (agenda, taken, notities, projecten, contacten, financiën, gezondheid).

Het systeem wordt volledig beheerd vanuit deze repo en aangestuurd via Claude Code (CLI) als primaire interface. Alle logica, data en compute draait op eigen hardware.

---

## Genomen architectuurbeslissingen

| Beslissing | Keuze | Reden |
|---|---|---|
| **Hosting** | Homelab (Docker Compose) | Volledige controle, geen vendor lock-in |
| **Database** | PostgreSQL 17 + pgvector | Zelfgehost, krachtig, bewezen |
| **Runtime** | Deno (behouden) | Consistentie met huidige codebase |
| **Backend framework** | Hono (behouden) | Lichtgewicht, TypeScript-native |
| **Database client** | `postgres` (direct SQL) | Vervangt Supabase client library |
| **AI provider (nu)** | OpenRouter | Overgangsperiode, geen code-wijziging nodig |
| **AI provider (toekomst)** | Ollama (selfhosted) | Volledige controle, geen externe afhankelijkheid |
| **Primaire interface** | Claude Code (CLI) via MCP | Commandline-first, geen UI nodig als MVP |
| **Frontend** | Nog niet besloten | Later bepalen na backend stabiliteit |
| **Authenticatie** | Single-user, API key | Simpelst voor persoonlijk gebruik |
| **Externe bereikbaarheid** | Cloudflare Tunnel | Gratis, veilig, geen open poorten |
| **Multi-user** | Nee (nu) | Later uitbreidbaar via schema |

---

## Applicaties die gebouwd worden

1. **Taken** — aanmaken, afvinken, prioriteit, deadlines, projectkoppeling
2. **Agenda** — events, herhalingen, locatie, dagweergave via Claude
3. **Notities / Journal** — gestructureerde notities gekoppeld aan AI-geheugen
4. **Projecten / Kanban** — projecten met kolommen en kaarten
5. **Contacten / CRM** — persoonlijk contactbeheer, interactie-log
6. **Financiën** — inkomsten, uitgaven, categorieën, maandoverzicht
7. **Gezondheid & Sport** — metingen, activiteiten, doelen, trends

---

## Wat blijft van OB1

- De `thoughts` tabel (ongewijzigd qua structuur)
- De 4 bestaande MCP tools (`capture_thought`, `search_thoughts`, `list_thoughts`, `thought_stats`)
- Het MCP protocol als primaire AI-interface
- Hono als web framework
- Deno als runtime

---

## Wat verandert

- **Supabase** → directe PostgreSQL verbinding (postgres.js)
- **Supabase Edge Functions** → Deno process in Docker container
- **OpenRouter** → abstractielaag zodat je later kunt switchen naar Ollama
- **Nieuwe tabellen** voor elke applicatie
- **Nieuwe MCP tools** voor elke applicatie (Claude kan alles beheren)
- **REST API** naast MCP (voor toekomstige frontend)

---

## Planbestanden

| Bestand | Inhoud |
|---|---|
| `01-infrastructure.md` | Docker Compose stack, services, volumes |
| `02-database-schema.md` | Alle tabellen, indexen, SQL migrations |
| `03-server-refactor.md` | Supabase → PostgreSQL, server structuur |
| `04-ai-abstraction.md` | AI provider abstractie, Ollama migratie |
| `05-mcp-tools.md` | Alle MCP tools per applicatie |
| `06-rest-api.md` | REST API endpoints per applicatie |
| `07-apps/` | Per-app gedetailleerde spec |
| `08-external-access.md` | Cloudflare Tunnel setup |
| `09-migration.md` | Stap-voor-stap migratie van huidige OB1 |

---

## Volgorde van implementatie

```
Fase 1 — Fundament
  ├─ Docker Compose opzetten (PostgreSQL + pgvector)
  ├─ Server refactor (Supabase weg, directe PG verbinding)
  └─ Bestaande 4 MCP tools werkend op nieuwe stack

Fase 2 — AI abstractie
  ├─ AI provider abstraction layer
  └─ OpenRouter als eerste implementatie (later Ollama)

Fase 3 — Applicaties (per stuk)
  ├─ Taken + Agenda (meest gebruikt)
  ├─ Notities / Journal
  ├─ Projecten / Kanban
  ├─ Contacten / CRM
  ├─ Financiën
  └─ Gezondheid & Sport

Fase 4 — Externe toegang
  └─ Cloudflare Tunnel + Claude Code MCP configuratie

Fase 5 — Frontend (later)
  └─ TBD op basis van voorkeur na fase 1-4
```
