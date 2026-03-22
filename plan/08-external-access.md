# Plan 08 — Externe Toegang via Cloudflare Tunnel

## Waarom Cloudflare Tunnel

- Geen open poorten in je router (veiliger)
- Gratis voor persoonlijk gebruik
- Automatisch HTTPS + TLS certificaten
- Werkt met dynamisch thuisIP
- Claude Desktop/Code kan de MCP server bereiken van buiten het thuisnetwerk

---

## Hoe het werkt

```
Claude Code (laptop/telefoon)
  ↓ HTTPS
Cloudflare Edge (cloudflare.com)
  ↓ Versleutelde tunnel
cloudflared container (op homelab)
  ↓ HTTP intern
ob1-server container (port 3000)
  ↓ SQL
ob1-postgres container (port 5432)
```

Alle verkeer van buiten loopt via Cloudflare. Jouw homelab hoeft geen enkele poort open te hebben.

---

## Stap 1: Cloudflare account + tunnel aanmaken

1. Ga naar [dash.cloudflare.com](https://dash.cloudflare.com)
2. Voeg een gratis domein toe (of gebruik een bestaand domein)
   - Alternatief: gebruik `trycloudflare.com` (tijdelijk, geen account nodig voor test)
3. Ga naar **Zero Trust → Networks → Tunnels**
4. Klik **Create a tunnel** → geef het een naam (bijv. `ob1-homelab`)
5. Kopieer de **tunnel token** (lange string)
6. Configureer een Public Hostname:
   - Subdomain: `ob1`
   - Domain: `jouwnaam.com`
   - Service: `http://server:3000`

---

## Stap 2: Token in .env zetten

```bash
# .env
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiM...  ← jouw token hier
```

---

## Stap 3: cloudflared in Docker Compose

Al opgenomen in plan 01. De container start automatisch en verbindt met Cloudflare.

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  container_name: ob1-tunnel
  restart: unless-stopped
  command: tunnel run
  environment:
    TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
  depends_on:
    - server
```

---

## Stap 4: Claude Code verbinden

Na setup is de server bereikbaar op `https://ob1.jouwnaam.com`.

**`.mcp.json` in repo root:**
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

Sla de `OB1_ACCESS_KEY` op in je shell environment:
```bash
# ~/.zshrc of ~/.bashrc
export OB1_ACCESS_KEY="jouw_lange_geheime_sleutel"
```

---

## Lokale toegang (zelfde netwerk)

Als je op hetzelfde netwerk als de homelab werkt, kun je direct verbinden zonder tunnel:

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

Vervang `192.168.1.100` met het IP van je homelab machine.

**Tip:** Geef de homelab machine een vast IP via je router (DHCP reservering op MAC-adres).

---

## Sneltest (tijdelijke tunnel zonder account)

Voor testen kun je een gratis tijdelijke tunnel starten zonder Cloudflare account:

```bash
docker run --rm cloudflare/cloudflared tunnel --url http://host.docker.internal:3000
```

Dit geeft een tijdelijke URL zoals `https://random-name.trycloudflare.com`. Goed voor testen, niet permanent.

---

## Beveiliging

- De Cloudflare Tunnel versleutelt alles tussen Cloudflare en jouw homelab
- De MCP server vereist altijd de `x-brain-key` header — zelfs als iemand de URL kent
- Overweeg Cloudflare Access toe te voegen (Zero Trust) voor extra beveiliging (optioneel, vereist gratis account)
- Nooit de `MCP_ACCESS_KEY` committen naar git

---

## TODO bij implementatie

- [ ] Cloudflare account aanmaken (of bestaand gebruiken)
- [ ] Domein toevoegen aan Cloudflare (of `trycloudflare.com` voor test)
- [ ] Tunnel aanmaken in Cloudflare dashboard
- [ ] Tunnel token kopiëren naar `.env`
- [ ] `docker compose up -d` — verificeer dat cloudflared verbindt
- [ ] Test: `curl https://ob1.jouwnaam.com/health` geeft `{"status":"ok"}`
- [ ] `.mcp.json` aanmaken in repo root met juiste URL
- [ ] Test: Claude Code herkent MCP server (`/mcp list`)
- [ ] Vaste IP instellen voor homelab via router (DHCP reservering)
