import type { DiagramDoc, EnvName, SolutionSpec, ViewId } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated } from "../generated-parse";

// IAM Policy Matrix view — who can do what, where.
//   Left rail: the personas/groups actually present in the generated IAM JSON.
//   Body: one route-style card per admin domain mapping group → scope → rights,
//   following the OCI Open LZ segregation-of-duties pattern (tenancy-wide vs
//   shared-service vs environment vs project scope), color-coded per scope.
//   Bottom: least-privilege principles + project security-boundary notes.
// Same visual grammar as the other views: routeCards with header bars, white
// tiles with teal monoline icons, yellow note cards, right-rail legend.

const GROUP_CAP = 12;
const ENV_ROW_CAP = 6;
const PROJECT_ROW_CAP = 6;

const KNOWN_ENVS: EnvName[] = ["prod", "preprod", "staging", "uat", "dev", "test"];

/** Sensible fallback when the generated IAM JSON exposes no groups. */
const DEFAULT_GROUPS = [
  "lz-iam-admin",
  "lz-network-admin",
  "lz-security-admin",
  "lz-prod-admin",
  "lz-auditor",
  "lz-cost-admin",
];

/** routeCard height following the shared idiom: title bar + column header + rows. */
function cardH(rowCount: number): number {
  return 20 + 15 + rowCount * 16 + 6;
}

/** note height: title + rows. */
function noteH(rowCount: number): number {
  return 30 + rowCount * 16 + 8;
}

/** Environments requested for this solution (defensive, never empty). */
function envList(spec: SolutionSpec): EnvName[] {
  const envs = Array.isArray(spec?.environments) ? spec.environments : [];
  return envs.length ? envs : (["prod"] as EnvName[]);
}

/**
 * Per-project admin groups (grp-lz-<env>-<project>-admin) from the generated
 * IAM, falling back to the enterprise plans, then to an illustrative default.
 * Returns [groupName (without grp- prefix), compartment] pairs.
 */
function projectAdminGroups(spec: SolutionSpec, gen: ParsedGenerated): { group: string; cmp: string }[] {
  const out: { group: string; cmp: string }[] = [];
  const seen = new Set<string>();

  for (const g of gen?.groups ?? []) {
    const m = /^lz-([a-z0-9]+)-([a-z0-9-]+)-admin$/.exec(g);
    if (!m) continue;
    const [, env, project] = m;
    if (!(KNOWN_ENVS as string[]).includes(env)) continue; // env-admin groups match a shorter shape
    const cmp = `cmp-lz-${env}-${project}`;
    if (!seen.has(g)) {
      seen.add(g);
      out.push({ group: g, cmp });
    }
  }
  if (out.length) return out;

  // fallback: derive from the enterprise sizing plans (defensively)
  const s = spec?.sizing;
  if (s && s.kind === "enterprise_lz") {
    for (const [env, plan] of Object.entries(s.plans ?? {})) {
      for (const p of plan?.projects ?? []) {
        const name = typeof p?.name === "string" && p.name ? p.name : "project";
        const g = `lz-${env}-${name}-admin`;
        if (!seen.has(g)) {
          seen.add(g);
          out.push({ group: g, cmp: `cmp-lz-${env}-${name}` });
        }
      }
    }
  }
  if (out.length) return out;

  // last resort: one illustrative project per first environment
  const env0 = envList(spec)[0];
  return [{ group: `lz-${env0}-<project>-admin`, cmp: `cmp-lz-${env0}-<project>` }];
}

export function layoutIamMatrixView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  const top = 64;

  d.add({
    kind: "canvasTitle",
    label: "IAM Policy Matrix",
    sublabel: "who can do what, where — group → scope → rights (segregation of duties)",
    x: 24, y: 14, w: 760, h: 40, style: "canvasTitle",
  });

  // ---- left rail: personas / groups from the generated IAM ----------------
  const px = 24;
  const pw = 232;
  const groupsAll = gen?.groups?.length ? gen.groups : DEFAULT_GROUPS;
  const shownGroups = groupsAll.slice(0, GROUP_CAP);
  const extraGroups = groupsAll.length - shownGroups.length;
  const gTileH = 30;
  const gGap = 8;
  const panelH = 36 + shownGroups.length * (gTileH + gGap) + (extraGroups > 0 ? 26 : 0) + 8;
  d.add({
    id: "grp-panel",
    kind: "compartment",
    label: "IAM groups (generated)",
    sublabel: gen?.policyCount ? `${gen.policyCount} policy sets` : undefined,
    x: px, y: top, w: pw, h: panelH,
    style: "compartmentShared",
  });
  shownGroups.forEach((g, i) => {
    d.add({
      id: `pgrp${i}`,
      kind: "persona",
      label: `grp-${g}`,
      icon: "people",
      x: px + 12, y: top + 36 + i * (gTileH + gGap), w: pw - 24, h: gTileH,
      style: "persona",
      parent: "grp-panel",
    });
  });
  if (extraGroups > 0) {
    d.add({
      id: "pgrp-more",
      kind: "note",
      label: `+${extraGroups} more groups (iam.json)`,
      x: px + 12, y: top + 36 + shownGroups.length * (gTileH + gGap), w: pw - 24, h: 22,
      style: "note",
      parent: "grp-panel",
    });
  }

  // ---- body geometry: three scope columns ---------------------------------
  const colW = 270;
  const colGap = 22;
  const ax = px + pw + 34; // tenancy-wide column
  const bx = ax + colW + colGap; // shared-services column
  const cx = bx + colW + colGap; // env / project column
  const railX = cx + colW + 40;
  const gap = 14;

  // ---- column A: tenancy-wide grants --------------------------------------
  const iamRows = [
    { left: "tenancy", right: "manage IAM groups/policies", bold: true },
    { left: "tenancy", right: "no security bypass" },
  ];
  const audRows = [
    { left: "tenancy", right: "inspect all-resources", bold: true },
    { left: "tenancy", right: "read audit-events" },
  ];
  const costRows = [
    { left: "tenancy", right: "manage budgets", bold: true },
    { left: "tenancy", right: "read usage-reports" },
  ];
  const aCards = [
    { id: "card-iam", label: "grp-lz-iam-admin", rows: iamRows },
    { id: "card-aud", label: "grp-lz-auditor (read-only)", rows: audRows },
    { id: "card-cost", label: "grp-lz-cost-admin", rows: costRows },
  ];
  let aY = top + 30;
  const zoneAH =
    30 + aCards.reduce((h, c) => h + cardH(c.rows.length) + gap, 0) + 2;
  d.add({
    id: "zone-a",
    kind: "zone",
    label: "TENANCY-WIDE",
    x: ax, y: top, w: colW, h: zoneAH,
    style: "zone",
  });
  for (const c of aCards) {
    d.add({
      id: c.id,
      kind: "routeCard",
      label: c.label,
      x: ax + 12, y: aY, w: colW - 24, h: cardH(c.rows.length),
      style: "routeCardHub",
      colHeaders: ["Scope", "Rights"],
      rows: c.rows,
      parent: "zone-a",
    });
    aY += cardH(c.rows.length) + gap;
  }

  // ---- column B: shared-service grants ------------------------------------
  const netRows = [
    { left: "cmp-lz-network", right: "manage vcn/drg/firewall", bold: true },
    { left: "cmp-lz-network", right: "manage lb & dns" },
  ];
  const secRows = [
    { left: "cmp-lz-security", right: "manage vaults & keys", bold: true },
    { left: "cmp-lz-security", right: "manage cloud-guard/zones" },
  ];
  const bCards = [
    { id: "card-net", label: "grp-lz-network-admin", rows: netRows },
    { id: "card-sec", label: "grp-lz-security-admin", rows: secRows },
  ];
  let bY = top + 30;
  const zoneBH =
    30 + bCards.reduce((h, c) => h + cardH(c.rows.length) + gap, 0) + 2;
  d.add({
    id: "zone-b",
    kind: "zone",
    label: "SHARED SERVICES",
    x: bx, y: top, w: colW, h: zoneBH,
    style: "zone",
  });
  for (const c of bCards) {
    d.add({
      id: c.id,
      kind: "routeCard",
      label: c.label,
      x: bx + 12, y: bY, w: colW - 24, h: cardH(c.rows.length),
      style: "routeCardSpoke",
      colHeaders: ["Scope", "Rights"],
      rows: c.rows,
      parent: "zone-b",
    });
    bY += cardH(c.rows.length) + gap;
  }

  // ---- column C: environment + project grants -----------------------------
  const envs = envList(spec);
  const envShown = envs.slice(0, ENV_ROW_CAP);
  const envRows = envShown.map((e, i) => ({
    left: `cmp-lz-${e}`,
    right: "manage env resources",
    bold: i === 0,
  }));
  if (envs.length > ENV_ROW_CAP) {
    envRows.push({ left: `+${envs.length - ENV_ROW_CAP} more envs`, right: "same pattern", bold: false });
  }

  const projects = projectAdminGroups(spec, gen);
  const projShown = projects.slice(0, PROJECT_ROW_CAP);
  const projRows = projShown.map((p) => ({
    left: `grp-${p.group}`,
    right: p.cmp,
    bold: false,
  }));
  if (projects.length > PROJECT_ROW_CAP) {
    projRows.push({
      left: `+${projects.length - PROJECT_ROW_CAP} more projects`,
      right: "own cmp only",
      bold: false,
    });
  }

  let cY = top + 30;
  const zoneCH = 30 + cardH(envRows.length) + gap + cardH(projRows.length) + gap + 2;
  d.add({
    id: "zone-c",
    kind: "zone",
    label: "ENVIRONMENT & PROJECT",
    x: cx, y: top, w: colW, h: zoneCH,
    style: "zone",
  });
  d.add({
    id: "card-env",
    kind: "routeCard",
    label: "grp-lz-<env>-admin (per env)",
    x: cx + 12, y: cY, w: colW - 24, h: cardH(envRows.length),
    style: "stackCard",
    colHeaders: ["Scope", "Rights"],
    rows: envRows,
    parent: "zone-c",
  });
  cY += cardH(envRows.length) + gap;
  d.add({
    id: "card-proj",
    kind: "routeCard",
    label: "project admins → own compartment",
    x: cx + 12, y: cY, w: colW - 24, h: cardH(projRows.length),
    style: "routeCardDrg",
    colHeaders: ["Group", "Scope"],
    rows: projRows,
    parent: "zone-c",
  });

  // ---- leader edges: groups panel → scope columns -------------------------
  d.edge({ from: "grp-panel", to: "zone-a", kind: "leader", label: "tenancy policies" });
  d.edge({ from: "grp-panel", to: "zone-b", kind: "leader", label: "shared-service policies" });
  d.edge({ from: "grp-panel", to: "zone-c", kind: "leader", label: "env / project policies" });

  // ---- bottom notes: least-privilege principles + security boundary -------
  const notesY = top + Math.max(zoneAH, zoneBH, zoneCH) + 26;
  const lpRows = [
    { left: "Deny-by-default — nothing is allowed without an explicit policy", bold: true },
    { left: "Grants are group-based only — no user-level policy statements" },
    {
      left: gen?.policyCount
        ? `${gen.policyCount} generated least-privilege policy sets (iam.json)`
        : "Least-privilege policy sets generated per compartment",
    },
    { left: "Break-glass account kept separate — excluded from federation, monitored" },
  ];
  d.add({
    id: "note-lp",
    kind: "note",
    label: "Least-privilege principles",
    x: ax, y: notesY, w: colW * 2 + colGap, h: noteH(lpRows.length),
    style: "note",
    rows: lpRows,
  });
  d.add({
    id: "note-boundary",
    kind: "note",
    label: "Security boundary",
    x: cx, y: notesY, w: colW, h: noteH(2),
    style: "note",
    rows: [
      { left: "Admins of one project cannot see another", bold: true },
      { left: "project — compartment + NSG isolation." },
    ],
  });
  d.edge({ from: "note-boundary", to: "card-proj", kind: "leader" });

  // ---- legend (right rail) ------------------------------------------------
  addLegend(d, railX, top, [
    { left: "TENANCY-WIDE", swatch: "routeCardHub" },
    { left: "SHARED-SERVICE SCOPE", swatch: "routeCardSpoke" },
    { left: "ENV SCOPE", swatch: "stackCard" },
    { left: "PROJECT SCOPE", swatch: "routeCardDrg" },
  ]);

  return d.finish({
    view: "iam" as ViewId,
    title: {
      th: "ตารางสิทธิ์ IAM (IAM Policy Matrix)",
      en: "IAM Policy Matrix",
    },
  });
}
