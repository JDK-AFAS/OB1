// server/api/projects.ts — REST API routes voor projecten en kanban
import { Hono } from "hono";
import { sql } from "../db.ts";
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ColumnCreateSchema,
  CardCreateSchema,
  CardUpdateSchema,
  CardMoveSchema,
  validationError,
} from "../validation.ts";

export const projectRoutes = new Hono();
export const cardRoutes = new Hono();

const DEFAULT_COLUMNS = ["Backlog", "In uitvoering", "Klaar"];

// GET /api/projects
projectRoutes.get("/", async (c) => {
  const { status = "active", limit = "50", offset = "0" } = c.req.query();

  const rows = await sql`
    SELECT
      p.id, p.title, p.description, p.color, p.status, p.created_at, p.updated_at,
      COUNT(t.id) FILTER (WHERE t.done = false) AS open_tasks
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.status = ${status}
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ${parseInt(limit)}
    OFFSET ${parseInt(offset)}
  `;

  return c.json({ data: rows, meta: { count: rows.length, limit: parseInt(limit), offset: parseInt(offset) } });
});

// POST /api/projects
projectRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = ProjectCreateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const colNames: string[] = (d.columns && d.columns.length > 0) ? d.columns : DEFAULT_COLUMNS;

  const [project] = await sql`
    INSERT INTO projects (title, description, color)
    VALUES (${d.title}, ${d.description ?? null}, ${d.color ?? "#6366f1"})
    RETURNING *
  `;

  for (let i = 0; i < colNames.length; i++) {
    await sql`
      INSERT INTO kanban_columns (project_id, title, position)
      VALUES (${project.id}, ${colNames[i]}, ${i})
    `;
  }

  return c.json({ data: project }, 201);
});

// GET /api/projects/:id
projectRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [project] = await sql`SELECT * FROM projects WHERE id = ${id}`;
  if (!project) return c.json({ error: "Not found", code: 404 }, 404);

  const columns = await sql`
    SELECT id, title, position FROM kanban_columns
    WHERE project_id = ${id}
    ORDER BY position ASC
  `;

  return c.json({ data: { ...project, columns } });
});

// PATCH /api/projects/:id
projectRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = ProjectUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [project] = await sql`
    UPDATE projects SET
      title       = COALESCE(${d.title ?? null}, title),
      description = COALESCE(${d.description ?? null}, description),
      color       = COALESCE(${d.color ?? null}, color)
    WHERE id = ${id}
    RETURNING *
  `;
  if (!project) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: project });
});

// DELETE /api/projects/:id — archiveren (soft delete)
projectRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [project] = await sql`
    UPDATE projects SET status = 'archived' WHERE id = ${id} RETURNING id
  `;
  if (!project) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: null }, 204);
});

// GET /api/projects/:id/board
projectRoutes.get("/:id/board", async (c) => {
  const id = c.req.param("id");
  const [project] = await sql`SELECT id, title FROM projects WHERE id = ${id}`;
  if (!project) return c.json({ error: "Not found", code: 404 }, 404);

  const columns = await sql`
    SELECT id, title, position FROM kanban_columns
    WHERE project_id = ${id}
    ORDER BY position ASC
  `;

  const board = await Promise.all(
    columns.map(async (col) => {
      const cards = await sql`
        SELECT id, title, description, due_date, done, tags, position, created_at
        FROM kanban_cards
        WHERE column_id = ${col.id}
        ORDER BY position ASC
      `;
      return { ...col, cards };
    })
  );

  return c.json({ data: { project, columns: board } });
});

// POST /api/projects/:id/columns
projectRoutes.post("/:id/columns", async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json();
  const parsed = ColumnCreateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [posRow] = await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
    FROM kanban_columns WHERE project_id = ${projectId}
  `;

  const position = "position" in d ? d.position : posRow.next_pos;

  const [col] = await sql`
    INSERT INTO kanban_columns (project_id, title, position)
    VALUES (${projectId}, ${d.name}, ${position})
    RETURNING *
  `;
  return c.json({ data: col }, 201);
});

// POST /api/projects/:id/cards
projectRoutes.post("/:id/cards", async (c) => {
  const projectId = c.req.param("id");
  const body = await c.req.json();
  const parsed = CardCreateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  // Verify column belongs to this project
  const [col] = await sql`
    SELECT id FROM kanban_columns WHERE id = ${d.column_id} AND project_id = ${projectId}
  `;
  if (!col) return c.json({ error: "Column not found in this project", code: 404 }, 404);

  const [posRow] = await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
    FROM kanban_cards WHERE column_id = ${d.column_id}
  `;

  const [card] = await sql`
    INSERT INTO kanban_cards (column_id, title, description, position)
    VALUES (
      ${d.column_id},
      ${d.title},
      ${d.description ?? null},
      ${d.position ?? posRow.next_pos}
    )
    RETURNING *
  `;
  return c.json({ data: card }, 201);
});

// PATCH /api/cards/:id
cardRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = CardUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [card] = await sql`
    UPDATE kanban_cards SET
      title       = COALESCE(${d.title ?? null}, title),
      description = CASE WHEN ${"description" in d} THEN ${d.description ?? null} ELSE description END
    WHERE id = ${id}
    RETURNING *
  `;
  if (!card) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: card });
});

// PATCH /api/cards/:id/move
cardRoutes.patch("/:id/move", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = CardMoveSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [posRow] = await sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
    FROM kanban_cards WHERE column_id = ${d.column_id}
  `;
  const newPos = d.position ?? posRow.next_pos;

  const [card] = await sql`
    UPDATE kanban_cards SET column_id = ${d.column_id}, position = ${newPos}
    WHERE id = ${id}
    RETURNING *
  `;
  if (!card) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: card });
});

// DELETE /api/cards/:id
cardRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await sql`DELETE FROM kanban_cards WHERE id = ${id}`;
  return c.json({ data: null }, 204);
});
