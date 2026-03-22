// server/api/health.ts — REST API routes voor gezondheid
import { Hono } from "hono";
import { sql } from "../db.ts";
import { HealthCreateSchema, validationError } from "../validation.ts";

export const healthRoutes = new Hono();

// GET /api/health/summary — moet vóór /:id staan
healthRoutes.get("/summary", async (c) => {
  const { type, days = "30" } = c.req.query();
  if (!type) return c.json({ error: "type parameter is required", code: 400 }, 400);

  const from = new Date(Date.now() - parseInt(days) * 86400000).toISOString().slice(0, 10);

  const rows = await sql`
    SELECT value, date
    FROM health_logs
    WHERE type = ${type}
      AND value IS NOT NULL
      AND date >= ${from}
    ORDER BY date ASC
  `;

  if (rows.length === 0) {
    return c.json({ data: { type, days: parseInt(days), count: 0, message: "No data found" } });
  }

  const values = rows.map((r) => Number(r.value));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  let trend: string | null = null;
  if (firstHalf.length > 0 && secondHalf.length > 0) {
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const diff = avgSecond - avgFirst;
    trend = Math.abs(diff) < 0.01 ? "stable" : diff > 0 ? "rising" : "falling";
  }

  return c.json({
    data: {
      type,
      days: parseInt(days),
      count: rows.length,
      average: parseFloat(avg.toFixed(4)),
      min,
      max,
      trend,
    },
  });
});

// GET /api/health
healthRoutes.get("/", async (c) => {
  const { type, from, to, limit = "50", offset = "0" } = c.req.query();

  const rows = await sql`
    SELECT id, type, value, value_text, unit, notes, date, time_of_day, tags, created_at
    FROM health_logs
    WHERE 1=1
    ${type ? sql`AND type = ${type}` : sql``}
    ${from ? sql`AND date >= ${from}` : sql``}
    ${to ? sql`AND date <= ${to}` : sql``}
    ORDER BY date DESC, time_of_day DESC NULLS LAST
    LIMIT ${parseInt(limit)}
    OFFSET ${parseInt(offset)}
  `;

  return c.json({ data: rows, meta: { count: rows.length, limit: parseInt(limit), offset: parseInt(offset) } });
});

// POST /api/health
healthRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = HealthCreateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const entryDate = d.date ?? new Date().toISOString().slice(0, 10);

  const [entry] = await sql`
    INSERT INTO health_logs (type, value, value_text, unit, notes, date, time_of_day, tags)
    VALUES (
      ${d.type},
      ${d.value ?? null},
      ${d.value_text ?? null},
      ${d.unit ?? null},
      ${d.notes ?? null},
      ${entryDate},
      ${d.time_of_day ?? null},
      ${d.tags ? JSON.stringify(d.tags) : null}::jsonb
    )
    RETURNING *
  `;
  return c.json({ data: entry }, 201);
});

// GET /api/health/:id
healthRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [entry] = await sql`SELECT * FROM health_logs WHERE id = ${id}`;
  if (!entry) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: entry });
});

// DELETE /api/health/:id
healthRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await sql`DELETE FROM health_logs WHERE id = ${id}`;
  return c.json({ data: null }, 204);
});
