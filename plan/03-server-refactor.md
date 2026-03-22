# Plan 03 — Server Refactor (Supabase → Direct PostgreSQL)

## Doel

De huidige `server/index.ts` gebruikt:
1. `@supabase/supabase-js` als database client
2. `jsr:@supabase/functions-js/edge-runtime.d.ts` (Supabase Edge Runtime types)
3. `Deno.serve()` (blijft, want we houden Deno)

Dit wordt vervangen door:
1. `postgres` npm package (Deno-compatible, directe SQL)
2. Verwijderen van Supabase-specifieke imports
3. Zelfde Hono + MCP setup (blijft)

---

## Nieuwe structuur van server/

```
server/
├── index.ts              ← entry point (Hono app + auth middleware)
├── db.ts                 ← database connectie module
├── ai.ts                 ← AI provider abstractie (zie plan 04)
├── mcp/
│   ├── thoughts.ts       ← bestaande 4 MCP tools
│   ├── tasks.ts          ← nieuwe MCP tools voor taken
│   ├── calendar.ts       ← nieuwe MCP tools voor agenda
│   ├── notes.ts          ← nieuwe MCP tools voor notities
│   ├── projects.ts       ← nieuwe MCP tools voor projecten
│   ├── contacts.ts       ← nieuwe MCP tools voor contacten
│   ├── finances.ts       ← nieuwe MCP tools voor financiën
│   └── health.ts         ← nieuwe MCP tools voor gezondheid
├── api/
│   ├── tasks.ts          ← REST routes voor taken
│   ├── calendar.ts       ← REST routes voor agenda
│   ├── notes.ts          ← REST routes voor notities
│   ├── projects.ts       ← REST routes voor projecten
│   ├── contacts.ts       ← REST routes voor contacten
│   ├── finances.ts       ← REST routes voor financiën
│   └── health.ts         ← REST routes voor gezondheid
├── Dockerfile
└── deno.json
```

---

## db.ts — Database module

```typescript
// server/db.ts
import postgres from "npm:postgres@3";

const DATABASE_URL = Deno.env.get("DATABASE_URL")!;

// Singleton connectie pool
export const sql = postgres(DATABASE_URL, {
  max: 10,           // max connections in pool
  idle_timeout: 30,  // seconds
  connect_timeout: 10,
});

// Typed query helper
export async function query<T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return sql<T[]>(strings, ...values);
}
```

**Gebruik in de rest van de code:**
```typescript
import { sql } from "./db.ts";

// In plaats van: supabase.from("thoughts").select(...)
const thoughts = await sql<Thought[]>`
  SELECT id, content, metadata, created_at
  FROM thoughts
  ORDER BY created_at DESC
  LIMIT ${limit}
`;

// In plaats van: supabase.rpc("match_thoughts", {...})
const results = await sql<MatchResult[]>`
  SELECT * FROM match_thoughts(
    ${embedding}::vector,
    ${threshold},
    ${limit},
    ${filter}::jsonb
  )
`;
```

---

## deno.json — Bijgewerkte dependencies

```json
{
  "imports": {
    "hono":                        "npm:hono@4.9.2",
    "@hono/mcp":                   "npm:@hono/mcp@0.1.1",
    "@modelcontextprotocol/sdk":   "npm:@modelcontextprotocol/sdk@1.24.3",
    "zod":                         "npm:zod@4.1.13",
    "postgres":                    "npm:postgres@3.4.5"
  }
}
```

**Verwijderd:** `@supabase/supabase-js`
**Toegevoegd:** `postgres`

---

## index.ts — Nieuwe structuur (schets)

```typescript
// server/index.ts
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";

// DB + AI modules
import { sql } from "./db.ts";
import { getAiProvider } from "./ai.ts";

// MCP tool registraties
import { registerThoughtTools } from "./mcp/thoughts.ts";
import { registerTaskTools } from "./mcp/tasks.ts";
import { registerCalendarTools } from "./mcp/calendar.ts";
import { registerNoteTools } from "./mcp/notes.ts";
import { registerProjectTools } from "./mcp/projects.ts";
import { registerContactTools } from "./mcp/contacts.ts";
import { registerFinanceTools } from "./mcp/finances.ts";
import { registerHealthTools } from "./mcp/health.ts";

// REST API routes
import { taskRoutes } from "./api/tasks.ts";
import { calendarRoutes } from "./api/calendar.ts";
// ... etc

const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY")!;
const PORT = parseInt(Deno.env.get("PORT") || "3000");

// MCP Server
const mcpServer = new McpServer({ name: "ob1", version: "2.0.0" });

// Tools registreren
const ai = getAiProvider();
registerThoughtTools(mcpServer, sql, ai);
registerTaskTools(mcpServer, sql);
registerCalendarTools(mcpServer, sql);
registerNoteTools(mcpServer, sql, ai);
registerProjectTools(mcpServer, sql);
registerContactTools(mcpServer, sql, ai);
registerFinanceTools(mcpServer, sql);
registerHealthTools(mcpServer, sql);

// Hono App
const app = new Hono();

// Auth middleware
app.use("*", async (c, next) => {
  const key = c.req.header("x-brain-key")
    ?? new URL(c.req.url).searchParams.get("key");
  if (!key || key !== MCP_ACCESS_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// MCP endpoint
app.all("/mcp/*", async (c) => {
  const transport = new StreamableHTTPTransport();
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

// REST API endpoints
app.route("/api/tasks", taskRoutes);
app.route("/api/calendar", calendarRoutes);
// ... etc

// Health check (geen auth vereist)
app.get("/health", (c) => c.json({ status: "ok", version: "2.0.0" }));

Deno.serve({ port: PORT }, app.fetch);
```

---

## Wat verandert per bestaande MCP tool

### search_thoughts

**Oud:**
```typescript
const { data, error } = await supabase.rpc("match_thoughts", {
  query_embedding: qEmb,
  match_threshold: threshold,
  match_count: limit,
  filter: {},
});
```

**Nieuw:**
```typescript
const data = await sql<MatchResult[]>`
  SELECT * FROM match_thoughts(
    ${JSON.stringify(qEmb)}::vector,
    ${threshold},
    ${limit},
    '{}'::jsonb
  )
`;
```

### list_thoughts

**Oud:** Supabase query builder met `.contains()`, `.gte()`, etc.

**Nieuw:** Directe SQL met optionele WHERE clauses samengesteld als array van conditions.

### thought_stats

**Oud:** Twee aparte Supabase queries (count + data).

**Nieuw:** Eén SQL query met aggregaties.

### capture_thought

**Oud:**
```typescript
const { error } = await supabase.from("thoughts").insert({ ... });
```

**Nieuw:**
```typescript
await sql`
  INSERT INTO thoughts (content, embedding, metadata)
  VALUES (${content}, ${JSON.stringify(embedding)}::vector, ${JSON.stringify(metadata)})
`;
```

---

## Refactor aanpak (aanbevolen volgorde)

1. `db.ts` aanmaken en testen (directe SQL query werkt)
2. `ai.ts` aanmaken (zie plan 04)
3. `mcp/thoughts.ts` — bestaande 4 tools migreren (geen nieuwe functionaliteit)
4. `index.ts` herschrijven met nieuwe structuur
5. Testen: alle 4 bestaande tools werken correct
6. Daarna per app: `mcp/tasks.ts`, `api/tasks.ts`, etc.

---

## TODO bij implementatie

- [ ] `server/db.ts` aanmaken
- [ ] `server/ai.ts` aanmaken (zie plan 04)
- [ ] `server/mcp/` directory aanmaken
- [ ] `server/api/` directory aanmaken
- [ ] `server/mcp/thoughts.ts` — migreer bestaande 4 tools
- [ ] `server/index.ts` herschrijven
- [ ] `server/deno.json` updaten (supabase verwijderen, postgres toevoegen)
- [ ] Testen: Docker build slaagt
- [ ] Testen: health endpoint bereikbaar
- [ ] Testen: alle 4 bestaande MCP tools werken
