// server/api/finances.ts — REST API routes voor financiën
import { Hono } from "hono";
import { sql } from "../db.ts";
import { FinanceCreateSchema, validationError } from "../validation.ts";

export const financeRoutes = new Hono();

// GET /api/finances/summary — moet vóór /:id staan
financeRoutes.get("/summary", async (c) => {
  const { month } = c.req.query();
  const m = month ?? new Date().toISOString().slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const fromDate = `${y}-${String(mo).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const toDate = `${y}-${String(mo).padStart(2, "0")}-${lastDay}`;

  const [totals] = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) AS total_expense
    FROM finances
    WHERE date >= ${fromDate} AND date <= ${toDate}
  `;

  const categories = await sql`
    SELECT category, SUM(ABS(amount)) AS total
    FROM finances
    WHERE type = 'expense' AND date >= ${fromDate} AND date <= ${toDate}
    GROUP BY category
    ORDER BY total DESC
    LIMIT 10
  `;

  const income = Number(totals.total_income);
  const expense = Number(totals.total_expense);

  return c.json({
    data: {
      period: m,
      from: fromDate,
      to: toDate,
      total_income: income,
      total_expense: expense,
      balance: income - expense,
      top_expense_categories: categories.map((r) => ({
        category: r.category,
        total: Number(r.total),
      })),
    },
  });
});

// GET /api/finances
financeRoutes.get("/", async (c) => {
  const { type, category, from, to, limit = "50", offset = "0" } = c.req.query();

  const rows = await sql`
    SELECT id, type, amount, description, category, date, currency, tags, recurring, created_at
    FROM finances
    WHERE 1=1
    ${type ? sql`AND type = ${type}` : sql``}
    ${category ? sql`AND category ILIKE ${"%" + category + "%"}` : sql``}
    ${from ? sql`AND date >= ${from}` : sql``}
    ${to ? sql`AND date <= ${to}` : sql``}
    ORDER BY date DESC
    LIMIT ${parseInt(limit)}
    OFFSET ${parseInt(offset)}
  `;

  return c.json({ data: rows, meta: { count: rows.length, limit: parseInt(limit), offset: parseInt(offset) } });
});

// POST /api/finances
financeRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = FinanceCreateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const sign = d.type === "expense" ? -1 : 1;
  const entryDate = d.date ?? new Date().toISOString().slice(0, 10);

  const [entry] = await sql`
    INSERT INTO finances (type, amount, description, category, date, currency, tags, recurring)
    VALUES (
      ${d.type},
      ${sign * Math.abs(d.amount)},
      ${d.description},
      ${d.category},
      ${entryDate},
      ${d.currency ?? "EUR"},
      ${d.tags ? JSON.stringify(d.tags) : null}::jsonb,
      ${d.recurring ?? false}
    )
    RETURNING *
  `;
  return c.json({ data: entry }, 201);
});

// GET /api/finances/:id
financeRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [entry] = await sql`SELECT * FROM finances WHERE id = ${id}`;
  if (!entry) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: entry });
});

// PATCH /api/finances/:id
financeRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const [entry] = await sql`
    UPDATE finances SET
      type        = COALESCE(${body.type ?? null}, type),
      amount      = COALESCE(${body.amount ?? null}, amount),
      description = COALESCE(${body.description ?? null}, description),
      category    = COALESCE(${body.category ?? null}, category),
      date        = COALESCE(${body.date ?? null}, date),
      currency    = COALESCE(${body.currency ?? null}, currency),
      recurring   = COALESCE(${body.recurring ?? null}, recurring),
      tags        = CASE WHEN ${"tags" in body}
                      THEN ${body.tags ? JSON.stringify(body.tags) : null}::jsonb
                      ELSE tags END
    WHERE id = ${id}
    RETURNING *
  `;
  if (!entry) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: entry });
});

// DELETE /api/finances/:id
financeRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await sql`DELETE FROM finances WHERE id = ${id}`;
  return c.json({ data: null }, 204);
});
