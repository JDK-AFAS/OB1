// server/mcp/tasks.ts — MCP tools voor taken
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { sql as sqlType } from "../db.ts";

type Sql = typeof sqlType;

export function registerTaskTools(server: McpServer, sql: Sql) {
  // Tool 1: create_task
  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description: "Create a new task with optional deadline, priority, and project.",
      inputSchema: {
        title: z.string().describe("Task title (required)"),
        description: z.string().optional().describe("Optional description"),
        due_date: z.string().optional().describe("Deadline in YYYY-MM-DD format"),
        priority: z.number().int().min(1).max(4).optional().default(3).describe(
          "Priority: 1=urgent, 2=high, 3=normal, 4=low"
        ),
        project_id: z.string().uuid().optional().describe("Optional project UUID"),
        tags: z.array(z.string()).optional().describe("Optional tags"),
      },
    },
    async ({ title, description, due_date, priority, project_id, tags }) => {
      try {
        const rows = await sql`
          INSERT INTO tasks (title, description, due_date, priority, project_id, tags)
          VALUES (
            ${title},
            ${description ?? null},
            ${due_date ?? null},
            ${priority},
            ${project_id ?? null},
            ${tags ? JSON.stringify(tags) : null}::jsonb
          )
          RETURNING id, title, priority, due_date
        `;
        const row = rows[0];
        let msg = `Taak aangemaakt: ${row.title} (prioriteit ${row.priority}`;
        if (row.due_date) msg += `, deadline ${row.due_date}`;
        msg += ")";
        return { content: [{ type: "text" as const, text: msg }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 2: complete_task
  server.registerTool(
    "complete_task",
    {
      title: "Complete Task",
      description: "Mark a task as done. Provide either the task UUID or a title to search for.",
      inputSchema: {
        id: z.string().uuid().optional().describe("Task UUID"),
        title: z.string().optional().describe("Task title (fuzzy match if no id given)"),
      },
    },
    async ({ id, title }) => {
      try {
        if (!id && !title) {
          return {
            content: [{ type: "text" as const, text: "Geef een id of title op." }],
            isError: true,
          };
        }

        let rows;
        if (id) {
          rows = await sql`
            UPDATE tasks SET done = true, done_at = NOW()
            WHERE id = ${id}
            RETURNING title
          `;
        } else {
          rows = await sql`
            UPDATE tasks SET done = true, done_at = NOW()
            WHERE done = false AND title ILIKE ${"%" + title! + "%"}
            ORDER BY created_at DESC
            LIMIT 1
            RETURNING title
          `;
          // RETURNING with LIMIT in UPDATE requires a subquery in Postgres
          // Rewrite using CTE
          rows = await sql`
            WITH matched AS (
              SELECT id FROM tasks
              WHERE done = false AND title ILIKE ${"%" + title! + "%"}
              ORDER BY created_at DESC
              LIMIT 1
            )
            UPDATE tasks SET done = true, done_at = NOW()
            FROM matched
            WHERE tasks.id = matched.id
            RETURNING tasks.title
          `;
        }

        if (!rows || rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: "Taak niet gevonden." }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: `Taak afgevinkt: ${rows[0].title}` }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 3: list_tasks
  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description: "List tasks with optional filters for status, priority, project, deadline, and tags.",
      inputSchema: {
        done: z.boolean().optional().default(false).describe("Include completed tasks (default: false = open only)"),
        priority: z.number().int().min(1).max(4).optional().describe("Filter by priority"),
        project_id: z.string().uuid().optional().describe("Filter by project UUID"),
        due_before: z.string().optional().describe("Only tasks with deadline before YYYY-MM-DD"),
        tags: z.array(z.string()).optional().describe("Filter by tags (any match)"),
        limit: z.number().int().optional().default(20),
      },
    },
    async ({ done, priority, project_id, due_before, tags, limit }) => {
      try {
        const rows = await sql`
          SELECT id, title, description, due_date, priority, done, done_at, project_id, tags, created_at
          FROM tasks
          WHERE done = ${done}
          ${priority !== undefined ? sql`AND priority = ${priority}` : sql``}
          ${project_id ? sql`AND project_id = ${project_id}` : sql``}
          ${due_before ? sql`AND due_date <= ${due_before}` : sql``}
          ${tags && tags.length > 0 ? sql`AND tags ?| ${tags}` : sql``}
          ORDER BY priority ASC, due_date ASC NULLS LAST, created_at DESC
          LIMIT ${limit}
        `;

        if (!rows || rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Geen taken gevonden." }] };
        }

        const pLabel: Record<number, string> = { 1: "🔴 urgent", 2: "🟠 hoog", 3: "🟡 normaal", 4: "⚪ laag" };
        const lines = rows.map((r) => {
          let line = `• [${pLabel[r.priority] || r.priority}] ${r.title}`;
          if (r.due_date) line += ` — deadline: ${r.due_date}`;
          if (r.done && r.done_at) line += ` ✓ (${new Date(r.done_at).toLocaleDateString()})`;
          return line;
        });

        return {
          content: [{ type: "text" as const, text: `${rows.length} taak/taken:\n\n${lines.join("\n")}` }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 4: update_task
  server.registerTool(
    "update_task",
    {
      title: "Update Task",
      description: "Update one or more fields of an existing task.",
      inputSchema: {
        id: z.string().uuid().describe("Task UUID"),
        title: z.string().optional(),
        description: z.string().optional(),
        due_date: z.string().optional().describe("YYYY-MM-DD or empty string to clear"),
        priority: z.number().int().min(1).max(4).optional(),
        project_id: z.string().uuid().optional().describe("UUID or empty string to clear"),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ id, title, description, due_date, priority, project_id, tags }) => {
      try {
        const rows = await sql`
          UPDATE tasks SET
            title       = COALESCE(${title ?? null}, title),
            description = COALESCE(${description ?? null}, description),
            due_date    = CASE WHEN ${due_date !== undefined}
                            THEN ${due_date || null}
                            ELSE due_date END,
            priority    = COALESCE(${priority ?? null}, priority),
            project_id  = CASE WHEN ${project_id !== undefined}
                            THEN ${project_id || null}
                            ELSE project_id END,
            tags        = CASE WHEN ${tags !== undefined}
                            THEN ${tags ? JSON.stringify(tags) : null}::jsonb
                            ELSE tags END
          WHERE id = ${id}
          RETURNING title
        `;
        if (!rows || rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Taak niet gevonden." }], isError: true };
        }
        return { content: [{ type: "text" as const, text: `Taak bijgewerkt: ${rows[0].title}` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 5: delete_task
  server.registerTool(
    "delete_task",
    {
      title: "Delete Task",
      description: "Permanently delete a task by UUID.",
      inputSchema: {
        id: z.string().uuid().describe("Task UUID"),
      },
    },
    async ({ id }) => {
      try {
        await sql`DELETE FROM tasks WHERE id = ${id}`;
        return { content: [{ type: "text" as const, text: "Taak verwijderd." }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
