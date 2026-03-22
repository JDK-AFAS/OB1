// server/mcp/health.ts — MCP tools voor gezondheid
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { sql as sqlType } from "../db.ts";

type Sql = typeof sqlType;

export function registerHealthTools(server: McpServer, sql: Sql) {
  // Tool 1: log_health
  server.registerTool(
    "log_health",
    {
      title: "Log Health",
      description:
        'Log a health measurement. Examples: "Log gewicht: 81.5 kg", "Log slaap: 7.5 uur", "Log mood: 7/10"',
      inputSchema: {
        type: z
          .string()
          .describe('Measurement type: weight, sleep, workout, mood, steps, etc.'),
        value: z.number().optional().describe("Numeric value (e.g. 81.5)"),
        value_text: z.string().optional().describe("Text value (e.g. '5km hardlopen in 28 min')"),
        unit: z.string().optional().describe("Unit (e.g. kg, uur, min, stappen)"),
        notes: z.string().optional(),
        date: z.string().optional().describe("YYYY-MM-DD (default: today)"),
        time_of_day: z.string().optional().describe("HH:MM"),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ type, value, value_text, unit, notes, date, time_of_day, tags }) => {
      try {
        const entryDate = date ?? new Date().toISOString().slice(0, 10);

        await sql`
          INSERT INTO health_logs (type, value, value_text, unit, notes, date, time_of_day, tags)
          VALUES (
            ${type},
            ${value ?? null},
            ${value_text ?? null},
            ${unit ?? null},
            ${notes ?? null},
            ${entryDate},
            ${time_of_day ?? null},
            ${tags ? JSON.stringify(tags) : null}::jsonb
          )
        `;

        let summary = `${type} gelogd`;
        if (value !== undefined) summary += `: ${value}${unit ? " " + unit : ""}`;
        else if (value_text) summary += `: ${value_text}`;
        summary += ` (${entryDate})`;

        return { content: [{ type: "text" as const, text: summary }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 2: list_health
  server.registerTool(
    "list_health",
    {
      title: "List Health Logs",
      description: "List health log entries with optional filters.",
      inputSchema: {
        type: z.string().optional().describe("Filter by type (e.g. weight, sleep)"),
        from: z.string().optional().describe("YYYY-MM-DD"),
        to: z.string().optional().describe("YYYY-MM-DD"),
        limit: z.number().int().optional().default(20),
      },
    },
    async ({ type, from, to, limit }) => {
      try {
        const rows = await sql`
          SELECT type, value, value_text, unit, notes, date, time_of_day
          FROM health_logs
          WHERE 1=1
          ${type ? sql`AND type = ${type}` : sql``}
          ${from ? sql`AND date >= ${from}` : sql``}
          ${to ? sql`AND date <= ${to}` : sql``}
          ORDER BY date DESC, time_of_day DESC NULLS LAST
          LIMIT ${limit}
        `;

        if (!rows || rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Geen gezondheidsdata gevonden." }] };
        }

        const lines = rows.map((r) => {
          let line = `[${r.date}${r.time_of_day ? " " + r.time_of_day : ""}] ${r.type}`;
          if (r.value !== null && r.value !== undefined)
            line += `: ${r.value}${r.unit ? " " + r.unit : ""}`;
          else if (r.value_text) line += `: ${r.value_text}`;
          if (r.notes) line += ` (${r.notes})`;
          return line;
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

  // Tool 3: health_summary
  server.registerTool(
    "health_summary",
    {
      title: "Health Summary",
      description: "Get average, trend, min/max for a health metric over N days.",
      inputSchema: {
        type: z.string().describe("Measurement type (e.g. weight, sleep, mood)"),
        days: z.number().int().optional().default(30).describe("Number of past days to analyze"),
      },
    },
    async ({ type, days }) => {
      try {
        const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

        const rows = await sql`
          SELECT value, date
          FROM health_logs
          WHERE type = ${type}
            AND value IS NOT NULL
            AND date >= ${from}
          ORDER BY date ASC
        `;

        if (!rows || rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Geen data voor "${type}" in de laatste ${days} dagen.`,
              },
            ],
          };
        }

        const values = rows.map((r) => Number(r.value));
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);

        // Simple linear trend: compare first half vs second half average
        const mid = Math.floor(values.length / 2);
        const firstHalf = values.slice(0, mid);
        const secondHalf = values.slice(mid);
        let trend = "";
        if (firstHalf.length > 0 && secondHalf.length > 0) {
          const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
          const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
          const diff = avgSecond - avgFirst;
          if (Math.abs(diff) < 0.01) trend = "stabiel";
          else if (diff > 0) trend = `+${diff.toFixed(2)} (stijgend)`;
          else trend = `${diff.toFixed(2)} (dalend)`;
        }

        const lines = [
          `=== ${type} — laatste ${days} dagen (${rows.length} metingen) ===`,
          `Gemiddelde: ${avg.toFixed(2)}`,
          `Min: ${min} | Max: ${max}`,
          ...(trend ? [`Trend: ${trend}`] : []),
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
