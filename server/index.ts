// server/index.ts — Open Brain MCP server (v2.0, directe PostgreSQL)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";

import { sql } from "./db.ts";
import { getAiProvider } from "./ai.ts";
import { registerThoughtTools } from "./mcp/thoughts.ts";
import { registerTaskTools } from "./mcp/tasks.ts";
import { registerCalendarTools } from "./mcp/calendar.ts";
import { registerNoteTools } from "./mcp/notes.ts";
import { registerProjectTools } from "./mcp/projects.ts";
import { registerContactTools } from "./mcp/contacts.ts";
import { registerFinanceTools } from "./mcp/finances.ts";
import { registerHealthTools } from "./mcp/health.ts";

import { taskRoutes } from "./api/tasks.ts";
import { calendarRoutes } from "./api/calendar.ts";
import { noteRoutes } from "./api/notes.ts";
import { projectRoutes, cardRoutes } from "./api/projects.ts";
import { contactRoutes } from "./api/contacts.ts";
import { financeRoutes } from "./api/finances.ts";
import { healthRoutes } from "./api/health.ts";
import { thoughtRoutes } from "./api/thoughts.ts";

const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY")!;
const PORT = parseInt(Deno.env.get("PORT") || "3000");

// AI provider (openrouter of ollama, via AI_PROVIDER env var)
const ai = getAiProvider();

// MCP Server
const mcpServer = new McpServer({ name: "ob1", version: "2.0.0" });

// Tools registreren
registerThoughtTools(mcpServer, sql, ai);
registerTaskTools(mcpServer, sql);
registerCalendarTools(mcpServer, sql);
registerNoteTools(mcpServer, sql, ai);
registerProjectTools(mcpServer, sql);
registerContactTools(mcpServer, sql, ai);
registerFinanceTools(mcpServer, sql);
registerHealthTools(mcpServer, sql);

// Hono App
const app = new Hono();

// Health check (geen auth vereist)
app.get("/health", (c) => c.json({ status: "ok", version: "2.0.0" }));

// Auth middleware voor alle andere routes
app.use("*", async (c, next) => {
  const key =
    c.req.header("x-brain-key") ??
    new URL(c.req.url).searchParams.get("key");
  if (!key || key !== MCP_ACCESS_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// MCP endpoint
app.all("/mcp/*", async (c) => {
  const transport = new StreamableHTTPTransport();
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

// REST API routes
app.route("/api/tasks", taskRoutes);
app.route("/api/events", calendarRoutes);
app.route("/api/notes", noteRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/cards", cardRoutes);
app.route("/api/contacts", contactRoutes);
app.route("/api/finances", financeRoutes);
app.route("/api/health", healthRoutes);
app.route("/api/thoughts", thoughtRoutes);

Deno.serve({ port: PORT }, app.fetch);
