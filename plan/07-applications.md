# Plan 07 — Applicaties: Validatie & Afwerking

## Doel

De REST API routes die in plan 06 zijn aangemaakt hebben minimale inputvalidatie.
Dit plan voegt Zod-schemata toe aan alle routes, een gedeeld error-handler middleware,
en een `/api/info` endpoint dat alle beschikbare routes en tools opsomt.

---

## Wat wordt gebouwd

### 1. Gedeeld validatiemodule (`server/validation.ts`)

Zod-schemata voor alle applicaties:

- `TaskCreateSchema` / `TaskUpdateSchema`
- `EventCreateSchema` / `EventUpdateSchema`
- `NoteCreateSchema` / `NoteUpdateSchema`
- `ProjectCreateSchema` / `ProjectUpdateSchema`
- `ContactCreateSchema` / `ContactUpdateSchema`
- `FinanceCreateSchema`
- `HealthCreateSchema`
- `ThoughtCreateSchema`

### 2. Validatie in alle REST API routes

Elk POST/PATCH endpoint:
1. Parsed de request body met `schema.safeParse(body)`
2. Retourneert `400 { error: "Validation failed", details: [...] }` bij fouten
3. Gebruikt alleen het gecleansde, getypte object voor de SQL query

### 3. Error handler middleware (`server/index.ts`)

Catch-all voor onverwachte database-errors:
```typescript
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});
```

### 4. `/api/info` endpoint

Geeft een overzicht van alle beschikbare routes en applicaties:
```json
{
  "version": "2.0.0",
  "apps": ["tasks","events","notes","projects","contacts","finances","health","thoughts"],
  "routes": { ... }
}
```

---

## Zod-schemata per applicatie

### Tasks
```typescript
TaskCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  due_date: z.string().datetime({ offset: true }).optional().nullable(),
  priority: z.number().int().min(1).max(4).default(3),
  project_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
});
TaskUpdateSchema = TaskCreateSchema.partial();
```

### Calendar
```typescript
EventCreateSchema = z.object({
  title: z.string().min(1).max(255),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  description: z.string().optional(),
  location: z.string().optional(),
  rrule: z.string().optional(),
  all_day: z.boolean().default(false),
});
EventUpdateSchema = EventCreateSchema.partial();
```

### Notes
```typescript
NoteCreateSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional(),
  pinned: z.boolean().default(false),
  thought_id: z.string().uuid().optional().nullable(),
});
NoteUpdateSchema = NoteCreateSchema.partial();
```

### Projects
```typescript
ProjectCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(["active","archived"]).default("active"),
});
ProjectUpdateSchema = ProjectCreateSchema.partial();
ColumnCreateSchema = z.object({
  name: z.string().min(1).max(100),
  position: z.number().int().min(0),
});
CardCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  column_id: z.string().uuid(),
  position: z.number().int().min(0).default(0),
});
CardMoveSchema = z.object({
  column_id: z.string().uuid(),
  position: z.number().int().min(0),
});
```

### Contacts
```typescript
ContactCreateSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});
ContactUpdateSchema = ContactCreateSchema.partial();
InteractionCreateSchema = z.object({
  type: z.string().min(1).max(50),
  notes: z.string().optional(),
  occurred_at: z.string().datetime({ offset: true }).optional(),
});
```

### Finances
```typescript
FinanceCreateSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(["income","expense"]),
  category: z.string().max(100).optional(),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
```

### Health
```typescript
HealthCreateSchema = z.object({
  type: z.string().min(1).max(100),
  value: z.number(),
  unit: z.string().max(50).optional(),
  notes: z.string().optional(),
  measured_at: z.string().datetime({ offset: true }).optional(),
});
```

### Thoughts
```typescript
ThoughtCreateSchema = z.object({
  content: z.string().min(1),
  type: z.string().max(50).optional(),
  topic: z.string().max(255).optional(),
  person: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
});
```

---

## Implementatie-aanpak

Voor elk POST/PATCH endpoint in de API-bestanden:

```typescript
import { TaskCreateSchema } from "../validation.ts";

taskRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = TaskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.issues }, 400);
  }
  const data = parsed.data;
  // ... rest van de SQL query gebruikt data.title, data.priority, etc.
});
```

---

## TODO bij implementatie

- [ ] Maak `server/validation.ts` met alle Zod-schemata
- [ ] Update `server/api/tasks.ts` — validatie op POST en PATCH
- [ ] Update `server/api/calendar.ts` — validatie op POST en PATCH
- [ ] Update `server/api/notes.ts` — validatie op POST en PATCH
- [ ] Update `server/api/projects.ts` — validatie op POST project, POST column, POST card, PATCH card/move
- [ ] Update `server/api/contacts.ts` — validatie op POST contact, PATCH contact, POST interaction
- [ ] Update `server/api/finances.ts` — validatie op POST
- [ ] Update `server/api/health.ts` — validatie op POST
- [ ] Update `server/api/thoughts.ts` — validatie op POST
- [ ] Voeg `app.onError()` toe aan `server/index.ts`
- [ ] Voeg `/api/info` endpoint toe aan `server/index.ts`
- [ ] Commit en push
