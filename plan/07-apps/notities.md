# App Spec: Notities / Journal

## Doel
Gestructureerde notities die optioneel ook in het AI-geheugen (thoughts) worden opgeslagen voor semantisch terugvinden. Combineert het beste van een klassieke notitie-app met AI-doorzoekbaarheid.

## Verschil tussen Note en Thought

| | Note | Thought |
|---|---|---|
| **Opgeslagen in** | `notes` tabel | `thoughts` tabel |
| **Doorzoekbaar** | Tekst (ILIKE) + optioneel semantisch | Altijd semantisch |
| **Structuur** | Titel + content + tags + pinned | Alleen content + metadata |
| **Gebruik** | Langere notities, recepten, aantekeningen | Korte observaties, inzichten |
| **Koppeling** | Optioneel thought_id FK | — |

## Kernfunctionaliteit
- Notitie aanmaken met titel, inhoud, tags
- Pinnen van belangrijke notities
- Optioneel: ook in AI-geheugen opslaan (`also_capture: true`)
- Zoeken via tekst (snel) of semantisch (via AI)
- Tags voor organisatie

## Voorbeeldinteracties
```
Jij: Sla dit op als notitie: Recept pasta carbonara — 200g pasta, 100g pancetta...
Claude: Notitie opgeslagen: Recept pasta carbonara

Jij: Pin de carbonara notitie
Claude: Notitie gepind: Recept pasta carbonara ⭐

Jij: Zoek mijn recepten
Claude: Notities met tag 'recept':
  ⭐ Recept pasta carbonara
  Recept focaccia

Jij: Sla dit ook op in mijn geheugen: Ik merk dat ik productiever ben in de ochtend
Claude: Notitie + thought opgeslagen: "Ik merk dat ik productiever ben..."
  → Captured als "observation" — topics: productiviteit, gewoontes
```

## Journal modus
Door elke dag een notitie aan te maken met tag `journal` en datum in de titel, ontstaat automatisch een persoonlijk dagboek:

```
Jij: Maak een journal entry voor vandaag: goede dag gehad, training goed gegaan, ...
Claude: Journal entry aangemaakt: Journal 2026-03-22
  Tags: journal, 2026-03
```

Latere zoekopdracht:
```
Jij: Zoek in mijn journal naar momenten dat ik me goed voelde na sport
Claude: [search_notes semantisch + list_notes met tag journal]
```

## MCP tools
Zie `plan/05-mcp-tools.md` → sectie Notities

## Toekomstige uitbreiding
- Markdown rendering in toekomstige frontend
- Export naar PDF/Markdown
- Automatische daily journal aanmaken via cron
