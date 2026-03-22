# Plan 05 — MCP Tools (volledig overzicht)

## Filosofie

Claude Code is de primaire interface. Alle applicaties zijn volledig bedienbaar via MCP tools — geen UI nodig als MVP. Tools zijn zo ontworpen dat je in natuurlijke taal kunt werken:

> "Maak een taak: belasting aangifte doen voor 1 april, hoge prioriteit"
> "Wat staat er deze week op mijn agenda?"
> "Log 30 minuten hardlopen vandaag"

---

## Overzicht alle tools

| Module | Tools |
|---|---|
| **Thoughts** (bestaand) | `capture_thought`, `search_thoughts`, `list_thoughts`, `thought_stats` |
| **Taken** | `create_task`, `complete_task`, `list_tasks`, `update_task`, `delete_task` |
| **Agenda** | `create_event`, `list_events`, `update_event`, `delete_event` |
| **Notities** | `create_note`, `list_notes`, `search_notes`, `update_note`, `delete_note` |
| **Projecten** | `create_project`, `list_projects`, `create_kanban_card`, `move_kanban_card`, `list_kanban_board` |
| **Contacten** | `create_contact`, `list_contacts`, `log_interaction`, `get_contact` |
| **Financiën** | `log_finance`, `list_finances`, `finance_summary` |
| **Gezondheid** | `log_health`, `list_health`, `health_summary` |

---

## Thoughts tools (bestaand, wordt alleen gemigreerd)

Zie `mcp/thoughts.ts`. Zelfde functionaliteit, nieuwe database client.

---

## Taken tools

### `create_task`
```
Inputs:
  title: string (verplicht)
  description?: string
  due_date?: string (YYYY-MM-DD)
  priority?: 1|2|3|4  (1=urgent, 4=laag, default=3)
  project_id?: UUID
  tags?: string[]

Output: "Taak aangemaakt: [title] (prioriteit [X], deadline [date])"
```

### `complete_task`
```
Inputs:
  id: UUID  OF  title: string (zoekt op fuzzy match)

Output: "Taak afgevinkt: [title]"
Gedrag: zet done=true, done_at=NOW()
```

### `list_tasks`
```
Inputs:
  done?: boolean (default: false — toon openstaande taken)
  priority?: 1|2|3|4
  project_id?: UUID
  due_before?: string (YYYY-MM-DD)
  tags?: string[]
  limit?: number (default: 20)

Output: gestructureerde lijst met prioriteit, deadline, project
```

### `update_task`
```
Inputs:
  id: UUID
  title?: string
  description?: string
  due_date?: string
  priority?: 1|2|3|4
  project_id?: UUID
  tags?: string[]

Output: "Taak bijgewerkt: [title]"
```

### `delete_task`
```
Inputs:
  id: UUID

Output: "Taak verwijderd."
Gedrag: vraagt om bevestiging als taak niet done is
```

---

## Agenda tools

### `create_event`
```
Inputs:
  title: string (verplicht)
  start_at: string (ISO 8601, verplicht)
  end_at?: string (ISO 8601)
  all_day?: boolean (default: false)
  description?: string
  location?: string
  recurring_rule?: string (RRULE formaat, bijv "FREQ=WEEKLY;BYDAY=MO")
  tags?: string[]

Output: "Event aangemaakt: [title] op [datum] [tijd]"
```

### `list_events`
```
Inputs:
  from?: string (YYYY-MM-DD, default: vandaag)
  to?: string (YYYY-MM-DD, default: +7 dagen)
  tags?: string[]
  limit?: number (default: 20)

Output: chronologische lijst van events in het opgegeven bereik

Voorbeeldoutput:
  Ma 24 mrt — 09:00 Tandarts (locatie: Kerkstraat 10)
  Ma 24 mrt — 14:00 Meeting met Thomas
  Di 25 mrt — Verjaardag Sarah [hele dag]
```

### `update_event`
```
Inputs:
  id: UUID
  [alle velden van create_event zijn optioneel]
```

### `delete_event`
```
Inputs:
  id: UUID
```

---

## Notities tools

### `create_note`
```
Inputs:
  content: string (verplicht)
  title?: string
  tags?: string[]
  pinned?: boolean
  also_capture?: boolean (default: false)
  -- indien true: ook als thought opslaan in AI-geheugen

Output: "Notitie opgeslagen: [title|eerste 50 chars]"
```

### `list_notes`
```
Inputs:
  tags?: string[]
  pinned?: boolean
  limit?: number (default: 10)
  search?: string (simpele tekstzoekopdracht, ILIKE)
```

### `search_notes`
```
Inputs:
  query: string
  -- semantische zoekopdracht via AI embeddings (zoals search_thoughts)
```

### `update_note`
```
Inputs:
  id: UUID
  content?: string
  title?: string
  tags?: string[]
  pinned?: boolean
```

### `delete_note`
```
Inputs:
  id: UUID
```

---

## Projecten tools

### `create_project`
```
Inputs:
  title: string
  description?: string
  color?: string (hex, default: #6366f1)
  columns?: string[]
  -- standaard kolommen als niet opgegeven: ["Backlog", "In uitvoering", "Klaar"]
```

### `list_projects`
```
Inputs:
  status?: "active"|"paused"|"completed"|"archived" (default: active)

Output: lijst van projecten met aantal open taken
```

### `create_kanban_card`
```
Inputs:
  project_id: UUID
  title: string
  description?: string
  column: string (kolomnaam of column_id)
  due_date?: string
  tags?: string[]
```

### `move_kanban_card`
```
Inputs:
  card_id: UUID
  to_column: string (kolomnaam of column_id)
  position?: number

Voorbeeldgebruik: "Zet 'Website ontwerpen' naar 'In uitvoering'"
```

### `list_kanban_board`
```
Inputs:
  project_id: UUID

Output: volledig bord met kolommen en kaarten
  Voorbeeld:
  === Project: Website Redesign ===
  [Backlog]
    • Wireframes maken
    • Copywriting
  [In uitvoering]
    • Homepage layout ← jij
  [Klaar]
    • Briefing klant ✓
```

---

## Contacten tools

### `create_contact`
```
Inputs:
  name: string (verplicht)
  email?: string
  phone?: string
  company?: string
  role?: string
  notes?: string
  tags?: string[]
  birthday?: string (YYYY-MM-DD)
```

### `list_contacts`
```
Inputs:
  tags?: string[]
  search?: string (naam, bedrijf, email)
  limit?: number (default: 20)
```

### `get_contact`
```
Inputs:
  id: UUID  OF  name: string

Output: volledig contactprofiel inclusief recente interacties
```

### `log_interaction`
```
Inputs:
  contact_id: UUID  OF  contact_name: string
  type: "call"|"email"|"meeting"|"message"|"note"|"other"
  summary: string
  date?: string (default: vandaag)
  also_capture?: boolean
  -- indien true: ook als thought opslaan

Output: "Interactie gelogd met [naam]: [type] — [summary]"
```

---

## Financiën tools

### `log_finance`
```
Inputs:
  type: "income"|"expense"
  amount: number (positief getal)
  description: string
  category: string
  date?: string (default: vandaag)
  currency?: string (default: EUR)
  tags?: string[]
  recurring?: boolean

Voorbeeldgebruik:
  "Log uitgave: €45 boodschappen"
  "Log inkomen: €2800 salaris januari"
```

### `list_finances`
```
Inputs:
  type?: "income"|"expense"
  category?: string
  from?: string (YYYY-MM-DD)
  to?: string (YYYY-MM-DD)
  limit?: number (default: 20)
```

### `finance_summary`
```
Inputs:
  month?: string (YYYY-MM, default: huidige maand)
  year?: number

Output:
  === Financieel overzicht: maart 2026 ===
  Inkomen:    €3.200,00
  Uitgaven:   €2.150,00
  Saldo:      +€1.050,00

  Top uitgavencategorieën:
    Wonen:        €850 (40%)
    Boodschappen: €320 (15%)
    Vervoer:      €210 (10%)
    ...
```

---

## Gezondheid tools

### `log_health`
```
Inputs:
  type: string (vrij, bijv. "weight", "sleep", "workout", "mood", "steps")
  value?: number
  value_text?: string
  unit?: string
  notes?: string
  date?: string (default: vandaag)
  time_of_day?: string (HH:MM)
  tags?: string[]

Voorbeeldgebruik:
  "Log gewicht: 81.5 kg"
  "Log slaap: 7.5 uur"
  "Log workout: 5km hardlopen in 28 minuten"
  "Log mood: 7/10"
```

### `list_health`
```
Inputs:
  type?: string
  from?: string (YYYY-MM-DD)
  to?: string (YYYY-MM-DD)
  limit?: number (default: 20)
```

### `health_summary`
```
Inputs:
  type: string (bijv. "weight", "sleep")
  days?: number (default: 30)

Output: gemiddelde, trend, min/max over periode
  === Gewicht — laatste 30 dagen ===
  Gemiddelde: 81.8 kg
  Min: 81.1 kg | Max: 82.4 kg
  Trend: -0.3 kg (dalend)
```

---

## Claude Code configuratie (.mcp.json)

Na implementatie sluit Claude Code aan via dit bestand in de repo root:

```json
{
  "mcpServers": {
    "ob1": {
      "type": "http",
      "url": "https://jouw-tunnel.trycloudflare.com/mcp",
      "headers": {
        "x-brain-key": "${OB1_ACCESS_KEY}"
      }
    }
  }
}
```

Of lokaal (zonder tunnel, direct op homelab):
```json
{
  "mcpServers": {
    "ob1": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "x-brain-key": "${OB1_ACCESS_KEY}"
      }
    }
  }
}
```

---

## TODO bij implementatie

- [ ] `server/mcp/thoughts.ts` — migreer bestaande 4 tools
- [ ] `server/mcp/tasks.ts` — 5 tools implementeren
- [ ] `server/mcp/calendar.ts` — 4 tools implementeren
- [ ] `server/mcp/notes.ts` — 5 tools implementeren
- [ ] `server/mcp/projects.ts` — 5 tools implementeren
- [ ] `server/mcp/contacts.ts` — 4 tools implementeren
- [ ] `server/mcp/finances.ts` — 3 tools implementeren
- [ ] `server/mcp/health.ts` — 3 tools implementeren
- [ ] `.mcp.json` aanmaken in repo root
- [ ] Testen: Claude Code herkent alle tools via `/tools list`
