# App Spec: Agenda

## Doel
Een persoonlijke agenda volledig beheerbaar via Claude Code. Geen externe kalender-sync (voor nu) — dit is jouw eigen kalender op eigen infrastructuur.

## Datamodel
Zie `plan/02-database-schema.md` → `03-calendar.sql`

## Kernfunctionaliteit
- Events aanmaken met titel, tijd, locatie, beschrijving
- Herhalende events via RRULE strings
- Dagoverzicht, weekoverzicht opvragen via Claude
- Tags voor categorisering (werk, prive, sport, etc.)

## RRULE voorbeelden
```
Wekelijks op maandag:        FREQ=WEEKLY;BYDAY=MO
Dagelijks:                   FREQ=DAILY
Elke 2 weken op vrijdag:     FREQ=WEEKLY;INTERVAL=2;BYDAY=FR
Elke maand op de 1e:         FREQ=MONTHLY;BYMONTHDAY=1
Ma/Woe/Vr:                   FREQ=WEEKLY;BYDAY=MO,WE,FR
```

**Implementatienota:** De server berekent occurrences van herhalende events bij het opvragen. Eenvoudige implementatie: genereer de volgende N occurrences van een RRULE. Bibliotheek: `rrule` (npm).

## Voorbeeldinteracties
```
Jij: Zet een afspraak: tandarts maandag 24 maart om 10:00, duurt een uur
Claude: Event aangemaakt: Tandarts — ma 24 mrt 10:00-11:00

Jij: Wat staat er deze week op mijn agenda?
Claude:
  Ma 24 mrt — 10:00 Tandarts
  Ma 24 mrt — 14:00 Meeting Thomas
  Di 25 mrt — Verjaardag Sarah [hele dag]
  Do 27 mrt — 19:30 Sportschool (wekelijks)

Jij: Maak een wekelijkse afspraak: sportschool elke donderdag 19:30
Claude: Herhalend event aangemaakt: Sportschool — elke do 19:30 (oneindig)
```

## Toekomstige uitbreiding
- Sync met Google Calendar / CalDAV
- iCal export/import
- Herinneringen (push notificaties)
- Gedeelde agenda met anderen

## Beslissingen

- **Tijdzone: niet relevant.** Altijd Nederland (CET/CEST). Timestamps worden opgeslagen als `TIMESTAMP` (zonder tijdzone), behandeld als lokale tijd. Geen conversie nodig, geen complexity.
- **Herhalende events:** Occurrences worden on-the-fly berekend bij opvragen. Geen individuele occurrences opslaan in de database.
