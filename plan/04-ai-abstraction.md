# Plan 04 — AI Abstractielaag (OpenRouter → Ollama migratie)

## Probleem

De huidige code is hardcoded aan OpenRouter. De overstap naar Ollama vereist:
1. Een andere API endpoint
2. Een andere embedding-dimensie (1536 → 768)
3. Andere model-namen

Een abstractielaag zorgt dat je kunt switchen zonder alle tools te herschrijven.

---

## ai.ts — Provider abstractie

```typescript
// server/ai.ts

export interface AiProvider {
  getEmbedding(text: string): Promise<number[]>;
  extractMetadata(text: string): Promise<Record<string, unknown>>;
  embeddingDimension: number;
}

export function getAiProvider(): AiProvider {
  const provider = Deno.env.get("AI_PROVIDER") ?? "openrouter";

  switch (provider) {
    case "openrouter":
      return new OpenRouterProvider();
    case "ollama":
      return new OllamaProvider();
    default:
      throw new Error(`Onbekende AI_PROVIDER: ${provider}`);
  }
}
```

---

## OpenRouterProvider (huidige implementatie, opgekuist)

```typescript
class OpenRouterProvider implements AiProvider {
  readonly embeddingDimension = 1536;

  private readonly baseUrl = "https://openrouter.ai/api/v1";
  private readonly apiKey = Deno.env.get("OPENROUTER_API_KEY")!;
  private readonly embedModel = "openai/text-embedding-3-small";
  private readonly chatModel = "openai/gpt-4o-mini";

  async getEmbedding(text: string): Promise<number[]> {
    const r = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.embedModel, input: text }),
    });
    if (!r.ok) throw new Error(`OpenRouter embeddings: ${r.status}`);
    const d = await r.json();
    return d.data[0].embedding;
  }

  async extractMetadata(text: string): Promise<Record<string, unknown>> {
    const r = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.chatModel,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: METADATA_SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });
    const d = await r.json();
    try {
      return JSON.parse(d.choices[0].message.content);
    } catch {
      return { topics: ["uncategorized"], type: "observation" };
    }
  }
}
```

---

## OllamaProvider (toekomstige implementatie)

```typescript
class OllamaProvider implements AiProvider {
  readonly embeddingDimension = 768;  // nomic-embed-text

  private readonly baseUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://ollama:11434";
  private readonly embedModel = Deno.env.get("OLLAMA_EMBED_MODEL") ?? "nomic-embed-text";
  private readonly chatModel = Deno.env.get("OLLAMA_CHAT_MODEL") ?? "llama3.1:8b";

  async getEmbedding(text: string): Promise<number[]> {
    const r = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.embedModel, prompt: text }),
    });
    if (!r.ok) throw new Error(`Ollama embeddings: ${r.status}`);
    const d = await r.json();
    return d.embedding;
  }

  async extractMetadata(text: string): Promise<Record<string, unknown>> {
    const r = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.chatModel,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: METADATA_SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });
    const d = await r.json();
    try {
      return JSON.parse(d.message.content);
    } catch {
      return { topics: ["uncategorized"], type: "observation" };
    }
  }
}
```

---

## Migratie van embeddings (OpenRouter → Ollama)

**Het probleem:** bestaande `thoughts` hebben 1536-dimensie embeddings. Ollama's `nomic-embed-text` genereert 768-dimensies. Ze zijn **incompatibel**.

### Oplossing: re-embedding script

```typescript
// scripts/reembed.ts
// Draai dit als: deno run --allow-net --allow-env scripts/reembed.ts

import { sql } from "../server/db.ts";
import { OllamaProvider } from "../server/ai.ts";

const ollama = new OllamaProvider();

// Stap 1: kolom aanpassen (EENMALIG)
await sql`ALTER TABLE thoughts ALTER COLUMN embedding TYPE vector(768)`;

// Stap 2: alle thoughts opnieuw embedden
const thoughts = await sql<{ id: string; content: string }[]>`
  SELECT id, content FROM thoughts ORDER BY created_at
`;

console.log(`Re-embedding ${thoughts.length} thoughts...`);

for (const thought of thoughts) {
  const embedding = await ollama.getEmbedding(thought.content);
  await sql`
    UPDATE thoughts SET embedding = ${JSON.stringify(embedding)}::vector
    WHERE id = ${thought.id}
  `;
  // Rate limiting voor Ollama
  await new Promise(r => setTimeout(r, 100));
}

// Stap 3: HNSW index herbouwen
await sql`
  DROP INDEX IF EXISTS thoughts_embedding_idx;
  CREATE INDEX thoughts_embedding_idx
    ON thoughts USING hnsw (embedding vector_cosine_ops);
`;

console.log("Re-embedding voltooid.");
```

### Migratiestappen (wanneer je overschakelt)

1. Ollama opstarten + model downloaden: `ollama pull nomic-embed-text`
2. `.env` aanpassen: `AI_PROVIDER=ollama`
3. Script draaien: `docker exec ob1-server deno run --allow-net --allow-env /app/scripts/reembed.ts`
4. `match_thoughts` functie updaten: `vector(1536)` → `vector(768)`
5. Server herstarten: `docker compose restart server`

**Verwachte duur:** ~1 seconde per thought bij lokale Ollama. 1000 thoughts ≈ 17 minuten.

---

## METADATA_SYSTEM_PROMPT (gedeeld)

```typescript
const METADATA_SYSTEM_PROMPT = `Extract metadata from the user's captured thought.
Return JSON with:
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what's explicitly there.`;
```

---

## Aanbevolen Ollama modellen

| Doel | Model | Grootte | Kwaliteit |
|---|---|---|---|
| Embeddings | `nomic-embed-text` | 274MB | Uitstekend voor tekst |
| Chat/LLM (snel) | `llama3.2:3b` | 2GB | Goed voor metadata extractie |
| Chat/LLM (kwaliteit) | `llama3.1:8b` | 4.7GB | Aanbevolen |
| Chat/LLM (best) | `mistral:7b` | 4.1GB | Alternatief |

**Hardware vereisten voor `llama3.1:8b`:**
- CPU-only: 8GB RAM, traag (~30s per response)
- GPU (8GB VRAM): comfortabel snel

---

## TODO bij implementatie

- [ ] `server/ai.ts` aanmaken met beide providers
- [ ] `.env.example` updaten met AI_PROVIDER variabele
- [ ] Testen: OpenRouterProvider werkt (bestaand gedrag)
- [ ] Testen: OllamaProvider werkt (nadat Ollama actief is)
- [ ] `scripts/` directory aanmaken
- [ ] `scripts/reembed.ts` aanmaken
- [ ] Documenteer migratiestappen in `docs/` wanneer Ollama gereed is
