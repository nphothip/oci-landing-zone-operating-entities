import type { DiagramDoc, SolutionSpec } from "@/lib/domain/types";
import { Doc } from "../model";
import type { ParsedGenerated } from "../generated-parse";

// Operations View — observability flow (from the generated observability
// config) + the GitOps day-2 operating loop. The upstream design doc keeps
// this chapter as a stub, so the content here is the presale-friendly
// definition agreed for this app.

export function layoutOperationsView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({ kind: "canvasTitle", label: "Operations View — monitoring & day-2 (GitOps)", x: 24, y: 16, w: 680, h: 26, style: "canvasTitle" });

  // --- observability flow ---------------------------------------------------
  const srcs = ["VCN flow logs", "Audit logs", "Cloud Guard problems", "Service events"];
  const srcZone = d.add({ kind: "zone", label: "Sources", x: 24, y: 56, w: 200, h: 60 + srcs.length * 54, style: "zone" });
  srcs.forEach((s, i) => {
    d.add({ id: `src${i}`, kind: "service", label: s, x: 40, y: 92 + i * 54, w: 168, h: 42, style: "serviceObs", parent: srcZone.id });
  });

  const midX = 290;
  d.add({
    id: "logging",
    kind: "service",
    label: `Logging — ${gen.logGroupCount || "LZ"} log groups`,
    sublabel: "retention per CIS profile",
    x: midX, y: 130, w: 210, h: 56, style: "serviceObs",
  });
  d.add({
    id: "connector",
    kind: "service",
    label: "Service Connector Hub",
    sublabel: gen.serviceConnector ? "log routing enabled" : "optional",
    x: midX, y: 216, w: 210, h: 56, style: "serviceObs",
  });
  srcs.forEach((_, i) => d.edge({ from: `src${i}`, to: "logging", kind: "flow" }));
  d.edge({ from: "logging", to: "connector", kind: "flow" });

  const rightX = 570;
  d.add({
    id: "alarms",
    kind: "group",
    label: `Alarms (${gen.alarmNames.length || "LZ set"})`,
    x: rightX, y: 66, w: 260, h: 30 + Math.max(gen.alarmNames.length, 3) * 18 + 8,
    style: "blockObs",
    rows: (gen.alarmNames.length ? gen.alarmNames : ["cpu", "memory", "network"]).map((a) => ({ left: a, right: "" })),
  });
  d.add({
    id: "topics",
    kind: "service",
    label: `Notifications — ${gen.topicCount || 1} topic(s)`,
    sublabel: "email to ops/security teams",
    x: rightX, y: 250, w: 260, h: 56, style: "serviceObs",
  });
  d.edge({ from: "connector", to: "topics", kind: "flow" });
  d.edge({ from: "alarms", to: "topics", kind: "flow" });
  d.add({
    id: "events",
    kind: "service",
    label: `Event rules — ${gen.eventCount || "LZ set"}`,
    sublabel: "IAM / network / security changes",
    x: midX, y: 66, w: 210, h: 48, style: "serviceObs",
  });
  d.edge({ from: "events", to: "topics", kind: "flow" });

  // --- GitOps day-2 loop ----------------------------------------------------
  const loopY = 400;
  const stages = [
    { label: "config.json", sub: "design intent (Git)" },
    { label: "generate", sub: "gen/generate.sh --config" },
    { label: "review", sub: "PR diff: LZ JSON" },
    { label: "apply", sub: "orchestrator / ORM" },
    { label: `OCI ${spec.region.shortName.toUpperCase()}`, sub: "landing zone updated" },
  ];
  const loopZone = d.add({ kind: "zone", label: "Day-2 operating model — GitOps loop", x: 24, y: loopY - 36, w: stages.length * 186 + 40, h: 130, style: "zone" });
  stages.forEach((s, i) => {
    const id = `st${i}`;
    d.add({ id, kind: "block", label: s.label, sublabel: s.sub, x: 44 + i * 186, y: loopY, w: 166, h: 58, style: "stage", parent: loopZone.id });
    if (i > 0) d.edge({ from: `st${i - 1}`, to: id, kind: "flow" });
  });

  return d.finish({ view: "operations", title: { th: "มุมมองปฏิบัติการ (Operations View)", en: "Operations View" } });
}
