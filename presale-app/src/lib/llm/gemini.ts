import { SYSTEM_PROMPT, schemaAsText, type WireResult } from "./prompt";
import type { LlmOutcome } from "./adapter";
import { extractJson } from "./json-util";

// Google Gemini via the REST generateContent endpoint. The wire schema is
// embedded in the prompt (responseMimeType json) — this stays compatible
// across Gemini API versions without depending on responseSchema dialects.

export async function geminiParse(text: string): Promise<LlmOutcome> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { status: "unavailable", reason: "GEMINI_API_KEY not set" };
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Return ONLY a JSON object matching this JSON Schema (all keys required, unknown values null):\n` +
              `${schemaAsText()}\n\nUser requirement:\n${text}`,
          },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { status: "error", message: `Gemini API HTTP ${res.status}: ${detail.slice(0, 300)}` };
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const wire = extractJson<WireResult>(raw);
    if (!wire) return { status: "error", message: "Gemini returned unparseable JSON" };
    return { status: "ok", wire };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
