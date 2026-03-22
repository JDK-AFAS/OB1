# App Spec: Contacten / CRM

## Doel
Persoonlijk contactbeheer met interactie-log. Geen verkoop-CRM, maar een systeem om bij te houden met wie je contact hebt, wanneer, en wat er is besproken. Integreert met het AI-geheugen voor rijke context.

## Datamodel
Zie `plan/02-database-schema.md` → `06-contacts.sql`

Twee tabellen:
- `contacts` — de persoon
- `contact_interactions` — elk gesprek/contact moment

## Kernfunctionaliteit
- Contact aanmaken met naam, email, telefoon, bedrijf, rol, notities
- Interacties loggen (gesprek, email, meeting, bericht)
- Verjaardag bijhouden
- Tags voor groepering (familie, werk, vrienden, zakelijk)
- Optioneel: interactie ook als thought opslaan (voor semantisch terugvinden)

## Voorbeeldinteracties
```
Jij: Voeg contact toe: Thomas Bakker, thomas@werk.nl, senior developer bij Acme
Claude: Contact aangemaakt: Thomas Bakker
  Email: thomas@werk.nl | Bedrijf: Acme | Rol: Senior Developer

Jij: Log een gesprek met Thomas: hebben gediscussieerd over architectuurkeuzes voor het nieuwe platform
Claude: Interactie gelogd met Thomas Bakker:
  Gesprek — 22 mrt 2026
  "Hebben gediscussieerd over architectuurkeuzes voor het nieuwe platform"

Jij: Wanneer heb ik Thomas voor het laatst gesproken?
Claude: Thomas Bakker — laatste contact: 22 mrt 2026
  Gesprek: "architectuurkeuzes voor het nieuwe platform"

Jij: Wie heb ik de afgelopen maand niet gesproken?
Claude: Contacten zonder interactie afgelopen 30 dagen:
  • Sarah de Vries (laatste: 5 feb)
  • Mark Jansen (laatste: 15 jan)
  • ...

Jij: Zoek in mijn geheugen wat ik weet over Thomas
Claude: [gebruikt search_thoughts met query "Thomas Bakker"]
  Gevonden 3 relevante thoughts + 2 interacties
```

## Verjaardagenlijst
```
Jij: Wie heeft er binnenkort verjaardag?
Claude: Verjaardagen komende 30 dagen:
  • Sarah de Vries — 2 april (over 11 dagen)
  • Mark Jansen — 15 april (over 24 dagen)
```

## Integratie met AI-geheugen
Interacties kunnen optioneel als `thought` worden opgeslagen:
```typescript
// Bij log_interaction met also_capture: true
await sql`INSERT INTO contact_interactions ...`;
await captureThought(`Gesprek met ${contact.name}: ${summary}`);
```

Dit maakt contactinformatie doorzoekbaar via semantische zoekopdrachten.

## Toekomstige uitbreiding
- Import vanuit LinkedIn / vCard
- Email integratie (automatisch interacties loggen)
- Herinneringen ("neem contact op met X over 3 maanden")
- Bedrijven als aparte entiteit
