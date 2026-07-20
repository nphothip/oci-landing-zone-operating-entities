import { SYSTEM_PROMPT, schemaAsText, type WireResult } from "./prompt";
import type { LlmOutcome } from "./adapter";
import { extractJson } from "./json-util";
import { getGoogleAccessToken, loadServiceAccount } from "./google-auth";

// Google Gemini via REST generateContent. Supports API key (Google AI) or
// service account OAuth (Vertex AI) when GOOGLE_APPLICATION_CREDENTIALS is set.

type GeminiAuthMode = "api_key" | "service_account";

function geminiAuthMode(): GeminiAuthMode | null {
  if (process.env.GEMINI_API_KEY) return "api_key";
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return "service_account";
  return null;
}

export function isGeminiConfigured(): boolean {
  return geminiAuthMode() !== null;
}

export async function resolveGeminiRequest(model: string, body: object): Promise<
  | { ok: true; url: string; headers: Record<string, string> }
  | { ok: false; reason: string }
> {
  const mode = geminiAuthMode();
  if (mode === "api_key") {
    return {
      ok: true,
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY!,
      },
    };
  }

  if (mode === "service_account") {
    try {
      const sa = loadServiceAccount();
      const project = process.env.GEMINI_PROJECT_ID || sa.project_id;
      if (!project) {
        return { ok: false, reason: "GEMINI_PROJECT_ID not set and missing project_id in service account JSON" };
      }
      const location = process.env.GEMINI_LOCATION || "us-central1";
      const token = await getGoogleAccessToken();
      return {
        ok: true,
        url:
          `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
          `/locations/${location}/publishers/google/models/${model}:generateContent`,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
      };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  return { ok: false, reason: "GEMINI_API_KEY or GOOGLE_APPLICATION_CREDENTIALS not set" };
}

export async function geminiParse(text: string): Promise<LlmOutcome> {
  if (!isGeminiConfigured()) {
    return { status: "unavailable", reason: "GEMINI_API_KEY or GOOGLE_APPLICATION_CREDENTIALS not set" };
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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

  const resolved = await resolveGeminiRequest(model, body);
  if (!resolved.ok) {
    const mode = geminiAuthMode();
    return mode
      ? { status: "error", message: resolved.reason }
      : { status: "unavailable", reason: resolved.reason };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(resolved.url, {
      method: "POST",
      headers: resolved.headers,
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
