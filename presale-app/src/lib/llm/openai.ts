import { SYSTEM_PROMPT, WIRE_SCHEMA, type WireResult } from "./prompt";
import type { LlmOutcome } from "./adapter";
import { extractJson } from "./json-util";

// OpenAI via chat completions with strict structured output (json_schema).
// Newer models (gpt-5 / o-series) reject any temperature other than the
// default 1, so we send 0.2 first (better determinism for extraction) and
// transparently retry without it when the model refuses.

interface OpenAiError {
  status: number;
  detail: string;
}

async function callOpenAi(
  base: string,
  key: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ ok: true; raw: string } | { ok: false; error: OpenAiError }> {
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: { status: res.status, detail } };
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { ok: true, raw: data.choices?.[0]?.message?.content ?? "" };
}

function isUnsupportedTemperature(error: OpenAiError): boolean {
  return error.status === 400 && /temperature/i.test(error.detail);
}

export async function openaiParse(text: string): Promise<LlmOutcome> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { status: "unavailable", reason: "OPENAI_API_KEY not set" };
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  const baseBody: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "solution_wire", strict: true, schema: WIRE_SCHEMA },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    let result = await callOpenAi(base, key, { ...baseBody, temperature: 0.2 }, controller.signal);
    // Retry without temperature for models that only accept the default value.
    if (!result.ok && isUnsupportedTemperature(result.error)) {
      result = await callOpenAi(base, key, baseBody, controller.signal);
    }
    if (!result.ok) {
      return { status: "error", message: `OpenAI API HTTP ${result.error.status}: ${result.error.detail.slice(0, 300)}` };
    }
    const wire = extractJson<WireResult>(result.raw);
    if (!wire) return { status: "error", message: "OpenAI returned unparseable JSON" };
    return { status: "ok", wire };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
