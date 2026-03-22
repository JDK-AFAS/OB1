// server/ai.ts — AI provider abstractielaag (OpenRouter + Ollama)

const METADATA_SYSTEM_PROMPT = `Extract metadata from the user's captured thought.
Return JSON with:
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what's explicitly there.`;

export interface AiProvider {
  getEmbedding(text: string): Promise<number[]>;
  extractMetadata(text: string): Promise<Record<string, unknown>>;
  embeddingDimension: number;
}

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
    if (!r.ok) {
      const msg = await r.text().catch(() => "");
      throw new Error(`OpenRouter embeddings: ${r.status} ${msg}`);
    }
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

class OllamaProvider implements AiProvider {
  readonly embeddingDimension = 768; // nomic-embed-text

  private readonly baseUrl =
    Deno.env.get("OLLAMA_BASE_URL") ?? "http://ollama:11434";
  private readonly embedModel =
    Deno.env.get("OLLAMA_EMBED_MODEL") ?? "nomic-embed-text";
  private readonly chatModel =
    Deno.env.get("OLLAMA_CHAT_MODEL") ?? "llama3.1:8b";

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
