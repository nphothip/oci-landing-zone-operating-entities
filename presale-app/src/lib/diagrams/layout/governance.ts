import type { DiagramDoc, DiagramNode, EnvName, SolutionSpec } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { CompartmentNode, ParsedGenerated } from "../generated-parse";

// Governance View — compartment security posture. The same L2 compartment
// hierarchy as the Security View (OCI Region ▸ dashed OCI Tenancy ▸
// red-bordered cmp-landingzone ▸ cream tenancy-shared column + sage workload
// environments), annotated with the posture that protects each scope:
//  - a magenta tenancy-wide controls card (Cloud Guard, VSS, budgets+tags,
//    CIS recipe) leadered to the tenancy frame,
//  - a green Security Zone target card per TARGETED environment only
//    (enterprise_lz: sizing.securityTargetEnvs, empty = all; other templates:
//    every environment gets a target),
//  - a Vault card when the spec is CIS Level 2.

const ROW_H = 38;
const PAD = 14;
const ENV_ORDER: EnvName[] = ["prod", "preprod", "staging", "uat", "dev", "test"];

function envOf(name: string): EnvName | null {
  const m = name.match(/-(prod|preprod|staging|uat|dev|test)$/);
  return m ? (m[1] as EnvName) : null;
}

function childStyle(name: string): string {
  if (/platform/.test(name)) return "compartmentPlatform";
  if (/projects$/.test(name)) return "compartmentProjects";
  return "compartmentShared";
}

/** Synthetic compartment tree used when the generated iam.json is absent —
 *  mirrors the generator's canonical naming so the view never renders empty. */
function fallbackTree(spec: SolutionSpec): CompartmentNode {
  const envNames: EnvName[] = (spec.environments.length ? spec.environments : (["prod"] as EnvName[]))
    .slice()
    .sort((a, b) => ENV_ORDER.indexOf(a) - ENV_ORDER.indexOf(b));
  const projectsOf = (env: EnvName): CompartmentNode[] => {
    if (spec.sizing.kind === "enterprise_lz") {
      const plan = spec.sizing.plans[env];
      const names = (plan?.projects ?? []).map((p) => p.name).filter(Boolean);
      if (names.length) {
        return names.map((n) => ({ key: `fb-${env}-${n}`, name: `cmp-lz-${env}-${n}`, children: [] }));
      }
    }
    return [{ key: `fb-${env}-project1`, name: `cmp-lz-${env}-project1`, children: [] }];
  };
  return {
    key: "fb-root",
    name: "cmp-landingzone",
    children: [
      { key: "fb-network", name: "cmp-lz-network", children: [] },
      { key: "fb-security", name: "cmp-lz-security", children: [] },
      { key: "fb-platform", name: "cmp-lz-shared-platform", children: [] },
      ...envNames.map((env) => ({
        key: `fb-env-${env}`,
        name: `cmp-lz-${env}`,
        children: [
          { key: `fb-${env}-network`, name: `cmp-lz-${env}-network`, children: [] },
          { key: `fb-${env}-projects`, name: `cmp-lz-${env}-projects`, children: projectsOf(env) },
        ],
      })),
    ],
  };
}

export function layoutGovernanceView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: "Governance View",
    sublabel: `compartment security posture · scope of each control — CIS Level ${spec.cisLevel}`,
    x: 24, y: 14, w: 720, h: 40, style: "canvasTitle",
  });

  // ---- pick the compartment tree (generated, else synthesized) ------------
  const isEnv = (c: CompartmentNode) => envOf(c.name) !== null;
  let root = gen.compartmentRoot && gen.compartmentRoot.children.length ? gen.compartmentRoot : fallbackTree(spec);
  if (!root.children.some(isEnv)) root = fallbackTree(spec);

  const children = root.children;
  const shared = children.filter((c) => !isEnv(c));
  const envRank = (c: CompartmentNode) => {
    const e = envOf(c.name);
    const i = e ? ENV_ORDER.indexOf(e) : -1;
    return i === -1 ? 99 : i;
  };
  const envs = children.filter(isEnv).sort((a, b) => envRank(a) - envRank(b));

  // ---- which environments carry a Security Zone target --------------------
  const allEnvNames = envs.map((c) => envOf(c.name)).filter((e): e is EnvName => e !== null);
  let targets: EnvName[];
  if (spec.sizing.kind === "enterprise_lz") {
    const raw = (spec.sizing.securityTargetEnvs ?? []).filter((e) => allEnvNames.includes(e));
    targets = raw.length ? raw : allEnvNames;
  } else {
    targets = allEnvNames; // SME templates: every environment is targeted
  }

  // ---- geometry (same frame arithmetic as the Security View) --------------
  const top = 64;
  const regionX = 24;
  const tenX = regionX + PAD;
  const lzX = tenX + PAD;
  const contentX = lzX + PAD;
  const contentY = top + 26 * 3 + 6;

  const sharedW = 180;
  const envW = 520;
  const colGap = 20;

  // left column — tenancy-shared compartments (cream)
  let sy = contentY;
  let securityCmpId: string | null = null;
  for (const c of shared) {
    const n = d.add({
      id: `cmp:${c.key}`,
      kind: "compartment",
      label: c.name,
      x: contentX, y: sy, w: sharedW, h: ROW_H,
      style: "compartmentShared",
      parent: "lz",
    });
    if (/security/.test(c.name)) securityCmpId = n.id;
    sy += ROW_H + 12;
  }

  // right column — workload environments (sage) with children inside
  const envX = contentX + sharedW + colGap;
  let ey = contentY;
  const envPanels: { env: EnvName | null; id: string; y: number; h: number }[] = [];
  for (const env of envs) {
    const kids = env.children;
    const kidW = (envW - 28 - 12) / 2;
    const kidRows = Math.max(1, Math.ceil(kids.length / 2));
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
    envPanels.push({ env: envOf(env.name), id: envPanel.id, y: ey, h: envH });
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
        kid.children.slice(0, 2).forEach((proj, j) => {
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

  // ---- wrappers (Region ▸ Tenancy ▸ cmp-landingzone) ----------------------
  const contentBottom = Math.max(sy - 12, ey - 14, contentY + ROW_H);
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
      id: "lz", kind: "compartment", label: root.name || "cmp-landingzone", parent: "tenancy",
      x: lzX, y: top + 52, w: lzW, h: lzH, style: "landingZone",
    } as DiagramNode,
  );

  // ---- right rail: posture cards with leader lines ------------------------
  const railX = regionX + lzW + PAD * 4 + 30;
  const railW = 300;
  let ry = top;

  // 1) tenancy-wide controls (magenta) → leader to the tenancy frame
  const tenancyRows = [
    { left: "Cloud Guard", right: "cg-tgt-root" },
    { left: "Vulnerability Scanning", right: "vss-rcph-lz" },
    { left: "Budgets + cost tags", right: "governance.json" },
    { left: `CIS L${spec.cisLevel} recipe`, right: spec.cisLevel === 2 ? "L1 + L2 controls" : "L1 controls" },
  ];
  const tenH = 20 + 15 + tenancyRows.length * 16 + 6;
  d.add({
    id: "gov-tenancy-card",
    kind: "routeCard",
    label: "Tenancy-wide controls (ควบคุมทั้ง tenancy)",
    x: railX, y: ry, w: railW, h: tenH,
    style: "routeCardHub",
    colHeaders: ["Control", "Scope / resource"],
    rows: tenancyRows,
  });
  d.edge({ from: "gov-tenancy-card", to: "tenancy", kind: "leader" });
  ry += tenH + 18;

  // 2) Security Zone target cards — only the targeted environments
  for (const p of envPanels) {
    if (!p.env || !targets.includes(p.env)) continue;
    const rows = [
      { left: "recipe", right: `CIS L${spec.cisLevel} security zone` },
      { left: "enforced on", right: `cmp-lz-${p.env}` },
    ];
    const h = 20 + 15 + rows.length * 16 + 6;
    const y = Math.max(ry, p.y); // sit next to its environment when possible
    const id = `gov-sz-${p.env}`;
    d.add({
      id,
      kind: "routeCard",
      label: `Security Zone — ${p.env}`,
      x: railX, y, w: railW, h,
      style: "routeCardSpoke",
      rows,
    });
    d.edge({ from: id, to: p.id, kind: "leader" });
    ry = y + h + 18;
  }

  // 3) Vault card — CIS Level 2 only
  if (spec.cisLevel === 2) {
    d.add({
      id: "gov-vault",
      kind: "service",
      label: "Vault — customer-managed keys",
      sublabel: "vlt-lz-shared-security · CIS L2 (เข้ารหัสด้วยคีย์ลูกค้า)",
      icon: "key",
      x: railX, y: ry, w: railW, h: 52,
      style: "serviceSecurity",
    });
    d.edge({ from: "gov-vault", to: securityCmpId ?? "lz", kind: "leader" });
    ry += 52 + 18;
  }

  addLegend(d, railX, ry, [
    { left: "COMPARTMENT (SCOPE)", swatch: "compartmentEnv" },
    { left: "SECURITY ZONE TARGET", swatch: "routeCardSpoke" },
    { left: "TENANCY-WIDE CONTROL", swatch: "routeCardHub" },
  ]);

  return d.finish({
    view: "governance",
    title: { th: "มุมมองธรรมาภิบาล (Governance View)", en: "Governance View" },
  });
}
