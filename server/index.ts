// server/index.ts — Open Brain MCP server (v2.0, directe PostgreSQL)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";

import { sql } from "./db.ts";
import { getAiProvider } from "./ai.ts";
import { registerThoughtTools } from "./mcp/thoughts.ts";

const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY")!;
const PORT = parseInt(Deno.env.get("PORT") || "3000");

// AI provider (openrouter of ollama, via AI_PROVIDER env var)
const ai = getAiProvider();

// MCP Server
const mcpServer = new McpServer({ name: "ob1", version: "2.0.0" });

// Tools registreren
registerThoughtTools(mcpServer, sql, ai);

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

Deno.serve({ port: PORT }, app.fetch);
