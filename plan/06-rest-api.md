# Plan 06 — REST API

## Doel

Naast de MCP-laag komt een REST API. Die is nu nog niet nodig (Claude Code is de primaire interface), maar is essentieel zodra je een frontend bouwt.

De REST API is **identiek van opzet** aan de MCP tools — dezelfde database queries, gewoon via HTTP in plaats van MCP protocol.

---

## Authenticatie

Zelfde API key als MCP:
```
Header: x-brain-key: <MCP_ACCESS_KEY>
```

---

## Base URL

```
http://localhost:3000/api/...        ← lokaal
https://jouw-tunnel.trycloudflare.com/api/...  ← via tunnel
```

---

## Endpoints per resource

### Taken `/api/tasks`

```
GET    /api/tasks              — lijst (filter: ?done=false&priority=1&due_before=2026-04-01)
POST   /api/tasks              — aanmaken
GET    /api/tasks/:id          — details
PATCH  /api/tasks/:id          — bijwerken
DELETE /api/tasks/:id          — verwijderen
POST   /api/tasks/:id/complete — afvinken (shortcut)
```

**GET /api/tasks — query parameters:**
- `done` (boolean, default: false)
- `priority` (1-4)
- `project_id` (UUID)
- `due_before` (YYYY-MM-DD)
- `tags` (kommagescheiden)
- `limit` (default: 50)
- `offset` (paginatie)

**POST /api/tasks — body:**
```json
{
  "title": "Belasting aangifte doen",
  "due_date": "2026-04-01",
  "priority": 1,
  "tags": ["financiën", "deadline"]
}
```

---

### Agenda `/api/events`

```
GET    /api/events             — lijst (filter: ?from=2026-03-22&to=2026-03-29)
POST   /api/events             — aanmaken
GET    /api/events/:id         — details
PATCH  /api/events/:id         — bijwerken
DELETE /api/events/:id         — verwijderen
```

**GET /api/events — query parameters:**
- `from` (YYYY-MM-DD, default: vandaag)
- `to` (YYYY-MM-DD, default: +7 dagen)
- `tags` (kommagescheiden)

---

### Notities `/api/notes`

```
GET    /api/notes              — lijst
POST   /api/notes              — aanmaken
GET    /api/notes/:id          — details
PATCH  /api/notes/:id          — bijwerken
DELETE /api/notes/:id          — verwijderen
GET    /api/notes/search?q=... — semantisch zoeken
```

---

### Projecten `/api/projects`

```
GET    /api/projects                      — lijst
POST   /api/projects                      — aanmaken
GET    /api/projects/:id                  — details + kolommen
PATCH  /api/projects/:id                  — bijwerken
DELETE /api/projects/:id                  — archiveren (soft delete)

GET    /api/projects/:id/board            — volledig kanban bord
POST   /api/projects/:id/columns          — kolom toevoegen
POST   /api/projects/:id/cards            — kaart toevoegen
PATCH  /api/cards/:id                     — kaart bijwerken
PATCH  /api/cards/:id/move                — kaart verplaatsen
DELETE /api/cards/:id                     — kaart verwijderen
```

---

### Contacten `/api/contacts`

```
GET    /api/contacts           — lijst
POST   /api/contacts           — aanmaken
GET    /api/contacts/:id       — details + interacties
PATCH  /api/contacts/:id       — bijwerken
DELETE /api/contacts/:id       — verwijderen

GET    /api/contacts/:id/interactions     — interactie historie
POST   /api/contacts/:id/interactions     — interactie loggen
```

---

### Financiën `/api/finances`

```
GET    /api/finances           — lijst (filter: ?type=expense&category=boodschappen)
POST   /api/finances           — entry aanmaken
GET    /api/finances/:id       — details
PATCH  /api/finances/:id       — bijwerken
DELETE /api/finances/:id       — verwijderen

GET    /api/finances/summary   — maandoverzicht (?month=2026-03)
```

---

### Gezondheid `/api/health`

```
GET    /api/health             — lijst (filter: ?type=weight&from=2026-03-01)
POST   /api/health             — entry loggen
GET    /api/health/:id         — details
DELETE /api/health/:id         — verwijderen

GET    /api/health/summary     — samenvatting (?type=sleep&days=30)
```

---

### Thoughts `/api/thoughts`

```
GET    /api/thoughts           — lijst
POST   /api/thoughts           — capture (zelfde als MCP capture_thought)
GET    /api/thoughts/search?q= — semantisch zoeken
```

---

## Response formaat

**Succes:**
```json
{
  "data": { ... },
  "meta": { "count": 1 }
}
```

**Lijst:**
```json
{
  "data": [...],
  "meta": { "count": 42, "limit": 50, "offset": 0 }
}
```

**Fout:**
```json
{
  "error": "Not found",
  "code": 404
}
```

---

## Hono route structuur

```typescript
// server/api/tasks.ts
import { Hono } from "hono";
import { sql } from "../db.ts";

export const taskRoutes = new Hono();

taskRoutes.get("/", async (c) => {
  const { done = "false", priority, limit = "50", offset = "0" } = c.req.query();

  const tasks = await sql`
    SELECT * FROM tasks
    WHERE done = ${done === "true"}
    ${priority ? sql`AND priority = ${parseInt(priority)}` : sql``}
    ORDER BY priority ASC, due_date ASC NULLS LAST
    LIMIT ${parseInt(limit)}
    OFFSET ${parseInt(offset)}
  `;

  return c.json({ data: tasks, meta: { count: tasks.length } });
});

taskRoutes.post("/", async (c) => {
  const body = await c.req.json();
  // validatie + insert
  const [task] = await sql`
    INSERT INTO tasks (title, description, due_date, priority, tags)
    VALUES (${body.title}, ${body.description}, ${body.due_date}, ${body.priority ?? 3}, ${body.tags ?? []})
    RETURNING *
  `;
  return c.json({ data: task }, 201);
});

// ... patch, delete, complete
```

---

## TODO bij implementatie

- [ ] `server/api/tasks.ts` — volledige CRUD
- [ ] `server/api/calendar.ts` — volledige CRUD
- [ ] `server/api/notes.ts` — volledige CRUD + search
- [ ] `server/api/projects.ts` — CRUD + kanban operaties
- [ ] `server/api/contacts.ts` — CRUD + interacties
- [ ] `server/api/finances.ts` — CRUD + summary
- [ ] `server/api/health.ts` — CRUD + summary
- [ ] `server/api/thoughts.ts` — lijst + capture + search
- [ ] Routes registreren in `index.ts`
- [ ] Testen: alle endpoints met curl of Postman
- [ ] Overwegen: OpenAPI/Swagger genereren voor toekomstige frontend
