import type { Connectivity, DiagramDoc, SolutionSpec, TemplateId } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated } from "../generated-parse";

// Resilience / High-Availability View — one region box with an Availability
// Domain split into the three Fault Domain columns. Shows where the HA-critical
// components physically land: the hub firewall pair (or its SPOF), the
// FD-spanning regional Load Balancer, app VMs spread round-robin, OKE workers,
// and the managed-HA DB tier. Below the region: connectivity redundancy and an
// OCI SLA reference card. Same visual language as operations/logging views.

interface Tile {
  id: string;
  label: string;
  sub?: string;
  icon?: string;
  style: string;
}

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/** Prod-tier FD-pinned VM fleet for every template (defensive on sizing). */
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
    case "dr":
      return {
        count: num(s.protectedVmCount),
        name: "Standby VM",
        sub: s.mode === "warm_standby" ? "warm standby (running)" : "pilot light (stopped)",
      };
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
      const plans = s.plans ?? {};
      const plan = plans.prod ?? Object.values(plans).find((p) => Boolean(p));
      const projects = (plan?.projects ?? []).filter((p) => Boolean(p));
      const count = projects.reduce((a, p) => a + num(p.vmCount), 0);
      return { count, name: "App VM", sub: `prod · ${projects.length} project(s)` };
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
    const plans = s.plans ?? {};
    const plan = plans.prod ?? Object.values(plans).find((p) => Boolean(p));
    return plan?.oke ? num(plan.okeWorkerCount) || 3 : 0;
  }
  return 0;
}

/** DB tier HA posture rows (ADB managed HA and/or Base DB Data Guard note). */
function dbTier(spec: SolutionSpec): { rows: { left: string; right?: string; bold?: boolean }[]; present: boolean } {
  const s = spec.sizing as SolutionSpec["sizing"] | undefined;
  const rows: { left: string; right?: string; bold?: boolean }[] = [];
  const adb = (detail: string) =>
    rows.push({ left: "Autonomous DB — built-in HA, auto-failover", right: detail, bold: true });
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
      if (s.dbDr === "adb_cross_region") adb("cross-region standby");
      else if (s.dbDr === "base_db_data_guard")
        rows.push({ left: "Base DB + Data Guard standby", right: "switchover ready", bold: true });
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
  const present = rows.length > 0;
  if (!present) rows.push({ left: "No FD-pinned database tier in this solution" });
  return { rows, present };
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

const LB_TEMPLATES: TemplateId[] = [
  "web_app",
  "chatbot",
  "ecommerce",
  "erp",
  "vdi",
  "oke_platform",
  "serverless",
  "enterprise_lz",
];

export function layoutResilienceView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: "Resilience View",
    sublabel: "fault-domain placement, HA pairs & connectivity redundancy",
    x: 24, y: 14, w: 720, h: 40, style: "canvasTitle",
  });

  const top = 64;
  const hubKind = spec.hub?.kind;
  const vm = vmTier(spec);
  const oke = okeWorkers(spec);
  const db = dbTier(spec);
  const conn = connInfo(spec.hub?.connectivity);
  const wantsLb = Boolean(gen?.hasHubLb) || LB_TEMPLATES.includes(spec.template);

  // ---- fill the three FD columns (shortest-column round-robin) ------------
  const fdSlots: Tile[][] = [[], [], []];
  const shortest = (): number => {
    let bi = 0;
    for (let i = 1; i < 3; i++) if (fdSlots[i].length < fdSlots[bi].length) bi = i;
    return bi;
  };

  let spofNfw = false;
  if (hubKind === "hub_a") {
    fdSlots[0].push({ id: "nfw1", label: "Network Firewall 1", sub: "hub — active HA pair", icon: "fw", style: "stage" });
    fdSlots[1].push({ id: "nfw2", label: "Network Firewall 2", sub: "hub — active HA pair", icon: "fw", style: "stage" });
  } else if (hubKind === "hub_b") {
    spofNfw = true;
    fdSlots[0].push({ id: "nfw1", label: "Network Firewall", sub: "hub — single instance", icon: "fw", style: "note" });
    fdSlots[1].push({
      id: "nfw-advice",
      label: "SPOF — single firewall",
      sub: "upgrade to hub_a NFW pair for HA",
      style: "note",
    });
  } else if (hubKind === "hub_c") {
    fdSlots[0].push({ id: "nlb1", label: "Hub NLB 1", sub: "network LB — HA pair", icon: "lb", style: "stage" });
    fdSlots[1].push({ id: "nlb2", label: "Hub NLB 2", sub: "network LB — HA pair", icon: "lb", style: "stage" });
  }
  // hub_e: no hub inspection appliance — nothing to place.

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
      label: "No FD-pinned compute",
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
  const lbH = wantsLb ? 52 : 0;
  const colY = adY + 30 + (wantsLb ? lbH + 24 : 0);
  const colGap = 14;
  const colW = Math.floor((adW - 32 - 2 * colGap) / 3);
  const tileH = 50;
  const tileGap = 10;
  const maxSlots = Math.max(1, fdSlots[0].length, fdSlots[1].length, fdSlots[2].length);
  const colH = 30 + maxSlots * (tileH + tileGap) + 4;
  const dbY = colY + colH + 20;
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

  if (wantsLb) {
    d.add({
      id: "lb",
      kind: "service",
      label: "Load Balancer — regional",
      sublabel: "spans all fault domains · managed HA · 99.95% SLA",
      icon: "lb",
      x: adX + 16, y: adY + 30, w: adW - 32, h: lbH,
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
  if (spofNfw) d.edge({ from: "nfw-advice", to: "nfw1", kind: "leader", dashed: true });

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
  d.add({
    id: "slacard",
    kind: "routeCard",
    label: "AVAILABILITY SLA REFERENCE (OCI PUBLISHED)",
    x: 24 + cardW + 24, y: cardsY, w: cardW, h: 26 + 4 * 17 + 10,
    style: "stackCard",
    rows: [
      { left: "Load Balancer (regional, FD-spanning)", right: "99.95%" },
      { left: "Autonomous Database", right: "99.95%" },
      { left: "OKE control plane", right: "99.95%" },
      { left: "Compute SLA — spread ≥ 2 VMs across FDs", right: "guidance" },
    ],
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
    { left: "HA PAIR (FD-SPREAD)", swatch: "stage" },
    { left: "SINGLE POINT OF FAILURE", swatch: "note" },
    { left: "MANAGED-HA SERVICE", swatch: "service" },
    { left: "COMPUTE (ANTI-AFFINITY)", swatch: "resourceTile" },
  ]);
  d.add({
    id: "fd-explainer",
    kind: "note",
    label: "Fault domains",
    sublabel: "แยกฮาร์ดแวร์ภายใน AD",
    x: railX, y: top + 30 + 5 * 24 + 20, w: 210, h: 96,
    style: "note",
    rows: [
      { left: "Isolated hardware & power within 1 AD", bold: true },
      { left: "OCI never patches 2 FDs at once" },
      { left: "Spread every HA tier over ≥ 2 FDs" },
    ],
  });

  return d.finish({
    view: "resilience",
    title: { th: "มุมมองความพร้อมใช้งานสูง (Resilience View)", en: "Resilience / HA View" },
  });
}
