"use client";

import { useState } from "react";
import JSZip from "jszip";
import type { DiagramDoc, LacFile } from "@/lib/domain/types";
import { toDrawio } from "@/lib/diagrams/drawio";
import { downloadBlob } from "@/lib/diagrams/export";
import { L, useLang } from "@/lib/i18n";

export function LacTab({ files, diagrams, baseName }: { files: LacFile[]; diagrams: DiagramDoc[]; baseName: string }) {
  const { t } = useLang();
  const [selected, setSelected] = useState<string>(files[0]?.path ?? "");
  const current = files.find((f) => f.path === selected);

  const downloadZip = async () => {
    const zip = new JSZip();
    for (const f of files) zip.file(f.path, f.content);
    zip.file("diagrams/diagrams.drawio", toDrawio(diagrams));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `${baseName}-lac.zip`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">
          {t(
            L(
              "แพ็กเกจ LaC พร้อม deploy ผ่าน OCI Landing Zones Orchestrator (อ่านลำดับใน README.md)",
              "LaC package, deployable via the OCI Landing Zones Orchestrator (see README.md for the order)",
            ),
          )}
        </p>
        <button onClick={() => void downloadZip()} className="rounded-lg bg-[#C74634] px-4 py-2 text-sm font-semibold text-white shadow">
          {t(L("ดาวน์โหลด ZIP", "Download ZIP"))}
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-[240px_1fr]">
        <div className="rounded-xl border border-neutral-200 bg-white p-2">
          {files.map((f) => (
            <button
              key={f.path}
              onClick={() => setSelected(f.path)}
              className={`block w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-xs ${f.path === selected ? "bg-red-50 font-semibold text-[#C74634]" : "text-neutral-700 hover:bg-neutral-100"}`}
            >
              {f.path}
            </button>
          ))}
          <div className="mt-1 block w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-xs text-neutral-400">
            diagrams/diagrams.drawio
          </div>
        </div>
        <pre className="max-h-[480px] overflow-auto rounded-xl border border-neutral-200 bg-neutral-900 p-3 text-xs leading-5 text-neutral-100">
          {current?.content ?? ""}
        </pre>
      </div>
    </div>
  );
}
