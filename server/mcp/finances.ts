// server/mcp/finances.ts — MCP tools voor financiën
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { sql as sqlType } from "../db.ts";

type Sql = typeof sqlType;

function formatEuro(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

export function registerFinanceTools(server: McpServer, sql: Sql) {
  // Tool 1: log_finance
  server.registerTool(
    "log_finance",
    {
      title: "Log Finance",
      description:
        'Log an income or expense. Examples: "Log uitgave: €45 boodschappen", "Log inkomen: €2800 salaris"',
      inputSchema: {
        type: z.enum(["income", "expense"]).describe("income or expense"),
        amount: z.number().positive().describe("Positive amount"),
        description: z.string(),
        category: z.string().describe("E.g. wonen, boodschappen, vervoer, salaris"),
        date: z.string().optional().describe("YYYY-MM-DD (default: today)"),
        currency: z.string().optional().default("EUR"),
        tags: z.array(z.string()).optional(),
        recurring: z.boolean().optional().default(false),
      },
    },
    async ({ type, amount, description, category, date, currency, tags, recurring }) => {
      try {
        const entryDate = date ?? new Date().toISOString().slice(0, 10);
        const sign = type === "expense" ? -1 : 1;

        await sql`
          INSERT INTO finances (type, amount, description, category, date, currency, tags, recurring)
          VALUES (
            ${type},
            ${sign * amount},
            ${description},
            ${category},
            ${entryDate},
            ${currency},
            ${tags ? JSON.stringify(tags) : null}::jsonb,
            ${recurring}
          )
        `;

        const label = type === "income" ? "Inkomen" : "Uitgave";
        return {
          content: [
            {
              type: "text" as const,
              text: `${label} gelogd: ${formatEuro(amount)} — ${description} (${category}, ${entryDate})`,
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

  // Tool 2: list_finances
  server.registerTool(
    "list_finances",
    {
      title: "List Finances",
      description: "List income/expense records with optional filters.",
      inputSchema: {
        type: z.enum(["income", "expense"]).optional(),
        category: z.string().optional(),
        from: z.string().optional().describe("YYYY-MM-DD"),
        to: z.string().optional().describe("YYYY-MM-DD"),
        limit: z.number().int().optional().default(20),
      },
    },
    async ({ type, category, from, to, limit }) => {
      try {
        const rows = await sql`
          SELECT type, amount, description, category, date, currency
          FROM finances
          WHERE 1=1
          ${type ? sql`AND type = ${type}` : sql``}
          ${category ? sql`AND category ILIKE ${"%" + category + "%"}` : sql``}
          ${from ? sql`AND date >= ${from}` : sql``}
          ${to ? sql`AND date <= ${to}` : sql``}
          ORDER BY date DESC
          LIMIT ${limit}
        `;

        if (!rows || rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Geen transacties gevonden." }] };
        }

        const lines = rows.map((r) => {
          const sign = r.amount >= 0 ? "+" : "";
          return `[${r.date}] ${sign}${formatEuro(Math.abs(r.amount))} ${r.description} (${r.category})`;
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

  // Tool 3: finance_summary
  server.registerTool(
    "finance_summary",
    {
      title: "Finance Summary",
      description: "Get income/expense summary for a month or year.",
      inputSchema: {
        month: z.string().optional().describe("YYYY-MM (default: current month)"),
        year: z.number().int().optional().describe("Full year (e.g. 2026)"),
      },
    },
    async ({ month, year }) => {
      try {
        let fromDate: string;
        let toDate: string;
        let periodLabel: string;

        if (year && !month) {
          fromDate = `${year}-01-01`;
          toDate = `${year}-12-31`;
          periodLabel = `${year}`;
        } else {
          const m = month ?? new Date().toISOString().slice(0, 7);
          const [y, mo] = m.split("-").map(Number);
          fromDate = `${y}-${String(mo).padStart(2, "0")}-01`;
          const lastDay = new Date(y, mo, 0).getDate();
          toDate = `${y}-${String(mo).padStart(2, "0")}-${lastDay}`;
          periodLabel = new Date(fromDate).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
        }

        const totals = await sql`
          SELECT
            SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) AS total_income,
            SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END) AS total_expense
          FROM finances
          WHERE date >= ${fromDate} AND date <= ${toDate}
        `;

        const catRows = await sql`
          SELECT category, SUM(ABS(amount)) AS cat_total
          FROM finances
          WHERE type = 'expense' AND date >= ${fromDate} AND date <= ${toDate}
          GROUP BY category
          ORDER BY cat_total DESC
          LIMIT 6
        `;

        const income = Number(totals[0]?.total_income ?? 0);
        const expense = Number(totals[0]?.total_expense ?? 0);
        const balance = income - expense;

        const lines = [
          `=== Financieel overzicht: ${periodLabel} ===`,
          `Inkomen:  ${formatEuro(income)}`,
          `Uitgaven: ${formatEuro(expense)}`,
          `Saldo:    ${balance >= 0 ? "+" : ""}${formatEuro(balance)}`,
        ];

        if (catRows.length > 0) {
          lines.push("\nTop uitgavencategorieën:");
          for (const r of catRows) {
            const pct = expense > 0 ? ((Number(r.cat_total) / expense) * 100).toFixed(0) : "0";
            lines.push(`  ${r.category}: ${formatEuro(Number(r.cat_total))} (${pct}%)`);
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
