import type {
  Connectivity,
  DiagramDoc,
  DiagramNode,
  EnvName,
  NodeKind,
  SolutionSpec,
} from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated, SubnetInfo, VcnInfo } from "../generated-parse";

// Traffic Flow View — FOUR self-contained horizontal lanes stacked vertically.
// Each lane is a left→right hop chain inside its own dotted zone frame; every
// hop is an edge of kind "flow" so the web canvas animates packets along it.
//   LANE 1 — INBOUND    : Internet → hub LB (+WAF) → firewall → DRG → web/app/db NSGs
//   LANE 2 — OUTBOUND   : app subnet → DRG → firewall → NAT GW → Internet,
//                         plus a parallel Service Gateway hop (private, no internet)
//   LANE 3 — EAST-WEST  : spoke A app → DRG → firewall → spoke B db («NSG allow»)
//   LANE 4 — HYBRID     : on-prem DC → FastConnect/VPN → DRG → spoke (omitted
//                         when connectivity = "none")
// Firewall tiles vary by hub kind: hub_a = DMZ + Internal NFW pair (inbound
// uses DMZ, outbound/east-west the Internal), hub_b = single NFW everywhere,
// hub_c = NLB + 3rd-party FW pair, hub_e = amber "no inline inspection — NSG
// only" note and the lanes skip the firewall hop entirely.
// Right rail: legend (one swatch per lane) + DRG traffic-policy routeCard
// (path → next-hop per lane) + hop-label glossary card.

const LANE_X = 24;
const LANE_W = 1132;
const INNER_X = LANE_X + 18; // 42
const INNER_W = LANE_W - 36; // 1096
const TILE_H = 58;
const LANE_GAP = 18;

interface Hop {
  id: string;
  label: string;
  sub?: string;
  icon?: string;
  style?: string;
  kind?: NodeKind;
  /** render as a small gateway circle centered in the slot (DRG / NAT / SGW) */
  gw?: boolean;
  /** label of the "flow" edge arriving into this hop from the previous hop */
  inLabel?: string;
}

/** Lay a hop chain evenly across the lane's inner width; connect with flows. */
function chain(d: Doc, parent: string, rowY: number, hops: Hop[]): DiagramNode[] {
  const n = Math.max(hops.length, 1);
  const tileW = Math.min(170, Math.floor((INNER_W - (n - 1) * 30) / n));
  const gap = n > 1 ? (INNER_W - n * tileW) / (n - 1) : 0;
  const nodes: DiagramNode[] = [];
  hops.forEach((h, i) => {
    const slotX = Math.round(INNER_X + i * (tileW + gap));
    if (h.gw) {
      nodes.push(
        d.add({
          id: h.id, kind: "gateway", label: h.label, icon: h.icon ?? "drg", captionBelow: true,
          x: slotX + Math.round((tileW - 46) / 2), y: rowY + 2, w: 46, h: 46,
          style: "gateway", parent,
        }),
      );
    } else {
      nodes.push(
        d.add({
          id: h.id, kind: h.kind ?? "service", label: h.label, sublabel: h.sub, icon: h.icon,
          x: slotX, y: rowY, w: tileW, h: TILE_H,
          style: h.style ?? "resourceTile", parent,
        }),
      );
    }
    if (i > 0) d.edge({ from: hops[i - 1].id, to: h.id, kind: "flow", label: h.inLabel });
  });
  return nodes;
}

function isHub(v: VcnInfo): boolean {
  return v.name.includes("-hub") || v.category.startsWith("0-");
}

function connLabel(c: Connectivity): string {
  switch (c) {
    case "vpn":
      return "Site-to-Site VPN (IPSec)";
    case "vpn_ha":
      return "VPN HA — 2× IPSec tunnels";
    case "fastconnect_1g":
      return "FastConnect 1 Gbps";
    case "fastconnect_1g_ha":
      return "FastConnect 1 Gbps (HA)";
    case "fastconnect_10g":
      return "FastConnect 10 Gbps";
    case "fastconnect_10g_ha":
      return "FastConnect 10 Gbps (HA)";
    case "fastconnect_vpn_backup":
      return "FastConnect + VPN backup";
    default:
      return "no on-prem link";
  }
}

export function layoutTrafficView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  const short = spec?.region?.shortName || "oci";
  const hubKind = spec?.hub?.kind ?? "hub_b";
  const conn: Connectivity = spec?.hub?.connectivity ?? "none";
  const inspection = spec?.hub?.inspection ?? "standard";
  const inspect = hubKind !== "hub_e"; // hub_e has no inline inspection
  const szAny = (spec?.sizing ?? {}) as { waf?: boolean; lbBandwidthMbps?: number };
  const wafOn = szAny.waf === true || (spec?.traffic?.wafRequestsM ?? 0) > 0;

  const envList: EnvName[] =
    spec?.environments && spec.environments.length ? spec.environments : (["prod"] as EnvName[]);
  const envA: EnvName = envList[0];
  const envB: EnvName | undefined = envList[1];

  const vcns = gen?.vcns ?? [];
  const spokes = vcns.filter((v) => !isHub(v));
  const spokeA = spokes.find((v) => v.category.endsWith(envA)) ?? spokes[0];
  const spokeB =
    (envB ? spokes.find((v) => v.category.endsWith(envB)) : undefined) ??
    spokes.find((v) => v !== spokeA);
  const spokeAName = spokeA?.name ?? `vcn-${short}-${envA}-spoke`;
  const spokeBName =
    spokeB?.name ?? (envB ? `vcn-${short}-${envB}-spoke` : `vcn-${short}-platform`);

  const subOf = (re: RegExp, i: number, fallback: string): SubnetInfo => {
    const byName = spokeA?.subnets?.find((s) => re.test(s.name));
    return byName ?? spokeA?.subnets?.[i] ?? { key: fallback, name: fallback, cidr: "" };
  };
  const webSub = subOf(/web/, 0, `sn-${short}-${envA}-web`);
  const appSub = subOf(/app/, 1, `sn-${short}-${envA}-app`);
  const dbSub = subOf(/db/, 2, `sn-${short}-${envA}-db`);

  const inspLabel =
    inspection === "tls" ? "TLS inspection" : inspection === "ids_ips" ? "IDS / IPS" : "stateful L4–L7";

  /** Firewall hop tile per hub kind (null for hub_e = no inline inspection). */
  const fwHop = (lane: string, side: "in" | "out"): Hop | null => {
    if (hubKind === "hub_a") {
      return side === "in"
        ? { id: `${lane}-fw`, label: "OCI NFW — DMZ", sub: inspLabel, icon: "fw", inLabel: "«inspect»" }
        : { id: `${lane}-fw`, label: "OCI NFW — Internal", sub: inspLabel, icon: "fw", inLabel: "«inspect»" };
    }
    if (hubKind === "hub_b") {
      return { id: `${lane}-fw`, label: "OCI Network Firewall", sub: inspLabel, icon: "fw", inLabel: "«inspect»" };
    }
    if (hubKind === "hub_c") {
      return { id: `${lane}-fw`, label: "3rd-party FW pair", sub: "NLB flow-hash sandwich", icon: "fw", inLabel: "«inspect»" };
    }
    return null; // hub_e
  };

  // ---- title ----------------------------------------------------------------
  d.add({
    kind: "canvasTitle",
    label: "Traffic Flow View",
    sublabel: `4 lanes — inbound · outbound · east-west · hybrid — ${hubKind.replace("_", " ").toUpperCase()} · ${spec?.region?.id ?? ""}`,
    x: 24, y: 14, w: 780, h: 40, style: "canvasTitle",
  });

  let y = 64;
  const top = y;

  // ==== LANE 1 — INBOUND (north-south ingress) ===============================
  const lbMbps = spec?.traffic?.lbBandwidthMbps ?? szAny.lbBandwidthMbps;
  const lbSub =
    typeof lbMbps === "number" && lbMbps > 0 ? `${lbMbps} Mbps flexible` : "flexible shape";
  const hops1: Hop[] = [
    { id: "l1-users", label: "Internet users", sub: "public clients", icon: "user", kind: "block", style: "actor" },
    {
      id: "l1-lb",
      label: hubKind === "hub_c" ? "Network Load Balancer" : "Load Balancer (L7)",
      sub: hubKind === "hub_c" ? "flow-hash to FW pair" : wafOn ? `WAF + ${lbSub}` : lbSub,
      icon: "lb",
      inLabel: "«HTTPS 443»",
    },
  ];
  const fw1 = fwHop("l1", "in");
  if (fw1) hops1.push(fw1);
  hops1.push({
    id: "l1-drg", label: `drg-${short}-lz-hub`, gw: true,
    inLabel: fw1 ? "«route»" : "«route» — no inspection",
  });
  hops1.push({ id: "l1-web", label: "web NSG", sub: webSub.name, icon: "shield", inLabel: "«NSG allow» 443" });
  hops1.push({ id: "l1-app", label: "app NSG", sub: appSub.name, icon: "shield", inLabel: "«NSG allow» app port" });
  hops1.push({ id: "l1-db", label: "db NSG", sub: dbSub.name, icon: "shield", inLabel: "«NSG allow» 1521" });

  const lane1HasNotes = wafOn || !inspect;
  const lane1H = lane1HasNotes ? 160 : 106;
  d.add({
    id: "lane1", kind: "zone",
    label: "LANE 1 — INBOUND (ขาเข้า) · Internet → hub → spoke",
    x: LANE_X, y, w: LANE_W, h: lane1H, style: "zone",
  });
  const n1 = chain(d, "lane1", y + 32, hops1);
  const noteY1 = y + 32 + TILE_H + 12;
  if (wafOn) {
    d.add({
      id: "l1-waf", kind: "note", label: "WAF policy in front of LB",
      sublabel: "OWASP core rules — กรองก่อนเข้า hub",
      x: n1[1].x, y: noteY1, w: 180, h: 44, style: "note", parent: "lane1",
    });
    d.edge({ from: "l1-waf", to: "l1-lb", kind: "leader", dashed: true });
  }
  if (!inspect) {
    const drgNode1 = n1[2]; // hub_e chain: users, lb, drg, ...
    d.add({
      id: "l1-noinsp", kind: "note", label: "no inline inspection — NSG only",
      sublabel: "hub_e — routing hub, ไม่มี firewall",
      x: drgNode1.x, y: noteY1, w: 200, h: 44, style: "note", parent: "lane1",
    });
    d.edge({ from: "l1-noinsp", to: "l1-drg", kind: "leader", dashed: true });
  }
  y += lane1H + LANE_GAP;

  // ==== LANE 2 — OUTBOUND (egress) ===========================================
  const egressGb = spec?.traffic?.egressGbPerMonth;
  const hops2: Hop[] = [
    { id: "l2-app", label: `app subnet — ${envA}`, sub: appSub.name, icon: "compute" },
    { id: "l2-drg", label: `drg-${short}-lz-hub`, gw: true, inLabel: "«route» 0.0.0.0/0" },
  ];
  const fw2 = fwHop("l2", "out");
  if (fw2) hops2.push(fw2);
  hops2.push({
    id: "l2-nat", label: "NAT Gateway", gw: true, icon: "natgw",
    inLabel: fw2 ? "«route»" : "«route» — no inspection",
  });
  hops2.push({
    id: "l2-inet", label: "Internet", kind: "block", style: "actor", icon: "cloud",
    sub: typeof egressGb === "number" && egressGb > 0 ? `${egressGb} GB/mo egress` : "public internet",
    inLabel: "«egress»",
  });

  const lane2H = 204;
  d.add({
    id: "lane2", kind: "zone",
    label: "LANE 2 — OUTBOUND (ขาออก) · spoke → NAT / Service Gateway",
    x: LANE_X, y, w: LANE_W, h: lane2H, style: "zone",
  });
  chain(d, "lane2", y + 32, hops2);

  // parallel Service Gateway branch — private path to OCI services (bypasses
  // the internet entirely)
  const row2Y = y + 32 + TILE_H + 38;
  d.add({
    id: "l2-sgw", kind: "gateway", label: "Service Gateway", icon: "sgw", captionBelow: true,
    x: INNER_X + Math.round(INNER_W * 0.4), y: row2Y + 2, w: 46, h: 46,
    style: "gateway", parent: "lane2",
  });
  d.add({
    id: "l2-osvc", kind: "service",
    label: "OCI Services — Object Storage",
    sublabel: "private — ไม่ออก internet",
    icon: "archive",
    x: INNER_X + Math.round(INNER_W * 0.58), y: row2Y, w: 230, h: 54,
    style: "resourceTile", parent: "lane2",
  });
  d.edge({ from: "l2-app", to: "l2-sgw", kind: "flow", label: "«route» OCI services CIDR" });
  d.edge({ from: "l2-sgw", to: "l2-osvc", kind: "flow", label: "«private» bypasses internet" });
  if (!inspect) {
    d.add({
      id: "l2-noinsp", kind: "note", label: "no inline inspection — NSG only",
      x: INNER_X + INNER_W - 176, y: row2Y + 4, w: 176, h: 44, style: "note", parent: "lane2",
    });
    d.edge({ from: "l2-noinsp", to: "l2-nat", kind: "leader", dashed: true });
  }
  y += lane2H + LANE_GAP;

  // ==== LANE 3 — EAST-WEST (spoke ⇄ spoke) ===================================
  const hops3: Hop[] = [
    { id: "l3-app", label: `${envA} app tier`, sub: spokeAName, icon: "compute" },
    { id: "l3-drg", label: `drg-${short}-lz-hub`, gw: true, inLabel: "«route» east-west" },
  ];
  const fw3 = fwHop("l3", "out");
  if (fw3) hops3.push(fw3);
  hops3.push({
    id: "l3-db",
    label: envB ? `${envB} db tier` : "platform workload",
    sub: spokeBName,
    icon: "db",
    inLabel: fw3 ? "«NSG allow» 1521" : "«NSG allow» 1521 — no inspection",
  });

  const lane3H = inspect ? 106 : 160;
  d.add({
    id: "lane3", kind: "zone",
    label: `LANE 3 — EAST-WEST · ${spokeAName} ⇄ ${spokeBName} ผ่าน hub`,
    x: LANE_X, y, w: LANE_W, h: lane3H, style: "zone",
  });
  const n3 = chain(d, "lane3", y + 32, hops3);
  if (!inspect) {
    d.add({
      id: "l3-noinsp", kind: "note", label: "no inline inspection — NSG only",
      sublabel: "hub_e — DRG routes spoke-to-spoke ตรง",
      x: n3[1].x, y: y + 32 + TILE_H + 12, w: 220, h: 44, style: "note", parent: "lane3",
    });
    d.edge({ from: "l3-noinsp", to: "l3-drg", kind: "leader", dashed: true });
  }
  y += lane3H + LANE_GAP;

  // ==== LANE 4 — HYBRID (on-prem) — omitted when connectivity = none ========
  if (conn !== "none") {
    const linkShort = conn.startsWith("vpn")
      ? "IPSec VPN"
      : conn === "fastconnect_vpn_backup"
        ? "FastConnect + VPN"
        : "FastConnect";
    const hops4: Hop[] = [
      { id: "l4-dc", label: "On-premises DC", sub: "customer site", icon: "onprem", kind: "block", style: "actor" },
      { id: "l4-link", label: linkShort, sub: connLabel(conn), icon: "natgw", inLabel: "«encrypted / private»" },
      { id: "l4-drg", label: `drg-${short}-lz-hub`, gw: true, inLabel: "«attach»" },
      { id: "l4-spoke", label: `${envA} spoke`, sub: spokeAName, icon: "rt", inLabel: "«route» · «NSG allow»" },
    ];
    const lane4H = 160;
    d.add({
      id: "lane4", kind: "zone",
      label: `LANE 4 — HYBRID (on-prem) · ${connLabel(conn)}`,
      x: LANE_X, y, w: LANE_W, h: lane4H, style: "zone",
    });
    const n4 = chain(d, "lane4", y + 32, hops4);
    d.add({
      id: "l4-insp-note", kind: "note",
      label: inspect
        ? "hub inspects on-prem traffic"
        : "on-prem traffic NOT inspected",
      sublabel: inspect
        ? "on-prem → DRG → hub firewall → spoke"
        : "hub_e — DRG routing + spoke NSGs only",
      x: n4[2].x - 60, y: y + 32 + TILE_H + 12, w: 250, h: 44, style: "note", parent: "lane4",
    });
    d.edge({ from: "l4-insp-note", to: "l4-drg", kind: "leader", dashed: true });
    y += lane4H + LANE_GAP;
  }

  // ==== right rail: legend · DRG traffic-policy card · hop glossary ==========
  const railX = LANE_X + LANE_W + 26; // 1182 — canvas stays under ~1450
  const legendRows: { left: string; swatch: string }[] = [
    { left: "LANE 1 — INBOUND", swatch: "lb" },
    { left: "LANE 2 — OUTBOUND", swatch: "gateway" },
    { left: "LANE 3 — EAST-WEST", swatch: "fw" },
  ];
  if (conn !== "none") legendRows.push({ left: "LANE 4 — HYBRID", swatch: "actor" });
  legendRows.push({ left: "NSG HOP (SPOKE)", swatch: "resourceTile" });
  addLegend(d, railX, top, legendRows);

  const fwWord = hubKind === "hub_c" ? "FW pair" : hubKind === "hub_a" ? "NFW ×2" : "NFW";
  const policyRows: { left: string; right?: string }[] = [
    { left: "inbound", right: inspect ? `LB → ${fwWord} → DRG` : "LB → DRG" },
    { left: "outbound", right: inspect ? `DRG → ${fwWord} → NAT` : "DRG → NAT" },
    { left: "oci services", right: "SGW (private)" },
    { left: "east-west", right: inspect ? `DRG → ${fwWord}` : "DRG direct" },
    {
      left: "on-prem",
      right: conn === "none" ? "—" : conn.startsWith("vpn") ? "VPN → DRG" : "FastConnect → DRG",
    },
  ];
  const rcY = top + 30 + legendRows.length * 24 + 14;
  const rcH = 20 + 15 + policyRows.length * 16 + 6;
  d.add({
    id: "rtc", kind: "routeCard", label: `drgrt-${short}-lz-hub — traffic policy`,
    x: railX, y: rcY, w: 210, h: rcH,
    style: "routeCardDrg",
    colHeaders: ["Path", "Next-hop"],
    rows: policyRows,
  });

  const glossRows: { left: string }[] = [
    { left: "«inspect» — ตรวจสอบที่ firewall" },
    { left: "«route» — DRG / route table" },
    { left: "«NSG allow» — NSG เปิดพอร์ต" },
    { left: "«private» — SGW ไม่ออก internet" },
  ];
  if (spec?.sizing?.kind === "enterprise_lz") {
    const projs = (spec.sizing.plans?.[envA]?.projects ?? []).map((p) => p.name).slice(0, 4);
    if (projs.length) glossRows.push({ left: `per-project NSGs: ${projs.join(", ")}` });
  }
  d.add({
    id: "hops", kind: "group", label: "Hop labels — คำอธิบาย",
    x: railX, y: rcY + rcH + 14, w: 210, h: 34 + glossRows.length * 18 + 8,
    style: "resourceTile", rows: glossRows,
  });

  return d.finish({
    view: "traffic",
    title: { th: "มุมมองการไหลของทราฟฟิก (Traffic Flow View)", en: "Traffic Flow View" },
  });
}
