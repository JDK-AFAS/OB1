# App Spec: Taken

## Doel
Een eenvoudig maar krachtig takenbeheer systeem volledig bedienbaar via Claude Code. Taken kunnen gekoppeld worden aan projecten en het AI-geheugen.

## Datamodel
Zie `plan/02-database-schema.md` → `02-tasks.sql`

## Kernfunctionaliteit
- Aanmaken met titel, omschrijving, deadline, prioriteit, tags, project
- Afvinken (registreert tijdstip)
- Filteren op: open/gesloten, prioriteit, deadline, project, tags
- Koppelen aan een thought (bijv. als een thought een actie bevat)

## Prioriteitssysteem
- **1 Urgent** — vandaag, blokkeert andere dingen
- **2 Hoog** — deze week
- **3 Normaal** — geen haast, default
- **4 Laag** — nice-to-have, later

## Voorbeeldinteracties via Claude Code
```
Jij: Maak een taak aan: belasting aangifte voor 1 april, urgent
Claude: Taak aangemaakt: Belasting aangifte (prioriteit: Urgent, deadline: 1 apr 2026)

Jij: Wat zijn mijn urgente taken?
Claude: Urgente taken (prioriteit 1):
  • Belasting aangifte — deadline 1 apr 2026

Jij: Vink belasting aangifte af
Claude: Taak afgevinkt: Belasting aangifte ✓

Jij: Zoek in mijn geheugen naar taken gerelateerd aan belasting
Claude: [gebruikt search_thoughts + list_tasks gecombineerd]
```

## MCP tools
Zie `plan/05-mcp-tools.md` → sectie Taken

## REST API
Zie `plan/06-rest-api.md` → `/api/tasks`

## Open vragen / toekomstige uitbreiding
- Subtaken? (nu niet, later eventueel via self-referencing FK)
- Notificaties bij deadline? (vereist cron job of reminder systeem)
- Integratie met agenda: taak met deadline → automatisch event?
