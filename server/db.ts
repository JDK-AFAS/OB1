// server/db.ts — PostgreSQL connection pool (directe verbinding, geen Supabase)
import postgres from "postgres";

const DATABASE_URL = Deno.env.get("DATABASE_URL")!;

// Singleton connectie pool
export const sql = postgres(DATABASE_URL, {
  max: 10,           // max connections in pool
  idle_timeout: 30,  // seconds
  connect_timeout: 10,
});
