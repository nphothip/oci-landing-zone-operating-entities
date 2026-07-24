import { NextResponse } from "next/server";
import { extractDocument } from "@/lib/tor/extract-text";
import { extractRequirements } from "@/lib/tor/requirements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

// POST multipart/form-data { file } -> structured TOR requirements.
//
// The server only READS the document and splits it into atomic requirements.
// Compliance matching stays on the client (matchRequirements) where it runs
// against the SolutionSpec + BOM already in the browser — so the pass/fail
// verdict never depends on a model call.
export async function POST(req: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ status: "error", message: "ต้องส่งไฟล์แบบ multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ status: "error", message: "ไม่พบไฟล์ในคำขอ" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ status: "error", message: "ไฟล์ว่างเปล่า" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { status: "error", message: `ไฟล์ใหญ่เกิน ${Math.round(MAX_BYTES / 1024 / 1024)} MB` },
      { status: 413 },
    );
  }

  let doc;
  try {
    doc = await extractDocument(file.name, await file.arrayBuffer());
  } catch (err) {
    return NextResponse.json({ status: "error", message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }

  if (doc.text.trim().length < 200) {
    return NextResponse.json({
      status: "error",
      message: "อ่านข้อความจากเอกสารได้น้อยเกินไป จนวิเคราะห์ไม่ได้",
      warnings: doc.warnings,
    }, { status: 422 });
  }

  const out = await extractRequirements(doc.text, file.name);
  if (out.status === "unavailable") {
    return NextResponse.json({ status: "llm_unavailable", reason: out.message, warnings: doc.warnings });
  }
  if (out.status === "error") {
    return NextResponse.json({ status: "error", message: out.message, warnings: doc.warnings }, { status: 502 });
  }

  return NextResponse.json({
    status: "ok",
    fileName: file.name,
    source: doc.source,
    charCount: doc.text.length,
    requirements: out.requirements,
    warnings: doc.warnings,
  });
}
