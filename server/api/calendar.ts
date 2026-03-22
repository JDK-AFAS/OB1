// server/api/calendar.ts — REST API routes voor agenda/events
import { Hono } from "hono";
import { sql } from "../db.ts";

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
  if (!body.title) return c.json({ error: "title is required", code: 400 }, 400);
  if (!body.start_at) return c.json({ error: "start_at is required", code: 400 }, 400);

  const [event] = await sql`
    INSERT INTO events (title, start_at, end_at, all_day, description, location, recurring_rule, tags)
    VALUES (
      ${body.title},
      ${body.start_at}::timestamptz,
      ${body.end_at ?? null},
      ${body.all_day ?? false},
      ${body.description ?? null},
      ${body.location ?? null},
      ${body.recurring_rule ?? null},
      ${body.tags ? JSON.stringify(body.tags) : null}::jsonb
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

  const [event] = await sql`
    UPDATE events SET
      title          = COALESCE(${body.title ?? null}, title),
      start_at       = COALESCE(${body.start_at ? sql`${body.start_at}::timestamptz` : null}, start_at),
      end_at         = CASE WHEN ${"end_at" in body} THEN ${body.end_at || null} ELSE end_at END,
      all_day        = COALESCE(${body.all_day ?? null}, all_day),
      description    = COALESCE(${body.description ?? null}, description),
      location       = COALESCE(${body.location ?? null}, location),
      recurring_rule = COALESCE(${body.recurring_rule ?? null}, recurring_rule),
      tags           = CASE WHEN ${"tags" in body}
                         THEN ${body.tags ? JSON.stringify(body.tags) : null}::jsonb
                         ELSE tags END
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
