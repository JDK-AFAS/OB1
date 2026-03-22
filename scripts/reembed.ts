// scripts/reembed.ts — Herbereken alle embeddings van 1536-dim naar 768-dim
// Gebruik: deno run --allow-net --allow-env scripts/reembed.ts
//
// WAARSCHUWING: dit script wijzigt de embedding-kolom definitief.
// Maak een backup van de database voor je dit draait.
// Alleen nodig bij overstap van OpenRouter (1536-dim) naar Ollama (768-dim).

import { sql } from "../server/db.ts";
import { OllamaProvider } from "../server/ai.ts";

const ollama = new OllamaProvider();

console.log("=== OB1 Re-embedding script ===");
console.log(`Ollama base URL: ${Deno.env.get("OLLAMA_BASE_URL") ?? "http://ollama:11434"}`);
console.log(`Embed model: ${Deno.env.get("OLLAMA_EMBED_MODEL") ?? "nomic-embed-text"}`);
console.log("");

// Stap 1: kolom aanpassen van vector(1536) naar vector(768)
console.log("Stap 1: kolom embedding aanpassen naar vector(768)...");
await sql`ALTER TABLE thoughts ALTER COLUMN embedding TYPE vector(768)`;
console.log("  ✓ Kolom aangepast.");

// Stap 2: alle thoughts ophalen
const thoughts = await sql<{ id: string; content: string }[]>`
  SELECT id, content FROM thoughts ORDER BY created_at
`;
console.log(`\nStap 2: ${thoughts.length} thoughts ophalen en opnieuw embedden...`);

let done = 0;
let errors = 0;

for (const thought of thoughts) {
  try {
    const embedding = await ollama.getEmbedding(thought.content);
    await sql`
      UPDATE thoughts
      SET embedding = ${JSON.stringify(embedding)}::vector
      WHERE id = ${thought.id}
    `;
    done++;
    if (done % 10 === 0) {
      console.log(`  ${done}/${thoughts.length} verwerkt...`);
    }
    // Kleine pauze om Ollama niet te overbelasten
    await new Promise((r) => setTimeout(r, 100));
  } catch (err) {
    errors++;
    console.error(`  Fout bij thought ${thought.id}: ${err}`);
  }
}

console.log(`\n  ✓ ${done} verwerkt, ${errors} fouten.`);

// Stap 3: HNSW index herbouwen
console.log("\nStap 3: HNSW index herbouwen...");
await sql`DROP INDEX IF EXISTS thoughts_embedding_idx`;
await sql`
  CREATE INDEX thoughts_embedding_idx
    ON thoughts USING hnsw (embedding vector_cosine_ops)
`;
console.log("  ✓ Index herbouwd.");

// Stap 4: match_thoughts functie updaten
console.log("\nStap 4: match_thoughts functie updaten naar 768 dimensies...");
await sql`
  CREATE OR REPLACE FUNCTION match_thoughts(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
  )
  RETURNS TABLE (
    id uuid,
    content text,
    metadata jsonb,
    similarity float
  )
  LANGUAGE sql STABLE
  AS $$
    SELECT id, content, metadata,
           1 - (embedding <=> query_embedding) AS similarity
    FROM thoughts
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
  $$
`;
console.log("  ✓ match_thoughts functie bijgewerkt.");

console.log("\n=== Re-embedding voltooid ===");
console.log("Vergeet niet de server te herstarten: docker compose restart server");

await sql.end();
