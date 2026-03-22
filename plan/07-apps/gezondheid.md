# App Spec: Gezondheid & Sport

## Doel
Flexibel gezondheids- en sporttracker die je zelf vormgeeft. Geen vaste categorieën — jij bepaalt wat je bijhoudt. Doel: trends zien, gewoontes bijhouden, stimuleren.

## Datamodel
Zie `plan/02-database-schema.md` → `08-health.sql`

## Flexibel type-systeem
Geen enum — elk `type` is een string die jij zelf kiest. Hierdoor kun je alles bijhouden zonder schema-wijzigingen:

| Type | value | unit | value_text |
|---|---|---|---|
| `weight` | 81.5 | kg | — |
| `sleep` | 7.5 | hours | — |
| `steps` | 8420 | steps | — |
| `mood` | 7 | 1-10 | — |
| `workout` | — | — | "5km hardlopen, 28 min" |
| `water` | 2.1 | liters | — |
| `blood_pressure` | — | — | "120/80" |
| `custom_metric` | — | — | "Vrije tekst" |

## Voorbeeldinteracties
```
Jij: Log mijn gewicht: 81.5 kg
Claude: Gelogd: gewicht — 81.5 kg (22 mrt 2026)

Jij: Log slaap: 7 uur en 20 minuten
Claude: Gelogd: slaap — 7.3 uur (22 mrt 2026)

Jij: Log workout: 5km hardlopen buiten in 27 minuten, lekker gelopen
Claude: Gelogd: workout — "5km hardlopen buiten in 27 minuten, lekker gelopen" (22 mrt 2026)

Jij: Log mood: 8 uit 10
Claude: Gelogd: mood — 8/10 (22 mrt 2026)

Jij: Wat is mijn gemiddelde slaap de afgelopen maand?
Claude:
  === Slaap — laatste 30 dagen ===
  Gemiddelde: 7.1 uur
  Min: 5.5 uur | Max: 8.5 uur
  Trend: stabiel (+0.1 uur t.o.v. vorige maand)
  Dagen bijgehouden: 24/30

Jij: Toon mijn gewichtstrend dit jaar
Claude:
  Gewicht 2026:
  Jan gem: 82.8 kg
  Feb gem: 82.1 kg
  Mrt gem: 81.5 kg (t/m nu)
  Trend: -1.3 kg (dalend ↓)

Jij: Hoeveel heb ik getraind deze maand?
Claude:
  Workouts maart: 8x
  Laatste 7 dagen: 3x
  Types: hardlopen (5x), fietsen (2x), krachttraining (1x)
```

## Stimilanten / doelen (toekomstige uitbreiding)
- Dagdoelen instellen: "minimaal 7 uur slaap"
- Streak bijhouden: "X dagen op rij getraind"
- Wekelijkse check-in via Claude

## Integratie met AI-geheugen
Bijzondere workout-momenten of inzichten kun je ook als thought opslaan:
```
Jij: Sla op in mijn geheugen: vandaag mijn persoonlijk record gelopen, 5km in 25:30
Claude: Thought captured: "Persoonlijk record 5km — 25:30" (type: observation)
       + health entry gelogd: workout — "PR 5km in 25:30"
```

## Toekomstige uitbreiding
- Apple Health / Google Fit import
- Automatische sync via wearable API (Garmin, Fitbit, Polar)
- Grafieken in toekomstige frontend
- Doelen en streaks
- Slaapkwaliteit (fasen) als value_text
