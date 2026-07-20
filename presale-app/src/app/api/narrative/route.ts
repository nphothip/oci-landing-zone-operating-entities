import { NextResponse } from "next/server";
import { parseSolutionSpec } from "@/lib/domain/spec-schema";
import { generateAiNarrative } from "@/lib/design/ai-narrative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { spec, facts, lang } -> AI-written design-doc prose per section.
// facts are the client-computed DesignFacts (fed to the LLM as context only).
export async function POST(req: Request): Promise<NextResponse> {
  let body: { spec?: unknown; facts?: unknown; lang?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ status: "error", message: "invalid JSON body" }, { status: 400 });
  }

  const parsed = parseSolutionSpec(body.spec);
  if (!parsed.ok) {
    return NextResponse.json({ status: "error", message: `invalid spec: ${parsed.message}` }, { status: 400 });
  }
  const lang = body.lang === "en" ? "en" : "th";

  const result = await generateAiNarrative(body.facts ?? {}, parsed.spec, lang);
  if (result.status === "unavailable") {
    return NextResponse.json({ status: "llm_unavailable", reason: result.reason });
  }
  if (result.status === "error") {
    return NextResponse.json({ status: "error", message: result.message }, { status: 502 });
  }
  return NextResponse.json({ status: "ok", narrative: result.narrative });
}
