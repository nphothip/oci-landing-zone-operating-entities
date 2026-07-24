import type {
  Connectivity,
  DiagramDoc,
  EnterpriseEnvPlan,
  EnterpriseLzSizing,
  EnvName,
  SolutionSpec,
} from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated } from "../generated-parse";
import { orderEnvs } from "@/lib/domain/cidr";
import { defaultEnvPlan, enterpriseHasOke } from "@/lib/templates/enterprise-lz";

// Resilience / High-Availability View — one region box with an Availability
// Domain split into the three Fault Domain columns.
//
// Two things this view must never overstate, because the generated LZ does not
// implement them:
//   1. Fault-domain placement. `grep -r fault_domain gen/` matches nothing
//      outside the OCVS extension, so the LZ pins NO component to an FD. The FD
//      columns are therefore the RECOMMENDED anti-affinity target for
//      customer-deployed compute, labelled as guidance, not as-built.
//   2. Hub appliance redundancy. hub_a ships a DMZ firewall and an Internal
//      firewall with different policies on different subnets (gen/hub/hub_a.libsonnet)
//      and hub_c ships a trust NLB and an untrust NLB (gen/hub/hub_c.libsonnet) —
//      role-split path elements, not interchangeable HA pairs. They are managed
//      regional services, so they sit in a tier band above the FD columns.
// Below the region: connectivity redundancy and an OCI SLA reference card.
// Same visual language as the operations/logging views.

interface Tile {
  id: string;
  label: string;
  sub?: string;
  icon?: string;
  style: string;
}

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/**
 * Environment whose plan drives the enterprise_lz compute tier, plus the plan
 * that is actually priced for it. templates/enterprise-lz.ts fills a missing
 * plan with defaultEnvPlan(env), so the diagram must do the same — and it must
 * caption the tier with the environment it really read (never "prod" when prod
 * has no plan and another env was used).
 */
function enterpriseTier(
  spec: SolutionSpec,
  s: EnterpriseLzSizing,
): { env: EnvName; plan: EnterpriseEnvPlan } {
  const plans = s.plans ?? {};
  const envs = orderEnvs(spec.environments ?? []);
  const env: EnvName =
    envs.find((e) => e === "prod") ??
    envs[0] ??
    (Object.keys(plans)[0] as EnvName | undefined) ??
    "prod";
  return { env, plan: plans[env] ?? defaultEnvPlan(env) };
}

/** Prod-tier VM fleet for every template (defensive on sizing). */
function vmTier(spec: SolutionSpec): { count: number; name: string; sub: string } {
  const s = spec.sizing as SolutionSpec["sizing"] | undefined;
  switch (s?.kind) {
    case "web_app":
      return {
        count: Math.max(num(s.appVmCount), s.ha ? 2 : 0),
        name: "App VM",
        sub: `${num(s.ocpusPerVm) || "?"} OCPU · E5.Flex`,
      };
    case "chatbot":
      return s.runtime === "vm"
        ? { count: num(s.appVmCount), name: "Bot VM", sub: `${num(s.ocpusPerVm) || "?"} OCPU · E5.Flex` }
        : { count: 0, name: "App VM", sub: "" };
    case "dr": {
      // templates/dr.ts runs (and bills) ceil(protectedVmCount / 2) VMs for
      // warm_standby and none for pilot light — the view follows the BOM.
      const total = num(s.protectedVmCount);
      const running = Math.ceil(total / 2);
      return s.mode === "warm_standby"
        ? { count: running, name: "Standby VM", sub: `warm standby running · ${running} of ${total}` }
        : { count: total, name: "Standby VM", sub: "pilot light (stopped)" };
    }
    case "erp":
      return {
        count: num(s.appVmCount),
        name: "ERP app VM",
        sub: `${num(s.ocpusPerVm) || "?"} OCPU · ${s.os === "windows" ? "Windows" : "Linux"}`,
      };
    case "migration":
      return { count: num(s.vmCount), name: "Migrated VM", sub: `${num(s.avgOcpusPerVm) || "?"} OCPU avg` };
    case "devtest":
      return { count: num(s.vmPerEnv), name: "Dev/Test VM", sub: "scheduled start/stop" };
    case "ecommerce":
      return { count: num(s.appVmCount), name: "Shop app VM", sub: `${num(s.ocpusPerVm) || "?"} OCPU · E5.Flex` };
    case "fileserver":
      return { count: num(s.gatewayVmCount), name: "Gateway VM", sub: "SMB/NFS gateway" };
    case "vdi":
      return { count: num(s.appVmCount), name: "Broker/app VM", sub: "VDI infrastructure" };
    case "streaming":
      return { count: num(s.consumerVmCount), name: "Consumer VM", sub: `${num(s.consumerOcpus) || "?"} OCPU` };
    case "enterprise_lz": {
      const { env, plan } = enterpriseTier(spec, s);
      const projects = (plan.projects ?? []).filter((p) => Boolean(p));
      const count = projects.reduce((a, p) => a + num(p.vmCount), 0);
      return { count, name: "App VM", sub: `${env} · ${projects.length} project(s)` };
    }
    default:
      return { count: 0, name: "App VM", sub: "" };
  }
}

/** OKE worker count when the solution runs OKE (0 otherwise). */
function okeWorkers(spec: SolutionSpec): number {
  const s = spec.sizing as SolutionSpec["sizing"] | undefined;
  if (!s) return 0;
  if (s.kind === "oke_platform") return num(s.workerCount);
  if (s.kind === "chatbot" && s.runtime === "oke") return num(s.okeWorkerCount);
  if (s.kind === "enterprise_lz") {
    const { plan } = enterpriseTier(spec, s);
    return plan.oke ? num(plan.okeWorkerCount) || 3 : 0;
  }
  return 0;
}

/** DB tier HA posture rows (ADB managed HA and/or Base DB Data Guard note). */
function dbTier(spec: SolutionSpec): {
  rows: { left: string; right?: string; bold?: boolean }[];
  present: boolean;
  adb: boolean;
} {
  const s = spec.sizing as SolutionSpec["sizing"] | undefined;
  const rows: { left: string; right?: string; bold?: boolean }[] = [];
  let adbPresent = false;
  let dataGuard = false;
  // Plain Autonomous DB has managed HA *within* the region (automatic
  // restart/recovery on the same or another node) — it has NO standby database
  // and therefore no failover target unless Autonomous Data Guard is enabled,
  // which none of these templates configure.
  const adb = (detail: string) => {
    adbPresent = true;
    rows.push({ left: "Autonomous DB — managed HA inside the region (no standby)", right: detail, bold: true });
  };
  const base = (detail: string) =>
    rows.push({ left: "Base DB VM — single node", right: detail });
  switch (s?.kind) {
    case "web_app":
      if (s.db?.engine === "adb_serverless") adb(`${num(s.db.ecpus) || "?"} ECPU`);
      else if (s.db?.engine === "base_db_vm") base("add Data Guard standby (recommended)");
      break;
    case "chatbot":
      if (s.rag) adb(`vector store · ${num(s.vectorDbEcpus) || "?"} ECPU`);
      break;
    case "dr":
      if (s.dbDr === "adb_cross_region") {
        // Autonomous Data Guard automates failover only for a LOCAL standby;
        // a cross-region standby is switched over / failed over by the customer.
        adbPresent = true;
        dataGuard = true;
        rows.push({
          left: "Autonomous DB + Autonomous Data Guard — cross-region standby",
          right: "manual switchover/failover",
          bold: true,
        });
      } else if (s.dbDr === "base_db_data_guard") {
        dataGuard = true;
        rows.push({ left: "Base DB + Data Guard standby", right: "switchover ready", bold: true });
      }
      break;
    case "erp":
      if (s.db?.engine === "adb_serverless") adb(`${num(s.db.ecpus) || "?"} ECPU`);
      else if (s.db?.engine === "base_db_vm") base("add Data Guard standby (recommended)");
      break;
    case "analytics":
      if (num(s.adwEcpus)) adb(`ADW · ${num(s.adwEcpus)} ECPU`);
      break;
    case "devtest":
      if (num(s.dbEcpusPerEnv)) adb(`${num(s.dbEcpusPerEnv)} ECPU / env`);
      break;
    case "ecommerce":
      if (num(s.dbEcpus)) adb(`${num(s.dbEcpus)} ECPU`);
      break;
    case "serverless":
      if (num(s.adbEcpus)) adb(`${num(s.adbEcpus)} ECPU`);
      break;
    case "streaming":
      if (num(s.adwEcpus)) adb(`ADW · ${num(s.adwEcpus)} ECPU`);
      break;
    case "enterprise_lz": {
      const plans = s.plans ?? {};
      const projects = Object.values(plans)
        .flatMap((p) => p?.projects ?? [])
        .filter((p) => Boolean(p));
      if (projects.some((p) => p.dbEngine === "adb")) adb("per project");
      if (projects.some((p) => p.dbEngine === "base_db")) base("add Data Guard standby (recommended)");
      break;
    }
    default:
      break;
  }
  if (adbPresent && !dataGuard) {
    rows.push({
      left: "Autonomous Data Guard standby — automatic failover only when local",
      right: "optional add-on",
    });
  }
  const present = rows.length > 0;
  if (!present) rows.push({ left: "No database tier in this solution" });
  return { rows, present, adb: adbPresent };
}

/** On-prem connectivity redundancy summary. */
function connInfo(c: Connectivity | undefined): {
  title: string;
  rows: { left: string; right?: string }[];
  single: boolean;
} {
  switch (c) {
    case "vpn":
      return {
        title: "SITE-TO-SITE VPN",
        rows: [
          { left: "1 IPSec connection", right: "2 tunnels" },
          { left: "Single CPE / single path on-prem" },
        ],
        single: true,
      };
    case "vpn_ha":
      return {
        title: "SITE-TO-SITE VPN — HA",
        rows: [
          { left: "2 IPSec connections", right: "4 tunnels" },
          { left: "Terminate on 2 on-prem CPEs" },
        ],
        single: false,
      };
    case "fastconnect_1g":
      return {
        title: "FASTCONNECT 1 GBPS",
        rows: [
          { left: "1 port / 1 virtual circuit", right: "single path" },
          { left: "No backup path configured" },
        ],
        single: true,
      };
    case "fastconnect_1g_ha":
      return {
        title: "FASTCONNECT 1 GBPS — DUAL",
        rows: [
          { left: "2 ports / 2 virtual circuits", right: "dual path" },
          { left: "Diverse edge routers & paths" },
        ],
        single: false,
      };
    case "fastconnect_10g":
      return {
        title: "FASTCONNECT 10 GBPS",
        rows: [
          { left: "1 port / 1 virtual circuit", right: "single path" },
          { left: "No backup path configured" },
        ],
        single: true,
      };
    case "fastconnect_10g_ha":
      return {
        title: "FASTCONNECT 10 GBPS — DUAL",
        rows: [
          { left: "2 ports / 2 virtual circuits", right: "dual path" },
          { left: "Diverse edge routers & paths" },
        ],
        single: false,
      };
    case "fastconnect_vpn_backup":
      return {
        title: "FASTCONNECT + VPN BACKUP",
        rows: [
          { left: "FastConnect primary", right: "1 port" },
          { left: "Site-to-Site VPN standby", right: "auto failover (BGP)" },
        ],
        single: false,
      };
    case "none":
    default:
      return {
        title: "INTERNET ONLY",
        rows: [
          { left: "No on-prem private path" },
          { left: "Add VPN for private management access" },
        ],
        single: false,
      };
  }
}

/**
 * Does the LZ IaC ship the hub L7 load balancer for this design?
 * gen/landing_zone.libsonnet sets create_l7_load_balancer=false whenever a
 * platform uses the oke_simple extension — every hub builder creates the LB
 * otherwise. This mirrors lzShipsHubLb in src/lib/templates/lz-baseline.ts
 * (which drives the BOM's deployedByLz flag) and is used only as a fallback
 * when the generated network JSON is not available to read.
 */
function lzShipsHubLb(spec: SolutionSpec): boolean {
  if (spec.template === "oke_platform") return false;
  const s = spec.sizing as SolutionSpec["sizing"] | undefined;
  if (s?.kind === "chatbot" && s.runtime === "oke") return false;
  if (s?.kind === "enterprise_lz") return !enterpriseHasOke(spec);
  return true;
}

/**
 * Hub inspection / ingress tier. Everything here is a REGIONAL managed service
 * attached to a subnet (OCI Network Firewall, OCI Network Load Balancer): the
 * LZ never selects a fault domain for them, and in hub_a / hub_c the two
 * appliances carry DIFFERENT roles, so they are drawn as a role-split tier
 * above the FD columns instead of as an interchangeable HA pair.
 */
function hubTierTiles(hubKind: string | undefined): Tile[] {
  switch (hubKind) {
    case "hub_a":
      return [
        {
          id: "nfw-dmz",
          label: "OCI Network Firewall — DMZ",
          sub: "inbound north-south (IGW → firewall → LB)",
          icon: "fw",
          style: "service",
        },
        {
          id: "nfw-int",
          label: "OCI Network Firewall — Internal",
          sub: "east-west + egress (DRG ingress, NAT path)",
          icon: "fw",
          style: "service",
        },
        {
          id: "fw-role-note",
          label: "Two roles, not a redundant pair",
          sub: "each firewall is the only element on its own path",
          style: "note",
        },
      ];
    case "hub_b":
      return [
        {
          id: "nfw-single",
          label: "OCI Network Firewall",
          sub: "single instance — inspects every hub path",
          icon: "fw",
          style: "service",
        },
        {
          id: "nfw-advice",
          label: "SPOF — one inspection point",
          sub: "Hub A adds a second firewall in a different role (DMZ + Internal): defence in depth, not a standby",
          style: "note",
        },
      ];
    case "hub_c":
      return [
        {
          id: "nlb-untrust",
          label: "Hub NLB — untrust",
          sub: "internet-side ingress → firewall VMs (private)",
          icon: "lb",
          style: "service",
        },
        {
          id: "nlb-trust",
          label: "Hub NLB — trust",
          sub: "spoke egress + east-west → same firewall VMs",
          icon: "lb",
          style: "service",
        },
        {
          id: "nlb-role-note",
          label: "Two roles, not a redundant pair",
          sub: "HA comes from the firewall VMs behind both NLBs",
          style: "note",
        },
      ];
    default:
      // hub_e — no hub inspection appliance at all.
      return [];
  }
}

export function layoutResilienceView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: "Resilience View",
    sublabel: "hub inspection tier, recommended fault-domain spread & connectivity redundancy",
    x: 24, y: 14, w: 720, h: 40, style: "canvasTitle",
  });

  const top = 64;
  const hubKind = spec.hub?.kind;
  const vm = vmTier(spec);
  const oke = okeWorkers(spec);
  const db = dbTier(spec);
  const conn = connInfo(spec.hub?.connectivity);
  const wantsLb = Boolean(gen?.hasHubLb) || lzShipsHubLb(spec);
  const hubTier = hubTierTiles(hubKind);
  const spofFw = hubKind === "hub_b";

  // ---- fill the three FD columns (shortest-column round-robin) ------------
  const fdSlots: Tile[][] = [[], [], []];
  const shortest = (): number => {
    let bi = 0;
    for (let i = 1; i < 3; i++) if (fdSlots[i].length < fdSlots[bi].length) bi = i;
    return bi;
  };

  // hub_c is the only hub whose HA-critical element is customer compute: the
  // 3rd-party firewall appliances registered as the backends of BOTH NLBs
  // (gen/hub/hub_c.libsonnet placeholder_targets). The LZ only records their
  // OCIDs, so their FD spread is a deployment recommendation.
  if (hubKind === "hub_c") {
    fdSlots[0].push({
      id: "fwvm1",
      label: "3rd-party firewall VM 1",
      sub: "backend of both hub NLBs",
      icon: "fw",
      style: "stage",
    });
    fdSlots[1].push({
      id: "fwvm2",
      label: "3rd-party firewall VM 2",
      sub: "put in a separate FD (recommended)",
      icon: "fw",
      style: "stage",
    });
  }

  const shownVm = vm.count > 6 ? 5 : vm.count;
  for (let i = 0; i < shownVm; i++) {
    fdSlots[shortest()].push({
      id: `vm${i}`,
      label: `${vm.name} ${i + 1}`,
      sub: vm.sub || "anti-affinity across FDs",
      icon: "compute",
      style: "resourceTile",
    });
  }
  if (vm.count > 6) {
    fdSlots[shortest()].push({
      id: "vmmore",
      label: `+${vm.count - 5} more ${vm.name}s`,
      sub: "round-robin across FDs",
      icon: "compute",
      style: "resourceTile",
    });
  }

  if (oke > 0) {
    const shown = Math.min(oke, 3);
    for (let i = 0; i < shown; i++) {
      const last = i === shown - 1 && oke > 3;
      fdSlots[shortest()].push({
        id: `oke${i}`,
        label: last ? `OKE worker +${oke - (shown - 1)}` : `OKE worker ${i + 1}`,
        sub: "node pool · FD spread",
        icon: "k8s",
        style: "resourceTile",
      });
    }
  }

  if (fdSlots.every((c) => c.length === 0)) {
    fdSlots[0].push({
      id: "nofd",
      label: "No FD-placed compute",
      sub: "managed services handle HA",
      icon: "cloud",
      style: "resourceTile",
    });
  }

  // ---- region / AD / FD geometry ------------------------------------------
  const regionX = 24;
  const regionW = 940;
  const adX = regionX + 20;
  const adW = regionW - 40;
  const adY = top + 30;
  const tierY = adY + 30;
  const tierTileH = 62;
  const tierH = hubTier.length > 0 ? 28 + tierTileH + 8 : 0;
  const lbH = wantsLb ? 52 : 0;
  const lbY = tierY + (tierH > 0 ? tierH + 16 : 0);
  const colY = lbY + (wantsLb ? lbH + 24 : 0);
  const colGap = 14;
  const colW = Math.floor((adW - 32 - 2 * colGap) / 3);
  const tileH = 50;
  const tileGap = 10;
  const maxSlots = Math.max(1, fdSlots[0].length, fdSlots[1].length, fdSlots[2].length);
  const colH = 30 + maxSlots * (tileH + tileGap) + 4;
  const fdNoteY = colY + colH + 12;
  const fdNoteH = 34;
  const dbY = fdNoteY + fdNoteH + 14;
  const dbH = 26 + db.rows.length * 17 + 10;
  const adH = dbY + dbH + 14 - adY;
  const regionH = adY + adH + 16 - top;

  d.add({
    id: "region",
    kind: "compartment",
    label: `OCI REGION — ${spec.region?.id ?? "region"}`,
    x: regionX, y: top, w: regionW, h: regionH,
    style: "region",
  });
  d.add({
    id: "ad",
    kind: "zone",
    label: "AVAILABILITY DOMAIN — AD-1",
    x: adX, y: adY, w: adW, h: adH,
    style: "zone", parent: "region",
  });
  d.add({
    id: "ad-tab",
    kind: "block",
    label: "AD 1",
    x: adX + adW - 66, y: adY + 6, w: 50, h: 18,
    style: "adTab", parent: "ad",
  });

  // ---- hub inspection tier (regional managed services, above the FDs) -----
  if (hubTier.length > 0) {
    d.add({
      id: "hubtier",
      kind: "zone",
      label: "HUB INSPECTION TIER — REGIONAL MANAGED SERVICES (NO FAULT-DOMAIN CONTROL)",
      x: adX + 16, y: tierY, w: adW - 32, h: tierH,
      style: "zone", parent: "ad",
    });
    const innerW = adW - 32 - 20;
    const gap = 14;
    const tw = Math.floor((innerW - (hubTier.length - 1) * gap) / hubTier.length);
    hubTier.forEach((t, i) => {
      d.add({
        id: t.id,
        kind: t.style === "note" && !t.icon ? "note" : "service",
        label: t.label,
        sublabel: t.sub,
        icon: t.icon,
        x: adX + 26 + i * (tw + gap), y: tierY + 26, w: tw, h: tierTileH,
        style: t.style, parent: "hubtier",
      });
    });
  }
  if (spofFw) d.edge({ from: "nfw-advice", to: "nfw-single", kind: "leader", dashed: true });

  if (wantsLb) {
    d.add({
      id: "lb",
      kind: "service",
      label: "Load Balancer — regional",
      sublabel: "hub public ingress · spans all fault domains · managed HA · 99.95% SLA",
      icon: "lb",
      x: adX + 16, y: lbY, w: adW - 32, h: lbH,
      style: "service", parent: "ad",
    });
  }

  for (let f = 0; f < 3; f++) {
    const colX = adX + 16 + f * (colW + colGap);
    d.add({
      id: `fd${f}`,
      kind: "zone",
      label: `FAULT DOMAIN ${f + 1} (FD-${f + 1})`,
      x: colX, y: colY, w: colW, h: colH,
      style: "zone", parent: "ad",
    });
    fdSlots[f].forEach((t, i) => {
      d.add({
        id: t.id,
        kind: t.style === "note" && !t.icon ? "note" : "service",
        label: t.label,
        sublabel: t.sub,
        icon: t.icon,
        x: colX + 10, y: colY + 28 + i * (tileH + tileGap), w: colW - 20, h: tileH,
        style: t.style, parent: `fd${f}`,
      });
    });
    if (wantsLb) d.edge({ from: "lb", to: `fd${f}`, kind: "flow" });
  }

  d.add({
    id: "fd-note",
    kind: "note",
    label:
      "Fault-domain columns show the recommended anti-affinity target — the generated LZ sets no fault_domain; the FD is chosen at instance launch.",
    x: adX + 16, y: fdNoteY, w: adW - 32, h: fdNoteH,
    style: "note", parent: "ad",
  });

  d.add({
    id: "dbcard",
    kind: "routeCard",
    label: "DB TIER — HA POSTURE",
    x: adX + 16, y: dbY, w: adW - 32, h: dbH,
    style: "stackCard", rows: db.rows, parent: "ad",
  });
  if (db.present) d.edge({ from: "fd1", to: "dbcard", kind: "flow", label: "app → db" });

  // ---- below the region: connectivity redundancy + SLA reference ----------
  const cardsY = top + regionH + 24;
  const cardW = 450;
  const connH = 26 + conn.rows.length * 17 + 10;
  d.add({
    id: "conncard",
    kind: "routeCard",
    label: `CONNECTIVITY REDUNDANCY — ${conn.title}`,
    x: 24, y: cardsY, w: cardW, h: connH,
    style: "routeCardHub", rows: conn.rows,
  });
  // Only quote an SLA for something this design actually deploys.
  const slaRows: { left: string; right?: string }[] = [];
  if (wantsLb) slaRows.push({ left: "Load Balancer (regional, FD-spanning)", right: "99.95%" });
  if (db.adb) slaRows.push({ left: "Autonomous Database", right: "99.95%" });
  if (oke > 0) slaRows.push({ left: "OKE control plane", right: "99.95%" });
  slaRows.push(
    { left: "Compute SLA — spread ≥ 2 VMs across FDs", right: "guidance" },
    { left: "Fault domain is chosen at instance launch, not by the LZ", right: "guidance" },
  );
  d.add({
    id: "slacard",
    kind: "routeCard",
    label: "AVAILABILITY SLA & PLACEMENT REFERENCE (OCI PUBLISHED)",
    x: 24 + cardW + 24, y: cardsY, w: cardW, h: 26 + slaRows.length * 17 + 10,
    style: "stackCard",
    rows: slaRows,
  });
  if (conn.single) {
    d.add({
      id: "conn-note",
      kind: "note",
      label: "single path — consider HA (dual VPN tunnels / dual FastConnect ports)",
      x: 24, y: cardsY + connH + 10, w: cardW, h: 36,
      style: "note",
    });
    d.edge({ from: "conn-note", to: "conncard", kind: "leader", dashed: true });
  }

  // ---- right rail: legend + FD explainer ----------------------------------
  const railX = regionX + regionW + 26;
  addLegend(d, railX, top, [
    { left: "FAULT DOMAIN", swatch: "zone" },
    { left: "REGIONAL / MANAGED SERVICE", swatch: "service" },
    { left: "CUSTOMER-DEPLOYED HA TIER", swatch: "stage" },
    { left: "SPOF / ADVISORY", swatch: "note" },
    { left: "COMPUTE (RECOMMENDED SPREAD)", swatch: "resourceTile" },
  ]);
  d.add({
    id: "fd-explainer",
    kind: "note",
    label: "Fault domains",
    sublabel: "แยกฮาร์ดแวร์ภายใน AD",
    x: railX, y: top + 30 + 5 * 24 + 20, w: 210, h: 128,
    style: "note",
    rows: [
      { left: "Isolated hardware & power within 1 AD", bold: true },
      { left: "OCI never patches 2 FDs at once" },
      { left: "Spread every HA tier over ≥ 2 FDs" },
      { left: "The LZ IaC pins no fault domain —" },
      { left: "placement above is guidance" },
    ],
  });

  return d.finish({
    view: "resilience",
    title: { th: "มุมมองความพร้อมใช้งานสูง (Resilience View)", en: "Resilience / HA View" },
  });
}
