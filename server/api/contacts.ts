// server/api/contacts.ts — REST API routes voor contacten
import { Hono } from "hono";
import { sql } from "../db.ts";
import { ContactCreateSchema, ContactUpdateSchema, InteractionCreateSchema, validationError } from "../validation.ts";

export const contactRoutes = new Hono();

// GET /api/contacts
contactRoutes.get("/", async (c) => {
  const { search, tags, limit = "50", offset = "0" } = c.req.query();
  const tagsArr = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : null;

  const rows = await sql`
    SELECT id, name, email, phone, company, role, birthday, tags, created_at, updated_at
    FROM contacts
    WHERE 1=1
    ${tagsArr && tagsArr.length > 0 ? sql`AND tags ?| ${tagsArr}` : sql``}
    ${search ? sql`AND (
      name ILIKE ${"%" + search + "%"} OR
      company ILIKE ${"%" + search + "%"} OR
      email ILIKE ${"%" + search + "%"}
    )` : sql``}
    ORDER BY name ASC
    LIMIT ${parseInt(limit)}
    OFFSET ${parseInt(offset)}
  `;

  return c.json({ data: rows, meta: { count: rows.length, limit: parseInt(limit), offset: parseInt(offset) } });
});

// POST /api/contacts
contactRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = ContactCreateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [contact] = await sql`
    INSERT INTO contacts (name, email, phone, company, notes, tags)
    VALUES (
      ${d.name},
      ${d.email ?? null},
      ${d.phone ?? null},
      ${d.company ?? null},
      ${d.notes ?? null},
      ${d.tags ? JSON.stringify(d.tags) : null}::jsonb
    )
    RETURNING *
  `;
  return c.json({ data: contact }, 201);
});

// GET /api/contacts/:id — details + interacties
contactRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [contact] = await sql`SELECT * FROM contacts WHERE id = ${id}`;
  if (!contact) return c.json({ error: "Not found", code: 404 }, 404);

  const interactions = await sql`
    SELECT id, type, summary, date, created_at
    FROM contact_interactions
    WHERE contact_id = ${id}
    ORDER BY date DESC
    LIMIT 10
  `;

  return c.json({ data: { ...contact, interactions } });
});

// PATCH /api/contacts/:id
contactRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = ContactUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [contact] = await sql`
    UPDATE contacts SET
      name    = COALESCE(${d.name ?? null}, name),
      email   = COALESCE(${d.email ?? null}, email),
      phone   = COALESCE(${d.phone ?? null}, phone),
      company = COALESCE(${d.company ?? null}, company),
      notes   = COALESCE(${d.notes ?? null}, notes),
      tags    = CASE WHEN ${"tags" in d}
                  THEN ${d.tags ? JSON.stringify(d.tags) : null}::jsonb
                  ELSE tags END
    WHERE id = ${id}
    RETURNING *
  `;
  if (!contact) return c.json({ error: "Not found", code: 404 }, 404);
  return c.json({ data: contact });
});

// DELETE /api/contacts/:id
contactRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await sql`DELETE FROM contacts WHERE id = ${id}`;
  return c.json({ data: null }, 204);
});

// GET /api/contacts/:id/interactions
contactRoutes.get("/:id/interactions", async (c) => {
  const id = c.req.param("id");
  const { limit = "20", offset = "0" } = c.req.query();

  const rows = await sql`
    SELECT id, type, summary, date, created_at
    FROM contact_interactions
    WHERE contact_id = ${id}
    ORDER BY date DESC
    LIMIT ${parseInt(limit)}
    OFFSET ${parseInt(offset)}
  `;

  return c.json({ data: rows, meta: { count: rows.length } });
});

// POST /api/contacts/:id/interactions
contactRoutes.post("/:id/interactions", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = InteractionCreateSchema.safeParse(body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  const d = parsed.data;

  const [contact] = await sql`SELECT id FROM contacts WHERE id = ${id}`;
  if (!contact) return c.json({ error: "Contact not found", code: 404 }, 404);

  const [interaction] = await sql`
    INSERT INTO contact_interactions (contact_id, type, summary, date)
    VALUES (
      ${id},
      ${d.type},
      ${d.summary},
      ${d.date ?? new Date().toISOString().slice(0, 10)}
    )
    RETURNING *
  `;
  return c.json({ data: interaction }, 201);
});
