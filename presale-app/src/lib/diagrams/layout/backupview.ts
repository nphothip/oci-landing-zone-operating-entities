import type { DiagramDoc, SolutionSpec, ViewId } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated } from "../generated-parse";

// Backup View — per-workload backup posture in the deployment-view language:
// sage workload sources on the left, cream backup-service tiles in the middle,
// and the shared-services Object Storage target (Standard → IA → Archive
// lifecycle) on the right, plus an RPO/RTO guidance card. Everything is
// derived defensively from spec.sizing (+ gen for flavour), so the view works
// for every template including enterprise_lz multi-project plans.

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

interface SourceRow {
  icon: string;
  label: string;
  sub: string;
  svcIcon: string;
  svcLabel: string;
  svcSub: string;
}

/** Derive backup sources + matching backup services from the sizing union. */
function deriveSources(spec: SolutionSpec): { rows: SourceRow[]; hasBaseDb: boolean; hasAdb: boolean } {
  const s = spec.sizing as unknown as Record<string, unknown>;
  const kind = spec.sizing.kind;

  let vmCount = 0;
  let adbCount = 0;
  let baseDbCount = 0;
  let fssGb = 0;
  let adbSub = "Autonomous Database";
  let baseSub = "Base Database (VM)";

  if (kind === "enterprise_lz" && spec.sizing.kind === "enterprise_lz") {
    for (const plan of Object.values(spec.sizing.plans ?? {})) {
      if (!plan) continue;
      for (const p of plan.projects ?? []) {
        vmCount += num(p.vmCount);
        if (p.dbEngine === "adb") adbCount += 1;
        if (p.dbEngine === "base_db") baseDbCount += 1;
      }
      if (plan.oke) vmCount += num(plan.okeWorkerCount);
    }
    fssGb = num(spec.sizing.fssGb);
    adbSub = `${adbCount} project ADB(s)`;
    baseSub = `${baseDbCount} project Base DB(s)`;
  } else {
    // SME templates — pull common field shapes defensively.
    vmCount =
      num(s.appVmCount) ||
      num(s.protectedVmCount) ||
      num(s.vmCount) ||
      num(s.vmPerEnv) ||
      num(s.workerCount) ||
      num(s.consumerVmCount) ||
      num(s.gatewayVmCount) ||
      num(s.okeWorkerCount) ||
      num(s.desktopCount);
    const db = (s.db && typeof s.db === "object" ? (s.db as Record<string, unknown>) : {}) as Record<string, unknown>;
    const engine = typeof db.engine === "string" ? db.engine : "";
    if (engine === "adb_serverless") adbCount = 1;
    if (engine === "base_db_vm") baseDbCount = 1;
    if (kind === "chatbot" && s.rag === true) { adbCount = 1; adbSub = "Vector ADB (RAG)"; }
    if (kind === "dr") {
      if (s.dbDr === "adb_cross_region") { adbCount = 1; adbSub = "ADB cross-region peer"; }
      if (s.dbDr === "base_db_data_guard") { baseDbCount = 1; baseSub = "Base DB — Data Guard standby"; }
    }
    if (kind === "analytics" || kind === "streaming") { if (num(s.adwEcpus) > 0) { adbCount = 1; adbSub = "Autonomous Data Warehouse"; } }
    if (kind === "serverless" && num(s.adbEcpus) > 0) adbCount = 1;
    if (kind === "ecommerce" && num(s.dbEcpus) > 0) adbCount = 1;
    if (kind === "devtest" && num(s.dbEcpusPerEnv) > 0) { adbCount = 1; adbSub = "ADB per environment"; }
    if (kind === "backup" && s.dbBackup === true) { baseDbCount = 1; baseSub = `DB backup set · ${num(s.dbBackupGb)} GB`; }
    fssGb = num(s.fssGb) || num(s.profileStorageGb);
  }

  const rows: SourceRow[] = [];
  if (vmCount > 0) {
    rows.push({
      icon: "compute",
      label: "Compute boot/data volumes",
      sub: `${vmCount} VM · Block Volume (boot + data)`,
      svcIcon: "gear",
      svcLabel: "Block Volume backup policy",
      svcSub: "daily incremental · weekly full",
    });
  }
  if (adbCount > 0) {
    rows.push({
      icon: "db",
      label: "Autonomous DB",
      sub: adbSub,
      svcIcon: "shield",
      svcLabel: "ADB automatic backup",
      svcSub: "built-in · 60-day retention",
    });
  }
  if (baseDbCount > 0) {
    rows.push({
      icon: "db",
      label: "Base Database",
      sub: baseSub,
      svcIcon: "gear",
      svcLabel: "RMAN managed backup",
      svcSub: "weekly full + daily incr → Object Storage",
    });
  }
  if (fssGb > 0) {
    rows.push({
      icon: "archive",
      label: "File Storage (FSS)",
      sub: `${fssGb} GB shared file system`,
      svcIcon: "gear",
      svcLabel: "FSS snapshots",
      svcSub: "policy-based snapshots · clone for restore",
    });
  }
  if (rows.length === 0) {
    // e.g. backup-target template with no OCI compute/DB — data arrives from outside.
    rows.push({
      icon: "onprem",
      label: "Backup data (on-prem / 3rd-party)",
      sub: "backup software · agent-based",
      svcIcon: "cloud",
      svcLabel: "Direct upload to Object Storage",
      svcSub: "S3-compatible / native PUT API",
    });
  }
  return { rows, hasBaseDb: baseDbCount > 0, hasAdb: adbCount > 0 };
}

export function layoutBackupView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: "Backup Posture View",
    sublabel: `per-workload backup flows → Object Storage lifecycle — ${spec.region.id}`,
    x: 24, y: 14, w: 700, h: 40, style: "canvasTitle",
  });

  const top = 64;
  const { rows, hasBaseDb, hasAdb } = deriveSources(spec);
  const isDr = spec.template === "dr";

  const tileH = 60;
  const rowGap = 14;
  const rowPitch = tileH + rowGap;
  const framePadTop = 34;
  const frameH = framePadTop + rows.length * rowPitch + 4;

  // ---- left: workload sources (sage, like environment compartments) -------
  const srcX = 24;
  const srcW = 300;
  d.add({
    id: "src-frame",
    kind: "compartment",
    label: "WORKLOAD SOURCES",
    x: srcX, y: top, w: srcW, h: frameH,
    style: "compartmentEnv",
  });

  // ---- middle: backup services (cream shared-services language) -----------
  const svcX = srcX + srcW + 56;
  const svcW = 330;
  d.add({
    id: "svc-frame",
    kind: "compartment",
    label: "BACKUP SERVICES",
    x: svcX, y: top, w: svcW, h: frameH,
    style: "compartmentShared",
  });

  rows.forEach((r, i) => {
    const y = top + framePadTop + i * rowPitch;
    d.add({
      id: `src${i}`, kind: "service", label: r.label, sublabel: r.sub, icon: r.icon,
      x: srcX + 16, y, w: srcW - 32, h: tileH, style: "resourceTile", parent: "src-frame",
    });
    d.add({
      id: `svc${i}`, kind: "service", label: r.svcLabel, sublabel: r.svcSub, icon: r.svcIcon,
      x: svcX + 16, y, w: svcW - 32, h: tileH, style: "resourceTile", parent: "svc-frame",
    });
    d.edge({ from: `src${i}`, to: `svc${i}`, kind: "flow" });
  });

  // ---- right: shared-services Object Storage target -----------------------
  const osX = svcX + svcW + 56;
  const osW = 330;
  const lifecycleRows = [
    { left: "Standard", right: "day 0–30 · fast restore" },
    { left: "Infrequent Access", right: "day 31+ · lower cost" },
    { left: "Archive", right: "long-term / compliance" },
  ];
  const lifeH = 22 + lifecycleRows.length * 16 + 8;
  const osContentH = framePadTop + tileH + 16 + lifeH + (isDr ? tileH + 14 : 0) + 12;
  const osFrameH = Math.max(frameH, osContentH);
  d.add({
    id: "os-frame",
    kind: "compartment",
    label: "cmp-lz-shared-services — BACKUP TARGET",
    x: osX, y: top, w: osW, h: osFrameH,
    style: "compartmentShared",
  });
  d.add({
    id: "os",
    kind: "service",
    label: "Object Storage",
    sublabel: gen.serviceConnector ? "backup bucket · + LZ log archive bucket" : "backup bucket · versioned",
    icon: "archive",
    x: osX + 16, y: top + framePadTop, w: osW - 32, h: tileH,
    style: "resourceTile", parent: "os-frame",
  });
  d.add({
    id: "lifecycle",
    kind: "routeCard",
    label: "LIFECYCLE POLICY — STANDARD → IA → ARCHIVE",
    x: osX + 16, y: top + framePadTop + tileH + 16, w: osW - 32, h: lifeH,
    style: "stackCard",
    rows: lifecycleRows,
    parent: "os-frame",
  });
  d.edge({ from: "os", to: "lifecycle", kind: "leader", dashed: true, label: "«tiering»" });
  rows.forEach((_, i) => d.edge({ from: `svc${i}`, to: "os", kind: "flow" }));

  if (isDr) {
    d.add({
      id: "xregion",
      kind: "service",
      label: "Cross-region copy (DR)",
      sublabel: "bucket replication → standby region",
      icon: "cloud",
      x: osX + 16, y: top + framePadTop + tileH + 16 + lifeH + 14, w: osW - 32, h: tileH,
      style: "resourceTile", parent: "os-frame",
    });
    d.edge({ from: "os", to: "xregion", kind: "flow", label: "replicate" });
  }

  // ---- RPO / RTO guidance card --------------------------------------------
  const rpoRows: { left: string; right?: string; bold?: boolean }[] = [
    { left: "Block Volume policy (daily)", right: "RPO 24 h · RTO = restore + boot (นาที–ชั่วโมง)" },
  ];
  if (hasAdb) rpoRows.push({ left: "ADB automatic backup", right: "RPO ~1 h (archived redo) · RTO นาที" });
  if (hasBaseDb) rpoRows.push({ left: "Base DB RMAN + redo", right: "RPO ≤ 1 h · RTO ชั่วโมง (restore + recover)" });
  rpoRows.push({ left: "Archive-tier restore", right: "ต้อง thaw ~1 h ก่อนดาวน์โหลด" });
  const rpoH = 22 + rpoRows.length * 16 + 8;
  const rpoY = top + Math.max(frameH, osFrameH) + 30;
  d.add({
    id: "rpo",
    kind: "routeCard",
    label: "RPO / RTO GUIDANCE",
    colHeaders: ["PROTECTION", "RPO / RTO"],
    x: 24, y: rpoY, w: 690, h: rpoH + 16,
    style: "routeCardSpoke",
    rows: rpoRows,
  });
  d.add({
    kind: "note",
    label: "แนวทางเริ่มต้น: ปรับความถี่ backup และ retention ตาม SLA ของลูกค้าได้ในภายหลัง (bronze/silver/gold policy)",
    x: 24, y: rpoY + rpoH + 16 + 12, w: 560, h: 40,
    style: "note",
  });

  // ---- legend -------------------------------------------------------------
  addLegend(d, osX + osW + 26, top, [
    { left: "WORKLOAD SOURCE", swatch: "compartmentEnv" },
    { left: "BACKUP SERVICE", swatch: "resourceTile" },
    { left: "STORAGE TIER / LIFECYCLE", swatch: "stackCard" },
    { left: "SHARED SERVICES CMP", swatch: "compartmentShared" },
  ]);

  return d.finish({
    view: "backup" as ViewId,
    title: { th: "มุมมองการสำรองข้อมูล (Backup View)", en: "Backup View" },
  });
}
