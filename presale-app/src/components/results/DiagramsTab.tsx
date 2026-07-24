"use client";

import { useRef, useState } from "react";
import type { DiagramDoc, ViewId } from "@/lib/domain/types";
import { DiagramCanvas } from "@/components/diagrams/DiagramCanvas";
import { toDrawio } from "@/lib/diagrams/drawio";
import { downloadBlob, downloadPng, downloadSvg } from "@/lib/diagrams/export";
import { L, useLang } from "@/lib/i18n";

const VIEW_LABEL: Record<ViewId, { th: string; en: string }> = {
  functional: L("Functional", "Functional"),
  security: L("Security", "Security"),
  network: L("Network", "Network"),
  operations: L("Operations", "Operations"),
  runtime: L("Runtime", "Runtime"),
  governance: L("Compartments", "Compartments"),
  identity: L("Identity", "Identity"),
  logging: L("Logging", "Logging"),
  backup: L("Backup", "Backup"),
  traffic: L("Traffic flow", "Traffic flow"),
  resilience: L("Resilience/HA", "Resilience/HA"),
  ipplan: L("IP plan", "IP plan"),
  iam: L("IAM matrix", "IAM matrix"),
};

export function DiagramsTab({ diagrams, baseName }: { diagrams: DiagramDoc[]; baseName: string }) {
  const { t } = useLang();
  const [active, setActive] = useState<ViewId>("network");
  const svgRef = useRef<SVGSVGElement>(null);
  const doc = diagrams.find((d) => d.view === active) ?? diagrams[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {diagrams.map((d) => (
            <button
              key={d.view}
              onClick={() => setActive(d.view)}
              className={`rounded-lg px-3 py-1.5 text-sm ${d.view === active ? "bg-[#C74634] font-medium text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
            >
              {t(VIEW_LABEL[d.view])}
            </button>
          ))}
        </div>
        <div className="flex gap-2 text-sm">
          <button className="rounded-lg border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100" onClick={() => svgRef.current && downloadSvg(svgRef.current, `${baseName}-${active}.svg`)}>
            SVG
          </button>
          <button className="rounded-lg border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100" onClick={() => svgRef.current && void downloadPng(svgRef.current, `${baseName}-${active}.png`)}>
            PNG
          </button>
          <button
            className="rounded-lg border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100"
            onClick={() => downloadBlob(new Blob([toDrawio(diagrams)], { type: "application/xml" }), `${baseName}-diagrams.drawio`)}
            title={t(L("ไฟล์เดียว 13 หน้า เปิดแก้ต่อใน draw.io ได้", "One file, 13 pages — edit in draw.io"))}
          >
            draw.io
          </button>
        </div>
      </div>
      <div className="overflow-auto rounded-xl border border-neutral-200 bg-white p-3">
        {doc ? <DiagramCanvas ref={svgRef} doc={doc} /> : null}
      </div>
      {doc ? <p className="text-xs text-neutral-500">{t(doc.title)}</p> : null}
    </div>
  );
}
