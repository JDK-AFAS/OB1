// server/api/calendar.ts — REST API routes voor agenda/events
import { Hono } from "hono";
import { sql } from "../db.ts";
import { EventCreateSchema, EventUpdateSchema, validationError } from "../validation.ts";

export const calendarRoutes = new Hono();

// GET /api/events
calendarRoutes.get("/", async (c) => {
  const { from, to, tags, limit = "50", offset = "0" } = c.req.query();
  const fromDate = from ?? new Date().toISOString().slice(0, 10);
  const toDate = to ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const tagsArr = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : null;

  const rows = await sql`
    SELECT id, title, start_at, end_at, all_day, description, location, recurring_rule, tags, created_at, updated_at
    FROM events
    WHERE start_at >= ${fromDate}::date
      AND start_at < (${toDate}::date + INTERVAL '1 day')
    ${tagsArr && tagsArr.length > 0 ? sql`AND tags ?| ${tagsArr}` : sql``}
    ORDER BY start_at ASC
    LIMIT ${parseInt(limit)}
    OFFSET ${parseInt(offset)}
  `;

  return c.json({ data: rows, meta: { count: rows.length, limit: parseInt(limit), offset: parseInt(offset) } });
});

// POST /api/events
calendarRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = EventCreateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [event] = await sql`
    INSERT INTO events (title, start_at, end_at, all_day, description, location, recurring_rule, tags)
    VALUES (
      ${d.title},
      ${d.start_at}::timestamptz,
      ${d.end_at ?? null},
      ${d.all_day},
      ${d.description ?? null},
      ${d.location ?? null},
      ${d.recurring_rule ?? null},
      null
    )
    RETURNING *
  `;
  return c.json({ data: event }, 201);
});

// GET /api/events/:id
calendarRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [event] = await sql`SELECT * FROM events WHERE id = ${id}`;
  if (!event) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: event });
});

// PATCH /api/events/:id
calendarRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = EventUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [event] = await sql`
    UPDATE events SET
      title          = COALESCE(${d.title ?? null}, title),
      start_at       = COALESCE(${d.start_at ? sql`${d.start_at}::timestamptz` : null}, start_at),
      end_at         = CASE WHEN ${"end_at" in d} THEN ${d.end_at || null} ELSE end_at END,
      all_day        = COALESCE(${d.all_day ?? null}, all_day),
      description    = COALESCE(${d.description ?? null}, description),
      location       = COALESCE(${d.location ?? null}, location),
      recurring_rule = COALESCE(${d.recurring_rule ?? null}, recurring_rule)
    WHERE id = ${id}
    RETURNING *
  `;
  if (!event) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: event });
});

// DELETE /api/events/:id
calendarRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await sql`DELETE FROM events WHERE id = ${id}`;
  return c.json({ data: null }, 204);
});
