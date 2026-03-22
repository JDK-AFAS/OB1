// server/mcp/contacts.ts — MCP tools voor contacten
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { sql as sqlType } from "../db.ts";
import type { AiProvider } from "../ai.ts";

type Sql = typeof sqlType;

export function registerContactTools(server: McpServer, sql: Sql, ai: AiProvider) {
  // Tool 1: create_contact
  server.registerTool(
    "create_contact",
    {
      title: "Create Contact",
      description: "Add a new contact to the address book.",
      inputSchema: {
        name: z.string().describe("Full name (required)"),
        email: z.string().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        role: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
        birthday: z.string().optional().describe("YYYY-MM-DD"),
      },
    },
    async ({ name, email, phone, company, role, notes, tags, birthday }) => {
      try {
        await sql`
          INSERT INTO contacts (name, email, phone, company, role, notes, tags, birthday)
          VALUES (
            ${name},
            ${email ?? null},
            ${phone ?? null},
            ${company ?? null},
            ${role ?? null},
            ${notes ?? null},
            ${tags ? JSON.stringify(tags) : null}::jsonb,
            ${birthday ?? null}
          )
        `;
        return { content: [{ type: "text" as const, text: `Contact aangemaakt: ${name}` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 2: list_contacts
  server.registerTool(
    "list_contacts",
    {
      title: "List Contacts",
      description: "List contacts with optional search and tag filters.",
      inputSchema: {
        tags: z.array(z.string()).optional(),
        search: z.string().optional().describe("Search by name, company, or email"),
        limit: z.number().int().optional().default(20),
      },
    },
    async ({ tags, search, limit }) => {
      try {
        const rows = await sql`
          SELECT id, name, email, company, role, birthday
          FROM contacts
          WHERE 1=1
          ${tags && tags.length > 0 ? sql`AND tags ?| ${tags}` : sql``}
          ${
            search
              ? sql`AND (
                  name ILIKE ${"%" + search + "%"} OR
                  company ILIKE ${"%" + search + "%"} OR
                  email ILIKE ${"%" + search + "%"}
                )`
              : sql``
          }
          ORDER BY name ASC
          LIMIT ${limit}
        `;

        if (!rows || rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Geen contacten gevonden." }] };
        }

        const lines = rows.map((r) => {
          let line = `• ${r.name}`;
          if (r.company) line += ` (${r.company}${r.role ? `, ${r.role}` : ""})`;
          if (r.email) line += ` — ${r.email}`;
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

  // Tool 3: get_contact
  server.registerTool(
    "get_contact",
    {
      title: "Get Contact",
      description: "Get full contact profile including recent interactions. Provide UUID or name.",
      inputSchema: {
        id: z.string().uuid().optional().describe("Contact UUID"),
        name: z.string().optional().describe("Contact name (fuzzy match)"),
      },
    },
    async ({ id, name }) => {
      try {
        if (!id && !name) {
          return {
            content: [{ type: "text" as const, text: "Geef een id of naam op." }],
            isError: true,
          };
        }

        let contacts;
        if (id) {
          contacts = await sql`SELECT * FROM contacts WHERE id = ${id} LIMIT 1`;
        } else {
          contacts = await sql`
            SELECT * FROM contacts
            WHERE name ILIKE ${"%" + name! + "%"}
            ORDER BY name ASC LIMIT 1
          `;
        }

        if (!contacts.length) {
          return { content: [{ type: "text" as const, text: "Contact niet gevonden." }], isError: true };
        }

        const c = contacts[0];
        const interactions = await sql`
          SELECT type, summary, date
          FROM contact_interactions
          WHERE contact_id = ${c.id}
          ORDER BY date DESC
          LIMIT 5
        `;

        const lines = [
          `=== ${c.name} ===`,
          ...(c.company ? [`Bedrijf: ${c.company}${c.role ? ` (${c.role})` : ""}`] : []),
          ...(c.email ? [`Email: ${c.email}`] : []),
          ...(c.phone ? [`Tel: ${c.phone}`] : []),
          ...(c.birthday ? [`Verjaardag: ${c.birthday}`] : []),
          ...(c.notes ? [`\nNotes: ${c.notes}`] : []),
        ];

        if (interactions.length > 0) {
          lines.push("\nRecente interacties:");
          for (const i of interactions) {
            lines.push(`  [${i.date}] ${i.type}: ${i.summary}`);
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

  // Tool 4: log_interaction
  server.registerTool(
    "log_interaction",
    {
      title: "Log Interaction",
      description:
        "Log an interaction with a contact (call, email, meeting, etc.). Optionally also capture as thought.",
      inputSchema: {
        contact_id: z.string().uuid().optional().describe("Contact UUID"),
        contact_name: z.string().optional().describe("Contact name (fuzzy match)"),
        type: z
          .enum(["call", "email", "meeting", "message", "note", "other"])
          .describe("Type of interaction"),
        summary: z.string().describe("Short description of what happened"),
        date: z.string().optional().describe("YYYY-MM-DD (default: today)"),
        also_capture: z
          .boolean()
          .optional()
          .default(false)
          .describe("Also save as thought in AI memory"),
      },
    },
    async ({ contact_id, contact_name, type, summary, date, also_capture }) => {
      try {
        if (!contact_id && !contact_name) {
          return {
            content: [{ type: "text" as const, text: "Geef een contact_id of contact_name op." }],
            isError: true,
          };
        }

        let resolvedId = contact_id;
        let resolvedName = "";

        if (!resolvedId) {
          const contacts = await sql`
            SELECT id, name FROM contacts
            WHERE name ILIKE ${"%" + contact_name! + "%"}
            ORDER BY name ASC LIMIT 1
          `;
          if (!contacts.length) {
            return {
              content: [{ type: "text" as const, text: `Contact "${contact_name}" niet gevonden.` }],
              isError: true,
            };
          }
          resolvedId = contacts[0].id;
          resolvedName = contacts[0].name;
        } else {
          const contacts = await sql`SELECT name FROM contacts WHERE id = ${resolvedId} LIMIT 1`;
          resolvedName = contacts[0]?.name ?? "onbekend";
        }

        const interactionDate = date ?? new Date().toISOString().slice(0, 10);

        await sql`
          INSERT INTO contact_interactions (contact_id, type, summary, date)
          VALUES (${resolvedId}, ${type}, ${summary}, ${interactionDate})
        `;

        if (also_capture) {
          const text = `Interactie met ${resolvedName} (${type}): ${summary}`;
          const [embedding, metadata] = await Promise.all([
            ai.getEmbedding(text),
            ai.extractMetadata(text),
          ]);
          await sql`
            INSERT INTO thoughts (content, embedding, metadata)
            VALUES (
              ${text},
              ${JSON.stringify(embedding)}::vector,
              ${JSON.stringify({ ...metadata, source: "contact_interaction" })}::jsonb
            )
          `;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Interactie gelogd met ${resolvedName}: ${type} — ${summary}`,
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
}
