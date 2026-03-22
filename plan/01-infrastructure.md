# Plan 01 — Infrastructuur (Docker Compose)

## Doel

Alle services draaien als Docker containers op de homelab machine. Geen externe managed services vereist voor de core stack.

---

## Services overzicht

```
homelab/
├── docker-compose.yml
├── docker-compose.override.yml    ← lokale overrides (gitignored)
├── .env                           ← secrets (gitignored)
├── .env.example                   ← template (wel in git)
├── postgres/
│   └── init/
│       ├── 00-extensions.sql      ← pgvector installatie
│       └── 01-schema.sql          ← alle tabellen
└── server/
    ├── Dockerfile
    └── ... (bestaande code)
```

---

## docker-compose.yml (volledig plan)

```yaml
version: "3.9"

services:

  # ─── Database ───────────────────────────────────────────
  postgres:
    image: pgvector/pgvector:pg17
    container_name: ob1-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ob1
      POSTGRES_USER: ob1
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d:ro
    ports:
      - "127.0.0.1:5432:5432"    # alleen lokaal bereikbaar, nooit publiek
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ob1 -d ob1"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── MCP + REST API Server ───────────────────────────────
  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: ob1-server
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://ob1:${POSTGRES_PASSWORD}@postgres:5432/ob1
      AI_PROVIDER: ${AI_PROVIDER:-openrouter}           # openrouter | ollama
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:-}
      OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://ollama:11434}
      OLLAMA_EMBED_MODEL: ${OLLAMA_EMBED_MODEL:-nomic-embed-text}
      OLLAMA_CHAT_MODEL: ${OLLAMA_CHAT_MODEL:-llama3.1:8b}
      MCP_ACCESS_KEY: ${MCP_ACCESS_KEY}
      PORT: 3000
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "127.0.0.1:3000:3000"    # alleen lokaal, Cloudflare Tunnel tunnel hiernaar

  # ─── Ollama (selfhosted LLM) — optioneel, standaard uit ──
  ollama:
    image: ollama/ollama:latest
    container_name: ob1-ollama
    restart: unless-stopped
    volumes:
      - ollama_data:/root/.ollama
    ports:
      - "127.0.0.1:11434:11434"
    # GPU support (optioneel, uncomment indien beschikbaar):
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]
    profiles:
      - ollama    # alleen starten met: docker compose --profile ollama up

  # ─── Cloudflare Tunnel ───────────────────────────────────
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: ob1-tunnel
    restart: unless-stopped
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - server

volumes:
  postgres_data:
  ollama_data:
```

---

## .env.example (template voor secrets)

```bash
# Database
POSTGRES_PASSWORD=verander_dit_naar_sterk_wachtwoord

# MCP authenticatie
MCP_ACCESS_KEY=verander_dit_naar_lange_random_string

# AI Provider: "openrouter" of "ollama"
AI_PROVIDER=openrouter

# OpenRouter (actief tijdens overgangsperiode)
OPENROUTER_API_KEY=sk-or-...

# Ollama (invullen zodra Ollama actief is)
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_CHAT_MODEL=llama3.1:8b

# Cloudflare Tunnel token (aanmaken via dash.cloudflare.com)
CLOUDFLARE_TUNNEL_TOKEN=
```

---

## Dockerfile voor de server

```dockerfile
# server/Dockerfile
FROM denoland/deno:2.4

WORKDIR /app

# Dependencies cachen
COPY deno.json .
RUN deno install --entrypoint index.ts || true

COPY . .

EXPOSE 3000

# Permissions: net (HTTP), env (secrets), read (files)
CMD ["deno", "run", \
     "--allow-net", \
     "--allow-env", \
     "--allow-read", \
     "index.ts"]
```

---

## postgres/init/00-extensions.sql

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## Handige commando's

```bash
# Eerste keer opstarten
cp .env.example .env
# Vul .env in met jouw waardes
docker compose up -d

# Logs bekijken
docker compose logs -f server
docker compose logs -f postgres

# Database verbinding (lokaal)
docker exec -it ob1-postgres psql -U ob1 -d ob1

# Server herstarten na code wijziging
docker compose restart server

# Backup maken
docker exec ob1-postgres pg_dump -U ob1 ob1 > backup-$(date +%Y%m%d).sql

# Ollama activeren + model downloaden
docker compose --profile ollama up -d ollama
docker exec -it ob1-ollama ollama pull nomic-embed-text
docker exec -it ob1-ollama ollama pull llama3.1:8b
```

---

## Poortoverzicht

| Poort | Service | Bereikbaar van |
|---|---|---|
| 5432 | PostgreSQL | Alleen localhost (server container + lokale tools) |
| 3000 | MCP/REST server | Alleen localhost (Cloudflare Tunnel tunnel hiernaar) |
| 11434 | Ollama | Alleen localhost |

Geen enkele poort is direct publiek bereikbaar. Externe toegang loopt uitsluitend via Cloudflare Tunnel.

---

## TODO bij implementatie

- [ ] `docker-compose.yml` aanmaken in repo root
- [ ] `.env.example` aanmaken in repo root
- [ ] `.gitignore` updaten (`.env`, `postgres/data/`)
- [ ] `server/Dockerfile` aanmaken
- [ ] `postgres/init/` directory aanmaken met SQL bestanden
- [ ] Testen: `docker compose up -d` en controleer health checks
- [ ] Testen: server bereikbaar op `localhost:3000`
