// server/api/thoughts.ts — REST API routes voor thoughts
import { Hono } from "hono";
import { sql } from "../db.ts";
import { getAiProvider } from "../ai.ts";

export const thoughtRoutes = new Hono();

const ai = getAiProvider();

// GET /api/thoughts/search — moet vóór /:id staan
thoughtRoutes.get("/search", async (c) => {
  const { q, limit = "10", threshold = "0.5" } = c.req.query();
  if (!q) return c.json({ error: "q parameter is required", code: 400 }, 400);

  const embedding = await ai.getEmbedding(q);

  const rows = await sql`
    SELECT * FROM match_thoughts(
      ${JSON.stringify(embedding)}::vector,
      ${parseFloat(threshold)},
      ${parseInt(limit)},
      '{}'::jsonb
    )
  `;

  return c.json({ data: rows, meta: { count: rows.length } });
});

// GET /api/thoughts
thoughtRoutes.get("/", async (c) => {
  const { type, topic, person, days, limit = "50", offset = "0" } = c.req.query();
  const since = days
    ? new Date(Date.now() - parseInt(days) * 86400000).toISOString()
    : null;

  const rows = await sql`
    SELECT id, content, metadata, created_at
    FROM thoughts
    WHERE 1=1
    ${type ? sql`AND metadata @> ${JSON.stringify({ type })}::jsonb` : sql``}
    ${topic ? sql`AND metadata @> ${JSON.stringify({ topics: [topic] })}::jsonb` : sql``}
    ${person ? sql`AND metadata @> ${JSON.stringify({ people: [person] })}::jsonb` : sql``}
    ${since ? sql`AND created_at >= ${since}` : sql``}
    ORDER BY created_at DESC
    LIMIT ${parseInt(limit)}
    OFFSET ${parseInt(offset)}
  `;

  return c.json({ data: rows, meta: { count: rows.length, limit: parseInt(limit), offset: parseInt(offset) } });
});

// POST /api/thoughts — capture
thoughtRoutes.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.content) return c.json({ error: "content is required", code: 400 }, 400);

  const [embedding, metadata] = await Promise.all([
    ai.getEmbedding(body.content),
    ai.extractMetadata(body.content),
  ]);

  const fullMetadata = { ...metadata, source: "api" };

  await sql`
    INSERT INTO thoughts (content, embedding, metadata)
    VALUES (
      ${body.content},
      ${JSON.stringify(embedding)}::vector,
      ${JSON.stringify(fullMetadata)}::jsonb
    )
  `;

  return c.json({ data: { content: body.content, metadata: fullMetadata } }, 201);
});
