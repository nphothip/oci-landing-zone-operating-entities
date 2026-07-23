"use client";

import { useState } from "react";
import type { GenerateResult } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { BomTable } from "./BomTable";
import { DiagramsTab } from "./DiagramsTab";
import { LacTab } from "./LacTab";
import { DesignDocTab } from "./DesignDocTab";
import { DeployTab } from "./DeployTab";
import { L, useLang } from "@/lib/i18n";

type Tab = "summary" | "bom" | "diagrams" | "doc" | "lac" | "deploy";

export function ResultView({ result }: { result: GenerateResult }) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("summary");
  const template = TEMPLATES[result.spec.template];
  const baseName = `oci-${result.spec.template}-${result.spec.region.shortName}`;

  const tabs: { id: Tab; label: { th: string; en: string } }[] = [
    { id: "summary", label: L("สรุป", "Summary") },
    { id: "bom", label: L("BOM & ราคา", "BOM & Pricing") },
    { id: "diagrams", label: L("Diagram (5 views)", "Diagrams (5 views)") },
    { id: "doc", label: L("เอกสารออกแบบ", "Design Doc") },
    { id: "lac", label: L("LaC code", "LaC code") },
    { id: "deploy", label: L("Deploy", "Deploy") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-neutral-200">
        {tabs.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`-mb-px rounded-t-lg px-4 py-2 text-sm ${tab === x.id ? "border border-b-white border-neutral-200 bg-white font-semibold text-[#C74634]" : "text-neutral-600 hover:text-neutral-900"}`}
          >
            {t(x.label)}
          </button>
        ))}
      </div>

      {result.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {result.warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      ) : null}

      {tab === "summary" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title={t(L("โซลูชัน", "Solution"))} value={`${template.icon} ${t(template.name)}`} />
            <SummaryCard
              title={t(L("ราคาต่อเดือน (list price)", "Monthly (list price)"))}
              value={result.bom.totals.monthlyThb.toLocaleString("th-TH", { style: "currency", currency: "THB" })}
              accent
            />
            <SummaryCard title="Landing Zone" value={`${result.spec.hub.kind.replace("_", " ").toUpperCase()} · CIS L${result.spec.cisLevel}`} />
            <SummaryCard title="Region" value={`${result.spec.region.id}`} />
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-700">{t(L("สมมติฐานและขอบเขต", "Assumptions & scope"))}</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-neutral-700">
              {result.assumptions.map((a, i) => (
                <li key={i}>{t(a)}</li>
              ))}
              {result.spec.assumptionNotes.map((a, i) => (
                <li key={`n${i}`} className="text-neutral-500">
                  {a} <span className="text-[10px]">(AI)</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {tab === "bom" ? <BomTable result={result} /> : null}
      {tab === "diagrams" ? <DiagramsTab diagrams={result.diagrams} baseName={baseName} /> : null}
      {tab === "doc" ? <DesignDocTab result={result} /> : null}
      {tab === "lac" ? <LacTab files={result.lac.files} diagrams={result.diagrams} baseName={baseName} /> : null}
      {tab === "deploy" ? <DeployTab result={result} /> : null}
    </div>
  );
}

function SummaryCard({ title, value, accent }: { title: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{title}</div>
      <div className={`mt-1 text-lg font-bold ${accent ? "text-[#C74634]" : ""}`}>{value}</div>
    </div>
  );
}
