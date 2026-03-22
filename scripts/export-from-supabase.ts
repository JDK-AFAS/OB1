#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write
/**
 * scripts/export-from-supabase.ts
 *
 * MigratieScript: exporteer thoughts uit Supabase en importeer ze in lokale PostgreSQL.
 *
 * Gebruik:
 *   SUPABASE_DB_URL="postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres" \
 *   DATABASE_URL="postgresql://ob1:<password>@localhost:5432/ob1" \
 *   deno run --allow-net --allow-env scripts/export-from-supabase.ts
 *
 * Of: exporteer eerst naar JSON-bestand, importeer daarna:
 *   SUPABASE_DB_URL="..." deno run --allow-net --allow-env --allow-write scripts/export-from-supabase.ts --export-only
 *   DATABASE_URL="..." deno run --allow-net --allow-env --allow-read scripts/export-from-supabase.ts --import-only
 */

import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const EXPORT_FILE = "thoughts-export.json";

// ─── Argumenten verwerken ─────────────────────────────────────────────────────

const args = Deno.args;
const exportOnly = args.includes("--export-only");
const importOnly = args.includes("--import-only");
const dryRun = args.includes("--dry-run");

if (dryRun) {
  console.log("🔍 DRY-RUN modus: geen wijzigingen worden opgeslagen.");
}

// ─── Stap 1: Exporteer vanuit Supabase ──────────────────────────────────────

async function exportFromSupabase(): Promise<unknown[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!supabaseUrl) {
    throw new Error("SUPABASE_DB_URL is niet ingesteld. Zie bovenaan dit script voor instructies.");
  }

  console.log("🔗 Verbinding maken met Supabase...");
  const supabase = postgres(supabaseUrl, {
    max: 1,
    connect_timeout: 15,
    ssl: { rejectUnauthorized: false }, // Supabase vereist SSL
  });

  try {
    // Check of de tabel bestaat
    const tableCheck = await supabase`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'thoughts'
      ) AS exists
    `;

    if (!tableCheck[0].exists) {
      throw new Error("Tabel 'thoughts' niet gevonden in Supabase. Controleer de database en schema.");
    }

    // Tel het aantal thoughts
    const countResult = await supabase`SELECT COUNT(*) AS total FROM thoughts`;
    const total = Number(countResult[0].total);
    console.log(`📊 ${total} thoughts gevonden in Supabase.`);

    if (total === 0) {
      console.log("ℹ️  Geen thoughts om te exporteren.");
      return [];
    }

    // Exporteer alle thoughts in batches van 500
    const BATCH_SIZE = 500;
    const allThoughts: unknown[] = [];
    let offset = 0;

    while (offset < total) {
      const batch = await supabase`
        SELECT
          id::text,
          content,
          embedding::text,
          metadata,
          created_at
        FROM thoughts
        ORDER BY created_at ASC
        LIMIT ${BATCH_SIZE}
        OFFSET ${offset}
      `;

      allThoughts.push(...batch);
      offset += BATCH_SIZE;
      console.log(`  ✓ ${Math.min(offset, total)} / ${total} geëxporteerd`);
    }

    console.log(`✅ Export compleet: ${allThoughts.length} thoughts`);
    return allThoughts;
  } finally {
    await supabase.end();
  }
}

// ─── Stap 2: Importeer in lokale PostgreSQL ──────────────────────────────────

async function importToLocal(thoughts: unknown[]): Promise<void> {
  const databaseUrl = Deno.env.get("DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is niet ingesteld. Zie bovenaan dit script voor instructies.");
  }

  console.log("🔗 Verbinding maken met lokale PostgreSQL...");
  const local = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
  });

  try {
    // Check of pgvector actief is
    const extCheck = await local`
      SELECT EXISTS (
        SELECT FROM pg_extension WHERE extname = 'vector'
      ) AS exists
    `;
    if (!extCheck[0].exists) {
      throw new Error("pgvector extensie niet gevonden. Zorg dat 'docker compose up -d postgres' is gedraaid en init-scripts zijn uitgevoerd.");
    }

    // Tel bestaande thoughts
    const existingCount = await local`SELECT COUNT(*) AS total FROM thoughts`;
    const existing = Number(existingCount[0].total);

    if (existing > 0) {
      console.log(`⚠️  Er zijn al ${existing} thoughts in de lokale database.`);
      console.log("   Doorgaan voegt ontbrekende thoughts toe (duplicaten worden overgeslagen via ON CONFLICT).");
    }

    if (dryRun) {
      console.log(`🔍 DRY-RUN: zou ${thoughts.length} thoughts importeren (geen wijzigingen).`);
      return;
    }

    // Importeer in batches van 100
    const BATCH_SIZE = 100;
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < thoughts.length; i += BATCH_SIZE) {
      const batch = (thoughts as Array<{
        id: string;
        content: string;
        embedding: string | null;
        metadata: unknown;
        created_at: string;
      }>).slice(i, i + BATCH_SIZE);

      for (const thought of batch) {
        const result = await local`
          INSERT INTO thoughts (id, content, embedding, metadata, created_at)
          VALUES (
            ${thought.id}::uuid,
            ${thought.content},
            ${thought.embedding ? thought.embedding + "::vector" : null},
            ${JSON.stringify(thought.metadata)}::jsonb,
            ${thought.created_at}::timestamptz
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `;

        if (result.length > 0) {
          imported++;
        } else {
          skipped++;
        }
      }

      console.log(`  ✓ ${Math.min(i + BATCH_SIZE, thoughts.length)} / ${thoughts.length} verwerkt`);
    }

    console.log(`✅ Import compleet: ${imported} geïmporteerd, ${skipped} overgeslagen (al aanwezig)`);

    // Herbouw HNSW index na bulk import voor optimale performance
    if (imported > 0) {
      console.log("🔨 HNSW index herbouwen voor optimale search performance...");
      await local`DROP INDEX IF EXISTS thoughts_embedding_idx`;
      await local`
        CREATE INDEX thoughts_embedding_idx
        ON thoughts USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `;
      console.log("✅ Index herbouwd.");
    }

  } finally {
    await local.end();
  }
}

// ─── Stap 3: Opslaan en laden van JSON-bestand ───────────────────────────────

async function saveToFile(thoughts: unknown[]): Promise<void> {
  const json = JSON.stringify(thoughts, null, 2);
  await Deno.writeTextFile(EXPORT_FILE, json);
  console.log(`💾 Exportbestand opgeslagen: ${EXPORT_FILE} (${(json.length / 1024).toFixed(1)} KB)`);
}

async function loadFromFile(): Promise<unknown[]> {
  try {
    const json = await Deno.readTextFile(EXPORT_FILE);
    const thoughts = JSON.parse(json) as unknown[];
    console.log(`📂 ${thoughts.length} thoughts geladen uit ${EXPORT_FILE}`);
    return thoughts;
  } catch {
    throw new Error(`Kan '${EXPORT_FILE}' niet lezen. Voer eerst '--export-only' uit.`);
  }
}

// ─── Hoofdlogica ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  OB1 Migratie: Supabase → lokale PostgreSQL");
  console.log("═══════════════════════════════════════════════════════════════");

  try {
    if (importOnly) {
      // Alleen importeren van bestaand JSON-bestand
      const thoughts = await loadFromFile();
      await importToLocal(thoughts);

    } else if (exportOnly) {
      // Alleen exporteren naar JSON-bestand
      const thoughts = await exportFromSupabase();
      await saveToFile(thoughts);

    } else {
      // Volledig: exporteer vanuit Supabase, importeer in lokaal
      const thoughts = await exportFromSupabase();

      if (thoughts.length > 0) {
        // Sla ook op als backup
        await saveToFile(thoughts);
        await importToLocal(thoughts);
      }
    }

    console.log("");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  ✅ Migratie geslaagd!");
    console.log("═══════════════════════════════════════════════════════════════");

  } catch (err) {
    console.error("");
    console.error("❌ FOUT:", err instanceof Error ? err.message : String(err));
    console.error("");
    console.error("Raadpleeg docs/09-migration-guide.md voor hulp bij veelvoorkomende fouten.");
    Deno.exit(1);
  }
}

await main();
