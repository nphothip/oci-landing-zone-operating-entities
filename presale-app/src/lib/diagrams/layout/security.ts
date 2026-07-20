import type { DiagramDoc, SolutionSpec } from "@/lib/domain/types";
import { Doc } from "../model";
import type { CompartmentNode, ParsedGenerated } from "../generated-parse";

// Security View — compartment hierarchy from the generated iam.json (styled
// after 3_security_view_compartments_L2.jpg) plus IAM groups and the security
// posture services enabled by the selected CIS level.

const LEAF_H = 32;
const HEADER = 28;
const PAD = 10;

function styleFor(c: CompartmentNode, depth: number): string {
  if (depth === 0) return "compartmentRoot";
  const n = c.name;
  if (/-prod$|-preprod$|-staging$|-uat$|-dev$|-test$/.test(n)) return "compartmentEnv";
  if (/platform/.test(n)) return "compartmentPlatform";
  if (depth === 1) return "compartmentShared";
  return "compartmentChild";
}

function measure(c: CompartmentNode): number {
  if (c.children.length === 0) return LEAF_H;
  return HEADER + c.children.reduce((acc, ch) => acc + measure(ch) + PAD, 0) + PAD;
}

function draw(d: Doc, c: CompartmentNode, x: number, y: number, w: number, depth: number, parent?: string): number {
  const h = measure(c);
  const node = d.add({
    id: `cmp:${c.key}`,
    kind: "compartment",
    label: c.name,
    x, y, w, h,
    parent,
    style: styleFor(c, depth),
  });
  let cy = y + HEADER;
  for (const ch of c.children) {
    const chH = draw(d, ch, x + PAD + 6, cy, w - (PAD + 6) * 2, depth + 1, node.id);
    cy += chH + PAD;
  }
  return h;
}

export function layoutSecurityView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: `Security View — compartments, IAM & posture (CIS Level ${spec.cisLevel})`,
    x: 24, y: 16, w: 700, h: 26, style: "canvasTitle",
  });

  // tenancy frame around the compartment tree
  const treeW = 460;
  const treeX = 24;
  const treeY = 92;
  let treeH = 120;
  if (gen.compartmentRoot) {
    treeH = measure(gen.compartmentRoot);
    const tenancy = d.add({ kind: "zone", label: "OCI tenancy", x: treeX - 0, y: treeY - 32, w: treeW + 24, h: treeH + 56, style: "zone" });
    draw(d, gen.compartmentRoot, treeX + 12, treeY, treeW, 0, tenancy.id);
  }

  // right column: groups
  const colX = treeX + treeW + 70;
  let cy = 60;
  const groupsH = HEADER + gen.groups.length * 20 + PAD;
  d.add({
    kind: "group",
    label: `IAM groups (${gen.groups.length}) — segregation of duties`,
    x: colX, y: cy, w: 320, h: groupsH,
    style: "blockIam",
    rows: gen.groups.map((g) => ({ left: g, right: "" })),
  });
  cy += groupsH + 18;

  // policies
  d.add({
    kind: "service",
    label: `IAM policies: ${gen.policyCount} policy sets`,
    sublabel: "least-privilege per function / environment / project",
    x: colX, y: cy, w: 320, h: 48, style: "service",
  });
  cy += 66;

  // posture services
  const posture: { label: string; sub: string }[] = [
    { label: "Cloud Guard", sub: "threat detection & posture" },
    { label: `Security Zones — CIS L${spec.cisLevel} recipes`, sub: "preventive guardrails" },
    { label: "Vulnerability Scanning (VSS)", sub: "host & container scanning" },
    ...(spec.cisLevel === 2 ? [{ label: "OCI Vault", sub: "keys & secrets (CIS L2)" }] : []),
    { label: "Events → Notifications", sub: "security alerting chain" },
  ];
  const postureZone = d.add({ kind: "zone", label: "Security posture (enabled by the LZ)", x: colX, y: cy, w: 320, h: HEADER + posture.length * 54 + PAD, style: "zone" });
  let py = cy + HEADER + 4;
  for (const p of posture) {
    d.add({ kind: "service", label: p.label, sublabel: p.sub, x: colX + 12, y: py, w: 296, h: 44, style: "serviceSecurity", parent: postureZone.id });
    py += 54;
  }

  return d.finish({ view: "security", title: { th: "มุมมองความปลอดภัย (Security View)", en: "Security View" } });
}
