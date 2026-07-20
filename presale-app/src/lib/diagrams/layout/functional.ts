import type { DiagramDoc, SolutionSpec, TemplateId } from "@/lib/domain/types";
import { Doc, rowX } from "../model";

// Functional View — personas, landing zone function blocks and the workload's
// functional building blocks (styled after 2_functional_view_building_blocks).

const WORKLOAD_BLOCKS: Record<TemplateId, { label: string; sub?: string }[]> = {
  web_app: [
    { label: "Public ingress", sub: "hub LB (+WAF)" },
    { label: "Web/App tier", sub: "E5.Flex VMs" },
    { label: "Data tier", sub: "Autonomous DB" },
  ],
  chatbot: [
    { label: "Chat channels", sub: "web / LINE / MS Teams" },
    { label: "Bot application", sub: "VM or OKE" },
    { label: "Generative AI", sub: "OCI GenAI on-demand" },
    { label: "RAG store", sub: "ADB vector + Object Storage" },
  ],
  dr: [
    { label: "Replication", sub: "block replica / backups" },
    { label: "Standby compute", sub: "pilot light / warm" },
    { label: "DB standby", sub: "Data Guard / ADB DR" },
    { label: "Failover runbook", sub: "Full Stack DR" },
  ],
  backup: [
    { label: "Backup sources", sub: "on-prem / other cloud" },
    { label: "Backup landing", sub: "Object Storage tiers" },
    { label: "Lifecycle", sub: "Standard → IA → Archive" },
    { label: "Restore path", sub: "egress / FastConnect" },
  ],
};

export function layoutFunctionalView(spec: SolutionSpec): DiagramDoc {
  const d = new Doc();
  d.add({ kind: "canvasTitle", label: "Functional View — personas & building blocks", x: 24, y: 16, w: 640, h: 26, style: "canvasTitle" });

  // personas row
  const personas = ["IAM admin", "Network admin", "Security admin", "Cost admin", "Auditor", "Project team"];
  const pw = 128;
  const pz = d.add({ kind: "zone", label: "Personas", x: 24, y: 56, w: personas.length * (pw + 16) + 24, h: 96, style: "zone" });
  personas.forEach((p, i) => {
    d.add({ kind: "persona", label: p, x: rowX(40, i, pw), y: 92, w: pw, h: 44, style: "persona", parent: pz.id });
  });

  // landing zone functions
  const lzBlocks = [
    { label: "IAM & compartments", sub: "identity domain, groups, policies", style: "blockIam" },
    { label: "Hub network", sub: `${spec.hub.kind.replace("_", " ").toUpperCase()} + DRG + spokes`, style: "blockNetwork" },
    { label: "Security posture", sub: `Cloud Guard, SZ, VSS (CIS L${spec.cisLevel})`, style: "blockSecurity" },
    { label: "Observability", sub: "logs, events, alarms, topics", style: "blockObs" },
    { label: "Governance", sub: "tags, budgets, cost tracking", style: "blockGov" },
  ];
  const bw = 170;
  const lzZone = d.add({ kind: "zone", label: "Landing zone functions (deployed as code)", x: 24, y: 176, w: lzBlocks.length * (bw + 16) + 24, h: 118, style: "zone" });
  lzBlocks.forEach((b, i) => {
    d.add({ id: `lz${i}`, kind: "block", label: b.label, sublabel: b.sub, x: rowX(40, i, bw), y: 212, w: bw, h: 62, style: b.style, parent: lzZone.id });
  });

  // workload blocks
  const wBlocks = WORKLOAD_BLOCKS[spec.template];
  const ww = 200;
  const wZone = d.add({ kind: "zone", label: `Workload — ${spec.template.replace("_", " ")} (${spec.environments.join(", ")})`, x: 24, y: 318, w: wBlocks.length * (ww + 16) + 24, h: 122, style: "zone" });
  wBlocks.forEach((b, i) => {
    const id = `wl${i}`;
    d.add({ id, kind: "block", label: b.label, sublabel: b.sub, x: rowX(40, i, ww), y: 354, w: ww, h: 64, style: "blockWorkload", parent: wZone.id });
    if (i > 0) d.edge({ from: `wl${i - 1}`, to: id, kind: "flow" });
  });

  // shared stories: personas operate the LZ; workload rides on LZ functions
  d.edge({ from: "lz1", to: "wl0", kind: "assoc", label: "runs on", dashed: true });

  return d.finish({ view: "functional", title: { th: "มุมมองเชิงฟังก์ชัน (Functional View)", en: "Functional View" } });
}
