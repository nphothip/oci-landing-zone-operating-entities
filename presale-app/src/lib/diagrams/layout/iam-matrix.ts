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

/**
 * Fallback when the generated IAM JSON exposes no groups. Names follow the
 * generator's own conventions (gen/naming.libsonnet + gen/builders/iam/
 * identity_domains.libsonnet): tenancy-scoped groups carry no "lz-" segment,
 * landing-zone-scoped groups do. These six are always generated.
 */
const DEFAULT_GROUPS = [
  "auditors-admin",
  "cost-admin",
  "iam-admin",
  "lz-network-admin",
  "lz-security-admin",
  "security-admin",
];

/** Group names present in the generated IAM (lower-case, no "grp-" prefix). */
function knownGroups(gen: ParsedGenerated): Set<string> {
  return new Set((gen?.groups ?? []).filter((g) => typeof g === "string"));
}

/**
 * Card title for a group. Names are the generator's, so they always match the
 * left rail; if a generated IAM is present but does not contain the group, the
 * card is flagged rather than asserting a persona the IaC never creates.
 */
function groupTitle(known: Set<string>, name: string, note?: string): string {
  const base = note ? `grp-${name} ${note}` : `grp-${name}`;
  return known.size === 0 || known.has(name) ? base : `${base} — illustrative`;
}

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
    if (!(KNOWN_ENVS as string[]).includes(env)) continue; // shared groups (lz-network-admin) never match
    // OKE platform RBAC groups (grp-lz-<env>-<plat>-rbac-admin) share the shape
    // but are scoped to the platform compartment, not a project compartment.
    if (/(^|-)rbac$/.test(project)) continue;
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
  // Tenancy-scoped groups are named without the "lz-" segment by the generator
  // (grp-iam-admin, grp-auditors-admin, grp-cost-admin, grp-security-admin) —
  // the same names the left rail renders from gen.groups.
  const known = knownGroups(gen);
  const iamRows = [
    { left: "tenancy", right: "manage IAM groups/policies", bold: true },
    { left: "tenancy", right: "no security bypass" },
  ];
  const secTenRows = [
    { left: "tenancy", right: "manage cloud-guard-family", bold: true },
    { left: "tenancy", right: "manage cloudevents-rules" },
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
    { id: "card-iam", label: groupTitle(known, "iam-admin"), rows: iamRows },
    { id: "card-sec-ten", label: groupTitle(known, "security-admin"), rows: secTenRows },
    { id: "card-aud", label: groupTitle(known, "auditors-admin", "(read-only)"), rows: audRows },
    { id: "card-cost", label: groupTitle(known, "cost-admin"), rows: costRows },
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
  // Cloud Guard is NOT granted here: 'manage cloud-guard-family in tenancy'
  // belongs to the tenancy group grp-security-admin (column A). The landing-zone
  // security group gets manage security-zone / logging-family, tag-scoped.
  const secRows = [
    { left: "cmp-lz-security", right: "manage vaults & keys", bold: true },
    { left: "cmp-lz-security", right: "manage security-zone & logs" },
  ];
  const bCards = [
    { id: "card-net", label: groupTitle(known, "lz-network-admin"), rows: netRows },
    { id: "card-sec", label: groupTitle(known, "lz-security-admin"), rows: secRows },
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
  // The generator creates no per-environment admin group: every environment's
  // network and security compartments are tagged lz-network-admin /
  // lz-security-admin and administered by the shared landing-zone groups, while
  // the only env-keyed principals are the per-project admin groups below.
  const envs = envList(spec);
  const envShown = envs.slice(0, ENV_ROW_CAP);
  const envRows = envShown.flatMap((e, i) => [
    { left: `cmp-lz-${e}-network`, right: "grp-lz-network-admin", bold: i === 0 },
    { left: `cmp-lz-${e}-security`, right: "grp-lz-security-admin", bold: false },
  ]);
  if (envs.length > ENV_ROW_CAP) {
    envRows.push({ left: `+${envs.length - ENV_ROW_CAP} more envs`, right: "same pattern", bold: false });
  }
  envRows.push({ left: "no per-env admin group", right: "project scope only", bold: false });

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
    label: "env compartments — shared LZ admins",
    x: cx + 12, y: cY, w: colW - 24, h: cardH(envRows.length),
    style: "stackCard",
    colHeaders: ["Scope (tag-scoped)", "Rights held by"],
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
  // Unlabelled on purpose: these run the width of the canvas, so a caption
  // lands at the midpoint — inside the tenancy column, on top of its policy
  // rows. Each column already carries the same words in its own header.
  d.edge({ from: "grp-panel", to: "zone-a", kind: "leader" });
  d.edge({ from: "grp-panel", to: "zone-b", kind: "leader" });
  d.edge({ from: "grp-panel", to: "zone-c", kind: "leader" });

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
