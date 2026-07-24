"use client";

import { useMemo, useRef, useState } from "react";
import type { GenerateResult } from "@/lib/domain/types";
import { L, useLang } from "@/lib/i18n";
import { downloadBlob } from "@/lib/diagrams/export";
import { workbookToXlsx } from "@/lib/export/xlsx";
import { buildComplianceWorkbook } from "@/lib/export/compliance-xlsx";
import { matchRequirements } from "@/lib/tor/match";
import type { ComplianceRow, ComplianceStatus, TorAnalysis, TorRequirement } from "@/lib/tor/types";

// TOR compliance workspace: upload the customer's ข้อกำหนดขอบเขตงาน, let the
// model split it into atomic requirements, match them deterministically against
// the design + BOM already generated, then let a human correct every row before
// it becomes a submitted document.

const STATUS_META: Record<ComplianceStatus, { label: { th: string; en: string }; cls: string }> = {
  pass: { label: L("ผ่าน", "Pass"), cls: "bg-green-100 text-green-800 border-green-300" },
  partial: { label: L("ผ่านบางส่วน", "Partial"), cls: "bg-amber-100 text-amber-800 border-amber-300" },
  fail: { label: L("ไม่ผ่าน", "Fail"), cls: "bg-red-100 text-red-800 border-red-300" },
  manual: { label: L("ต้องตรวจสอบ", "Needs review"), cls: "bg-blue-100 text-blue-800 border-blue-300" },
};

const CATEGORY_LABEL: Record<string, { th: string; en: string }> = {
  compute: L("ประมวลผล", "Compute"),
  storage: L("จัดเก็บข้อมูล", "Storage"),
  network: L("เครือข่าย", "Network"),
  security: L("ความปลอดภัย", "Security"),
  database: L("ฐานข้อมูล", "Database"),
  availability: L("ความพร้อมใช้งาน", "Availability"),
  backup_dr: L("สำรอง/กู้คืน", "Backup/DR"),
  operations: L("ปฏิบัติการ", "Operations"),
  compliance: L("มาตรฐาน/กฎระเบียบ", "Compliance"),
  commercial: L("เชิงพาณิชย์", "Commercial"),
  other: L("อื่น ๆ", "Other"),
};

const STATUS_ORDER: Record<ComplianceStatus, number> = { fail: 0, partial: 1, manual: 2, pass: 3 };

type Phase = "idle" | "reading" | "done" | "error";

export function TorTab({ result }: { result: GenerateResult }) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [nonInfra, setNonInfra] = useState<TorRequirement[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [filter, setFilter] = useState<ComplianceStatus | "all">("all");
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const summary = useMemo(() => {
    const s = { pass: 0, partial: 0, fail: 0, manual: 0 };
    for (const r of rows) s[r.status] += 1;
    return s;
  }, [rows]);

  const visible = useMemo(
    () => [...rows].filter((r) => filter === "all" || r.status === filter).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
    [rows, filter],
  );

  const analysis = (): TorAnalysis => ({
    fileName,
    totalRequirements: totalFound,
    infraRequirements: rows.length,
    rows,
    summary,
    nonInfra,
    warnings,
  });

  async function upload(file: File) {
    setPhase("reading");
    setMessage(t(L(`กำลังอ่าน ${file.name} …`, `Reading ${file.name} …`)));
    setRows([]);
    setNonInfra([]);
    setReviewed(new Set());
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
        setMessage(t(L(`ยังไม่ได้ตั้งค่า AI: ${data.reason ?? ""}`, `AI not configured: ${data.reason ?? ""}`)));
        return;
      }
      if (data.status !== "ok" || !data.requirements) {
        setPhase("error");
        setMessage(data.message ?? t(L("วิเคราะห์เอกสารไม่สำเร็จ", "Analysis failed")));
        setWarnings(data.warnings ?? []);
        return;
      }
      const all = data.requirements;
      const infra = all.filter((r) => r.infraRelevant);
      setFileName(data.fileName ?? file.name);
      setTotalFound(all.length);
      setNonInfra(all.filter((r) => !r.infraRelevant));
      setRows(matchRequirements(infra, result));
      setWarnings(data.warnings ?? []);
      setPhase("done");
      setMessage("");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const patch = (id: string, next: Partial<ComplianceRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const download = async () => {
    const blob = await workbookToXlsx(buildComplianceWorkbook(analysis(), result));
    const base = fileName.replace(/\.[^.]+$/, "") || "tor";
    downloadBlob(blob, `${base}-compliance-matrix.xlsx`);
  };

  const unreviewed = rows.filter((r) => r.status === "manual" && !reviewed.has(r.id)).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-800">{t(L("วิเคราะห์ TOR → ตารางเปรียบเทียบข้อกำหนด", "TOR analysis → compliance matrix"))}</h3>
        <p className="mt-1 text-sm text-neutral-600">
          {t(
            L(
              "อัปโหลด TOR (.docx แม่นยำที่สุด, รองรับ .pdf/.txt) ระบบจะแยกข้อกำหนดออกเป็นข้อ ๆ แล้วเทียบกับแบบและ BOM ที่สร้างไว้ — ผลผ่าน/ไม่ผ่านคำนวณจากข้อมูลจริงของเรา ไม่ใช่การเดาของ AI",
              "Upload the TOR (.docx is most accurate; .pdf/.txt supported). Requirements are split into atomic clauses and matched against the generated design + BOM — every verdict is computed from our own data, not guessed by the AI.",
            ),
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
          <button
            onClick={() => inputRef.current?.click()}
            disabled={phase === "reading"}
            className="rounded-lg bg-[#C74634] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {phase === "reading" ? t(L("กำลังวิเคราะห์…", "Analysing…")) : t(L("อัปโหลด TOR", "Upload TOR"))}
          </button>
          {rows.length > 0 ? (
            <button onClick={download} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50">
              {t(L("ดาวน์โหลด Excel (Compliance Matrix)", "Download Excel (compliance matrix)"))}
            </button>
          ) : null}
          {fileName ? <span className="text-xs text-neutral-500">{fileName}</span> : null}
        </div>
        {message ? (
          <p className={`mt-2 text-sm ${phase === "error" ? "text-red-700" : "text-neutral-600"}`}>{message}</p>
        ) : null}
        {warnings.map((w, i) => (
          <p key={i} className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
            ⚠ {w}
          </p>
        ))}
      </div>

      {rows.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Chip label={t(L("ข้อกำหนดทั้งหมด", "Requirements found"))} value={`${totalFound}`} sub={t(L(`เกี่ยวข้องกับ infra ${rows.length}`, `${rows.length} infra-relevant`))} />
            {(["pass", "partial", "fail", "manual"] as const).map((s) => (
              <button key={s} onClick={() => setFilter(filter === s ? "all" : s)} className="text-left">
                <Chip label={t(STATUS_META[s].label)} value={`${summary[s]}`} active={filter === s} tone={s} />
              </button>
            ))}
          </div>

          {unreviewed > 0 ? (
            <div className="rounded-xl border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
              {t(
                L(
                  `มี ${unreviewed} ข้อที่ระบบพิสูจน์เองไม่ได้ — ต้องให้ผู้เชี่ยวชาญกรอกคำตอบและติ๊กว่าตรวจแล้วก่อนส่งเอกสารจริง`,
                  `${unreviewed} clause(s) could not be proven automatically — an engineer must fill in the answer and tick "reviewed" before this is submitted.`,
                ),
              )}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-2">{t(L("ข้อ", "Clause"))}</th>
                  <th className="px-3 py-2">{t(L("ข้อกำหนดตาม TOR", "TOR requirement"))}</th>
                  <th className="px-3 py-2">{t(L("ผล", "Verdict"))}</th>
                  <th className="px-3 py-2">{t(L("สิ่งที่เสนอ", "What we offer"))}</th>
                  <th className="px-3 py-2">{t(L("หลักฐาน", "Evidence"))}</th>
                  <th className="px-3 py-2">{t(L("ตรวจแล้ว", "Reviewed"))}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 align-top">
                {visible.map((r) => (
                  <tr key={r.id} className={r.status === "manual" && !reviewed.has(r.id) ? "bg-blue-50/40" : ""}>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-neutral-500">
                      <div className="font-mono">{r.id}</div>
                      <div>{r.clause}</div>
                      {r.page != null ? <div className="text-[10px]">{t(L("หน้า", "p."))} {r.page}</div> : null}
                      <div className="mt-1 text-[10px] text-neutral-400">{t(CATEGORY_LABEL[r.category] ?? L(r.category, r.category))}</div>
                    </td>
                    <td className="max-w-[26rem] px-3 py-2 text-neutral-800">
                      {r.text}
                      {r.metric ? (
                        <div className="mt-1 text-xs text-neutral-500">
                          {r.metric.name} {r.metric.op} {r.metric.value} {r.metric.unit}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.status}
                        onChange={(e) => patch(r.id, { status: e.target.value as ComplianceStatus })}
                        className={`rounded-lg border px-2 py-1 text-xs font-semibold ${STATUS_META[r.status].cls}`}
                      >
                        {(["pass", "partial", "fail", "manual"] as const).map((s) => (
                          <option key={s} value={s}>
                            {t(STATUS_META[s].label)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="max-w-[22rem] px-3 py-2">
                      <textarea
                        value={r.offered}
                        onChange={(e) => patch(r.id, { offered: e.target.value })}
                        rows={Math.min(5, Math.max(2, Math.ceil(r.offered.length / 48)))}
                        placeholder={t(L("กรอกสิ่งที่เราเสนอสำหรับข้อนี้", "Describe what we offer for this clause"))}
                        className="w-full rounded-lg border border-neutral-200 p-1.5 text-xs"
                      />
                      {r.note ? <div className="mt-1 text-[11px] text-amber-700">{r.note}</div> : null}
                    </td>
                    <td className="max-w-[16rem] px-3 py-2 text-xs text-neutral-500">{r.evidence}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={reviewed.has(r.id)}
                        onChange={(e) =>
                          setReviewed((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            return next;
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {nonInfra.length > 0 ? (
            <details className="rounded-xl border border-neutral-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-700">
                {t(L(`ข้อกำหนดที่ไม่ใช่ขอบเขต infrastructure (${nonInfra.length} ข้อ)`, `Non-infrastructure clauses (${nonInfra.length})`))}
              </summary>
              <ul className="mt-2 space-y-1.5 text-sm text-neutral-600">
                {nonInfra.map((r) => (
                  <li key={r.id}>
                    <span className="text-xs text-neutral-400">{r.clause || r.id}</span> — {r.text}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Chip({ label, value, sub, active, tone }: { label: string; value: string; sub?: string; active?: boolean; tone?: ComplianceStatus }) {
  const tint = tone ? STATUS_META[tone].cls.replace("border-", "ring-") : "";
  return (
    <div className={`rounded-xl border bg-white p-3 ${active ? "border-[#C74634] ring-2 ring-[#C74634]/20" : "border-neutral-200"} ${tone ? tint.split(" ")[0] : ""}`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
      {sub ? <div className="text-[11px] text-neutral-400">{sub}</div> : null}
    </div>
  );
}
