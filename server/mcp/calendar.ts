// server/mcp/calendar.ts — MCP tools voor agenda/events
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { sql as sqlType } from "../db.ts";

type Sql = typeof sqlType;

export function registerCalendarTools(server: McpServer, sql: Sql) {
  // Tool 1: create_event
  server.registerTool(
    "create_event",
    {
      title: "Create Event",
      description: "Add a new calendar event. Supports all-day events and recurring rules (RRULE format).",
      inputSchema: {
        title: z.string().describe("Event title (required)"),
        start_at: z.string().describe("Start time in ISO 8601 format (required)"),
        end_at: z.string().optional().describe("End time in ISO 8601 format"),
        all_day: z.boolean().optional().default(false),
        description: z.string().optional(),
        location: z.string().optional(),
        recurring_rule: z.string().optional().describe("RRULE string, e.g. FREQ=WEEKLY;BYDAY=MO"),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ title, start_at, end_at, all_day, description, location, recurring_rule, tags }) => {
      try {
        const rows = await sql`
          INSERT INTO events (title, start_at, end_at, all_day, description, location, recurring_rule, tags)
          VALUES (
            ${title},
            ${start_at}::timestamptz,
            ${end_at ?? null},
            ${all_day},
            ${description ?? null},
            ${location ?? null},
            ${recurring_rule ?? null},
            ${tags ? JSON.stringify(tags) : null}::jsonb
          )
          RETURNING id, title, start_at, all_day
        `;
        const row = rows[0];
        const dateStr = all_day
          ? new Date(row.start_at).toLocaleDateString("nl-NL")
          : new Date(row.start_at).toLocaleString("nl-NL");
        return {
          content: [{ type: "text" as const, text: `Event aangemaakt: ${row.title} op ${dateStr}` }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 2: list_events
  server.registerTool(
    "list_events",
    {
      title: "List Events",
      description: "List calendar events in a date range. Defaults to the next 7 days.",
      inputSchema: {
        from: z.string().optional().describe("Start date YYYY-MM-DD (default: today)"),
        to: z.string().optional().describe("End date YYYY-MM-DD (default: +7 days)"),
        tags: z.array(z.string()).optional(),
        limit: z.number().int().optional().default(20),
      },
    },
    async ({ from, to, tags, limit }) => {
      try {
        const fromDate = from ?? new Date().toISOString().slice(0, 10);
        const toDate = to ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

        const rows = await sql`
          SELECT id, title, start_at, end_at, all_day, location, description
          FROM events
          WHERE start_at >= ${fromDate}::date
            AND start_at <  (${toDate}::date + INTERVAL '1 day')
          ${tags && tags.length > 0 ? sql`AND tags ?| ${tags}` : sql``}
          ORDER BY start_at ASC
          LIMIT ${limit}
        `;

        if (!rows || rows.length === 0) {
          return { content: [{ type: "text" as const, text: `Geen events gevonden van ${fromDate} tot ${toDate}.` }] };
        }

        const days: Record<string, string[]> = {};
        for (const r of rows) {
          const d = new Date(r.start_at);
          const dayKey = d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
          if (!days[dayKey]) days[dayKey] = [];
          let line = r.all_day
            ? `  ${r.title} [hele dag]`
            : `  ${d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} ${r.title}`;
          if (r.location) line += ` (${r.location})`;
          days[dayKey].push(line);
        }

        const output = Object.entries(days)
          .map(([day, events]) => `${day}\n${events.join("\n")}`)
          .join("\n\n");

        return { content: [{ type: "text" as const, text: output }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 3: update_event
  server.registerTool(
    "update_event",
    {
      title: "Update Event",
      description: "Update one or more fields of an existing calendar event.",
      inputSchema: {
        id: z.string().uuid().describe("Event UUID"),
        title: z.string().optional(),
        start_at: z.string().optional().describe("ISO 8601"),
        end_at: z.string().optional().describe("ISO 8601 or empty string to clear"),
        all_day: z.boolean().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        recurring_rule: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ id, title, start_at, end_at, all_day, description, location, recurring_rule, tags }) => {
      try {
        const rows = await sql`
          UPDATE events SET
            title          = COALESCE(${title ?? null}, title),
            start_at       = COALESCE(${start_at ? sql`${start_at}::timestamptz` : null}, start_at),
            end_at         = CASE WHEN ${end_at !== undefined} THEN ${end_at || null} ELSE end_at END,
            all_day        = COALESCE(${all_day ?? null}, all_day),
            description    = COALESCE(${description ?? null}, description),
            location       = COALESCE(${location ?? null}, location),
            recurring_rule = COALESCE(${recurring_rule ?? null}, recurring_rule),
            tags           = CASE WHEN ${tags !== undefined}
                               THEN ${tags ? JSON.stringify(tags) : null}::jsonb
                               ELSE tags END
          WHERE id = ${id}
          RETURNING title
        `;
        if (!rows || rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Event niet gevonden." }], isError: true };
        }
        return { content: [{ type: "text" as const, text: `Event bijgewerkt: ${rows[0].title}` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 4: delete_event
  server.registerTool(
    "delete_event",
    {
      title: "Delete Event",
      description: "Permanently delete a calendar event by UUID.",
      inputSchema: {
        id: z.string().uuid().describe("Event UUID"),
      },
    },
    async ({ id }) => {
      try {
        await sql`DELETE FROM events WHERE id = ${id}`;
        return { content: [{ type: "text" as const, text: "Event verwijderd." }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
