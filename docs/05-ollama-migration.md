# Ollama Migratie — OpenRouter → Lokale AI

Wanneer je klaar bent om over te stappen van OpenRouter naar een volledig lokale AI-stack, volg dan deze stappen.

## Waarom overstappen?

- **Privacy:** je gedachten verlaten nooit je thuisnetwerk
- **Kosten:** geen API-kosten na de initiële setup
- **Snelheid:** lokale inference is snel bij een goede GPU

## Vereiste hardware

| Component | Minimum | Aanbevolen |
|---|---|---|
| RAM | 8 GB | 16 GB |
| GPU VRAM | CPU-only (traag) | 8 GB (comfortabel) |
| Opslag | 10 GB vrij | 20 GB vrij |

## Stap 1 — Ollama opstarten

Zorg dat Ollama actief is in je Docker-stack (via `--profile ollama`):

```bash
docker compose --profile ollama up -d
```

Download de benodigde modellen:

```bash
docker exec ob1-ollama ollama pull nomic-embed-text
docker exec ob1-ollama ollama pull llama3.1:8b
```

Wacht tot de modellen volledig zijn gedownload. `nomic-embed-text` is 274 MB, `llama3.1:8b` is ~4.7 GB.

## Stap 2 — .env aanpassen

Pas je `.env` aan:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_CHAT_MODEL=llama3.1:8b
```

## Stap 3 — Embeddings herberekenen

> **WAARSCHUWING:** dit wijzigt de embedding-kolom in de database definitief.
> Maak eerst een backup:
> ```bash
> docker exec ob1-db pg_dump -U postgres ob1 > backup-pre-reembed.sql
> ```

Voer het re-embedding script uit:

```bash
docker exec ob1-server deno run --allow-net --allow-env /app/scripts/reembed.ts
```

Dit script:
1. Past de `embedding`-kolom aan van `vector(1536)` naar `vector(768)`
2. Berekent alle bestaande thoughts opnieuw via Ollama
3. Herbouwt de HNSW-index
4. Werkt de `match_thoughts` PostgreSQL-functie bij

**Verwachte duur:** ~100ms per thought. Bij 1000 thoughts ≈ 2 minuten (GPU) of 17 minuten (CPU-only).

## Stap 4 — Server herstarten

```bash
docker compose restart server
```

## Verificatie

Test of alles werkt:

```bash
curl -H "x-brain-key: JOUW_MCP_KEY" http://localhost:3000/health
```

Verwachte response:
```json
{"status": "ok", "provider": "ollama"}
```

## Terugdraaien naar OpenRouter

Zet in `.env`:
```env
AI_PROVIDER=openrouter
```

Draai het re-embed script opnieuw (nu met OpenRouter als provider — pas het script aan of gebruik de `-p openrouter` vlag).

> **Let op:** na terugdraaien zijn de 768-dim embeddings incompatibel met OpenRouter's 1536-dim. Je moet de kolom opnieuw aanpassen en alle thoughts opnieuw embedden.

## Aanbevolen Ollama modellen

| Doel | Model | Grootte | Kwaliteit |
|---|---|---|---|
| Embeddings | `nomic-embed-text` | 274 MB | Uitstekend |
| Chat (snel) | `llama3.2:3b` | 2 GB | Goed |
| Chat (aanbevolen) | `llama3.1:8b` | 4.7 GB | Uitstekend |
| Chat (alternatief) | `mistral:7b` | 4.1 GB | Goed |
