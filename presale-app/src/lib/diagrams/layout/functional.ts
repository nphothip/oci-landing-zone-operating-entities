import type { DiagramDoc, SolutionSpec, TemplateId } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";

// Functional View — Oracle's two-panel grammar (2_functional_view_*):
// left rounded PERSONAS panel with monoline group icons, right panel with the
// landing-zone building blocks in the canonical color code, workload blocks
// in workload-environment green, and «guillemet» labels on the connectors.

const WORKLOAD_BLOCKS: Record<TemplateId, { label: string; sub?: string; icon: string }[]> = {
  enterprise_lz: [
    { label: "Public ingress", sub: "hub LB (+NFW inspection)", icon: "lb" },
    { label: "Project workloads", sub: "per-project compartments + NSGs", icon: "compute" },
    { label: "Databases", sub: "ADB / Base DB per project", icon: "db" },
    { label: "OKE platform", sub: "container platform per env", icon: "k8s" },
    { label: "Shared storage", sub: "FSS · Object Storage", icon: "archive" },
  ],
  web_app: [
    { label: "Public ingress", sub: "hub LB (+WAF)", icon: "lb" },
    { label: "Web / App tier", sub: "VM.Standard.E5.Flex", icon: "compute" },
    { label: "Data tier", sub: "Autonomous Database", icon: "db" },
  ],
  chatbot: [
    { label: "Chat channels", sub: "web · LINE · Teams", icon: "chat" },
    { label: "Bot application", sub: "VMs or OKE", icon: "compute" },
    { label: "Generative AI", sub: "OCI GenAI on-demand", icon: "ai" },
    { label: "RAG store", sub: "vector ADB + Object Storage", icon: "db" },
  ],
  dr: [
    { label: "Replication", sub: "block replicas · backups", icon: "archive" },
    { label: "Standby compute", sub: "pilot light / warm", icon: "compute" },
    { label: "DB standby", sub: "Data Guard / ADB DR", icon: "db" },
    { label: "Failover runbook", sub: "Full Stack DR", icon: "gear" },
  ],
  backup: [
    { label: "Backup sources", sub: "on-prem / other cloud", icon: "onprem" },
    { label: "Backup landing", sub: "Object Storage tiers", icon: "archive" },
    { label: "Lifecycle", sub: "Standard → IA → Archive", icon: "gear" },
    { label: "Restore path", sub: "egress / FastConnect", icon: "cloud" },
  ],
  erp: [
    { label: "Office users", sub: "VPN / private access", icon: "onprem" },
    { label: "ERP app tier", sub: "Windows/Linux VMs", icon: "compute" },
    { label: "Oracle Database", sub: "Base DB / ADB", icon: "db" },
    { label: "File share", sub: "FSS docs & interfaces", icon: "archive" },
  ],
  migration: [
    { label: "Source estate", sub: "VMware / Hyper-V / hosting", icon: "onprem" },
    { label: "Replication", sub: "Oracle Cloud Migrations", icon: "gear" },
    { label: "Migrated VMs", sub: "E5.Flex by role", icon: "compute" },
    { label: "Cutover", sub: "DNS switch via VPN", icon: "cloud" },
  ],
  analytics: [
    { label: "Data sources", sub: "ERP · POS · files", icon: "onprem" },
    { label: "Data lake", sub: "Object Storage", icon: "archive" },
    { label: "ADW", sub: "warehouse & models", icon: "db" },
    { label: "Dashboards", sub: "Analytics Cloud users", icon: "ai" },
  ],
  devtest: [
    { label: "Dev team", sub: "VPN access", icon: "user" },
    { label: "Dev spoke", sub: "VMs + ADB (scheduled)", icon: "compute" },
    { label: "Test spoke", sub: "VMs + ADB (scheduled)", icon: "compute" },
    { label: "Auto-stop", sub: "off-hours = compute ฿0", icon: "gear" },
  ],
  oke_platform: [
    { label: "Dev team", sub: "CI/CD pipelines", icon: "git" },
    { label: "Registry", sub: "images & artifacts", icon: "archive" },
    { label: "OKE cluster", sub: "deployed by the LZ", icon: "k8s" },
    { label: "Ingress", sub: "int-lb subnet LBs", icon: "lb" },
  ],
  ecommerce: [
    { label: "Storefront (WAF)", sub: "public ingress", icon: "lb" },
    { label: "Web/App tier", sub: "E5.Flex VMs", icon: "compute" },
    { label: "Cache", sub: "OCI Cache (Redis)", icon: "db" },
    { label: "Catalog DB + media", sub: "ADB + Object Storage", icon: "db" },
  ],
  fileserver: [
    { label: "Office users", sub: "VPN / private", icon: "onprem" },
    { label: "Gateway", sub: "SMB/NFS / sync", icon: "compute" },
    { label: "File Storage", sub: "FSS active share", icon: "archive" },
    { label: "Archive", sub: "Object Storage cold", icon: "archive" },
  ],
  vdi: [
    { label: "End users", sub: "private access", icon: "user" },
    { label: "Secure Desktops", sub: "per-desktop VDI", icon: "compute" },
    { label: "Profiles", sub: "FSS roaming", icon: "archive" },
    { label: "Broker/apps", sub: "shared servers", icon: "compute" },
  ],
  serverless: [
    { label: "API clients", sub: "apps / partners", icon: "chat" },
    { label: "API Gateway", sub: "ingress + auth", icon: "lb" },
    { label: "Functions", sub: "pay-per-use", icon: "gear" },
    { label: "Data tier", sub: "ADB + Object Storage", icon: "db" },
  ],
  streaming: [
    { label: "Producers", sub: "IoT / apps / logs", icon: "onprem" },
    { label: "OCI Streaming", sub: "Kafka-compatible", icon: "events" },
    { label: "Consumers", sub: "stream processing", icon: "compute" },
    { label: "ADW sink", sub: "analytics warehouse", icon: "db" },
  ],
};

export function layoutFunctionalView(spec: SolutionSpec): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: "Functional View",
    sublabel: "personas & landing zone building blocks",
    x: 24, y: 14, w: 640, h: 40, style: "canvasTitle",
  });

  const top = 64;

  // ---- left panel: personas ----------------------------------------------
  const personas = [
    { id: "p-op", label: "Operating\nTeam", stories: ["f-iam", "f-net", "f-sec", "f-obs", "f-gov"] },
    { id: "p-sec", label: "Security\nTeam", stories: [] },
    { id: "p-proj", label: "Project\nTeam", stories: [] },
  ];
  const perW = 150;
  const perPanelH = 40 + personas.length * 96;
  d.add({ id: "personas-panel", kind: "compartment", label: "PERSONAS", x: 24, y: top, w: perW + 32, h: perPanelH, style: "panel" });
  personas.forEach((p, i) => {
    d.add({
      id: p.id,
      kind: "persona",
      label: p.label,
      icon: "people",
      captionBelow: true,
      x: 40, y: top + 34 + i * 96, w: perW, h: 82,
      style: "persona",
      parent: "personas-panel",
    });
  });

  // ---- right panel: building blocks --------------------------------------
  const bbX = 24 + perW + 32 + 26;
  const lzBlocks = [
    { id: "f-iam", label: "IAM & Compartments", sub: "identity domain · groups · policies", icon: "people" },
    { id: "f-net", label: "Hub Network", sub: `${spec.hub.kind.replace("_", " ").toUpperCase()} · DRG · spokes`, icon: "drg" },
    { id: "f-sec", label: "Security Posture", sub: `Cloud Guard · SZ · VSS (CIS L${spec.cisLevel})`, icon: "shield" },
    { id: "f-obs", label: "Observability", sub: "logs · events · alarms · topics", icon: "logs" },
    { id: "f-gov", label: "Governance", sub: "tags · budgets · cost tracking", icon: "gear" },
  ];
  const wBlocks = WORKLOAD_BLOCKS[spec.template];
  const bw = 196;
  const bh = 80;
  const gap = 16;
  const lzRowW = Math.max(lzBlocks.length, wBlocks.length) * (bw + gap) - gap + 32;
  const frameH = 30 + bh + 16;
  const panelH = 40 + frameH + 26 + frameH + 16;
  d.add({
    id: "blocks-panel",
    kind: "compartment",
    label: `BUILDING BLOCKS — ${spec.template.replace("_", " ").toUpperCase()} ON OCI OPEN LZ`,
    x: bbX, y: top, w: lzRowW + 32, h: panelH,
    style: "panel",
  });

  // shared-services container (cream) with the LZ function blocks
  const sharedY = top + 40;
  d.add({
    id: "shared-frame",
    kind: "compartment",
    label: "Shared Services — landing zone (deployed as code)",
    x: bbX + 16, y: sharedY, w: lzRowW, h: frameH,
    style: "blockShared",
    parent: "blocks-panel",
  });
  lzBlocks.forEach((b, i) => {
    d.add({
      id: b.id,
      kind: "block",
      label: b.label,
      sublabel: b.sub,
      icon: b.icon,
      captionBelow: true,
      x: bbX + 32 + i * (bw + gap), y: sharedY + 28, w: bw, h: bh,
      style: "iconTile",
      parent: "shared-frame",
    });
  });

  // workload-environment container (green) with the workload chain
  const wY = sharedY + frameH + 26;
  d.add({
    id: "workload-frame",
    kind: "compartment",
    label: `Workload Environment — ${spec.environments.join(" · ")}`,
    x: bbX + 16, y: wY, w: lzRowW, h: frameH,
    style: "blockEnv",
    parent: "blocks-panel",
  });
  wBlocks.forEach((b, i) => {
    const id = `wl${i}`;
    d.add({
      id,
      kind: "block",
      label: b.label,
      sublabel: b.sub,
      icon: b.icon,
      captionBelow: true,
      x: bbX + 32 + i * (bw + gap), y: wY + 28, w: bw, h: bh,
      style: "iconTile",
      parent: "workload-frame",
    });
    if (i > 0) d.edge({ from: `wl${i - 1}`, to: id, kind: "flow" });
  });

  // persona → blocks + frame relations with guillemet labels
  d.edge({ from: "p-op", to: "shared-frame", kind: "flow", label: "«operates»" });
  // route «audits» through the gap between the two frames, then up into the tile
  const gapY = wY - 13;
  d.edge({
    from: "p-sec", to: "f-sec", kind: "flow", label: "«audits»",
    points: [
      { x: bbX + 4, y: gapY },
      { x: bbX + 32 + 2 * (bw + gap) + bw / 2, y: gapY },
    ],
  });
  d.edge({ from: "p-proj", to: "workload-frame", kind: "flow", label: "«deploys workloads»" });
  d.edge({
    from: "shared-frame", to: "workload-frame", kind: "assoc", label: "«contains»",
    points: [{ x: bbX + lzRowW + 52, y: sharedY + 56 }, { x: bbX + lzRowW + 52, y: wY + 56 }],
  });

  // ---- legend (canonical element colors) ----------------------------------
  addLegend(d, bbX + lzRowW + 32 + 78, top, [
    { left: "LZ ENVIRONMENT", swatch: "blockLze" },
    { left: "SHARED SERVICES", swatch: "blockShared" },
    { left: "WORKLOAD ENVIRONMENT", swatch: "blockEnv" },
    { left: "PROJECT", swatch: "blockProject" },
    { left: "PLATFORM", swatch: "blockPlatform" },
  ]);

  return d.finish({ view: "functional", title: { th: "มุมมองเชิงฟังก์ชัน (Functional View)", en: "Functional View" } });
}
