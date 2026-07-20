import type { WireResult } from "./prompt";
import { geminiParse } from "./gemini";
import { openaiParse } from "./openai";

export type LlmOutcome =
  | { status: "ok"; wire: WireResult }
  | { status: "unavailable"; reason: string }
  | { status: "error"; message: string };

export interface LlmAdapter {
  name: "gemini" | "openai";
  parse(text: string): Promise<LlmOutcome>;
}

export function activeProvider(): { provider: "gemini" | "openai" | "none"; reason?: string } {
  const requested = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (requested === "gemini") {
    return process.env.GEMINI_API_KEY
      ? { provider: "gemini" }
      : { provider: "none", reason: "LLM_PROVIDER=gemini but GEMINI_API_KEY is not set" };
  }
  if (requested === "openai") {
    return process.env.OPENAI_API_KEY
      ? { provider: "openai" }
      : { provider: "none", reason: "LLM_PROVIDER=openai but OPENAI_API_KEY is not set" };
  }
  if (requested === "none" || requested === "") {
    // Auto-detect from available keys when the provider is not pinned.
    if (process.env.GEMINI_API_KEY) return { provider: "gemini" };
    if (process.env.OPENAI_API_KEY) return { provider: "openai" };
    return { provider: "none", reason: "no LLM API key configured (GEMINI_API_KEY / OPENAI_API_KEY)" };
  }
  return { provider: "none", reason: `unknown LLM_PROVIDER: ${requested}` };
}

export function getAdapter(): LlmAdapter | { name: "none"; reason: string } {
  const { provider, reason } = activeProvider();
  if (provider === "gemini") return { name: "gemini", parse: geminiParse };
  if (provider === "openai") return { name: "openai", parse: openaiParse };
  return { name: "none", reason: reason ?? "LLM not configured" };
}
