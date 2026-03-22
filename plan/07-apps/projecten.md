# App Spec: Projecten / Kanban

## Doel
Projectbeheer met een kanban-bord structuur, volledig via Claude Code beheerbaar. Taken kunnen aan projecten gekoppeld worden.

## Datamodel
Zie `plan/02-database-schema.md` → `05-projects.sql`

Drie tabellen:
- `projects` — het project zelf
- `kanban_columns` — kolommen per project (volgorde via `position`)
- `kanban_cards` — kaarten per kolom

## Relatie met Taken
- Taken (`tasks`) kunnen een `project_id` hebben
- Kanban cards zijn lichter dan taken (geen priority systeem, meer visueel)
- Keuze per project: gebruik je taken of kanban cards (of beiden)

## Standaard kolommen (bij aanmaken project)
```
Backlog → In uitvoering → Review → Klaar
```
Aanpasbaar per project.

## Voorbeeldinteracties
```
Jij: Maak project: Website Redesign
Claude: Project aangemaakt: Website Redesign
  Kolommen: Backlog | In uitvoering | Review | Klaar

Jij: Voeg kaart toe aan Website Redesign: Wireframes maken, in Backlog
Claude: Kaart aangemaakt: Wireframes maken → Backlog

Jij: Toon het kanban bord van Website Redesign
Claude:
  === Website Redesign ===
  [Backlog]
    • Wireframes maken
    • Copywriting
    • Foto's selecteren
  [In uitvoering]
    • Homepage layout
  [Review]
    (leeg)
  [Klaar]
    • Briefing klant ✓

Jij: Verplaats "Wireframes maken" naar In uitvoering
Claude: Kaart verplaatst: Wireframes maken → In uitvoering

Jij: Toon al mijn actieve projecten
Claude:
  • Website Redesign (3 open, 1 in uitvoering)
  • Verbouwing badkamer (7 open)
  • Belasting 2026 (2 open, 1 klaar)
```

## Toekomstige uitbreiding
- Deadlines per project
- Projecten koppelen aan contacten (bijv. klantprojecten)
- Tijdregistratie per kaart/project
- Gantt-achtige weergave via Claude (tekstueel)
