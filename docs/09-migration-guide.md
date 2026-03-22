# OB1 Migratie: Supabase → Homelab (Cloudflare Tunnel)

Deze gids beschrijft de volledige migratie van je bestaande OB1-setup (Supabase + remote MCP) naar de nieuwe homelab-stack (Docker + PostgreSQL + Cloudflare Tunnel).

---

## Overzicht: Wat gaat er veranderen?

| Onderdeel | Oud (Supabase) | Nieuw (Homelab) |
|---|---|---|
| Database | Supabase PostgreSQL (cloud) | PostgreSQL 17 + pgvector (lokaal Docker) |
| Embeddings | OpenRouter API | OpenRouter (default) of Ollama (selfhosted) |
| MCP server | Supabase Edge Function | Deno server in Docker container |
| Externe toegang | Supabase URL | Cloudflare Tunnel (eigen domein) |
| Auth | Supabase anon key | x-brain-key (eigen secret) |

**Data die gemigreerd wordt:** de `thoughts` tabel (inhoud + vector embeddings).
**Nieuwe data** (taken, agenda, notities, etc.) start leeg — dat is bedoeld.

---

## Vereisten

- [ ] Docker Desktop of Docker Engine geïnstalleerd
- [ ] Git repository gekloond (`git clone https://github.com/JDK-AFAS/OB1`)
- [ ] Cloudflare account + domein (voor externe toegang)
- [ ] Supabase database-URL (voor data-export)
- [ ] Deno geïnstalleerd (voor het migratiescript, alleen eenmalig)

---

## Fase 1 — Nieuwe stack opstarten

### 1.1 — Configuratie

```bash
cd OB1
cp .env.example .env
```

Open `.env` en vul in:

```env
POSTGRES_PASSWORD=kies_een_sterk_wachtwoord
MCP_ACCESS_KEY=kies_een_lange_random_string
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
CLOUDFLARE_TUNNEL_TOKEN=  # later invullen
```

Genereer een willekeurige sleutel:
```bash
openssl rand -hex 32
```

### 1.2 — Database en server starten

```bash
docker compose up -d postgres
# Wacht tot postgres klaar is (ca. 30 seconden)
docker compose logs postgres | grep "ready to accept"

docker compose up -d server
docker compose logs server | grep "Listening"
```

### 1.3 — Verifieer alle tabellen

```bash
docker exec -it ob1-postgres psql -U ob1 -d ob1 -c "\dt"
```

Verwachte output (9 tabellen):
```
 Schema |         Name          | Type  | Owner
--------+-----------------------+-------+-------
 public | contact_interactions  | table | ob1
 public | contacts              | table | ob1
 public | events                | table | ob1
 public | finance_entries       | table | ob1
 public | health_entries        | table | ob1
 public | kanban_cards          | table | ob1
 public | kanban_columns        | table | ob1
 public | notes                 | table | ob1
 public | projects              | table | ob1
 public | tasks                 | table | ob1
 public | thoughts              | table | ob1
```

### 1.4 — Health check

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}

curl http://localhost:3000/api/info
# → {"version":"1.0.0","apps":[...],"routes":[...]}
```

✅ **Fase 1 klaar** als alle tabellen zichtbaar zijn en de health check antwoordt.

---

## Fase 2 — Data migreren vanuit Supabase

### 2.1 — Supabase database-URL ophalen

Ga naar [app.supabase.com](https://app.supabase.com) → jouw project → **Settings → Database → Connection string → URI**.

Kopieer de URI met `[YOUR-PASSWORD]` vervangen door jouw database-wachtwoord:
```
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### 2.2 — Migratiescript uitvoeren

```bash
# Volledig (export + import in één stap):
SUPABASE_DB_URL="postgresql://postgres:WACHTWOORD@db.XXXX.supabase.co:5432/postgres" \
DATABASE_URL="postgresql://ob1:WACHTWOORD@localhost:5432/ob1" \
deno run --allow-net --allow-env --allow-read --allow-write \
  scripts/export-from-supabase.ts
```

Het script toont de voortgang:
```
═══════════════════════════════════════════════════════════════
  OB1 Migratie: Supabase → lokale PostgreSQL
═══════════════════════════════════════════════════════════════
🔗 Verbinding maken met Supabase...
📊 247 thoughts gevonden in Supabase.
  ✓ 247 / 247 geëxporteerd
✅ Export compleet: 247 thoughts
💾 Exportbestand opgeslagen: thoughts-export.json (1.2 MB)
🔗 Verbinding maken met lokale PostgreSQL...
  ✓ 100 / 247 verwerkt
  ✓ 200 / 247 verwerkt
  ✓ 247 / 247 verwerkt
✅ Import compleet: 247 geïmporteerd, 0 overgeslagen (al aanwezig)
🔨 HNSW index herbouwen voor optimale search performance...
✅ Index herbouwd.
```

### 2.3 — Verificeer de migratie

```bash
# Tel thoughts in lokale database
docker exec -it ob1-postgres psql -U ob1 -d ob1 \
  -c "SELECT COUNT(*) FROM thoughts;"

# Test semantische search via API
curl -H "x-brain-key: JOUW_MCP_ACCESS_KEY" \
  "http://localhost:3000/api/thoughts/search?q=test&limit=3"
```

### 2.4 — Opgesplitst uitvoeren (alternatief)

Als je de export en import apart wilt doen (bijv. bij netwerkstoringen):

```bash
# Stap A: Exporteer naar JSON-bestand
SUPABASE_DB_URL="..." deno run --allow-net --allow-env --allow-write \
  scripts/export-from-supabase.ts --export-only
# → thoughts-export.json aangemaakt

# Stap B: Importeer vanuit JSON-bestand
DATABASE_URL="postgresql://ob1:WACHTWOORD@localhost:5432/ob1" \
deno run --allow-net --allow-env --allow-read \
  scripts/export-from-supabase.ts --import-only
```

✅ **Fase 2 klaar** als het aantal thoughts in lokale DB overeenkomt met Supabase.

---

## Fase 3 — Cloudflare Tunnel instellen

Zie `docs/08-cloudflare-setup.md` voor de volledige instructies.

Samenvatting:
1. Ga naar [dash.cloudflare.com](https://dash.cloudflare.com) → Zero Trust → Networks → Tunnels
2. Maak een nieuwe tunnel aan, kopieer het token
3. Voeg toe aan `.env`: `CLOUDFLARE_TUNNEL_TOKEN=eyJ...`
4. Start de tunnel: `docker compose up -d cloudflared`
5. Configureer Public Hostname: `ob1.jouwnaam.com → http://server:3000`

Verificatie:
```bash
scripts/verify-tunnel.sh https://ob1.jouwnaam.com
```

✅ **Fase 3 klaar** als alle checks in het verificatiescript slagen.

---

## Fase 4 — Claude Code configureren

### 4.1 — .mcp.json bijwerken

Pas de URL aan in `.mcp.json`:
```json
{
  "mcpServers": {
    "ob1": {
      "type": "http",
      "url": "https://ob1.jouwnaam.com/mcp",
      "headers": {
        "x-brain-key": "${OB1_ACCESS_KEY}"
      }
    }
  }
}
```

### 4.2 — Environment variable instellen

```bash
# Voeg toe aan ~/.bashrc of ~/.zshrc:
export OB1_ACCESS_KEY="jouw_mcp_access_key"
```

Herlaad je shell:
```bash
source ~/.bashrc
```

### 4.3 — Test in Claude Code

Start een nieuwe Claude Code sessie. Verifieer dat de tools beschikbaar zijn:
```
> Toon mijn gedachten van de laatste week
> Maak een nieuwe taak: groceries
> Wat staat er in mijn agenda deze week?
```

✅ **Fase 4 klaar** als Claude Code de MCP-tools kan aanroepen en data terugkrijgt.

---

## Fase 5 — Ollama instellen (optioneel, selfhosted AI)

Doe dit nadat alle andere fases stabiel zijn. Vereist: minimaal 8 GB RAM.

Zie `docs/05-ollama-migration.md` voor de volledige handleiding.

Samenvatting:
```bash
# Ollama container starten
docker compose --profile ollama up -d ollama

# Modellen downloaden
docker exec -it ob1-ollama ollama pull nomic-embed-text
docker exec -it ob1-ollama ollama pull llama3.1:8b

# Re-embedding draaien (converteert 1536-dim naar 768-dim vectors)
OLLAMA_BASE_URL=http://localhost:11434 \
DATABASE_URL="postgresql://ob1:WACHTWOORD@localhost:5432/ob1" \
deno run --allow-net --allow-env scripts/reembed.ts

# Activeren
# In .env: AI_PROVIDER=ollama
docker compose restart server
```

✅ **Fase 5 klaar** als `capture_thought` embeddings genereert zonder OpenRouter API-kosten.

---

## Rollback

Als iets misgaat kun je altijd terugvallen op Supabase:

```bash
# Stop de nieuwe stack
docker compose down

# Ga terug naar de oude server/index.ts (met Supabase)
git checkout main -- server/index.ts server/deno.json
```

Je Supabase-data is niet aangeraakt door de migratie.

---

## Veelvoorkomende problemen

### "SUPABASE_DB_URL is niet ingesteld"
Controleer of je de omgevingsvariabele correct hebt ingesteld. Exporteer hem inline vóór het commando, niet in een aparte shell-sessie.

### "pgvector extensie niet gevonden"
De postgres container is niet volledig opgestart. Wacht 30 seconden en probeer opnieuw:
```bash
docker compose logs postgres | tail -5
```

### "Tabel 'thoughts' niet gevonden in Supabase"
Controleer of je de juiste Supabase URL gebruikt (met het correcte wachtwoord en project-ID).

### Embeddings worden niet meegenomen
Het migratiescript kopieert embeddings als tekst (bijv. `[0.1, 0.2, ...]`). Als ze `null` zijn in Supabase, worden ze ook `null` geïmporteerd — dat is normaal als je OpenRouter gebruikt en nog niet alle thoughts embeddings had.

### Server start niet op
```bash
docker compose logs server
# Controleer op DATABASE_URL, MCP_ACCESS_KEY, OPENROUTER_API_KEY fouten
```

---

## Migratie voltooid — Checklist

| Fase | Status |
|---|---|
| 1 — Docker + Database opstarten | ☐ |
| 2 — Data migreren vanuit Supabase | ☐ |
| 3 — Cloudflare Tunnel instellen | ☐ |
| 4 — Claude Code configureren | ☐ |
| 5 — Ollama (optioneel) | ☐ |

Zodra alle fasen zijn doorlopen, kun je je Supabase-project archiveren of verwijderen.
