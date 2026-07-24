"use client";

import { useRef, useState } from "react";
import type { SolutionSpec } from "@/lib/domain/types";
import { L, useLang } from "@/lib/i18n";
import { deriveSpecFromTor, type SpecDecision } from "@/lib/tor/derive-spec";
import type { TorRequirement } from "@/lib/tor/types";

// TOR-first mode: upload the customer's ข้อกำหนดขอบเขตงาน and get a costed
// proposal in one step. The model reads the document; every design decision
// below it is a deterministic rule that shows its reasoning and the clause it
// came from, so the presale can defend the proposal line by line.

export interface TorIntake {
  spec: SolutionSpec;
  requirements: TorRequirement[];
  fileName: string;
  decisions: SpecDecision[];
  unmapped: TorRequirement[];
}

type Phase = "idle" | "reading" | "deriving" | "done" | "error";

const PHASE_LABEL: Record<Exclude<Phase, "idle" | "done" | "error">, { th: string; en: string }> = {
  reading: L("กำลังอ่านเอกสารและแยกข้อกำหนด…", "Reading the document and extracting requirements…"),
  deriving: L("กำลังแปลงข้อกำหนดเป็นแบบและ BOM…", "Turning the requirements into a design and BOM…"),
};

export function TorFirstPanel({ onIntake, busy }: { onIntake: (intake: TorIntake) => void; busy: boolean }) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [intake, setIntake] = useState<TorIntake | null>(null);
  const [customer, setCustomer] = useState("");

  async function upload(file: File) {
    setPhase("reading");
    setMessage("");
    setWarnings([]);
    setIntake(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/tor", { method: "POST", body: fd });
      const data = (await res.json()) as {
        status: string;
        message?: string;
        reason?: string;
        fileName?: string;
        requirements?: TorRequirement[];
        warnings?: string[];
      };
      if (data.status === "llm_unavailable") {
        setPhase("error");
        setMessage(t(L(`ยังไม่ได้ตั้งค่า AI สำหรับอ่านเอกสาร: ${data.reason ?? ""}`, `Document reading needs an AI provider: ${data.reason ?? ""}`)));
        return;
      }
      if (data.status !== "ok" || !data.requirements?.length) {
        setPhase("error");
        setMessage(data.message ?? t(L("อ่านข้อกำหนดจากเอกสารไม่ได้", "Could not extract requirements from the document")));
        setWarnings(data.warnings ?? []);
        return;
      }
      setWarnings(data.warnings ?? []);
      setPhase("deriving");

      const derived = deriveSpecFromTor(data.requirements, customer.trim() || undefined);
      const next: TorIntake = {
        spec: derived.spec,
        requirements: data.requirements,
        fileName: data.fileName ?? file.name,
        decisions: derived.decisions,
        unmapped: derived.unmapped,
      };
      setIntake(next);
      setPhase("done");
      onIntake(next);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const infraCount = intake?.requirements.filter((r) => r.infraRelevant).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-700">
          {t(L("อัปโหลด TOR → ได้แบบ + BOM + ตารางเปรียบเทียบข้อกำหนด ทันที", "Upload a TOR → design + BOM + compliance matrix in one step"))}
        </h3>
        <p className="mt-1 text-sm text-neutral-600">
          {t(
            L(
              "ระบบจะอ่านข้อกำหนดจากเอกสาร แล้วแปลงเป็น landing zone ตาม best practice โดยอัตโนมัติ — พร้อมบอกเหตุผลของทุกการตัดสินใจว่ามาจากข้อไหนของ TOR",
              "The document is read into atomic requirements, then turned into a best-practice landing zone automatically — with the reasoning and the source clause behind every decision.",
            ),
          )}
        </p>
        <ul className="mt-3 space-y-1 text-xs text-neutral-500">
          <li>{t(L("• AI อ่านและจัดโครงสร้างเอกสารเท่านั้น — ไม่ได้เป็นคนตัดสินว่าเราผ่านเกณฑ์หรือไม่", "• The AI only reads and structures the document — it never decides whether we comply"))}</li>
          <li>{t(L("• ทุกตัวเลขที่เสนอมาจาก BOM และราคา list price ของ AIS จริง", "• Every offered figure comes from the generated BOM and real AIS list prices"))}</li>
          <li>{t(L("• ข้อที่พิสูจน์อัตโนมัติไม่ได้ จะถูกทำเครื่องหมายให้ผู้เชี่ยวชาญตอบ ไม่ตีเป็นผ่านเอง", "• Anything we cannot prove is flagged for an engineer, never auto-passed"))}</li>
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".docx,.pdf,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <input
            type="text"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder={t(L("ชื่อหน่วยงาน/ลูกค้า (ไม่บังคับ)", "Customer / agency name (optional)"))}
            className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={phase === "reading" || phase === "deriving" || busy}
            className="rounded-lg bg-[#C74634] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {phase === "reading" || phase === "deriving"
              ? t(L("กำลังประมวลผล…", "Working…"))
              : intake
                ? t(L("อัปโหลด TOR ฉบับอื่น", "Upload a different TOR"))
                : t(L("เลือกไฟล์ TOR (.docx / .pdf)", "Choose a TOR file (.docx / .pdf)"))}
          </button>
          {phase === "reading" || phase === "deriving" ? (
            <span className="animate-pulse text-sm text-neutral-500">{t(PHASE_LABEL[phase])}</span>
          ) : null}
        </div>

        {message ? <p className={`mt-2 text-sm ${phase === "error" ? "text-red-700" : "text-neutral-600"}`}>{message}</p> : null}
        {warnings.map((w, i) => (
          <p key={i} className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
            ⚠ {w}
          </p>
        ))}
      </div>

      {intake ? (
        <>
          <div className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-900">
            ✓{" "}
            {t(
              L(
                `อ่าน ${intake.fileName} แล้วพบข้อกำหนด ${intake.requirements.length} ข้อ (เกี่ยวข้องกับ infrastructure ${infraCount} ข้อ) และแปลงเป็นแบบเรียบร้อย — ตรวจเหตุผลด้านล่าง แล้วปรับค่าใดก็ได้ในฟอร์ม`,
                `Read ${intake.fileName}: ${intake.requirements.length} requirements found (${infraCount} infrastructure-relevant) and turned into a design — review the reasoning below, then adjust anything in the form.`,
              ),
            )}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-neutral-700">{t(L("เหตุผลของแบบที่เสนอ (ตรวจสอบย้อนกลับไปยัง TOR ได้ทุกข้อ)", "Why this design — every decision traced back to the TOR"))}</h3>
            <div className="mt-3 space-y-2">
              {intake.decisions.map((d, i) => (
                <div key={i} className="flex gap-3 rounded-lg border border-neutral-100 bg-neutral-50/60 p-2.5">
                  <span
                    className={`mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      d.source === "tor" ? "bg-[#C74634]/10 text-[#C74634]" : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {d.source === "tor" ? t(L("ตาม TOR", "from TOR")) : t(L("best practice", "best practice"))}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-neutral-800">
                      <span className="font-mono text-neutral-500">{d.field}</span> = {d.value}
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-600">{t(d.reason)}</p>
                    {d.clauses.length ? (
                      <p className="mt-0.5 text-[11px] text-neutral-400">
                        {t(L("อ้างอิง", "source"))}: {d.clauses.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {intake.unmapped.length > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-900">
                {t(
                  L(
                    `${intake.unmapped.length} ข้อที่มีตัวเลขแต่แปลงเป็น sizing อัตโนมัติไม่ได้ — ต้องกรอกเอง`,
                    `${intake.unmapped.length} quantified clause(s) could not be auto-sized — set these by hand`,
                  ),
                )}
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {intake.unmapped.map((r) => (
                  <li key={r.id}>
                    <span className="text-xs text-amber-700">{r.clause || r.id}</span> — {r.text}
                    {r.metric ? (
                      <span className="ml-1 font-mono text-xs">
                        ({r.metric.name} {r.metric.op} {r.metric.value} {r.metric.unit})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
