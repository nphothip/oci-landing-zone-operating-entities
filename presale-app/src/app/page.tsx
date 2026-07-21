"use client";

import { useState } from "react";
import type { GenerateResult, SolutionSpec, TemplateId } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { TemplateGallery } from "@/components/wizard/TemplateGallery";
import { SizingForm } from "@/components/wizard/SizingForm";
import { FreeTextPanel } from "@/components/wizard/FreeTextPanel";
import { ResultView } from "@/components/results/ResultView";
import { L, LangProvider, useLang } from "@/lib/i18n";

type Mode = "template" | "freetext";

function Studio() {
  const { lang, setLang, t } = useLang();
  const [mode, setMode] = useState<Mode>("template");
  const [spec, setSpec] = useState<SolutionSpec | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const pickTemplate = (id: TemplateId) => {
    setSpec(TEMPLATES[id].defaults());
    setAiNote(null);
    setResult(null);
    setError(null);
  };

  const generate = async () => {
    if (!spec) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(spec),
      });
      const data = (await res.json()) as GenerateResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-[#C74634]">OCI</span> Presale Studio
          </h1>
          <p className="text-sm text-neutral-600">
            {t(L("BOM · ราคา/เดือน (THB) · Diagram 5 views · LaC code — ตามแนวทาง OCI Open Landing Zone", "BOM · monthly THB · 5-view diagrams · LaC code — per the OCI Open Landing Zone"))}
          </p>
        </div>
        <button
          onClick={() => setLang(lang === "th" ? "en" : "th")}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          {lang === "th" ? "EN" : "ไทย"}
        </button>
      </header>

      {/* mode switch */}
      <div className="mb-4 inline-flex rounded-xl border border-neutral-200 bg-white p-1">
        {(
          [
            { id: "template", label: L("เลือกจาก Template", "Pick a template") },
            { id: "freetext", label: L("พิมพ์อธิบาย (AI)", "Describe it (AI)") },
          ] as { id: Mode; label: { th: string; en: string } }[]
        ).map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-lg px-4 py-1.5 text-sm ${mode === m.id ? "bg-[#C74634] font-medium text-white" : "text-neutral-600"}`}
          >
            {t(m.label)}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {mode === "template" ? (
          <TemplateGallery selected={spec?.template ?? null} onSelect={pickTemplate} />
        ) : (
          <FreeTextPanel
            onSpec={(s, note) => {
              setSpec(s);
              setAiNote(note);
              setResult(null);
            }}
          />
        )}

        {aiNote && spec ? (
          <div className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800">✓ {aiNote}</div>
        ) : null}

        {spec ? (
          <>
            <SizingForm spec={spec} onChange={setSpec} />
            <div className="flex items-center gap-3">
              <button
                onClick={() => void generate()}
                disabled={busy}
                className="rounded-xl bg-[#C74634] px-6 py-2.5 font-semibold text-white shadow-md transition hover:bg-[#a93a2b] disabled:opacity-50"
              >
                {busy
                  ? t(L("กำลังสร้าง landing zone + BOM…", "Generating landing zone + BOM…"))
                  : t(L("สร้างผลลัพธ์ (BOM · ราคา · Diagram · LaC)", "Generate (BOM · pricing · diagrams · LaC)"))}
              </button>
              {busy ? <span className="animate-pulse text-sm text-neutral-500">{t(L("รัน Blueprint Factory จริงอยู่…", "Running the Blueprint Factory…"))}</span> : null}
            </div>
          </>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">{t(L("สร้างไม่สำเร็จ", "Generation failed"))}</p>
            <p className="mt-1 font-mono text-xs">{error}</p>
          </div>
        ) : null}

        {result ? <ResultView result={result} /> : null}
      </div>

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-400">
        {t(
          L(
            "เครื่องมือภายในสำหรับทีม presale — ตัวเลขเป็น list price ไม่ใช่ใบเสนอราคาอย่างเป็นทางการ; ตรวจสอบไฟล์ LaC ก่อน deploy ทุกครั้ง",
            "Internal presale tool — figures are list prices, not an official quote; review the LaC files before any deployment",
          ),
        )}
      </footer>
    </main>
  );
}

export default function Page() {
  return (
    <LangProvider>
      <Studio />
    </LangProvider>
  );
}
