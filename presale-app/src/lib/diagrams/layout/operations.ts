import type { DiagramDoc, SolutionSpec } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated } from "../generated-parse";

// Operations View — observability plumbing in the deployment-view language:
// white resource tiles with teal monoline icons and real resource names,
// grouped inside cream shared-services compartments, plus the GitOps day-2
// loop as neutral stage cards. (The upstream design doc keeps this chapter
// as a stub; this is the presale-friendly definition.)

export function layoutOperationsView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: "Operations View",
    sublabel: "monitoring chain & day-2 GitOps operating model",
    x: 24, y: 14, w: 680, h: 40, style: "canvasTitle",
  });

  const top = 64;

  // ---- monitoring chain inside cmp-lz (shared services) -------------------
  const frameW = 950;
  const frameH = 336;
  d.add({
    id: "obs-frame",
    kind: "compartment",
    label: "cmp-lz — shared observability & security operations",
    x: 24, y: top, w: frameW, h: frameH,
    style: "compartmentShared",
  });

  const srcs = [
    { id: "src0", icon: "scan", label: "VCN flow logs", sub: "lgrp-lz-vcn-flow" },
    { id: "src1", icon: "logs", label: "Audit logs", sub: "tenancy audit trail" },
    { id: "src2", icon: "shield", label: "Cloud Guard problems", sub: "cg-tgt-root" },
    { id: "src3", icon: "events", label: "Service events", sub: `${gen.eventCount || "LZ"} event rules` },
  ];
  srcs.forEach((s, i) => {
    d.add({
      id: s.id, kind: "service", label: s.label, sublabel: s.sub, icon: s.icon,
      x: 44, y: top + 34 + i * 72, w: 208, h: 60,
      style: "resourceTile", parent: "obs-frame",
    });
  });

  d.add({
    id: "logging", kind: "service", label: "Logging", sublabel: `${gen.logGroupCount || "LZ"} log groups · CIS retention`, icon: "logs",
    x: 320, y: top + 70, w: 210, h: 64, style: "resourceTile", parent: "obs-frame",
  });
  d.add({
    id: "connector", kind: "service", label: "Service Connector Hub", sublabel: gen.serviceConnector ? "log → object storage routing" : "optional", icon: "gear",
    x: 320, y: top + 196, w: 210, h: 64, style: "resourceTile", parent: "obs-frame",
  });
  srcs.slice(0, 2).forEach((s) => d.edge({ from: s.id, to: "logging", kind: "flow" }));

  const alarmRows = (gen.alarmNames.length ? gen.alarmNames : ["al-lz-cpu", "al-lz-memory", "al-lz-lb-health"]).slice(0, 6).map((a) => ({ left: a }));
  d.add({
    id: "alarms", kind: "group", label: "Alarms", icon: "bell",
    x: 600, y: top + 34, w: 236, h: 40 + alarmRows.length * 18 + 8,
    style: "resourceTile", rows: alarmRows, parent: "obs-frame",
  });
  d.add({
    id: "topics", kind: "service", label: "Notifications", sublabel: `${gen.topicCount || 1} topic(s) → ops & security email`, icon: "bell",
    x: 600, y: top + 240, w: 236, h: 60, style: "resourceTile", parent: "obs-frame",
  });
  d.edge({ from: "logging", to: "connector", kind: "flow" });
  d.edge({ from: "src2", to: "topics", kind: "flow" });
  d.edge({ from: "src3", to: "topics", kind: "flow" });
  d.edge({ from: "alarms", to: "topics", kind: "flow" });

  // ---- GitOps day-2 loop --------------------------------------------------
  const loopY = top + frameH + 40;
  const stages = [
    { icon: "git", label: "config.json", sub: "design intent in Git" },
    { icon: "gear", label: "generate", sub: "gen/generate.sh --config" },
    { icon: "user", label: "review", sub: "PR diff of LZ JSON" },
    { icon: "cloud", label: "apply", sub: "orchestrator / ORM" },
    { icon: "compute", label: `OCI ${spec.region.shortName.toUpperCase()}`, sub: "landing zone updated" },
  ];
  d.add({
    id: "gitops-frame",
    kind: "compartment",
    label: "DAY-2 OPERATING MODEL — GITOPS LOOP",
    x: 24, y: loopY, w: frameW, h: 132,
    style: "panel",
  });
  stages.forEach((s, i) => {
    const id = `st${i}`;
    d.add({
      id, kind: "block", label: s.label, sublabel: s.sub, icon: s.icon, captionBelow: true,
      x: 44 + i * 186, y: loopY + 34, w: 168, h: 80,
      style: "stage", parent: "gitops-frame",
    });
    if (i > 0) d.edge({ from: `st${i - 1}`, to: id, kind: "flow" });
  });

  // ---- legend -------------------------------------------------------------
  addLegend(d, 24 + frameW + 26, top, [
    { left: "SHARED SERVICES CMP", swatch: "compartmentShared" },
    { left: "OBSERVABILITY RESOURCE", swatch: "resourceTile" },
    { left: "DAY-2 PIPELINE STAGE", swatch: "stage" },
  ]);

  return d.finish({ view: "operations", title: { th: "มุมมองปฏิบัติการ (Operations View)", en: "Operations View" } });
}
