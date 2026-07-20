/** Extracts the first JSON object from an LLM response (handles ```json fences). */
export function extractJson<T>(raw: string): T | null {
  const stripped = raw.replace(/```json|```/g, "").trim();
  const candidates = [stripped];
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(stripped.slice(start, end + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      // try next candidate
    }
  }
  return null;
}
