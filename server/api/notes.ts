// server/api/notes.ts — REST API routes voor notities
import { Hono } from "hono";
import { sql } from "../db.ts";
import { NoteCreateSchema, NoteUpdateSchema, validationError } from "../validation.ts";

export const noteRoutes = new Hono();

// GET /api/notes
noteRoutes.get("/", async (c) => {
  const { pinned, limit = "50", offset = "0" } = c.req.query();

  const rows = await sql`
    SELECT id, title, content, pinned, thought_id, tags, created_at, updated_at
    FROM notes
    ${pinned !== undefined ? sql`WHERE pinned = ${pinned === "true"}` : sql``}
    ORDER BY pinned DESC, updated_at DESC
    LIMIT ${parseInt(limit)}
    OFFSET ${parseInt(offset)}
  `;

  return c.json({ data: rows, meta: { count: rows.length, limit: parseInt(limit), offset: parseInt(offset) } });
});

// GET /api/notes/search — moet vóór /:id staan
noteRoutes.get("/search", async (c) => {
  const { q, limit = "20" } = c.req.query();
  if (!q) return c.json({ error: "q parameter is required", code: 400 }, 400);

  const rows = await sql`
    SELECT id, title, content, pinned, tags, created_at, updated_at
    FROM notes
    WHERE title ILIKE ${"%" + q + "%"} OR content ILIKE ${"%" + q + "%"}
    ORDER BY updated_at DESC
    LIMIT ${parseInt(limit)}
  `;

  return c.json({ data: rows, meta: { count: rows.length } });
});

// POST /api/notes
noteRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = NoteCreateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [note] = await sql`
    INSERT INTO notes (title, content, pinned, thought_id, tags)
    VALUES (
      ${d.title},
      ${d.content ?? null},
      ${d.pinned},
      ${d.thought_id ?? null},
      null
    )
    RETURNING *
  `;
  return c.json({ data: note }, 201);
});

// GET /api/notes/:id
noteRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [note] = await sql`SELECT * FROM notes WHERE id = ${id}`;
  if (!note) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: note });
});

// PATCH /api/notes/:id
noteRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = NoteUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [note] = await sql`
    UPDATE notes SET
      title     = COALESCE(${d.title ?? null}, title),
      content   = COALESCE(${d.content ?? null}, content),
      pinned    = COALESCE(${d.pinned ?? null}, pinned),
      thought_id = CASE WHEN ${"thought_id" in d} THEN ${d.thought_id || null} ELSE thought_id END
    WHERE id = ${id}
    RETURNING *
  `;
  if (!note) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: note });
});

// DELETE /api/notes/:id
noteRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await sql`DELETE FROM notes WHERE id = ${id}`;
  return c.json({ data: null }, 204);
});
