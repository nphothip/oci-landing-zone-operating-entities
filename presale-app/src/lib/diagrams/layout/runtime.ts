import type { DiagramDoc, SolutionSpec, TemplateId } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated } from "../generated-parse";

// Runtime View — (top) deployment composition: which generated files apply in
// which order through the orchestrator, drawn as header-bar stack cards like
// the route-table cards of the deployment views; (bottom) the runtime request
// flow as white icon tiles with orthogonal arrows.

const FLOWS: Record<TemplateId, { label: string; sub?: string; icon: string }[]> = {
  web_app: [
    { label: "Users", icon: "user" },
    { label: "Hub LB", sub: "public ingress", icon: "lb" },
    { label: "web subnet", sub: "reverse proxy / static", icon: "compute" },
    { label: "app subnet", sub: "E5.Flex app VMs", icon: "compute" },
    { label: "db subnet", sub: "Autonomous DB endpoint", icon: "db" },
  ],
  chatbot: [
    { label: "Users / channels", icon: "chat" },
    { label: "Hub LB", sub: "public ingress", icon: "lb" },
    { label: "Bot app", sub: "VMs / OKE pods", icon: "k8s" },
    { label: "OCI GenAI", sub: "chat model (on-demand)", icon: "ai" },
    { label: "Vector ADB", sub: "RAG retrieval", icon: "db" },
  ],
  dr: [
    { label: "Primary site", icon: "onprem" },
    { label: "DRG", sub: "VPN / FastConnect", icon: "drg" },
    { label: "Replication", sub: "block replicas + backups", icon: "archive" },
    { label: "Standby VMs", sub: "pilot light / warm", icon: "compute" },
    { label: "DB standby", sub: "Data Guard / ADB", icon: "db" },
  ],
  backup: [
    { label: "Backup software", icon: "onprem" },
    { label: "DRG", sub: "VPN / FastConnect", icon: "drg" },
    { label: "Object Storage", sub: "Standard tier", icon: "archive" },
    { label: "Lifecycle", sub: "IA after 31 days", icon: "gear" },
    { label: "Archive", sub: "long-term retention", icon: "archive" },
  ],
  erp: [
    { label: "Office users", icon: "user" },
    { label: "DRG", sub: "VPN from office", icon: "drg" },
    { label: "ERP app VMs", sub: "app subnet", icon: "compute" },
    { label: "Oracle DB", sub: "db subnet", icon: "db" },
    { label: "File share", sub: "FSS mount", icon: "archive" },
  ],
  migration: [
    { label: "Source VMs", icon: "onprem" },
    { label: "DRG", sub: "VPN replication", icon: "drg" },
    { label: "Migrated fleet", sub: "app/db subnets", icon: "compute" },
    { label: "Block volumes", sub: "boot + data", icon: "archive" },
    { label: "Cutover", sub: "DNS switch", icon: "cloud" },
  ],
  analytics: [
    { label: "Data sources", icon: "onprem" },
    { label: "Data lake", sub: "Object Storage", icon: "archive" },
    { label: "ETL", sub: "Data Integration", icon: "gear" },
    { label: "ADW", sub: "db subnet endpoint", icon: "db" },
    { label: "OAC dashboards", sub: "per-user", icon: "ai" },
  ],
  devtest: [
    { label: "Dev team", icon: "user" },
    { label: "DRG", sub: "VPN access", icon: "drg" },
    { label: "Dev/Test VMs", sub: "scheduled start/stop", icon: "compute" },
    { label: "ADB per env", sub: "stop when idle", icon: "db" },
    { label: "Scheduler", sub: "off-hours auto-stop", icon: "gear" },
  ],
  oke_platform: [
    { label: "CI/CD", icon: "git" },
    { label: "Registry", sub: "container images", icon: "archive" },
    { label: "OKE control plane", sub: "private endpoint", icon: "k8s" },
    { label: "Worker nodes", sub: "E5.Flex pool", icon: "compute" },
    { label: "Ingress LB", sub: "int-lb subnet", icon: "lb" },
  ],
  ecommerce: [
    { label: "Shoppers", icon: "user" },
    { label: "WAF + Hub LB", sub: "public ingress", icon: "lb" },
    { label: "web/app subnet", sub: "E5.Flex VMs", icon: "compute" },
    { label: "Redis cache", sub: "app subnet", icon: "db" },
    { label: "ADB + media", sub: "db subnet + Object Storage", icon: "db" },
  ],
  fileserver: [
    { label: "Office users", icon: "user" },
    { label: "DRG", sub: "VPN / FastConnect", icon: "drg" },
    { label: "Gateway", sub: "SMB/NFS", icon: "compute" },
    { label: "File Storage", sub: "FSS mount targets", icon: "archive" },
    { label: "Archive", sub: "lifecycle to Object Storage", icon: "archive" },
  ],
  vdi: [
    { label: "End users", icon: "user" },
    { label: "DRG", sub: "VPN / FastConnect", icon: "drg" },
    { label: "Secure Desktops", sub: "per-desktop", icon: "compute" },
    { label: "Broker/apps", sub: "app subnet", icon: "compute" },
    { label: "Profiles (FSS)", sub: "home/roaming", icon: "archive" },
  ],
  serverless: [
    { label: "API clients", icon: "chat" },
    { label: "API Gateway", sub: "public ingress + auth", icon: "lb" },
    { label: "Functions", sub: "private subnet", icon: "gear" },
    { label: "ADB", sub: "db subnet", icon: "db" },
    { label: "Object Storage", sub: "assets", icon: "archive" },
  ],
  streaming: [
    { label: "Producers", icon: "onprem" },
    { label: "DRG", sub: "VPN / FastConnect", icon: "drg" },
    { label: "OCI Streaming", sub: "private endpoint", icon: "events" },
    { label: "Consumers", sub: "app subnet", icon: "compute" },
    { label: "ADW", sub: "db subnet", icon: "db" },
  ],
};

export function layoutRuntimeView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: "Runtime View",
    sublabel: "deployment stacks (apply order) & runtime request flow",
    x: 24, y: 14, w: 680, h: 40, style: "canvasTitle",
  });

  const top = 64;

  // ---- deployment composition --------------------------------------------
  const files = gen.fileNames;
  const pre = files.filter((f) => f.includes("_pre"));
  const staged = pre.length > 0;
  const stacks: { title: string; items: string[] }[] = [
    { title: "1 — foundation", items: ["config.json", "iam.json", "governance.json"] },
    staged
      ? { title: "2 — network (stage 1)", items: pre.filter((f) => f.startsWith("network")).length ? pre.filter((f) => f.startsWith("network")) : ["network_pre.json"] }
      : { title: "2 — network", items: ["network.json"] },
    {
      title: staged ? "3 — security & obs (stage 1)" : "3 — security & observability",
      items: files.filter((f) => (f.startsWith("security") || f.startsWith("observability")) && (staged ? f.includes("_pre") : !f.includes("_pre"))),
    },
    ...(staged
      ? [{ title: "4 — finalize (swap *_pre)", items: files.filter((f) => !f.includes("_pre") && f !== "iam.json" && f !== "governance.json") }]
      : []),
  ];
  const extra = files.filter((f) => /^oke|^ocvs|_backends/.test(f));
  if (extra.length) stacks.push({ title: `${stacks.length + 1} — workload extension`, items: extra });

  const cardW = 212;
  const frameW = 270 + stacks.length * (cardW + 18) + 10;
  const tallest = Math.max(...stacks.map((s) => 20 + s.items.length * 16 + 8));
  const frameH = 44 + Math.max(tallest, 96) + 20;
  d.add({
    id: "deploy-frame",
    kind: "compartment",
    label: "DEPLOYMENT — OCI LANDING ZONES ORCHESTRATOR (TERRAFORM / RESOURCE MANAGER)",
    x: 24, y: top, w: frameW, h: frameH,
    style: "panel",
  });
  d.add({
    id: "orch",
    kind: "block",
    label: "Orchestrator",
    sublabel: "terraform-oci-modules-orchestrator v2.1.3",
    icon: "gear",
    captionBelow: true,
    x: 44, y: top + 44, w: 210, h: 92,
    style: "stage",
    parent: "deploy-frame",
  });
  stacks.forEach((s, i) => {
    const id = `stack${i}`;
    const h = 20 + s.items.length * 16 + 8;
    d.add({
      id,
      kind: "routeCard",
      label: s.title,
      x: 284 + i * (cardW + 18), y: top + 44, w: cardW, h,
      style: "stackCard",
      rows: s.items.map((f) => ({ left: f })),
      parent: "deploy-frame",
    });
    d.edge({ from: i === 0 ? "orch" : `stack${i - 1}`, to: id, kind: "flow", label: i === 0 ? "«applies»" : undefined });
  });

  // ---- runtime request flow ----------------------------------------------
  const flow = FLOWS[spec.template];
  const fy = top + frameH + 36;
  const tileW = 178;
  const flowFrameW = flow.length * (tileW + 18) + 40;
  d.add({
    id: "flow-frame",
    kind: "compartment",
    label: `RUNTIME FLOW — ${spec.template.replace("_", " ").toUpperCase()} ON ${(spec.environments[0] ?? "prod").toUpperCase()} SPOKE`,
    x: 24, y: fy, w: flowFrameW, h: 150,
    style: "panel",
  });
  flow.forEach((f, i) => {
    const id = `flow${i}`;
    d.add({
      id, kind: "block", label: f.label, sublabel: f.sub, icon: f.icon, captionBelow: true,
      x: 44 + i * (tileW + 18), y: fy + 34, w: tileW, h: 96,
      style: "iconTile", parent: "flow-frame",
    });
    if (i > 0) d.edge({ from: `flow${i - 1}`, to: id, kind: "flow" });
  });
  if (gen.hasNfw && (spec.template === "web_app" || spec.template === "chatbot")) {
    d.add({
      id: "fwnote", kind: "note",
      label: "north-south traffic is inspected by the hub Network Firewall before reaching the spoke",
      x: 44, y: fy + 150 + 10, w: 430, h: 40, style: "note",
    });
  }

  // ---- legend -------------------------------------------------------------
  addLegend(d, Math.max(frameW, flowFrameW) + 24 + 26, top, [
    { left: "DEPLOYMENT STACK", swatch: "stackCard" },
    { left: "PIPELINE STAGE", swatch: "stage" },
    { left: "RUNTIME COMPONENT", swatch: "iconTile" },
  ]);

  return d.finish({ view: "runtime", title: { th: "มุมมองรันไทม์ (Runtime View)", en: "Runtime View" } });
}
