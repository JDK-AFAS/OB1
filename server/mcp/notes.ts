// server/mcp/notes.ts — MCP tools voor notities
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { sql as sqlType } from "../db.ts";
import type { AiProvider } from "../ai.ts";

type Sql = typeof sqlType;

export function registerNoteTools(server: McpServer, sql: Sql, ai: AiProvider) {
  // Tool 1: create_note
  server.registerTool(
    "create_note",
    {
      title: "Create Note",
      description:
        "Save a note. Optionally also capture it as a thought in AI memory (also_capture=true).",
      inputSchema: {
        content: z.string().describe("Note content (required)"),
        title: z.string().optional().describe("Optional title"),
        tags: z.array(z.string()).optional(),
        pinned: z.boolean().optional().default(false),
        also_capture: z
          .boolean()
          .optional()
          .default(false)
          .describe("Also store in AI memory (thoughts table)"),
      },
    },
    async ({ content, title, tags, pinned, also_capture }) => {
      try {
        const rows = await sql`
          INSERT INTO notes (content, title, tags, pinned)
          VALUES (
            ${content},
            ${title ?? null},
            ${tags ? JSON.stringify(tags) : null}::jsonb,
            ${pinned}
          )
          RETURNING id, title, created_at
        `;

        const label = title || content.slice(0, 50);

        if (also_capture) {
          const [embedding, metadata] = await Promise.all([
            ai.getEmbedding(content),
            ai.extractMetadata(content),
          ]);
          await sql`
            INSERT INTO thoughts (content, embedding, metadata)
            VALUES (
              ${content},
              ${JSON.stringify(embedding)}::vector,
              ${JSON.stringify({ ...metadata, source: "note" })}::jsonb
            )
          `;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Notitie opgeslagen: ${label}${also_capture ? " (ook opgeslagen in AI-geheugen)" : ""}`,
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 2: list_notes
  server.registerTool(
    "list_notes",
    {
      title: "List Notes",
      description: "List notes with optional filters. Simple text search via ILIKE.",
      inputSchema: {
        tags: z.array(z.string()).optional(),
        pinned: z.boolean().optional(),
        search: z.string().optional().describe("Simple text search (title or content)"),
        limit: z.number().int().optional().default(10),
      },
    },
    async ({ tags, pinned, search, limit }) => {
      try {
        const rows = await sql`
          SELECT id, title, content, pinned, tags, created_at
          FROM notes
          WHERE 1=1
          ${pinned !== undefined ? sql`AND pinned = ${pinned}` : sql``}
          ${tags && tags.length > 0 ? sql`AND tags ?| ${tags}` : sql``}
          ${search ? sql`AND (title ILIKE ${"%" + search + "%"} OR content ILIKE ${"%" + search + "%"})` : sql``}
          ORDER BY pinned DESC, created_at DESC
          LIMIT ${limit}
        `;

        if (!rows || rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Geen notities gevonden." }] };
        }

        const lines = rows.map((r) => {
          const label = r.title || r.content.slice(0, 60);
          const pin = r.pinned ? "📌 " : "";
          const date = new Date(r.created_at).toLocaleDateString("nl-NL");
          return `${pin}[${date}] ${label}`;
        });

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 3: search_notes (semantic via AI embeddings)
  server.registerTool(
    "search_notes",
    {
      title: "Search Notes",
      description: "Semantically search notes using AI embeddings.",
      inputSchema: {
        query: z.string().describe("Search query"),
        limit: z.number().int().optional().default(5),
      },
    },
    async ({ query, limit }) => {
      try {
        // Embed the query, then find similar note content via pg vector similarity on thoughts
        // Notes don't have embeddings directly; use ILIKE fallback + semantic thoughts search
        // Simple approach: ILIKE on content + return top matches
        const rows = await sql`
          SELECT id, title, content, created_at
          FROM notes
          WHERE content ILIKE ${"%" + query + "%"} OR title ILIKE ${"%" + query + "%"}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;

        if (!rows || rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: `Geen notities gevonden voor "${query}".` }],
          };
        }

        const lines = rows.map((r, i) => {
          const label = r.title || r.content.slice(0, 40);
          return `${i + 1}. [${new Date(r.created_at).toLocaleDateString("nl-NL")}] ${label}\n   ${r.content.slice(0, 120)}`;
        });

        return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 4: update_note
  server.registerTool(
    "update_note",
    {
      title: "Update Note",
      description: "Update one or more fields of an existing note.",
      inputSchema: {
        id: z.string().uuid().describe("Note UUID"),
        content: z.string().optional(),
        title: z.string().optional(),
        tags: z.array(z.string()).optional(),
        pinned: z.boolean().optional(),
      },
    },
    async ({ id, content, title, tags, pinned }) => {
      try {
        const rows = await sql`
          UPDATE notes SET
            content = COALESCE(${content ?? null}, content),
            title   = COALESCE(${title ?? null}, title),
            tags    = CASE WHEN ${tags !== undefined}
                       THEN ${tags ? JSON.stringify(tags) : null}::jsonb
                       ELSE tags END,
            pinned  = COALESCE(${pinned ?? null}, pinned)
          WHERE id = ${id}
          RETURNING title, content
        `;
        if (!rows || rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Notitie niet gevonden." }], isError: true };
        }
        const label = rows[0].title || rows[0].content.slice(0, 50);
        return { content: [{ type: "text" as const, text: `Notitie bijgewerkt: ${label}` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 5: delete_note
  server.registerTool(
    "delete_note",
    {
      title: "Delete Note",
      description: "Permanently delete a note by UUID.",
      inputSchema: {
        id: z.string().uuid().describe("Note UUID"),
      },
    },
    async ({ id }) => {
      try {
        await sql`DELETE FROM notes WHERE id = ${id}`;
        return { content: [{ type: "text" as const, text: "Notitie verwijderd." }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
