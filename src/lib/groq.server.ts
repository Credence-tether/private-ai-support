// Groq chat completion via OpenAI-compatible HTTP API. Server-only.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

export async function groqChat(
  messages: GroqMessage[],
  model: string = "llama-3.3-70b-versatile",
): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      max_tokens: 400,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// Cheap heuristic: detect intent to talk to a human.
const HUMAN_PATTERNS = [
  /\btalk\s+to\s+(a\s+)?(human|person|agent|someone|representative|rep|operator|staff|support)\b/i,
  /\bspeak\s+(to|with)\s+(a\s+)?(human|person|agent|someone|representative|rep|operator|staff)\b/i,
  /\b(real|live|actual)\s+(human|person|agent)\b/i,
  /\bhuman\s+(agent|support|please|now)\b/i,
  /\b(connect|transfer)\s+me\s+(to|with)\b/i,
  /\bcustomer\s+(service|support)\b/i,
];

export function wantsHuman(text: string): boolean {
  return HUMAN_PATTERNS.some((p) => p.test(text));
}
