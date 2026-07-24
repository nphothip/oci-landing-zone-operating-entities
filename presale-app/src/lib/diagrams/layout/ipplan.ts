import type { DiagramDoc, EnvName, HubKind, SolutionSpec } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated, VcnInfo } from "../generated-parse";
import { HUB_VCN, envBlocks, OKE_SERVICES_CIDR, hubMgmtSubnet, orderEnvs } from "@/lib/domain/cidr";

// IP Address Plan View — the network team's CIDR allocation map, rendered as
// routeCard tables in a 3-column masonry plus a right rail (legend, reserved
// space, allocation rules). Real CIDRs/subnet names come from the generated
// network JSON (gen.vcns) when available; otherwise everything is computed
// from the deterministic lane plan in lib/domain/cidr.ts:
//   hub 10.0.0.0/21 · per-env spoke /21 · per-env platform (OKE) /20.

const ALL_ENVS: EnvName[] = ["prod", "preprod", "staging", "uat", "dev", "test"];

/** OKE pods CIDR (cluster-internal, non-routed — pairs with OKE_SERVICES_CIDR). */
const OKE_PODS_CIDR = "10.244.0.0/16";

// Hub auto-subnet carve: consecutive /24s from the hub VCN in a fixed per-hub
// order (gen/config.libsonnet; see hubMgmtSubnet comments in lib/domain/cidr.ts).
// hub_c skips .4, so each entry carries its explicit third-octet index.
const HUB_SUBNET_PLAN: Record<HubKind, { name: string; idx: number }[]> = {
  hub_a: [
    { name: "fw-dmz", idx: 0 },
    { name: "lb", idx: 1 },
    { name: "fw-int", idx: 2 },
    { name: "mgmt", idx: 3 },
    { name: "mon", idx: 4 },
    { name: "dns", idx: 5 },
  ],
  hub_b: [
    { name: "lb", idx: 0 },
    { name: "fw", idx: 1 },
    { name: "mgmt", idx: 2 },
    { name: "mon", idx: 3 },
    { name: "dns", idx: 4 },
  ],
  hub_e: [
    { name: "lb", idx: 0 },
    { name: "mgmt", idx: 1 },
    { name: "mon", idx: 2 },
    { name: "dns", idx: 3 },
  ],
  hub_c: [
    { name: "untrust", idx: 0 },
    { name: "trust", idx: 1 },
    { name: "lb", idx: 2 },
    { name: "mgmt", idx: 3 },
    { name: "dns", idx: 5 },
  ],
};

/** Spoke auto-subnet tiers: consecutive /24s from the spoke /21 start. */
const SPOKE_TIERS = ["web", "app", "db", "infra"] as const;

type Row = { left: string; right?: string; swatch?: string; bold?: boolean };

/** "10.0.64.0/21" + offset 2 -> "10.0.66.0/24" (defensive: bad input echoes back). */
function slash24(base: string, offset: number): string {
  const m = /^(\d+)\.(\d+)\.(\d+)\.\d+\/\d+$/.exec(base);
  if (!m) return base;
  const third = Number(m[3]) + offset;
  if (!Number.isFinite(third) || third > 255) return base;
  return `${m[1]}.${m[2]}.${third}.0/24`;
}

/** Word-boundary env match so "prod" does not match "preprod". */
function mentionsEnv(v: VcnInfo, env: EnvName): boolean {
  const hay = `${v.category} ${v.name} ${v.key}`.toLowerCase();
  return new RegExp(`(^|[^a-z])${env}([^a-z]|$)`).test(hay);
}

function isPlatformVcn(v: VcnInfo): boolean {
  return /platform|oke/i.test(`${v.category} ${v.name} ${v.key}`);
}

function isHubVcn(v: VcnInfo): boolean {
  return /hub/i.test(`${v.category} ${v.name} ${v.key}`);
}

export function layoutIpPlanView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  const vcns: VcnInfo[] = Array.isArray(gen?.vcns) ? gen.vcns : [];
  const hubKind: HubKind = spec?.hub?.kind ?? "hub_a";
  const sizing = spec?.sizing;
  const plans = sizing?.kind === "enterprise_lz" ? sizing.plans ?? {} : undefined;

  const selected = orderEnvs(Array.isArray(spec?.environments) ? spec.environments : []);
  const envs: EnvName[] = selected.length ? selected : ["prod"];

  d.add({
    kind: "canvasTitle",
    label: "IP Address Plan",
    sublabel: "CIDR allocation — hub /21 · env spoke /21 · platform (OKE) /20 · cluster-internal ranges",
    x: 24, y: 14, w: 760, h: 40, style: "canvasTitle",
  });

  // ---- masonry geometry (3 card columns + right rail) ----------------------
  const top = 64;
  const cardW = 300;
  const colX = [24, 348, 672];
  const colY = [top, top, top];
  const GAP = 18;
  const railX = 996;
  const railW = 230;

  /** Height idiom shared with the network view's route cards. */
  const cardH = (rows: number) => 20 + 15 + rows * 16 + 6;

  const putCard = (opts: {
    id: string;
    title: string;
    style: string;
    colHeaders: [string, string];
    rows: Row[];
    forceCol?: number;
  }): void => {
    let c = opts.forceCol ?? 0;
    if (opts.forceCol === undefined) {
      for (let i = 1; i < colY.length; i++) if (colY[i] < colY[c]) c = i;
    }
    const h = cardH(opts.rows.length);
    d.add({
      id: opts.id,
      kind: "routeCard",
      label: opts.title,
      x: colX[c], y: colY[c], w: cardW, h,
      style: opts.style,
      colHeaders: opts.colHeaders,
      rows: opts.rows,
    });
    colY[c] += h + GAP;
  };

  // ---- (1) hub VCN card ----------------------------------------------------
  const hubVcn = vcns.find((v) => isHubVcn(v));
  const hubCidr = hubVcn?.cidr || HUB_VCN;
  const hubPlan = HUB_SUBNET_PLAN[hubKind] ?? HUB_SUBNET_PLAN.hub_a;
  const hubRows: Row[] =
    hubVcn && hubVcn.subnets.length
      ? hubVcn.subnets.slice(0, 8).map((s) => ({ left: s.name || s.key, right: s.cidr || "—" }))
      : hubPlan.map((s) => ({ left: `sub-lz-hub-${s.name}`, right: slash24(hubCidr, s.idx) }));
  putCard({
    id: "card-hub",
    title: `vcn-lz-hub (${hubKind}) — ${hubCidr}`,
    style: "routeCardHub",
    colHeaders: ["Subnet (/24)", "CIDR"],
    rows: hubRows,
    forceCol: 0,
  });

  // ---- (3) cluster-internal card (kept next to the hub in column 0) --------
  putCard({
    id: "card-cluster",
    title: "OKE cluster-internal (non-routed)",
    style: "routeCardDrg",
    colHeaders: ["Range", "CIDR"],
    rows: [
      { left: "Kubernetes services", right: OKE_SERVICES_CIDR },
      { left: "Pods (VCN-native alt.)", right: OKE_PODS_CIDR },
      { left: "never routed — may overlap other tenancies" },
    ],
    forceCol: 0,
  });

  // ---- (2) one card per selected environment -------------------------------
  let firstOkeEnvCard: string | null = null;
  for (const env of envs) {
    const lane = envBlocks(env);
    const spokeVcn = vcns.find((v) => mentionsEnv(v, env) && !isPlatformVcn(v) && !isHubVcn(v));
    const platVcn = vcns.find((v) => mentionsEnv(v, env) && isPlatformVcn(v));
    const spokeCidr = spokeVcn?.cidr || lane.spoke;
    const platCidr = platVcn?.cidr || lane.platform;

    // OKE on this env? enterprise: per-plan flag; else template-wide or generated.
    const okeOn =
      plans !== undefined
        ? Boolean(plans[env]?.oke)
        : sizing?.kind === "oke_platform" ||
          (sizing?.kind === "chatbot" && sizing.runtime === "oke") ||
          Boolean(platVcn);

    const rows: Row[] =
      spokeVcn && spokeVcn.subnets.length
        ? spokeVcn.subnets.slice(0, 7).map((s) => ({ left: s.name || s.key, right: s.cidr || "—" }))
        : SPOKE_TIERS.map((tier, i) => ({ left: `sub-lz-${env}-${tier}`, right: slash24(spokeCidr, i) }));
    if (spokeVcn && spokeVcn.subnets.length > 7) {
      rows.push({ left: `+${spokeVcn.subnets.length - 7} more subnets` });
    }
    rows.push({
      left: okeOn ? "platform VCN — OKE" : "platform VCN — OKE only when enabled",
      right: platCidr,
      bold: okeOn,
    });

    const id = `card-env-${env}`;
    putCard({
      id,
      title: `${spokeVcn?.name || `vcn-lz-${env}`} — ${spokeCidr}`,
      style: "routeCardSpoke",
      colHeaders: ["Subnet", "CIDR"],
      rows,
    });
    if (okeOn && !firstOkeEnvCard) firstOkeEnvCard = id;
  }

  // annotation: cluster-internal ranges live inside the OKE platform clusters
  if (firstOkeEnvCard) {
    d.edge({ from: "card-cluster", to: firstOkeEnvCard, kind: "leader", label: "inside OKE clusters" });
  }

  // ---- right rail: legend --------------------------------------------------
  const legend = addLegend(d, railX, top, [
    { left: "ALLOCATED — HUB", swatch: "routeCardHub" },
    { left: "ALLOCATED — ENV SPOKE", swatch: "routeCardSpoke" },
    { left: "PLATFORM /20 (OKE)", swatch: "compartmentPlatform" },
    { left: "CLUSTER-INTERNAL", swatch: "routeCardDrg" },
    { left: "RESERVED / EXPANSION", swatch: "resourceTile" },
  ]);

  // ---- (4) reserved / expansion card ---------------------------------------
  const unused = ALL_ENVS.filter((e) => !envs.includes(e));
  const reservedRows: Row[] = unused.length
    ? unused.flatMap((e) => {
        const lane = envBlocks(e);
        return [
          { left: `${e} spoke`, right: lane.spoke },
          { left: `${e} platform`, right: lane.platform },
        ];
      })
    : [{ left: "all lanes allocated — extend at 10.2.0.0/16+" }];
  const reservedY = legend.y + legend.h + 20;
  const reservedH = cardH(reservedRows.length);
  d.add({
    id: "card-reserved",
    kind: "routeCard",
    label: "Reserved — future expansion lanes",
    x: railX, y: reservedY, w: railW, h: reservedH,
    style: "stackCard",
    colHeaders: ["Lane", "CIDR"],
    rows: reservedRows,
  });

  // ---- (5) allocation rules card -------------------------------------------
  const ruleRows: Row[] = [
    { left: "No overlap: hub + spokes + platforms", bold: true },
    { left: "Platform VCN must be exactly /20" },
    { left: "Spoke VCN ≥ /22" },
    { left: `OKE API allowed from mgmt ${hubMgmtSubnet(hubKind)}` },
  ];
  d.add({
    id: "card-rules",
    kind: "note",
    label: "Allocation rules",
    sublabel: "กติกาการจัดสรร CIDR",
    x: railX, y: reservedY + reservedH + 20, w: railW, h: 40 + ruleRows.length * 17 + 8,
    style: "note",
    rows: ruleRows,
  });

  return d.finish({
    view: "ipplan",
    title: { th: "แผนผังการจัดสรร IP (IP Address Plan)", en: "IP Address Plan" },
  });
}
