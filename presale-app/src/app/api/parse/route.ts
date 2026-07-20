import { NextResponse } from "next/server";
import type { ParseResponse } from "@/lib/domain/types";
import { getAdapter } from "@/lib/llm/adapter";
import { normalizeWire } from "@/lib/llm/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    // fall through to the length check
  }
  if (text.length < 10) {
    const res: ParseResponse = { status: "error", message: "โปรดพิมพ์อธิบายความต้องการอย่างน้อย 1-2 ประโยค" };
    return NextResponse.json(res, { status: 400 });
  }
  if (text.length > 8000) text = text.slice(0, 8000);

  const adapter = getAdapter();
  if (adapter.name === "none") {
    const res: ParseResponse = { status: "llm_unavailable", reason: adapter.reason };
    return NextResponse.json(res);
  }

  let outcome = await adapter.parse(text);
  if (outcome.status === "error") {
    // one retry nudging the model back to valid JSON
    outcome = await adapter.parse(`${text}\n\n(Return ONLY valid JSON matching the schema.)`);
  }
  if (outcome.status === "unavailable") {
    return NextResponse.json({ status: "llm_unavailable", reason: outcome.reason } satisfies ParseResponse);
  }
  if (outcome.status === "error") {
    return NextResponse.json({ status: "error", message: outcome.message } satisfies ParseResponse, { status: 502 });
  }

  const wire = outcome.wire;
  const questions = (Array.isArray(wire.clarifyingQuestions) ? wire.clarifyingQuestions : [])
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .slice(0, 3);
  if (questions.length > 0) {
    return NextResponse.json({ status: "clarify", questions } satisfies ParseResponse);
  }

  const normalized = normalizeWire(wire);
  if (!normalized.ok) {
    return NextResponse.json({ status: "error", message: normalized.message } satisfies ParseResponse, { status: 502 });
  }
  return NextResponse.json({ status: "ok", spec: normalized.spec } satisfies ParseResponse);
}
