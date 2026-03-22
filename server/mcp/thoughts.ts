// server/mcp/thoughts.ts — MCP tools voor thoughts (gemigreerd van Supabase naar directe SQL)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { sql as sqlType } from "../db.ts";
import type { AiProvider } from "../ai.ts";

type Sql = typeof sqlType;

interface Thought {
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface MatchResult extends Thought {
  similarity: number;
}

interface StatsRow extends Thought {
  total_count: string;
}

export function registerThoughtTools(
  server: McpServer,
  sql: Sql,
  ai: AiProvider
) {
  // Tool 1: Semantic Search
  server.registerTool(
    "search_thoughts",
    {
      title: "Search Thoughts",
      description:
        "Search captured thoughts by meaning. Use this when the user asks about a topic, person, or idea they've previously captured.",
      inputSchema: {
        query: z.string().describe("What to search for"),
        limit: z.number().optional().default(10),
        threshold: z.number().optional().default(0.5),
      },
    },
    async ({ query, limit, threshold }) => {
      try {
        const qEmb = await ai.getEmbedding(query);
        const data = await sql<MatchResult[]>`
          SELECT * FROM match_thoughts(
            ${JSON.stringify(qEmb)}::vector,
            ${threshold},
            ${limit},
            '{}'::jsonb
          )
        `;

        if (!data || data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No thoughts found matching "${query}".`,
              },
            ],
          };
        }

        const results = data.map((t, i) => {
          const m = t.metadata || {};
          const parts = [
            `--- Result ${i + 1} (${(t.similarity * 100).toFixed(1)}% match) ---`,
            `Captured: ${new Date(t.created_at).toLocaleDateString()}`,
            `Type: ${m.type || "unknown"}`,
          ];
          if (Array.isArray(m.topics) && m.topics.length)
            parts.push(`Topics: ${(m.topics as string[]).join(", ")}`);
          if (Array.isArray(m.people) && m.people.length)
            parts.push(`People: ${(m.people as string[]).join(", ")}`);
          if (Array.isArray(m.action_items) && m.action_items.length)
            parts.push(`Actions: ${(m.action_items as string[]).join("; ")}`);
          parts.push(`\n${t.content}`);
          return parts.join("\n");
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${data.length} thought(s):\n\n${results.join("\n\n")}`,
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 2: List Recent Thoughts
  server.registerTool(
    "list_thoughts",
    {
      title: "List Recent Thoughts",
      description:
        "List recently captured thoughts with optional filters by type, topic, person, or time range.",
      inputSchema: {
        limit: z.number().optional().default(10),
        type: z
          .string()
          .optional()
          .describe(
            "Filter by type: observation, task, idea, reference, person_note"
          ),
        topic: z.string().optional().describe("Filter by topic tag"),
        person: z.string().optional().describe("Filter by person mentioned"),
        days: z
          .number()
          .optional()
          .describe("Only thoughts from the last N days"),
      },
    },
    async ({ limit, type, topic, person, days }) => {
      try {
        const since = days
          ? new Date(Date.now() - days * 86400000).toISOString()
          : null;

        const data = await sql<Thought[]>`
          SELECT content, metadata, created_at
          FROM thoughts
          WHERE 1=1
          ${type ? sql`AND metadata @> ${JSON.stringify({ type })}::jsonb` : sql``}
          ${topic ? sql`AND metadata @> ${JSON.stringify({ topics: [topic] })}::jsonb` : sql``}
          ${person ? sql`AND metadata @> ${JSON.stringify({ people: [person] })}::jsonb` : sql``}
          ${since ? sql`AND created_at >= ${since}` : sql``}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;

        if (!data || !data.length) {
          return {
            content: [{ type: "text" as const, text: "No thoughts found." }],
          };
        }

        const results = data.map((t, i) => {
          const m = t.metadata || {};
          const tags = Array.isArray(m.topics)
            ? (m.topics as string[]).join(", ")
            : "";
          return `${i + 1}. [${new Date(t.created_at).toLocaleDateString()}] (${m.type || "??"}${tags ? " - " + tags : ""})\n   ${t.content}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `${data.length} recent thought(s):\n\n${results.join("\n\n")}`,
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 3: Thought Stats
  server.registerTool(
    "thought_stats",
    {
      title: "Thought Statistics",
      description:
        "Get a summary of all captured thoughts: totals, types, top topics, and people.",
      inputSchema: {},
    },
    async () => {
      try {
        const rows = await sql<StatsRow[]>`
          SELECT
            metadata,
            created_at,
            COUNT(*) OVER () AS total_count
          FROM thoughts
          ORDER BY created_at DESC
        `;

        const count = rows.length > 0 ? rows[0].total_count : "0";
        const newestAt = rows.length > 0 ? rows[0].created_at : null;
        const oldestAt = rows.length > 0 ? rows[rows.length - 1].created_at : null;

        const types: Record<string, number> = {};
        const topics: Record<string, number> = {};
        const people: Record<string, number> = {};

        for (const r of rows) {
          const m = (r.metadata || {}) as Record<string, unknown>;
          if (m.type) types[m.type as string] = (types[m.type as string] || 0) + 1;
          if (Array.isArray(m.topics))
            for (const t of m.topics)
              topics[t as string] = (topics[t as string] || 0) + 1;
          if (Array.isArray(m.people))
            for (const p of m.people)
              people[p as string] = (people[p as string] || 0) + 1;
        }

        const sort = (o: Record<string, number>): [string, number][] =>
          Object.entries(o)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const lines: string[] = [
          `Total thoughts: ${count}`,
          `Date range: ${
            oldestAt && newestAt
              ? new Date(oldestAt).toLocaleDateString() +
                " → " +
                new Date(newestAt).toLocaleDateString()
              : "N/A"
          }`,
          "",
          "Types:",
          ...sort(types).map(([k, v]) => `  ${k}: ${v}`),
        ];

        if (Object.keys(topics).length) {
          lines.push("", "Top topics:");
          for (const [k, v] of sort(topics)) lines.push(`  ${k}: ${v}`);
        }

        if (Object.keys(people).length) {
          lines.push("", "People mentioned:");
          for (const [k, v] of sort(people)) lines.push(`  ${k}: ${v}`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err: unknown) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool 4: Capture Thought
  server.registerTool(
    "capture_thought",
    {
      title: "Capture Thought",
      description:
        "Save a new thought to the Open Brain. Generates an embedding and extracts metadata automatically. Use this when the user wants to save something to their brain directly from any AI client — notes, insights, decisions, or migrated content from other systems.",
      inputSchema: {
        content: z
          .string()
          .describe(
            "The thought to capture — a clear, standalone statement that will make sense when retrieved later by any AI"
          ),
      },
    },
    async ({ content }) => {
      try {
        const [embedding, metadata] = await Promise.all([
          ai.getEmbedding(content),
          ai.extractMetadata(content),
        ]);

        const fullMetadata = { ...metadata, source: "mcp" };

        await sql`
          INSERT INTO thoughts (content, embedding, metadata)
          VALUES (
            ${content},
            ${JSON.stringify(embedding)}::vector,
            ${JSON.stringify(fullMetadata)}::jsonb
          )
        `;

        const meta = metadata as Record<string, unknown>;
        let confirmation = `Captured as ${meta.type || "thought"}`;
        if (Array.isArray(meta.topics) && meta.topics.length)
          confirmation += ` — ${(meta.topics as string[]).join(", ")}`;
        if (Array.isArray(meta.people) && meta.people.length)
          confirmation += ` | People: ${(meta.people as string[]).join(", ")}`;
        if (Array.isArray(meta.action_items) && meta.action_items.length)
          confirmation += ` | Actions: ${(meta.action_items as string[]).join("; ")}`;

        return {
          content: [{ type: "text" as const, text: confirmation }],
        };
      } catch (err: unknown) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
