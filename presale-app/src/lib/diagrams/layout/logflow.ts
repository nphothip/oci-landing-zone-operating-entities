import type { DiagramDoc, SolutionSpec, ViewId } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated } from "../generated-parse";

// Logging View — centralized log management as a left→right flow:
//   log sources (per-spoke VCN flow logs, OCI Audit, Cloud Guard, NFW, app/OKE)
//     → central Logging (log groups) → Service Connector Hub
//     → sinks (Object Storage archive, Notifications topics, optional SIEM),
// plus the alarm chain feeding Notifications and a retention-guidance card.
// Same visual language as the operations view: white tiles with teal monoline
// icons, dotted zone frames per column, legend on the right rail.

/** Spoke VCNs that emit flow logs (everything that is not the hub). */
function spokeVcns(spec: SolutionSpec, gen: ParsedGenerated): { name: string; sub: string }[] {
  const spokes = (gen.vcns ?? []).filter(
    (v) => !/hub/i.test(v.category) && !/hub/i.test(v.name) && !/hub/i.test(v.key),
  );
  if (spokes.length > 0) {
    return spokes.map((v) => ({ name: v.name || v.key, sub: v.cidr || v.category || "spoke VCN" }));
  }
  // fallback: derive one spoke per requested environment
  const envs = spec.environments?.length ? spec.environments : ["prod" as const];
  return envs.map((e) => ({ name: `vcn-lz-${e}`, sub: `${e} spoke VCN` }));
}

/** Does this solution run OKE anywhere? (drives the app-logs tile wording) */
function hasOke(spec: SolutionSpec): boolean {
  const s = spec.sizing;
  if (!s) return false;
  if (s.kind === "oke_platform") return true;
  if (s.kind === "chatbot") return s.runtime === "oke";
  if (s.kind === "enterprise_lz") return Object.values(s.plans ?? {}).some((p) => Boolean(p?.oke));
  return false;
}

export function layoutLoggingView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: "Logging View",
    sublabel: "centralized log management — sources → Logging → Service Connector Hub → sinks",
    x: 24, y: 14, w: 760, h: 40, style: "canvasTitle",
  });

  const top = 64;

  // ---- column geometry ----------------------------------------------------
  const srcX = 24;
  const srcW = 252;
  const pipeX = srcX + srcW + 38; // 314
  const pipeW = 500;
  const sinkX = pipeX + pipeW + 40; // 854
  const sinkW = 280;
  const railX = sinkX + sinkW + 30; // 1164
  const railW = 210;

  // ---- sources column -----------------------------------------------------
  type Src = { id: string; icon: string; label: string; sub: string };
  const sources: Src[] = [];

  // per-environment spoke VCN flow logs (cap at 4 tiles, aggregate the rest)
  const spokes = spokeVcns(spec, gen);
  const shown = spokes.length > 4 ? spokes.slice(0, 3) : spokes;
  shown.forEach((v, i) => {
    sources.push({ id: `src-flow${i}`, icon: "scan", label: `VCN flow logs — ${v.name}`, sub: v.sub });
  });
  if (spokes.length > 4) {
    sources.push({
      id: "src-flowmore",
      icon: "scan",
      label: `VCN flow logs — +${spokes.length - 3} more spokes`,
      sub: "one flow log per subnet",
    });
  }
  sources.push({ id: "src-audit", icon: "logs", label: "OCI Audit", sub: "tenancy audit trail (all API calls)" });
  sources.push({ id: "src-cg", icon: "shield", label: "Cloud Guard findings", sub: "posture & threat detections" });
  if (gen.hasNfw) {
    sources.push({ id: "src-nfw", icon: "fw", label: "Network Firewall logs", sub: "hub traffic + threat logs" });
  }
  sources.push({
    id: "src-app",
    icon: hasOke(spec) ? "k8s" : "compute",
    label: hasOke(spec) ? "OKE / application logs" : "Application logs",
    sub: "custom logs via agent / OKE pods",
  });

  const tileH = 54;
  const tileGap = 14;
  const srcFrameH = 32 + sources.length * (tileH + tileGap) + 4;
  d.add({
    id: "zone-src",
    kind: "zone",
    label: "LOG SOURCES — แหล่งกำเนิด log",
    x: srcX, y: top, w: srcW, h: srcFrameH,
    style: "zone",
  });
  sources.forEach((s, i) => {
    d.add({
      id: s.id, kind: "service", label: s.label, sublabel: s.sub, icon: s.icon,
      x: srcX + 16, y: top + 32 + i * (tileH + tileGap), w: srcW - 32, h: tileH,
      style: "resourceTile", parent: "zone-src",
    });
  });

  // ---- central pipeline (Logging → Service Connector Hub) -----------------
  const alarmRows = (gen.alarmNames?.length
    ? gen.alarmNames
    : ["al-lz-cpu", "al-lz-memory", "al-lz-lb-health"]
  )
    .slice(0, 6)
    .map((a) => ({ left: a }));
  const alarmsY = top + 262;
  const alarmsH = 40 + alarmRows.length * 17 + 8;
  const pipeFrameH = Math.max(alarmsY + alarmsH + 16 - top, 300);

  d.add({
    id: "zone-pipe",
    kind: "zone",
    label: "CENTRAL LOG MANAGEMENT — cmp-lz-security (shared services)",
    x: pipeX, y: top, w: pipeW, h: pipeFrameH,
    style: "zone",
  });
  d.add({
    id: "logging-svc",
    kind: "service",
    label: "Logging",
    sublabel: `${gen.logGroupCount || "LZ"} log groups · เก็บ log ส่วนกลาง`,
    icon: "logs",
    x: pipeX + 20, y: top + 112, w: 210, h: 76,
    style: "stage", parent: "zone-pipe",
  });
  d.add({
    id: "sch",
    kind: "service",
    label: "Service Connector Hub",
    sublabel: gen.serviceConnector ? "routes logs → sinks" : "optional — enable for archiving",
    icon: "gear",
    x: pipeX + 270, y: top + 112, w: 210, h: 76,
    style: "stage", parent: "zone-pipe",
  });
  d.add({
    id: "alarms",
    kind: "group",
    label: `Alarms (${gen.alarmNames?.length || alarmRows.length})`,
    icon: "bell",
    x: pipeX + 20, y: alarmsY, w: 210, h: alarmsH,
    style: "resourceTile", rows: alarmRows, parent: "zone-pipe",
  });

  // ---- sinks column -------------------------------------------------------
  const sinkFrameH = 360;
  d.add({
    id: "zone-sink",
    kind: "zone",
    label: "SINKS — ปลายทางการเก็บและแจ้งเตือน",
    x: sinkX, y: top, w: sinkW, h: sinkFrameH,
    style: "zone",
  });
  d.add({
    id: "sink-os",
    kind: "service",
    label: "Object Storage — archive",
    sublabel: "long-term retention (archive tier)",
    icon: "archive",
    x: sinkX + 16, y: top + 52, w: sinkW - 32, h: 64,
    style: "service", parent: "zone-sink",
  });
  d.add({
    id: "sink-notif",
    kind: "service",
    label: `Notifications — ${gen.topicCount || 1} topic(s)`,
    sublabel: "อีเมลถึงทีม ops & security",
    icon: "bell",
    x: sinkX + 16, y: top + 168, w: sinkW - 32, h: 64,
    style: "service", parent: "zone-sink",
  });
  d.add({
    id: "sink-siem",
    kind: "service",
    label: "SIEM / external analytics",
    sublabel: "optional — via SCH streaming / functions",
    icon: "ai",
    x: sinkX + 16, y: top + 280, w: sinkW - 32, h: 64,
    style: "serviceObs", parent: "zone-sink",
  });

  // ---- flow edges ---------------------------------------------------------
  for (const s of sources) d.edge({ from: s.id, to: "logging-svc", kind: "flow" });
  d.edge({ from: "logging-svc", to: "sch", kind: "flow", label: "all log groups" });
  d.edge({ from: "sch", to: "sink-os", kind: "flow", label: "archive" });
  d.edge({ from: "sch", to: "sink-notif", kind: "flow" });
  d.edge({ from: "sch", to: "sink-siem", kind: "flow", dashed: true });
  d.edge({ from: "alarms", to: "sink-notif", kind: "flow", label: "alarm firing" });

  // ---- right rail: legend + retention guidance ----------------------------
  addLegend(d, railX, top, [
    { left: "LOG SOURCE", swatch: "resourceTile" },
    { left: "CENTRAL PIPELINE", swatch: "stage" },
    { left: "SINK / DESTINATION", swatch: "service" },
    { left: "OPTIONAL (DASHED)", swatch: "serviceObs" },
  ]);
  d.add({
    id: "retention",
    kind: "note",
    label: "Retention guidance",
    sublabel: "ข้อแนะนำระยะเวลาเก็บ log",
    x: railX, y: top + 30 + 4 * 24 + 20, w: railW, h: 104,
    style: "note",
    rows: [
      { left: "Audit logs — 365 days (CIS)", bold: true },
      { left: "VCN flow logs — 90 days (แนะนำ)" },
      { left: "Archive tier — ≥ 1 year" },
    ],
  });

  return d.finish({
    view: "logging" as ViewId,
    title: { th: "มุมมองการจัดการ Log (Logging View)", en: "Logging View" },
  });
}
