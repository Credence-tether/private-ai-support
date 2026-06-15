// Unified chat helper that supports Groq (cloud) and Ollama (self-hosted).
// Server-only.
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiSettings = {
  ai_provider: "groq" | "ollama";
  groq_model: string;
  ollama_base_url: string;
  ollama_model: string;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function groqChat(messages: ChatMessage[], model: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 500 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function ollamaChat(messages: ChatMessage[], baseUrl: string, model: string): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.4, num_predict: 500 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content?.trim() ?? "";
}

export async function aiChat(messages: ChatMessage[], settings: AiSettings): Promise<string> {
  if (settings.ai_provider === "ollama") {
    return ollamaChat(messages, settings.ollama_base_url, settings.ollama_model);
  }
  return groqChat(messages, settings.groq_model);
}

export const OLLAMA_MODELS = ["llama3.2:3b", "qwen2.5-coder:1.5b", "tinyllama:latest"] as const;
