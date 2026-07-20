import { activeProvider } from "./adapter";
import { extractJson } from "./json-util";
import { resolveGeminiRequest } from "./gemini";

// Provider-agnostic "return JSON" completion, reusing the same provider
// detection + auth (incl. Gemini Vertex service accounts) as the parser.
// Used by features beyond the SolutionSpec parser (e.g. design-doc narrative).

export type LlmJsonOutcome =
  | { status: "ok"; data: unknown }
  | { status: "unavailable"; reason: string }
  | { status: "error"; message: string };

export async function llmJson(system: string, user: string, schema: object): Promise<LlmJsonOutcome> {
  const { provider, reason } = activeProvider();
  if (provider === "none") return { status: "unavailable", reason: reason ?? "LLM not configured" };

  const controller = new AbortController();
  const timeoutMs = Number(process.env.LLM_JSON_TIMEOUT_MS || 120_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (provider === "gemini") {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      };
      const resolved = await resolveGeminiRequest(model, body);
      if (!resolved.ok) return { status: "error", message: resolved.reason };
      const res = await fetch(resolved.url, { method: "POST", headers: resolved.headers, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) return { status: "error", message: `Gemini API HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const parsed = extractJson(raw);
      return parsed ? { status: "ok", data: parsed } : { status: "error", message: "Gemini returned unparseable JSON" };
    }

    // openai
    const key = process.env.OPENAI_API_KEY!;
    const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const baseBody: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name: "design_narrative", strict: true, schema } },
    };
    const call = (withTemp: boolean) =>
      fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(withTemp ? { ...baseBody, temperature: 0.4 } : baseBody),
        signal: controller.signal,
      });
    let res = await call(true);
    if (res.status === 400 && /temperature/i.test(await res.clone().text().catch(() => ""))) res = await call(false);
    if (!res.ok) return { status: "error", message: `OpenAI API HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(raw);
    return parsed ? { status: "ok", data: parsed } : { status: "error", message: "OpenAI returned unparseable JSON" };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
