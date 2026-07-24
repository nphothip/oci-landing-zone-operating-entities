"use client";

import { useMemo, useRef, useState } from "react";
import type { DiagramDoc, GenerateResult, ViewId } from "@/lib/domain/types";
import { DiagramCanvas } from "@/components/diagrams/DiagramCanvas";
import { buildDesignDocument } from "@/lib/design/document";
import { buildDesignFacts } from "@/lib/design/facts";
import { renderDesignHtml, type DesignHtmlInput } from "@/lib/design/html";
import { buildDocx, type DocxImage } from "@/lib/design/docx";
import { downloadBlob, svgElementToString, svgToPngBytes } from "@/lib/diagrams/export";
import { L, useLang } from "@/lib/i18n";

type NarrativeByLang = Record<string, Record<string, string[]>>; // lang -> sectionId -> paragraphs

const money = (n: number) => n.toLocaleString("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 });

export function DesignDocTab({ result }: { result: GenerateResult }) {
  const { t, lang } = useLang();
  const doc = useMemo(() => buildDesignDocument(result), [result]);
  const diagramByView = useMemo(() => {
    const m = new Map<ViewId, DiagramDoc>();
    for (const d of result.diagrams) m.set(d.view, d);
    return m;
  }, [result.diagrams]);

  const svgRefs = useRef<Partial<Record<ViewId, SVGSVGElement | null>>>({});
  const [ai, setAi] = useState<NarrativeByLang>({});
  const [aiState, setAiState] = useState<"idle" | "loading" | "unavailable" | "error">("idle");
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  const aiForLang = ai[lang];

  const resolveParagraphs = (sectionId: string, deterministic: string[]): string[] =>
    aiForLang?.[sectionId] ?? deterministic;

  const enhanceWithAi = async () => {
    setAiState("loading");
    setAiMsg(null);
    try {
      const facts = buildDesignFacts(result);
      const res = await fetch("/api/narrative", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec: result.spec, facts, lang }),
      });
      const data = (await res.json()) as { status: string; narrative?: Record<string, string[]>; reason?: string; message?: string };
      if (data.status === "ok" && data.narrative) {
        setAi((prev) => ({ ...prev, [lang]: data.narrative! }));
        setAiState("idle");
      } else if (data.status === "llm_unavailable") {
        setAiState("unavailable");
        setAiMsg(data.reason ?? null);
      } else {
        setAiState("error");
        setAiMsg(data.message ?? "error");
      }
    } catch (e) {
      setAiState("error");
      setAiMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const buildHtmlInput = (): DesignHtmlInput => {
    const bomRows = result.bom.items.map((i) => ({
      category: t({ th: catTh(i.category), en: catEn(i.category) }),
      label: t(i.label),
      env: i.env ?? "shared",
      scope: i.deployedByLz ? "Landing Zone" : t(L("หลัง LZ", "post-LZ")),
      qty: `${i.quantity.toLocaleString()} ${i.unit}`,
      monthly: i.monthlyThb === null ? "—" : money(i.monthlyThb),
    }));
    const assumptions = [...result.assumptions.map((a) => t(a)), ...result.spec.assumptionNotes.map((n) => `${n} (AI)`)];
    return {
      title: t(doc.title),
      subtitle: t(doc.subtitle),
      meta: doc.meta.map((m) => ({ label: t(m.label), value: m.value })),
      sections: doc.sections.map((s) => ({
        id: s.id,
        heading: t(s.heading),
        paragraphs: resolveParagraphs(s.id, s.paragraphs.map((p) => t(p))),
        svg: s.view && svgRefs.current[s.view] ? svgElementToString(svgRefs.current[s.view]!) : undefined,
        kind: s.kind,
      })),
      bom: { rows: bomRows, total: money(result.bom.totals.monthlyThb), source: result.bom.priceSource },
      assumptions,
      deploymentFiles: doc.facts.lacFileNames,
      footer: t(L("เครื่องมือภายในสำหรับทีม presale — ตัวเลขเป็น list price ไม่ใช่ใบเสนอราคาอย่างเป็นทางการ", "Internal presale tool — figures are list prices, not an official quote")),
      generatedAt: new Date().toISOString().slice(0, 10),
    };
  };

  const baseName = `oci-${result.spec.template}-${result.spec.region.shortName}-design`;

  const downloadHtml = () => {
    const html = renderDesignHtml(buildHtmlInput());
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${baseName}.html`);
  };

  const printDoc = () => {
    const html = renderDesignHtml(buildHtmlInput());
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const [docxBusy, setDocxBusy] = useState(false);
  const downloadWord = async () => {
    setDocxBusy(true);
    try {
      const images: Record<string, DocxImage> = {};
      for (const s of doc.sections) {
        if (s.view && svgRefs.current[s.view]) {
          try {
            const png = await svgToPngBytes(svgRefs.current[s.view]!, 2);
            images[s.view] = { png: png.bytes, width: png.width, height: png.height };
          } catch {
            // skip a diagram that fails to rasterize
          }
        }
      }
      const catLabel = (c: string) => t({ th: CAT_TH[c] ?? c, en: CAT_TH[c] ?? c });
      const bomRows = result.bom.items.map((i) => [
        catLabel(i.category),
        t(i.label),
        i.env ?? "shared",
        i.deployedByLz ? "Landing Zone" : t(L("หลัง LZ", "post-LZ")),
        `${i.quantity.toLocaleString()} ${i.unit}`,
        i.monthlyThb === null ? "—" : money(i.monthlyThb),
      ]);
      const blob = await buildDocx({
        title: t(doc.title),
        subtitle: t(doc.subtitle),
        meta: doc.meta.map((m) => ({ label: t(m.label), value: m.value })),
        sections: doc.sections.map((s) => ({
          heading: t(s.heading),
          paragraphs: resolveParagraphs(s.id, s.paragraphs.map((p) => t(p))),
          imageView: s.view,
          kind: s.kind,
        })),
        bom: {
          headers: ["Category", "Item", "Env", "Scope", "Qty", "Monthly (THB)"],
          rows: bomRows,
          total: money(result.bom.totals.monthlyThb),
        },
        assumptions: [...result.assumptions.map((a) => t(a)), ...result.spec.assumptionNotes.map((n) => `${n} (AI)`)],
        deploymentFiles: doc.facts.lacFileNames,
        images,
        footer: t(L("เครื่องมือภายในสำหรับทีม presale — ตัวเลขเป็น list price ไม่ใช่ใบเสนอราคาอย่างเป็นทางการ", "Internal presale tool — figures are list prices, not an official quote")),
      });
      downloadBlob(blob, `${baseName}.docx`);
    } finally {
      setDocxBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">
          {t(L("เอกสารออกแบบ landing zone + cloud design พร้อม diagram จริงทั้ง 13 views", "Landing zone + cloud design document with all thirteen real diagram views"))}
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            onClick={() => void enhanceWithAi()}
            disabled={aiState === "loading"}
            className="rounded-lg border border-blue-700 px-3 py-1.5 font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-50"
          >
            {aiState === "loading" ? t(L("AI กำลังเขียน…", "AI writing…")) : aiForLang ? t(L("✓ ปรับปรุงด้วย AI แล้ว — เขียนใหม่", "✓ AI-enhanced — rewrite")) : t(L("✨ ปรับปรุงเนื้อหาด้วย AI", "✨ Enhance with AI"))}
          </button>
          <button onClick={printDoc} className="rounded-lg border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100">
            {t(L("พิมพ์ / PDF", "Print / PDF"))}
          </button>
          <button
            onClick={() => void downloadWord()}
            disabled={docxBusy}
            className="rounded-lg border border-blue-800 px-3 py-1.5 font-medium text-blue-900 hover:bg-blue-50 disabled:opacity-50"
          >
            {docxBusy ? t(L("กำลังสร้าง…", "Building…")) : t(L("ดาวน์โหลด Word", "Download Word"))}
          </button>
          <button onClick={downloadHtml} className="rounded-lg bg-[#C74634] px-4 py-1.5 font-semibold text-white shadow">
            {t(L("ดาวน์โหลด HTML", "Download HTML"))}
          </button>
        </div>
      </div>

      {aiState === "unavailable" ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {t(L("โหมด AI ยังไม่พร้อม — ตั้งค่า GEMINI_API_KEY หรือ OPENAI_API_KEY เพื่อให้ AI ช่วยเขียนเนื้อหา (ระหว่างนี้ใช้เนื้อหาอัตโนมัติได้ปกติ)", "AI mode is not configured — set GEMINI_API_KEY or OPENAI_API_KEY to let AI write the prose (the auto-generated prose works meanwhile)"))}
          {aiMsg ? <span className="block text-xs text-amber-700">({aiMsg})</span> : null}
        </div>
      ) : null}
      {aiState === "error" ? <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{aiMsg}</div> : null}

      {/* preview */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <h1 className="text-xl font-bold">{t(doc.title)}</h1>
          <p className="text-sm text-neutral-500">{t(doc.subtitle)}</p>
          <table className="mt-3 text-sm">
            <tbody>
              {doc.meta.map((m) => (
                <tr key={m.label.en}>
                  <td className="py-0.5 pr-4 font-medium text-neutral-500">{t(m.label)}</td>
                  <td className="py-0.5">{m.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {doc.sections.map((s) => (
          <section key={s.id} className="mt-6">
            <h2 className="border-b-2 border-[#C74634] pb-1 text-base font-semibold text-[#C74634]">{t(s.heading)}</h2>
            {resolveParagraphs(s.id, s.paragraphs.map((p) => t(p))).map((p, i) => (
              <p key={i} className="mt-2 text-sm leading-6 text-neutral-800">
                {p}
              </p>
            ))}
            {aiForLang?.[s.id] ? <p className="mt-1 text-[11px] italic text-neutral-400">{t(L("เนื้อหาโดย AI", "AI-written"))}</p> : null}
            {s.view && diagramByView.get(s.view) ? (
              <div className="mt-3 overflow-auto rounded-lg border border-neutral-200 p-2">
                <DiagramCanvas ref={(el) => { svgRefs.current[s.view!] = el; }} doc={diagramByView.get(s.view)!} />
              </div>
            ) : null}
            {s.kind === "bom" ? <DocBomTable result={result} /> : null}
            {s.kind === "assumptions" ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
                {result.assumptions.map((a, i) => (
                  <li key={i}>{t(a)}</li>
                ))}
              </ul>
            ) : null}
            {s.kind === "deployment" ? (
              <div className="mt-2 font-mono text-xs text-neutral-500">{doc.facts.lacFileNames.join(" · ")}</div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function DocBomTable({ result }: { result: GenerateResult }) {
  const { t } = useLang();
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="border-b-2 border-[#C74634] text-left text-neutral-500">
            <th className="px-2 py-1">Item</th>
            <th className="px-2 py-1">Env</th>
            <th className="px-2 py-1">Scope</th>
            <th className="px-2 py-1 text-right">Qty</th>
            <th className="px-2 py-1 text-right">Monthly (THB)</th>
          </tr>
        </thead>
        <tbody>
          {result.bom.items.map((i, idx) => (
            <tr key={idx} className="border-b border-neutral-100">
              <td className="px-2 py-1">{t(i.label)}</td>
              <td className="px-2 py-1">{i.env ?? "shared"}</td>
              <td className="px-2 py-1">{i.deployedByLz ? "Landing Zone" : t(L("หลัง LZ", "post-LZ"))}</td>
              <td className="px-2 py-1 text-right tabular-nums">{i.quantity.toLocaleString()} {i.unit}</td>
              <td className="px-2 py-1 text-right tabular-nums">{i.monthlyThb === null ? "—" : money(i.monthlyThb)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-neutral-300 font-bold">
            <td className="px-2 py-1" colSpan={4}>
              {t(L("รวมต่อเดือน", "Total per month"))}
            </td>
            <td className="px-2 py-1 text-right text-[#C74634]">{money(result.bom.totals.monthlyThb)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// category labels (kept local to avoid importing the BOM table component)
const CAT_TH: Record<string, string> = { landing_zone: "Landing Zone", compute: "Compute", database: "Database", network: "Network", storage: "Storage", ai: "AI Services", security: "Security", observability: "Observability" };
const catTh = (c: string) => CAT_TH[c] ?? c;
const catEn = (c: string) => CAT_TH[c] ?? c;
