# App Spec: Financiën

## Doel
Eenvoudig persoonlijk financieel overzicht. Geen bankintegratie (voor nu) — handmatig invoeren via Claude Code. Doel: inzicht in uitgavenpatronen en maandbudget.

## Datamodel
Zie `plan/02-database-schema.md` → `07-finances.sql`

## Kernfunctionaliteit
- Inkomsten en uitgaven loggen
- Categoriseren (vrije tekst, geen vaste enum)
- Maandoverzicht: totaal inkomen, totaal uitgaven, saldo, per categorie
- Jaaroverzicht
- Terugkerende posten markeren (`recurring: true`)

## Categorieën (suggesties, niet afgedwongen)
**Uitgaven:**
- `wonen` — huur, hypotheek, energie, internet
- `boodschappen` — supermarkt, markt
- `vervoer` — OV, brandstof, parkeren, auto
- `gezondheid` — zorgverzekering, apotheek, tandarts
- `abonnementen` — Netflix, Spotify, gym, software
- `entertainment` — uit eten, bioscoop, hobby
- `sport` — sportschool, uitrusting
- `kleding` — kleding, schoenen
- `diversen`

**Inkomen:**
- `salaris`
- `freelance`
- `diversen`

## Voorbeeldinteracties
```
Jij: Log uitgave: €45,80 boodschappen, Albert Heijn
Claude: Uitgave gelogd: €45,80 — boodschappen (22 mrt 2026)

Jij: Log inkomen: €2.800 salaris maart
Claude: Inkomen gelogd: €2.800,00 — salaris (22 mrt 2026)

Jij: Geef me het overzicht van maart
Claude:
  === Financieel overzicht — maart 2026 ===
  Inkomen:   €2.800,00
  Uitgaven:  €1.847,30
  Saldo:     +€952,70

  Uitgaven per categorie:
    wonen:         €850,00  (46%)
    boodschappen:  €312,40  (17%)
    vervoer:       €198,00  (11%)
    abonnementen:  €87,90   (5%)
    diversen:      €399,00  (22%)

Jij: Hoeveel heb ik dit jaar uitgegeven aan boodschappen?
Claude: Boodschappen 2026 (jan-mrt): €891,30
  Gemiddeld per maand: €297,10

Jij: Log terugkerende uitgave: €13,99 Netflix, maandelijks abonnement
Claude: Terugkerende uitgave gelogd: €13,99 — abonnementen (recurring)
```

## Toekomstige uitbreiding
- Budget instellen per categorie met waarschuwingen
- Bank CSV import (bijv. ING, Rabobank exportformaat)
- Grafische weergave via toekomstige frontend
- Belastingrapport (freelance inkomsten, aftrekposten)
- Valuta-ondersteuning (multi-currency)
