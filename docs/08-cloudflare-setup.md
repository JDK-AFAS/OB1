# Cloudflare Tunnel Setup — Externe Toegang tot OB1

Met een Cloudflare Tunnel is je OB1 MCP server bereikbaar vanaf elke locatie — zonder open poorten in je router. Alles loopt via Cloudflare's beveiligde infrastructuur.

---

## Architectuur

```
Claude Code (laptop/telefoon/extern)
  ↓ HTTPS (TLS, automatisch certificaat)
Cloudflare Edge
  ↓ Versleutelde tunnel
cloudflared container (ob1-tunnel) op homelab
  ↓ HTTP intern (Docker netwerk)
ob1-server container (port 3000)
  ↓ SQL (Docker netwerk)
ob1-postgres container (port 5432)
```

Jouw homelab hoeft **geen enkele poort** open te hebben in je router of firewall.

---

## Vereisten

- Docker + Docker Compose draait op je homelab
- Gratis Cloudflare account (voor permanente tunnel)
- Een domein dat je bij Cloudflare beheert (of gebruik `trycloudflare.com` voor testen)

---

## Stap 1: Cloudflare account en domein

1. Ga naar [dash.cloudflare.com](https://dash.cloudflare.com) en maak een gratis account aan
2. Voeg een domein toe (bijv. `jouwnaam.com`) **of** sla dit over en gebruik stap 6 voor een tijdelijke test-URL

> **Geen domein?** Gebruik de [Sneltest met tijdelijke tunnel](#sneltest-tijdelijke-tunnel) onderaan dit document.

---

## Stap 2: Tunnel aanmaken

1. In het Cloudflare dashboard: ga naar **Zero Trust → Networks → Tunnels**
2. Klik **Create a tunnel**
3. Geef de tunnel een naam (bijv. `ob1-homelab`)
4. Kies **Docker** als installatiemethode
5. Cloudflare toont een commando zoals:
   ```
   docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJhIjoiM...
   ```
   Kopieer het token (de lange string na `--token`)

---

## Stap 3: Public Hostname instellen

Nog in het tunnel-aanmaakscherm (of later via tunnel-instellingen):

1. Klik **Add a public hostname**
2. Vul in:
   - **Subdomain:** `ob1`
   - **Domain:** `jouwnaam.com`
   - **Service type:** `HTTP`
   - **URL:** `server:3000`
3. Sla op

Je MCP server is nu bereikbaar op `https://ob1.jouwnaam.com`.

---

## Stap 4: Token in .env zetten

```bash
# Kopieer .env.example als je dat nog niet hebt gedaan
cp .env.example .env

# Open .env en vul in:
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiM...  ← jouw token hier
```

Zet ook de andere vereiste waarden:
```bash
POSTGRES_PASSWORD=een_sterk_wachtwoord
MCP_ACCESS_KEY=een_lange_random_string   # bijv.: openssl rand -hex 32
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
```

> **Nooit** `.env` committen naar git. Het staat al in `.gitignore`.

---

## Stap 5: Stack starten

```bash
# Vanuit de repo root:
docker compose up -d
```

Dit start: postgres, ob1-server, en cloudflared. De tunnel verbindt automatisch.

Controleer de logs:
```bash
docker compose logs cloudflared
# Verwacht: "Registered tunnel connection" of "Connection ... registered"

docker compose logs server
# Verwacht: "OB1 MCP server running on port 3000"
```

---

## Stap 6: Verbinding testen

```bash
# Health check (geen auth nodig):
curl https://ob1.jouwnaam.com/health
# Verwacht: {"status":"ok","timestamp":"..."}

# API info (geen auth nodig):
curl https://ob1.jouwnaam.com/api/info
# Verwacht: {"name":"OB1","version":"1.0.0","apps":[...]}

# Met authenticatie:
curl -H "x-brain-key: JOUW_MCP_ACCESS_KEY" https://ob1.jouwnaam.com/api/thoughts
# Verwacht: [] of lijst van thoughts
```

---

## Stap 7: Claude Code verbinden

Pas `.mcp.json` in de repo root aan:

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

Sla de `OB1_ACCESS_KEY` op in je shell:
```bash
# ~/.zshrc of ~/.bashrc
export OB1_ACCESS_KEY="jouw_mcp_access_key_hier"
```

Herlaad je shell en start Claude Code. De MCP tools van OB1 zijn nu beschikbaar.

---

## Lokale toegang (zelfde netwerk)

Als je op hetzelfde netwerk als de homelab werkt, kun je de tunnel overslaan:

```json
{
  "mcpServers": {
    "ob1": {
      "type": "http",
      "url": "http://192.168.1.100:3000/mcp",
      "headers": {
        "x-brain-key": "${OB1_ACCESS_KEY}"
      }
    }
  }
}
```

Vervang `192.168.1.100` met het IP van je homelab.

**Tip:** Geef de homelab machine een vast IP via DHCP-reservering op MAC-adres in je router. Zo verandert het IP nooit.

---

## Sneltest: tijdelijke tunnel

Voor testen **zonder** Cloudflare account:

```bash
# Start de OB1 stack lokaal (zonder cloudflared):
docker compose up -d postgres server

# Start een tijdelijke tunnel in een aparte terminal:
docker run --rm cloudflare/cloudflared:latest tunnel --url http://host.docker.internal:3000
```

Cloudflare print een tijdelijke URL zoals `https://random-words.trycloudflare.com`.
Gebruik die URL tijdelijk in `.mcp.json`. De URL vervalt zodra je de container stopt.

---

## Vaste homelab IP instellen

Zonder vast IP kan het homelab IP veranderen na een herstart van je router. Oplossing:

1. Open je router-beheeromgeving (meestal `192.168.1.1` of `192.168.0.1`)
2. Zoek **DHCP Reservations** of **Static DHCP**
3. Voeg een reservering toe op basis van het MAC-adres van je homelab
4. Wijs een vast IP toe (bijv. `192.168.1.100`)

---

## Beveiliging

| Laag | Maatregel |
|------|-----------|
| Transport | Cloudflare TLS (automatisch, geen certificaat nodig) |
| Authenticatie | `x-brain-key` header vereist voor alle API/MCP calls |
| Netwerk | Geen open poorten — alleen uitgaande tunnel |
| Extra (optioneel) | Cloudflare Access (Zero Trust) voor IP-whitelisting of SSO |

> **Cloudflare Access** (gratis tier): Je kunt een extra loginscherm toevoegen bovenop de tunnel. Ga naar Zero Trust → Access → Applications → Add an application.

---

## Problemen oplossen

### cloudflared verbindt niet

```bash
docker compose logs cloudflared
```

Mogelijke oorzaken:
- Token is leeg of onjuist in `.env`
- Geen internetverbinding op de homelab
- Tunnel is verwijderd in het Cloudflare dashboard

### Server start niet

```bash
docker compose logs server
```

Mogelijke oorzaken:
- `DATABASE_URL` is incorrect (postgres nog niet gereed)
- `MCP_ACCESS_KEY` is niet ingesteld

### curl geeft 502 of 523

- 502: `ob1-server` container draait niet of crasht — check `docker compose ps`
- 523: cloudflared kan de server niet bereiken intern — controleer of de servicenaam `server` overeenkomt in docker-compose.yml

### MCP tools niet zichtbaar in Claude Code

1. Controleer dat `.mcp.json` de juiste URL heeft
2. Controleer dat `OB1_ACCESS_KEY` in je shell environment staat (`echo $OB1_ACCESS_KEY`)
3. Herstart Claude Code na het aanpassen van `.mcp.json`
