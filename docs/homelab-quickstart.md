# OB1 Homelab — Quickstart

Je eigen AI-geheugen, draaiend op je eigen machine. Geen cloud-abonnementen, geen externe databases — alles lokaal, bereikbaar via een beveiligde Cloudflare-tunnel.

**Wat je krijgt:**
- PostgreSQL-database met vectorzoeken (pgvector) op je homelab
- MCP-server die Claude direct laat praten met je data
- 29 tools: gedachten, taken, agenda, notities, projecten, contacten, financiën, gezondheid
- Externe toegang via Cloudflare Tunnel (zonder open poorten in je router)

**Tijdsinschatting:** ~30 minuten voor een verse installatie

---

## Vereisten

| Wat | Waarvoor |
|-----|----------|
| Docker + Docker Compose | Alle services draaien als containers |
| Gratis Cloudflare-account | Tunnel voor externe toegang (optioneel voor lokaalgebruik) |
| OpenRouter API-key | AI-embeddings genereren ([openrouter.ai](https://openrouter.ai)) |
| Git | Repository klonen |

> **Geen Cloudflare-account?** Je kunt OB1 ook puur lokaal gebruiken (stap 4 overslaan) of een tijdelijke gratis tunnel gebruiken voor testen.

---

## Stap 1 — Repository klonen

```bash
git clone https://github.com/JDK-AFAS/OB1.git
cd OB1
```

---

## Stap 2 — Configuratie instellen

Kopieer het voorbeeld-configuratiebestand:

```bash
cp .env.example .env
```

Open `.env` en vul de volgende waarden in:

```env
# Verplicht: kies een sterk wachtwoord voor de database
POSTGRES_PASSWORD=kies_een_sterk_wachtwoord

# Verplicht: jouw geheime sleutel waarmee Claude toegang krijgt
MCP_ACCESS_KEY=kies_een_lange_random_string

# Verplicht: AI-provider voor embeddings
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...

# Later invullen: Cloudflare Tunnel token (zie stap 4)
CLOUDFLARE_TUNNEL_TOKEN=
```

Genereer een willekeurige sleutel voor `MCP_ACCESS_KEY`:
```bash
openssl rand -hex 32
```

> **Bewaar `.env` goed.** Het staat al in `.gitignore` — commit dit bestand nooit.

---

## Stap 3 — Stack starten

```bash
docker compose up -d postgres server
```

Docker downloadt de images en start de containers. De eerste keer duurt dit 1–3 minuten.

Wacht tot de database klaar is:
```bash
docker compose logs postgres | grep "ready to accept"
# Verwacht: "database system is ready to accept connections"
```

Controleer of de server draait:
```bash
docker compose logs server | grep "Listening"
# Verwacht: "Listening on http://0.0.0.0:3000/"
```

### Verificatie

```bash
# Health check (geen sleutel nodig):
curl http://localhost:3000/health
# → {"status":"ok","version":"2.0.0"}

# API-overzicht (geen sleutel nodig):
curl http://localhost:3000/api/info
# → {"version":"2.0.0","apps":["tasks","events","notes",...]}

# Eerste test met jouw sleutel:
curl -H "x-brain-key: JOUW_MCP_ACCESS_KEY" http://localhost:3000/api/thoughts
# → []   (lege lijst, want je hebt nog geen gedachten vastgelegd)
```

Controleer ook of alle 11 tabellen zijn aangemaakt:
```bash
docker exec -it ob1-postgres psql -U ob1 -d ob1 -c "\dt"
```

Verwachte output:
```
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

---

## Stap 4 — Cloudflare Tunnel instellen

De tunnel maakt je OB1-server bereikbaar van overal, **zonder open poorten** in je router.

### 4.1 Tunnel aanmaken

1. Ga naar [dash.cloudflare.com](https://dash.cloudflare.com) en log in (gratis account)
2. Navigeer naar **Zero Trust → Networks → Tunnels**
3. Klik **Create a tunnel**
4. Geef de tunnel een naam, bijv. `ob1-homelab`
5. Kies **Docker** als installatievorm
6. Cloudflare toont een commando met een lang token. Kopieer **alleen het token** (de string na `--token`)

### 4.2 Public hostname configureren

Nog in het aanmaakscherm (of later via tunnel-instellingen → Public Hostnames):
- **Subdomain:** `ob1`
- **Domain:** `jouwnaam.com`
- **Service type:** `HTTP`
- **URL:** `server:3000`

Sla op. Je server is straks bereikbaar op `https://ob1.jouwnaam.com`.

### 4.3 Token in .env zetten

```bash
# Open .env en vul in:
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiM...   ← jouw token hier
```

### 4.4 Tunnel starten

```bash
docker compose up -d cloudflared
docker compose logs cloudflared | grep "Registered"
# Verwacht: "Registered tunnel connection"
```

### 4.5 Tunnel verifiëren

```bash
# Gebruik het meegeleverde verificatiescript:
export OB1_ACCESS_KEY="jouw_mcp_access_key"
bash scripts/verify-tunnel.sh https://ob1.jouwnaam.com
```

Alle checks moeten groen zijn.

> **Geen eigen domein?** Zie [Sneltest zonder account](#sneltest-zonder-cloudflare-account) onderaan.

---

## Stap 5 — Claude Code verbinden

### 5.1 .mcp.json bijwerken

Bewerk `.mcp.json` in de repo-root en vervang de placeholder-URL:

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

> **Lokaalgebruik (zelfde netwerk):** gebruik `http://192.168.1.XXX:3000/mcp` met het IP van je homelab.

### 5.2 Environment variable instellen

Voeg dit toe aan `~/.bashrc` of `~/.zshrc`:

```bash
export OB1_ACCESS_KEY="jouw_mcp_access_key"
```

Herlaad je shell:
```bash
source ~/.bashrc   # of source ~/.zshrc
```

### 5.3 Claude Code starten

Start een nieuwe Claude Code-sessie. Controleer of de tools beschikbaar zijn door te typen:

```
> Sla op: ik wil mijn OB1 setup testen
> Zoek in mijn gedachten naar "test"
> Maak een taak aan: README doorlezen
```

---

## Overzicht: beschikbare MCP tools

| Module | Tools |
|--------|-------|
| **Gedachten** | `capture_thought`, `search_thoughts`, `list_thoughts`, `thought_stats` |
| **Taken** | `create_task`, `list_tasks`, `complete_task`, `update_task`, `delete_task` |
| **Agenda** | `create_event`, `list_events`, `update_event`, `delete_event` |
| **Notities** | `create_note`, `list_notes`, `search_notes`, `update_note`, `delete_note` |
| **Projecten** | `create_project`, `list_projects`, `create_kanban_card`, `move_kanban_card`, `list_kanban_board` |
| **Contacten** | `create_contact`, `list_contacts`, `get_contact`, `log_interaction` |
| **Financiën** | `log_finance`, `list_finances`, `finance_summary` |
| **Gezondheid** | `log_health`, `list_health`, `health_summary` |

Alle tools zijn ook bereikbaar als REST API — zie `GET /api/info` voor het volledige route-overzicht.

---

## Stap 6 — Automatisch opstarten (optioneel)

Zorg dat de stack automatisch start na een herboot van de homelab:

```bash
# Docker Compose instellen als systemd service
sudo nano /etc/systemd/system/ob1.service
```

Plak dit:
```ini
[Unit]
Description=OB1 homelab stack
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/pad/naar/OB1
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=always
User=jouw_gebruikersnaam

[Install]
WantedBy=multi-user.target
```

Activeer:
```bash
sudo systemctl enable ob1
sudo systemctl start ob1
```

---

## Optioneel: Ollama (selfhosted AI, geen API-kosten)

Vervang OpenRouter door een lokaal AI-model. Vereist minimaal 8 GB RAM.

```bash
# Stap 1: Ollama-container starten
docker compose --profile ollama up -d ollama

# Stap 2: Modellen downloaden (eenmalig, kan even duren)
docker exec -it ob1-ollama ollama pull nomic-embed-text   # embedding model
docker exec -it ob1-ollama ollama pull llama3.1:8b        # chat model

# Stap 3: Activeren in .env
# Pas .env aan:
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_CHAT_MODEL=llama3.1:8b

# Stap 4: Server herstarten
docker compose restart server
```

Als je bestaande thoughts al embeddings hebben met OpenRouter (1536-dim vectors), voer dan het re-embedding script uit om ze te converteren naar het Ollama formaat (768-dim):

```bash
OLLAMA_BASE_URL=http://localhost:11434 \
DATABASE_URL="postgresql://ob1:JOUW_WACHTWOORD@localhost:5432/ob1" \
deno run --allow-net --allow-env scripts/reembed.ts
```

Zie `docs/05-ollama-migration.md` voor de volledige handleiding.

---

## Migreren vanuit Supabase

Als je al OB1 gebruikt met Supabase en je thoughts wilt overzetten naar de homelab-setup:

```bash
# Volledige export + import in één commando:
SUPABASE_DB_URL="postgresql://postgres:WACHTWOORD@db.XXXX.supabase.co:5432/postgres" \
DATABASE_URL="postgresql://ob1:WACHTWOORD@localhost:5432/ob1" \
deno run --allow-net --allow-env --allow-read --allow-write \
  scripts/export-from-supabase.ts
```

Vereist: [Deno](https://deno.land) geïnstalleerd. Zie `docs/09-migration-guide.md` voor de volledige stap-voor-stap handleiding inclusief rollback-instructies.

---

## Sneltest zonder Cloudflare-account

Test de tunnel **zonder account** via `trycloudflare.com`:

```bash
# Start de stack zonder cloudflared:
docker compose up -d postgres server

# Start een tijdelijke tunnel (in een aparte terminal):
docker run --rm cloudflare/cloudflared:latest tunnel \
  --url http://host.docker.internal:3000
```

Cloudflare print een tijdelijke URL, bijv. `https://random-words.trycloudflare.com`. Gebruik die in `.mcp.json`. De URL vervalt zodra je de container stopt.

---

## Problemen oplossen

### Server start niet op

```bash
docker compose logs server
```

Veelvoorkomende oorzaken:
- `MCP_ACCESS_KEY` is niet ingesteld in `.env`
- `DATABASE_URL` is onjuist of postgres is nog niet klaar
- `OPENROUTER_API_KEY` ontbreekt (vereist als `AI_PROVIDER=openrouter`)

### Tunnel verbindt niet

```bash
docker compose logs cloudflared
```

Veelvoorkomende oorzaken:
- `CLOUDFLARE_TUNNEL_TOKEN` is leeg of onjuist in `.env`
- Geen internetverbinding op de homelab
- Tunnel is verwijderd in het Cloudflare-dashboard

### curl geeft 401

De `x-brain-key` header ontbreekt of klopt niet. Controleer:
```bash
echo $OB1_ACCESS_KEY   # moet de waarde tonen, niet leeg zijn
```

### curl geeft 502

De `ob1-server` container draait niet of is gecrasht:
```bash
docker compose ps
docker compose up -d server
```

### MCP tools niet zichtbaar in Claude Code

1. Controleer dat `.mcp.json` de juiste URL bevat
2. Controleer dat `OB1_ACCESS_KEY` in je shellomgeving staat
3. Herstart Claude Code na het wijzigen van `.mcp.json`

---

## Alles stoppen

```bash
docker compose down          # stopt containers, bewaart data
docker compose down -v       # stopt containers EN verwijdert database (onomkeerbaar!)
```

---

## Volgende stappen

- **Dagelijks gebruik:** zie de [companion prompts](02-companion-prompts.md) voor handige Claude-instructies
- **Externe AI-modellen:** zie [05-ollama-migration.md](05-ollama-migration.md)
- **Cloudflare Tunnel details:** zie [08-cloudflare-setup.md](08-cloudflare-setup.md)
- **Migratie vanuit Supabase:** zie [09-migration-guide.md](09-migration-guide.md)
