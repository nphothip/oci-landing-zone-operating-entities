import { SYSTEM_PROMPT, WIRE_SCHEMA, type WireResult } from "./prompt";
import type { LlmOutcome } from "./adapter";
import { extractJson } from "./json-util";

// OpenAI via chat completions with strict structured output (json_schema).

export async function openaiParse(text: string): Promise<LlmOutcome> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { status: "unavailable", reason: "OPENAI_API_KEY not set" };
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "solution_wire", strict: true, schema: WIRE_SCHEMA },
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { status: "error", message: `OpenAI API HTTP ${res.status}: ${detail.slice(0, 300)}` };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const wire = extractJson<WireResult>(raw);
    if (!wire) return { status: "error", message: "OpenAI returned unparseable JSON" };
    return { status: "ok", wire };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
