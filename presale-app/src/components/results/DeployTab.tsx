"use client";

import { useState } from "react";
import type { GenerateResult } from "@/lib/domain/types";
import { L, useLang } from "@/lib/i18n";

// Deploy tab — the runbook for taking the LaC ZIP to a real tenancy via the
// OCI Landing Zones Orchestrator (v2.1.3). The ZIP already contains the
// executable version of everything shown here (deploy/deploy.sh|.ps1 +
// DEPLOY.md + orm-stack.md).

const PRE = "overflow-x-auto rounded-xl border border-neutral-200 bg-neutral-900 p-3 text-xs leading-5 text-neutral-100";

function Cmd({ title, cmd }: { title: string; cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-600">{title}</span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded px-2 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100"
        >
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <pre className={PRE}>{cmd}</pre>
    </div>
  );
}

export function DeployTab({ result }: { result: GenerateResult }) {
  const { t } = useLang();
  const names = result.lac.files.map((f) => f.path);
  const staged = names.some((n) => n.includes("_pre"));
  const hub = result.spec.hub.kind;
  const deployMd = result.lac.files.find((f) => f.path === "deploy/DEPLOY.md")?.content;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800">
        {t(
          L(
            "แพ็กเกจนี้ deploy ได้ทันที — ดาวน์โหลด ZIP จากแท็บ LaC code แล้วทำตามขั้นตอนด้านล่าง (สคริปต์ทั้งหมดอยู่ในโฟลเดอร์ deploy/ ของ ZIP แล้ว)",
            "This package is deploy-ready — download the ZIP from the LaC tab and follow the steps below (all scripts are already in the ZIP's deploy/ folder)",
          ),
        )}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700">
          {t(L("Option A — Terraform ในเครื่อง (ผ่าน OCI LZ Orchestrator v2.1.3)", "Option A — local Terraform (via the OCI LZ Orchestrator v2.1.3)"))}
        </h3>
        <Cmd
          title={t(L("1) เตรียม credentials + init (clone orchestrator + terraform init)", "1) prepare credentials + init (clones the orchestrator + terraform init)"))}
          cmd={`cd <unzipped-package>\ncp deploy/oci-credentials.tfvars.json.template oci-credentials.tfvars.json\n#   fill in tenancy_ocid / user_ocid / fingerprint / private_key_path / region\nbash deploy/deploy.sh init`}
        />
        <Cmd title={t(L("2) ตรวจ plan ก่อนแตะ tenancy จริง", "2) review the plan before touching the tenancy"))} cmd={`bash deploy/deploy.sh plan`} />
        {staged ? (
          <>
            <Cmd title={t(L("3) Stage 1 — apply ไฟล์ *_pre + iam/governance", "3) Stage 1 — apply the *_pre files + iam/governance"))} cmd={`bash deploy/deploy.sh stage1`} />
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              {hub === "hub_c"
                ? t(L("ระหว่างขั้น: ลงทะเบียน backend ของ 3rd-party firewall (network_backends.json) ก่อน Stage 2", "Between stages: register the third-party firewall backends (network_backends.json) before Stage 2"))
                : t(
                    L(
                      `ระหว่างขั้น: คัดลอก private-IP OCID ของ Network Firewall${hub === "hub_a" ? " ทั้ง 2 ตัว (DMZ + Internal)" : ""} ที่สร้างใน Stage 1 ไปแทน placeholder "OCI NFW PRIVATE IP OCID..." ใน generated/network.json`,
                      `Between stages: copy the private-IP OCID of the ${hub === "hub_a" ? "TWO Network Firewalls (DMZ + Internal)" : "Network Firewall"} created in Stage 1 over the "OCI NFW PRIVATE IP OCID..." placeholders in generated/network.json`,
                    ),
                  )}
            </div>
            <Cmd title={t(L("4) Stage 2 — apply ไฟล์จบ (state เดิม)", "4) Stage 2 — apply the final files (same state)"))} cmd={`bash deploy/deploy.sh stage2`} />
          </>
        ) : (
          <Cmd title={t(L("3) Apply (แพ็กเกจนี้รันรอบเดียว ไม่มีไฟล์ *_pre)", "3) Apply (single-run package — no *_pre files)"))} cmd={`bash deploy/deploy.sh apply`} />
        )}
        <p className="text-xs text-neutral-500">
          {t(L("บน Windows ใช้ deploy\\deploy.ps1 ด้วยคำสั่งเดียวกัน (init / plan / " + (staged ? "stage1 / stage2" : "apply") + ")", "On Windows use deploy\\deploy.ps1 with the same flow (init / plan / " + (staged ? "stage1 / stage2" : "apply") + ")"))}
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700">{t(L("Option B — OCI Resource Manager", "Option B — OCI Resource Manager"))}</h3>
        <p className="text-sm text-neutral-600">
          {t(
            L(
              "สร้าง stack จาก orchestrator release zip (working directory rms-facade, Terraform 1.5.x) แล้วชี้ generated/*.json ผ่านตัวแปร input_config_files_urls (private bucket แนะนำ) — คำสั่ง OCI CLI ครบอยู่ใน deploy/orm-stack.md",
              "Create the stack from the orchestrator release zip (working directory rms-facade, Terraform 1.5.x) and reference generated/*.json via input_config_files_urls (private bucket recommended) — full OCI CLI commands are in deploy/orm-stack.md",
            ),
          )}
        </p>
      </section>

      {deployMd ? (
        <details className="rounded-xl border border-neutral-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-700">DEPLOY.md ({t(L("ฉบับเต็มใน ZIP", "full copy from the ZIP"))})</summary>
          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5 text-neutral-700">{deployMd}</pre>
        </details>
      ) : null}
    </div>
  );
}
