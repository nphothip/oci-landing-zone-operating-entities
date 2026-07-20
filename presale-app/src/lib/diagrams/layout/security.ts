import type { DiagramDoc, DiagramNode, SolutionSpec } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { CompartmentNode, ParsedGenerated } from "../generated-parse";

// Security View — compartment hierarchy in Oracle's L2 reference layout
// (3_security_view_compartments_L2.jpg): OCI Region ▸ dashed OCI Tenancy ▸
// red-bordered cmp-landingzone with a narrow cream "tenancy shared" column
// on the left and wide sage workload-environment panels on the right, plus a
// Management-Groups / posture rail styled after the deployment views.

const ROW_H = 38;
const PAD = 14;

function childStyle(name: string): string {
  if (/platform/.test(name)) return "compartmentPlatform";
  if (/projects$/.test(name)) return "compartmentProjects";
  return "compartmentShared";
}

export function layoutSecurityView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: "Security View",
    sublabel: `compartments · IAM · security posture — CIS Level ${spec.cisLevel}`,
    x: 24, y: 14, w: 700, h: 40, style: "canvasTitle",
  });

  const root = gen.compartmentRoot;
  const top = 64;
  const regionX = 24;
  const tenX = regionX + PAD;
  const lzX = tenX + PAD;
  const contentX = lzX + PAD;
  const contentY = top + 26 * 3 + 6;

  // ---- split children: shared column vs environment panels ----------------
  const children = root?.children ?? [];
  const isEnv = (c: CompartmentNode) => /-(prod|preprod|staging|uat|dev|test)$/.test(c.name);
  const shared = children.filter((c) => !isEnv(c));
  const ENV_ORDER = ["prod", "preprod", "staging", "uat", "dev", "test"];
  const envRank = (c: CompartmentNode) => {
    const m = c.name.match(/-([a-z]+)$/);
    const i = m ? ENV_ORDER.indexOf(m[1]) : -1;
    return i === -1 ? 99 : i;
  };
  const envs = children.filter(isEnv).sort((a, b) => envRank(a) - envRank(b));

  const sharedW = 190;
  const envW = 560;
  const colGap = 20;

  // left column — tenancy-shared compartments (cream)
  let sy = contentY;
  for (const c of shared) {
    d.add({
      id: `cmp:${c.key}`,
      kind: "compartment",
      label: c.name,
      x: contentX, y: sy, w: sharedW, h: ROW_H,
      style: "compartmentShared",
      parent: "lz",
    });
    sy += ROW_H + 12;
  }

  // right column — workload environments (sage) with their children inside
  const envX = contentX + sharedW + colGap;
  let ey = contentY;
  for (const env of envs) {
    // children grid: 2 columns of boxes
    const kids = env.children;
    const kidW = (envW - 28 - 12) / 2;
    const kidRows = Math.ceil(kids.length / 2);
    // project stubs add extra height inside the projects box
    const projKids = kids.find((k) => /projects$/.test(k.name))?.children ?? [];
    const projExtra = projKids.length > 0 ? 26 : 0;
    const envH = 30 + kidRows * (ROW_H + projExtra + 10) + 8;
    const envPanel = d.add({
      id: `cmp:${env.key}`,
      kind: "compartment",
      label: env.name,
      x: envX, y: ey, w: envW, h: envH,
      style: "compartmentEnv",
      parent: "lz",
    });
    kids.forEach((kid, i) => {
      const kx = envX + 14 + (i % 2) * (kidW + 12);
      const ky = ey + 28 + Math.floor(i / 2) * (ROW_H + projExtra + 10);
      const isProjects = /projects$/.test(kid.name);
      const box = d.add({
        id: `cmp:${kid.key}`,
        kind: "compartment",
        label: kid.name,
        x: kx, y: ky, w: kidW, h: ROW_H + (isProjects ? projExtra : 0),
        style: childStyle(kid.name),
        parent: envPanel.id,
      });
      if (isProjects) {
        kid.children.forEach((proj, j) => {
          d.add({
            id: `cmp:${proj.key}`,
            kind: "compartment",
            label: proj.name,
            x: kx + 10 + j * 118, y: ky + 24, w: 110, h: 24,
            style: "compartmentProject",
            parent: box.id,
          });
        });
      }
    });
    ey += envH + 14;
  }

  // ---- wrappers -----------------------------------------------------------
  const contentBottom = Math.max(sy - 12, ey - 14);
  const lzW = sharedW + colGap + envW + PAD * 2;
  const lzH = contentBottom - contentY + PAD + 26;
  d.nodes.unshift(
    {
      id: "region", kind: "compartment", label: `OCI Region — ${spec.region.id}`,
      x: regionX, y: top, w: lzW + PAD * 4, h: lzH + 26 * 2 + PAD * 2, style: "region",
    } as DiagramNode,
    {
      id: "tenancy", kind: "compartment", label: "OCI Tenancy — Operating Entity", parent: "region",
      x: tenX, y: top + 26, w: lzW + PAD * 2, h: lzH + 26 + PAD * 2, style: "tenancy",
    } as DiagramNode,
    {
      id: "lz", kind: "compartment", label: "cmp-landingzone", parent: "tenancy",
      x: lzX, y: top + 52, w: lzW, h: lzH, style: "landingZone",
    } as DiagramNode,
  );

  // ---- right rail ---------------------------------------------------------
  const railX = regionX + lzW + PAD * 4 + 30;
  const railW = 300;
  let ry = top;

  // Management groups (identity domain) — people icon rows
  const groupRows = gen.groups.map((g) => ({ left: `grp-${g}`, swatch: "people", bold: true }));
  const groupsH = 34 + groupRows.length * 18 + 10;
  d.add({
    id: "groups",
    kind: "group",
    label: "Management Groups — LZ identity domain",
    x: railX, y: ry, w: railW, h: groupsH,
    style: "panel",
    rows: groupRows,
  });
  ry += groupsH + 16;

  d.add({
    id: "policies",
    kind: "group",
    label: `IAM policies — ${gen.policyCount} policy sets`,
    sublabel: "least-privilege per function / environment / project",
    x: railX, y: ry, w: railW, h: 56,
    style: "resourceTile",
  });
  ry += 56 + 16;

  // Security posture — cream shared-services frame with icon tiles
  const posture: { icon: string; label: string; sub: string }[] = [
    { icon: "shield", label: "Cloud Guard", sub: "tenancy-wide target" },
    { icon: "logs", label: `Security Zones — CIS L${spec.cisLevel}`, sub: "recipes on network & env cmps" },
    { icon: "scan", label: "Vulnerability Scanning", sub: "vss-rcph-lz host recipe" },
    ...(spec.cisLevel === 2 ? [{ icon: "key", label: "Vault — CIS L2", sub: "vlt-lz-shared-security" }] : []),
    { icon: "events", label: "Events → Notifications", sub: "security alerting chain" },
  ];
  const postureH = 30 + posture.length * 52 + 8;
  const posturePanel = d.add({
    id: "posture",
    kind: "compartment",
    label: "cmp-lz-security — posture services",
    x: railX, y: ry, w: railW, h: postureH,
    style: "compartmentShared",
  });
  posture.forEach((p, i) => {
    d.add({
      kind: "service",
      label: p.label,
      sublabel: p.sub,
      icon: p.icon,
      x: railX + 12, y: ry + 28 + i * 52, w: railW - 24, h: 44,
      style: "serviceSecurity",
      parent: posturePanel.id,
    });
  });
  ry += postureH + 16;

  addLegend(d, railX, ry, [
    { left: "L0 — OCI TENANCY", swatch: "region" },
    { left: "L1 — LZ ENVIRONMENT", swatch: "landingZone" },
    { left: "L2 — TENANCY SHARED", swatch: "compartmentShared" },
    { left: "L2 — WORKLOAD ENVIRONMENT", swatch: "compartmentEnv" },
    { left: "L3/L4 — PROJECTS", swatch: "compartmentProject" },
    { left: "L3/L4 — PLATFORMS", swatch: "compartmentPlatform" },
  ]);

  return d.finish({ view: "security", title: { th: "มุมมองความปลอดภัย (Security View)", en: "Security View" } });
}
