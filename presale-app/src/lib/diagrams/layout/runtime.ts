import type { DiagramDoc, SolutionSpec, TemplateId } from "@/lib/domain/types";
import { Doc } from "../model";
import type { ParsedGenerated } from "../generated-parse";

// Runtime View — (top) deployment composition: which generated files apply in
// which order through the orchestrator (styled after the one-oe deployment
// view thumbnails); (bottom) the request/data flow at runtime.

const FLOWS: Record<TemplateId, { label: string; sub?: string; style?: string }[]> = {
  web_app: [
    { label: "Users", style: "actor" },
    { label: "Hub LB", sub: "public ingress", style: "lb" },
    { label: "web subnet", sub: "reverse proxy / static" },
    { label: "app subnet", sub: "E5.Flex app VMs" },
    { label: "db subnet", sub: "Autonomous DB endpoint" },
  ],
  chatbot: [
    { label: "Users / channels", style: "actor" },
    { label: "Hub LB", sub: "public ingress", style: "lb" },
    { label: "Bot app", sub: "VM / OKE pods" },
    { label: "OCI GenAI", sub: "chat model (on-demand)" },
    { label: "Vector ADB", sub: "RAG retrieval" },
  ],
  dr: [
    { label: "Primary site", style: "actor" },
    { label: "DRG", sub: "VPN / FastConnect", style: "drg" },
    { label: "Replication", sub: "block replicas + backups" },
    { label: "Standby VMs", sub: "pilot light / warm" },
    { label: "DB standby", sub: "Data Guard / ADB" },
  ],
  backup: [
    { label: "Backup software", style: "actor" },
    { label: "DRG", sub: "VPN / FastConnect", style: "drg" },
    { label: "Object Storage", sub: "Standard tier" },
    { label: "Lifecycle", sub: "IA after 31d" },
    { label: "Archive", sub: "long-term retention" },
  ],
};

export function layoutRuntimeView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({ kind: "canvasTitle", label: "Runtime View — deployment stacks & runtime flow", x: 24, y: 16, w: 680, h: 26, style: "canvasTitle" });

  // --- deployment composition ----------------------------------------------
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

  const depZone = d.add({ kind: "zone", label: "Deployment — OCI Landing Zones Orchestrator (Terraform / Resource Manager)", x: 24, y: 56, w: stacks.length * 230 + 220 + 60, h: 190, style: "zone" });
  d.add({ id: "orch", kind: "service", label: "Orchestrator", sublabel: "terraform-oci-modules-orchestrator v2.1.3", x: 44, y: 118, w: 200, h: 64, style: "stage", parent: depZone.id });
  stacks.forEach((s, i) => {
    const id = `stack${i}`;
    const h = 34 + s.items.length * 17 + 8;
    d.add({
      id,
      kind: "group",
      label: s.title,
      x: 284 + i * 230, y: 96, w: 210, h,
      style: "blockGov",
      rows: s.items.map((f) => ({ left: f, right: "" })),
      parent: depZone.id,
    });
    d.edge({ from: i === 0 ? "orch" : `stack${i - 1}`, to: id, kind: "flow", label: i === 0 ? "applies" : undefined });
  });

  // --- runtime request flow -------------------------------------------------
  const flow = FLOWS[spec.template];
  const fy = 330;
  const flowZone = d.add({ kind: "zone", label: `Runtime flow — ${spec.template.replace("_", " ")} on ${spec.environments[0] ?? "prod"} spoke`, x: 24, y: fy - 36, w: flow.length * 196 + 40, h: 140, style: "zone" });
  flow.forEach((f, i) => {
    const id = `flow${i}`;
    d.add({ id, kind: "block", label: f.label, sublabel: f.sub, x: 44 + i * 196, y: fy, w: 176, h: 62, style: f.style ?? "blockWorkload", parent: flowZone.id });
    if (i > 0) d.edge({ from: `flow${i - 1}`, to: id, kind: "flow" });
  });
  if (gen.hasNfw && (spec.template === "web_app" || spec.template === "chatbot")) {
    d.add({ id: "fwnote", kind: "note", label: "north-south traffic inspected by the hub Network Firewall", x: 44, y: fy + 84, w: 330, h: 30, style: "note", parent: flowZone.id });
  }

  return d.finish({ view: "runtime", title: { th: "มุมมองรันไทม์ (Runtime View)", en: "Runtime View" } });
}
