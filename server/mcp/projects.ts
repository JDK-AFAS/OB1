// server/mcp/projects.ts — MCP tools voor projecten en kanban
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { sql as sqlType } from "../db.ts";

type Sql = typeof sqlType;

const DEFAULT_COLUMNS = ["Backlog", "In uitvoering", "Klaar"];

export function registerProjectTools(server: McpServer, sql: Sql) {
  // Tool 1: create_project
  server.registerTool(
    "create_project",
    {
      title: "Create Project",
      description: "Create a new project with optional Kanban columns.",
      inputSchema: {
        title: z.string().describe("Project title"),
        description: z.string().optional(),
        color: z.string().optional().default("#6366f1").describe("Hex color"),
        columns: z
          .array(z.string())
          .optional()
          .describe("Column names (default: Backlog, In uitvoering, Klaar)"),
      },
    },
    async ({ title, description, color, columns }) => {
      try {
        const colNames = columns && columns.length > 0 ? columns : DEFAULT_COLUMNS;

        const projects = await sql`
          INSERT INTO projects (title, description, color)
          VALUES (${title}, ${description ?? null}, ${color})
          RETURNING id, title
        `;
        const project = projects[0];

        // Insert kanban columns in order
        for (let i = 0; i < colNames.length; i++) {
          await sql`
            INSERT INTO kanban_columns (project_id, title, position)
            VALUES (${project.id}, ${colNames[i]}, ${i})
          `;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Project aangemaakt: ${project.title} (${colNames.length} kolommen: ${colNames.join(", ")})`,
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

  // Tool 2: list_projects
  server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description: "List projects with open task counts.",
      inputSchema: {
        status: z
          .enum(["active", "paused", "completed", "archived"])
          .optional()
          .default("active"),
      },
    },
    async ({ status }) => {
      try {
        const rows = await sql`
          SELECT
            p.id, p.title, p.description, p.color, p.status, p.created_at,
            COUNT(t.id) FILTER (WHERE t.done = false) AS open_tasks
          FROM projects p
          LEFT JOIN tasks t ON t.project_id = p.id
          WHERE p.status = ${status}
          GROUP BY p.id
          ORDER BY p.created_at DESC
        `;

        if (!rows || rows.length === 0) {
          return { content: [{ type: "text" as const, text: `Geen ${status} projecten gevonden.` }] };
        }

        const lines = rows.map((r) => {
          const tasks = Number(r.open_tasks);
          return `• ${r.title}${r.description ? ` — ${r.description}` : ""} (${tasks} open taak${tasks !== 1 ? "en" : ""})`;
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

  // Tool 3: create_kanban_card
  server.registerTool(
    "create_kanban_card",
    {
      title: "Create Kanban Card",
      description: "Add a card to a Kanban column. Specify column by name or UUID.",
      inputSchema: {
        project_id: z.string().uuid().describe("Project UUID"),
        title: z.string(),
        description: z.string().optional(),
        column: z.string().describe("Column name (e.g. 'Backlog') or column UUID"),
        due_date: z.string().optional().describe("YYYY-MM-DD"),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ project_id, title, description, column, due_date, tags }) => {
      try {
        // Resolve column: try UUID first, then name
        let columnId: string;
        const byId = await sql`
          SELECT id FROM kanban_columns
          WHERE project_id = ${project_id} AND id::text = ${column}
          LIMIT 1
        `;
        if (byId.length > 0) {
          columnId = byId[0].id;
        } else {
          const byName = await sql`
            SELECT id FROM kanban_columns
            WHERE project_id = ${project_id} AND title ILIKE ${column}
            LIMIT 1
          `;
          if (!byName.length) {
            return {
              content: [{ type: "text" as const, text: `Kolom "${column}" niet gevonden in dit project.` }],
              isError: true,
            };
          }
          columnId = byName[0].id;
        }

        // Get max position in column
        const posRow = await sql`
          SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
          FROM kanban_cards
          WHERE column_id = ${columnId}
        `;
        const position = posRow[0].next_pos;

        await sql`
          INSERT INTO kanban_cards (column_id, title, description, due_date, tags, position)
          VALUES (
            ${columnId},
            ${title},
            ${description ?? null},
            ${due_date ?? null},
            ${tags ? JSON.stringify(tags) : null}::jsonb,
            ${position}
          )
        `;

        return { content: [{ type: "text" as const, text: `Kaart aangemaakt: "${title}" in kolom "${column}"` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 4: move_kanban_card
  server.registerTool(
    "move_kanban_card",
    {
      title: "Move Kanban Card",
      description: "Move a Kanban card to another column. Specify target column by name or UUID.",
      inputSchema: {
        card_id: z.string().uuid().describe("Card UUID"),
        to_column: z.string().describe("Target column name or UUID"),
        position: z.number().int().optional().describe("Position in target column (0-indexed)"),
      },
    },
    async ({ card_id, to_column, position }) => {
      try {
        // Get card's current project via its column
        const cardRow = await sql`
          SELECT kc.id, kc.title, col.project_id
          FROM kanban_cards kc
          JOIN kanban_columns col ON kc.column_id = col.id
          WHERE kc.id = ${card_id}
          LIMIT 1
        `;
        if (!cardRow.length) {
          return { content: [{ type: "text" as const, text: "Kaart niet gevonden." }], isError: true };
        }
        const { project_id, title } = cardRow[0];

        // Resolve target column
        let targetColumnId: string;
        const byId = await sql`
          SELECT id FROM kanban_columns
          WHERE project_id = ${project_id} AND id::text = ${to_column}
          LIMIT 1
        `;
        if (byId.length > 0) {
          targetColumnId = byId[0].id;
        } else {
          const byName = await sql`
            SELECT id FROM kanban_columns
            WHERE project_id = ${project_id} AND title ILIKE ${to_column}
            LIMIT 1
          `;
          if (!byName.length) {
            return {
              content: [{ type: "text" as const, text: `Kolom "${to_column}" niet gevonden.` }],
              isError: true,
            };
          }
          targetColumnId = byName[0].id;
        }

        const posRow = await sql`
          SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
          FROM kanban_cards WHERE column_id = ${targetColumnId}
        `;
        const newPos = position ?? posRow[0].next_pos;

        await sql`
          UPDATE kanban_cards
          SET column_id = ${targetColumnId}, position = ${newPos}
          WHERE id = ${card_id}
        `;

        return { content: [{ type: "text" as const, text: `"${title}" verplaatst naar "${to_column}"` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 5: list_kanban_board
  server.registerTool(
    "list_kanban_board",
    {
      title: "List Kanban Board",
      description: "Show the full Kanban board for a project: all columns and their cards.",
      inputSchema: {
        project_id: z.string().uuid().describe("Project UUID"),
      },
    },
    async ({ project_id }) => {
      try {
        const project = await sql`SELECT title FROM projects WHERE id = ${project_id} LIMIT 1`;
        if (!project.length) {
          return { content: [{ type: "text" as const, text: "Project niet gevonden." }], isError: true };
        }

        const columns = await sql`
          SELECT id, title FROM kanban_columns
          WHERE project_id = ${project_id}
          ORDER BY position ASC
        `;

        const lines: string[] = [`=== Project: ${project[0].title} ===`];

        for (const col of columns) {
          lines.push(`\n[${col.title}]`);
          const cards = await sql`
            SELECT title, due_date, done
            FROM kanban_cards
            WHERE column_id = ${col.id}
            ORDER BY position ASC
          `;
          if (cards.length === 0) {
            lines.push("  (leeg)");
          } else {
            for (const card of cards) {
              let line = `  • ${card.title}`;
              if (card.done) line += " ✓";
              if (card.due_date) line += ` [${card.due_date}]`;
              lines.push(line);
            }
          }
        }

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
