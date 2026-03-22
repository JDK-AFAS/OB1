// server/api/tasks.ts — REST API routes voor taken
import { Hono } from "hono";
import { sql } from "../db.ts";

export const taskRoutes = new Hono();

// GET /api/tasks
taskRoutes.get("/", async (c) => {
  const { done = "false", priority, project_id, due_before, tags, limit = "50", offset = "0" } = c.req.query();
  const tagsArr = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : null;

  const rows = await sql`
    SELECT id, title, description, due_date, priority, done, done_at, project_id, tags, created_at, updated_at
    FROM tasks
    WHERE done = ${done === "true"}
    ${priority ? sql`AND priority = ${parseInt(priority)}` : sql``}
    ${project_id ? sql`AND project_id = ${project_id}` : sql``}
    ${due_before ? sql`AND due_date <= ${due_before}` : sql``}
    ${tagsArr && tagsArr.length > 0 ? sql`AND tags ?| ${tagsArr}` : sql``}
    ORDER BY priority ASC, due_date ASC NULLS LAST, created_at DESC
    LIMIT ${parseInt(limit)}
    OFFSET ${parseInt(offset)}
  `;

  return c.json({ data: rows, meta: { count: rows.length, limit: parseInt(limit), offset: parseInt(offset) } });
});

// POST /api/tasks
taskRoutes.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.title) return c.json({ error: "title is required", code: 400 }, 400);

  const [task] = await sql`
    INSERT INTO tasks (title, description, due_date, priority, project_id, tags)
    VALUES (
      ${body.title},
      ${body.description ?? null},
      ${body.due_date ?? null},
      ${body.priority ?? 3},
      ${body.project_id ?? null},
      ${body.tags ? JSON.stringify(body.tags) : null}::jsonb
    )
    RETURNING *
  `;
  return c.json({ data: task }, 201);
});

// GET /api/tasks/:id
taskRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [task] = await sql`SELECT * FROM tasks WHERE id = ${id}`;
  if (!task) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: task });
});

// PATCH /api/tasks/:id
taskRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const [task] = await sql`
    UPDATE tasks SET
      title       = COALESCE(${body.title ?? null}, title),
      description = COALESCE(${body.description ?? null}, description),
      due_date    = CASE WHEN ${"due_date" in body} THEN ${body.due_date || null} ELSE due_date END,
      priority    = COALESCE(${body.priority ?? null}, priority),
      project_id  = CASE WHEN ${"project_id" in body} THEN ${body.project_id || null} ELSE project_id END,
      tags        = CASE WHEN ${"tags" in body}
                      THEN ${body.tags ? JSON.stringify(body.tags) : null}::jsonb
                      ELSE tags END
    WHERE id = ${id}
    RETURNING *
  `;
  if (!task) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: task });
});

// DELETE /api/tasks/:id
taskRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await sql`DELETE FROM tasks WHERE id = ${id}`;
  return c.json({ data: null }, 204);
});

// POST /api/tasks/:id/complete
taskRoutes.post("/:id/complete", async (c) => {
  const id = c.req.param("id");
  const [task] = await sql`
    UPDATE tasks SET done = true, done_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  if (!task) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: task });
});
