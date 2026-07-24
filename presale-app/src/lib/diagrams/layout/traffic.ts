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
//   LANE 1 — INBOUND    : Internet → hub edge → (firewall / LB in the real order)
//                         → DRG → web/app/db NSGs
//   LANE 2 — OUTBOUND   : the egress path the generated route tables really
//                         build, plus the parallel spoke Service Gateway hop
//   LANE 3 — EAST-WEST  : spoke A app → DRG → firewall → spoke B db («NSG allow»)
//   LANE 4 — HYBRID     : on-prem DC → FastConnect/VPN → DRG → spoke (omitted
//                         when connectivity = "none")
// Right rail: legend (one swatch per lane) + hub route-table policy card
// (path → next-hop per lane) + hop-label glossary card.
//
// GROUND TRUTH — the chains below mirror what the generator actually emits, so
// the picture can be diffed against the bundled network.json:
//   hub_a  gen/hub/hub_a.libsonnet — IGW + hub NAT GW + SGW.
//     in : the IGW carries RT HUB IGW, whose post rule routes the LB-subnet CIDR
//          through the DMZ NFW private IP (l.227-235) — inspection happens IN
//          FRONT of the LB. RT HUB LB is a spoke_route_table (l.279), so
//          builders/hub_integration.libsonnet (l.55-58, 122-125) fills it with
//          spoke-CIDR → DRG rules: the LB → DRG leg traverses NO firewall.
//     out: spoke 0.0.0.0/0 → DRG → RT HUB INGRESS 0.0.0.0/0 → Internal NFW
//          (l.237-245, the DRG-attachment ingress table) → RT HUB FW INT
//          0.0.0.0/0 → hub NAT GW (l.43, 152) → internet.
//   hub_b  gen/hub/hub_b.libsonnet — IGW + hub NAT GW + SGW.
//     in : the IGW has no route table (l.116) so traffic reaches the LB first;
//          RT HUB LB is a post_route_table (l.215) carrying spoke-CIDR → NFW, so
//          the single NFW inspects the LB → DRG leg.
//     out: DRG → RT HUB INGRESS → NFW (l.170-184) → RT HUB FW 0.0.0.0/0 → hub
//          NAT GW (l.36, 117) → internet.
//   hub_c  gen/hub/hub_c.libsonnet — NO NAT GATEWAY: vcn_specific_gateways holds
//          internet_gateways + service_gateways only (l.240-243).
//     in : IGW (RT HUB IGW routes the LB-subnet CIDR through the untrust NLB,
//          l.267-275) → 3rd-party FW pair → public L7 LB (created by default,
//          l.64-66 + 248-250; the NLBs are is_private:true, l.37) → RT HUB LB
//          spoke-CIDR → DRG (l.315).
//     out: DRG → RT HUB INGRESS 0.0.0.0/0 → trust NLB (l.277-285) → FW pair →
//          RT HUB UNTRUST 0.0.0.0/0 → hub IGW (l.105, _internet_route_via_igw).
//   hub_e  gen/hub/hub_e.libsonnet sets has_spoke_natgw: true (l.128) — the only
//          hub that does. builders/network_spokes.libsonnet then gives EVERY
//          spoke VCN its own NAT GW (l.225-231) and a 0.0.0.0/0 → spoke NGW rule
//          (l.140-145); only the hub CIDR and spoke peers use the DRG (l.134-139,
//          146-158). Egress never touches the DRG or the hub — the hub NAT GW
//          serves the hub mgmt/mon/dns route table only (hub_e l.39).
//   all kinds: every spoke VCN also owns a Service Gateway plus an all-services →
//          SGW route (network_spokes.libsonnet l.126-131, 218-224), so lane 2's
//          private OCI-services branch is the SPOKE's SGW, not the hub's.

const LANE_X = 24;
const LANE_W = 1256;
const INNER_X = LANE_X + 18; // 42
const INNER_W = LANE_W - 36; // 1220
const TILE_H = 58;
const LANE_GAP = 18;
const NOTE_H = 44;

interface Hop {
  id: string;
  label: string;
  sub?: string;
  icon?: string;
  style?: string;
  kind?: NodeKind;
  /** render as a small gateway circle centered in the slot (DRG / IGW / NAT / SGW) */
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

/** Find a chain node by hop id (chains are hub-kind dependent, so never index). */
function at(nodes: DiagramNode[], id: string): DiagramNode | undefined {
  return nodes.find((n) => n.id === id);
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
  // hub_e is the only kind with no inline inspection; anything unrecognised
  // falls through to the hub_b shape (one inline NFW), the historical default.
  const inspect = hubKind !== "hub_e";
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

  // The hub L7 LB is created by default for every hub kind and suppressed only
  // when an oke_simple platform is present (gen/landing_zone.libsonnet l.48-53).
  // Trust the generated JSON whenever we parsed a network; otherwise assume the
  // generator default.
  const haveGenNet = vcns.length > 0;
  const hasL7Lb = haveGenNet ? gen?.hasHubLb === true : true;

  const subOf = (re: RegExp, i: number, fallback: string): SubnetInfo => {
    const byName = spokeA?.subnets?.find((s) => re.test(s.name));
    return byName ?? spokeA?.subnets?.[i] ?? { key: fallback, name: fallback, cidr: "" };
  };
  const webSub = subOf(/web/, 0, `sn-${short}-${envA}-web`);
  const appSub = subOf(/app/, 1, `sn-${short}-${envA}-app`);
  const dbSub = subOf(/db/, 2, `sn-${short}-${envA}-db`);

  const inspLabel =
    inspection === "tls" ? "TLS inspection" : inspection === "ids_ips" ? "IDS / IPS" : "stateful L4–L7";

  /**
   * Firewall hop tile per hub kind for the egress / east-west direction — the
   * device the DRG-attachment ingress route table points 0.0.0.0/0 at
   * (hub_a → Internal NFW, hub_b → the single NFW, hub_c → the Trust NLB in
   * front of the 3rd-party pair). null for hub_e = no inline inspection.
   * Lane 2 draws hub_c's Trust NLB and FW pair as separate tiles, so this
   * collapsed form is only used where the lane has no room for both.
   */
  const fwHopOut = (lane: string): Hop | null => {
    if (hubKind === "hub_e") return null;
    if (hubKind === "hub_a") {
      return { id: `${lane}-fw`, label: "OCI NFW — Internal", sub: inspLabel, icon: "fw", inLabel: "«inspect» drg ingress rt" };
    }
    if (hubKind === "hub_c") {
      return { id: `${lane}-fw`, label: "3rd-party FW pair", sub: "หลัง trust NLB (BYOL)", icon: "fw", inLabel: "«drg ingress rt» → trust NLB" };
    }
    return { id: `${lane}-fw`, label: "OCI Network Firewall", sub: inspLabel, icon: "fw", inLabel: "«inspect» drg ingress rt" };
  };

  /**
   * Collects the notes of one lane and lays them out left→right in the order of
   * the hop each one annotates, so sibling notes can never overlap whatever hop
   * chain the hub kind produced.
   */
  interface LaneNote { id: string; label: string; sub?: string; w: number; near?: number; to: string }
  const noteRow = (parent: string, rowY: number) => {
    const pending: LaneNote[] = [];
    return {
      add(note: LaneNote) {
        pending.push(note);
      },
      flush() {
        let cursor = INNER_X;
        for (const note of [...pending].sort((a, b) => (a.near ?? 0) - (b.near ?? 0))) {
          const x = Math.max(cursor, Math.min(note.near ?? cursor, INNER_X + INNER_W - note.w));
          d.add({
            id: note.id, kind: "note", label: note.label, sublabel: note.sub,
            x, y: rowY, w: note.w, h: NOTE_H, style: "note", parent,
          });
          d.edge({ from: note.id, to: note.to, kind: "leader", dashed: true });
          cursor = x + note.w + 14;
        }
      },
    };
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
  // Hop order follows the generated route tables: hub_a/hub_c inspect BETWEEN
  // the IGW and the LB, hub_b inspects between the LB and the DRG, hub_e not at
  // all. The LB → DRG leg carries spoke-CIDR rules injected by hub_integration.
  const lbMbps = spec?.traffic?.lbBandwidthMbps ?? szAny.lbBandwidthMbps;
  const lbSub =
    typeof lbMbps === "number" && lbMbps > 0 ? `${lbMbps} Mbps flexible` : "flexible shape";
  const lbHop = (inLabel: string): Hop => ({
    id: "l1-lb",
    label: "Load Balancer (L7)",
    sub: wafOn ? `WAF + ${lbSub}` : lbSub,
    icon: "lb",
    inLabel,
  });

  const hops1: Hop[] = [
    { id: "l1-users", label: "Internet users", sub: "public clients", icon: "user", kind: "block", style: "actor" },
    { id: "l1-igw", label: `igw-${short}-lz-hub`, gw: true, icon: "igw", inLabel: "«HTTPS 443»" },
  ];
  if (hubKind === "hub_a") {
    hops1.push({ id: "l1-fw", label: "OCI NFW — DMZ", sub: inspLabel, icon: "fw", inLabel: "«inspect» igw rt → lb cidr" });
    if (hasL7Lb) hops1.push(lbHop("«forward» to lb subnet"));
  } else if (hubKind === "hub_c") {
    hops1.push({ id: "l1-nlb", label: "NLB — untrust", sub: "symmetric flow-hash", icon: "lb", inLabel: "«igw rt» → lb cidr" });
    hops1.push({ id: "l1-fw", label: "3rd-party FW pair", sub: "BYOL appliances", icon: "fw", inLabel: "«inspect»" });
    if (hasL7Lb) hops1.push(lbHop("«forward» to public L7 LB"));
  } else if (hubKind === "hub_e") {
    if (hasL7Lb) hops1.push(lbHop("«route» igw → lb subnet"));
  } else {
    // hub_b (and any unrecognised kind): the IGW has no route table, so clients
    // reach the LB first and the single NFW inspects the LB → spoke leg.
    if (hasL7Lb) hops1.push(lbHop("«route» igw → lb subnet"));
    hops1.push({ id: "l1-fw", label: "OCI Network Firewall", sub: inspLabel, icon: "fw", inLabel: "«inspect» lb rt → spoke cidr" });
  }
  hops1.push({
    id: "l1-drg", label: `drg-${short}-lz-hub`, gw: true,
    inLabel: inspect ? "«route» spoke cidr" : "«route» spoke cidr — no inspection",
  });
  hops1.push({ id: "l1-web", label: "web NSG", sub: webSub.name, icon: "shield", inLabel: "«NSG allow» 443" });
  hops1.push({ id: "l1-app", label: "app NSG", sub: appSub.name, icon: "shield", inLabel: "«NSG allow» app port" });
  hops1.push({ id: "l1-db", label: "db NSG", sub: dbSub.name, icon: "shield", inLabel: "«NSG allow» 1521" });

  const lane1H = 160;
  d.add({
    id: "lane1", kind: "zone",
    label: "LANE 1 — INBOUND (ขาเข้า) · Internet → hub → spoke",
    x: LANE_X, y, w: LANE_W, h: lane1H, style: "zone",
  });
  const n1 = chain(d, "lane1", y + 32, hops1);
  const note1 = noteRow("lane1", y + 32 + TILE_H + 12);
  if (wafOn && hasL7Lb) {
    note1.add({
      id: "l1-waf", label: "WAF policy in front of LB",
      sub: "OWASP core rules — กรองก่อนเข้า hub",
      w: 204, near: at(n1, "l1-lb")?.x, to: "l1-lb",
    });
  }
  if (hubKind === "hub_a") {
    note1.add({
      id: "l1-order", label: "DMZ NFW อยู่หน้า LB",
      sub: "rt-hub-igw: lb cidr → DMZ NFW",
      w: 210, near: at(n1, "l1-fw")?.x, to: "l1-fw",
    });
  } else if (hubKind === "hub_c") {
    note1.add({
      id: "l1-order", label: "FW pair อยู่หน้า L7 LB",
      sub: "rt-hub-igw: lb cidr → untrust NLB",
      w: 224, near: at(n1, "l1-nlb")?.x, to: "l1-nlb",
    });
  } else if (hubKind !== "hub_e") {
    note1.add({
      id: "l1-order", label: "NFW อยู่หลัง LB",
      sub: "rt-hub-lb: spoke cidr → NFW",
      w: 206, near: at(n1, "l1-fw")?.x, to: "l1-fw",
    });
  }
  if (!inspect) {
    note1.add({
      id: "l1-noinsp", label: "no inline inspection — NSG only",
      sub: "hub_e — routing hub, ไม่มี firewall",
      w: 220, near: at(n1, "l1-drg")?.x, to: "l1-drg",
    });
  }
  note1.flush();
  y += lane1H + LANE_GAP;

  // ==== LANE 2 — OUTBOUND (egress) ===========================================
  // Each hub kind gets the egress chain its own route tables build. Only hub_a
  // and hub_b actually terminate on a hub NAT Gateway.
  const egressGb = spec?.traffic?.egressGbPerMonth;
  const inetHop: Hop = {
    id: "l2-inet", label: "Internet", kind: "block", style: "actor", icon: "cloud",
    sub: typeof egressGb === "number" && egressGb > 0 ? `${egressGb} GB/mo egress` : "public internet",
    inLabel: "«egress»",
  };
  const hops2: Hop[] = [
    { id: "l2-app", label: `app subnet — ${envA}`, sub: appSub.name, icon: "compute" },
  ];
  let lane2Zone: string;
  if (hubKind === "hub_e") {
    // has_spoke_natgw — the spoke VCN owns its NAT GW; the DRG is not on the path.
    hops2.push({
      id: "l2-nat", label: `ngw-${short}-lz-${envA}-proj`, gw: true, icon: "natgw",
      inLabel: "«route» 0.0.0.0/0 → spoke NAT GW",
    });
    hops2.push(inetHop);
    lane2Zone = "LANE 2 — OUTBOUND (ขาออก) · spoke NAT GW ของตัวเอง — ไม่ผ่าน DRG / hub";
  } else if (hubKind === "hub_c") {
    // No NAT Gateway anywhere in hub_c — egress leaves through the hub IGW.
    hops2.push({ id: "l2-drg", label: `drg-${short}-lz-hub`, gw: true, inLabel: "«route» 0.0.0.0/0" });
    hops2.push({ id: "l2-nlb", label: "NLB — trust", sub: "symmetric flow-hash", icon: "lb", inLabel: "«drg ingress rt» 0.0.0.0/0" });
    hops2.push({ id: "l2-fw", label: "3rd-party FW pair", sub: "BYOL appliances", icon: "fw", inLabel: "«inspect»" });
    hops2.push({ id: "l2-igw", label: `igw-${short}-lz-hub`, gw: true, icon: "igw", inLabel: "«untrust rt» 0.0.0.0/0" });
    hops2.push(inetHop);
    lane2Zone = "LANE 2 — OUTBOUND (ขาออก) · spoke → DRG → FW pair → Internet Gateway (ไม่มี NAT GW)";
  } else {
    hops2.push({ id: "l2-drg", label: `drg-${short}-lz-hub`, gw: true, inLabel: "«route» 0.0.0.0/0" });
    const fw2 = fwHopOut("l2");
    if (fw2) hops2.push(fw2);
    hops2.push({
      id: "l2-nat", label: `ngw-${short}-lz-hub`, gw: true, icon: "natgw",
      inLabel: "«fw subnet rt» 0.0.0.0/0",
    });
    hops2.push(inetHop);
    lane2Zone = "LANE 2 — OUTBOUND (ขาออก) · spoke → DRG → firewall → hub NAT GW";
  }

  const lane2H = 204;
  d.add({
    id: "lane2", kind: "zone",
    label: `${lane2Zone} · + Service Gateway (private)`,
    x: LANE_X, y, w: LANE_W, h: lane2H, style: "zone",
  });
  chain(d, "lane2", y + 32, hops2);

  // parallel Service Gateway branch — every spoke VCN gets its own SGW plus an
  // all-services route, so OCI service traffic never leaves for the internet
  const row2Y = y + 32 + TILE_H + 38;
  d.add({
    id: "l2-sgw", kind: "gateway", label: `sgw-${short}-lz-${envA}-proj`, icon: "sgw", captionBelow: true,
    x: INNER_X + Math.round(INNER_W * 0.36), y: row2Y + 2, w: 46, h: 46,
    style: "gateway", parent: "lane2",
  });
  d.add({
    id: "l2-osvc", kind: "service",
    label: "OCI Services — Object Storage",
    sublabel: "private — ไม่ออก internet",
    icon: "archive",
    x: INNER_X + Math.round(INNER_W * 0.5), y: row2Y, w: 230, h: 54,
    style: "resourceTile", parent: "lane2",
  });
  d.edge({ from: "l2-app", to: "l2-sgw", kind: "flow", label: "«route» all-services → spoke SGW" });
  d.edge({ from: "l2-sgw", to: "l2-osvc", kind: "flow", label: "«private» bypasses internet" });

  const note2 = { x: INNER_X + INNER_W - 236, y: row2Y + 4, w: 236 };
  if (hubKind === "hub_e") {
    d.add({
      id: "l2-egress-note", kind: "note", label: "แต่ละ spoke มี NAT GW ของตัวเอง",
      sublabel: "has_spoke_natgw — egress ไม่ผ่าน DRG / hub",
      x: note2.x, y: note2.y, w: note2.w, h: NOTE_H, style: "note", parent: "lane2",
    });
    d.edge({ from: "l2-egress-note", to: "l2-nat", kind: "leader", dashed: true });
  } else if (hubKind === "hub_c") {
    d.add({
      id: "l2-egress-note", kind: "note", label: "hub_c ไม่มี NAT Gateway",
      sublabel: "untrust rt: 0.0.0.0/0 → IGW หลัง FW pair",
      x: note2.x, y: note2.y, w: note2.w, h: NOTE_H, style: "note", parent: "lane2",
    });
    d.edge({ from: "l2-egress-note", to: "l2-igw", kind: "leader", dashed: true });
  } else {
    d.add({
      id: "l2-egress-note", kind: "note", label: "egress ผ่าน firewall ก่อนออก NAT GW",
      sublabel: "drg ingress rt → NFW → fw subnet rt → NAT GW",
      x: note2.x, y: note2.y, w: note2.w, h: NOTE_H, style: "note", parent: "lane2",
    });
    d.edge({ from: "l2-egress-note", to: "l2-nat", kind: "leader", dashed: true });
  }
  y += lane2H + LANE_GAP;

  // ==== LANE 3 — EAST-WEST (spoke ⇄ spoke) ===================================
  // hub_a/b/c: the spoke 0.0.0.0/0 → DRG rule sends spoke-to-spoke through the
  // hub ingress route table and its firewall. hub_e: per-peer DRG routes only.
  const hops3: Hop[] = [
    { id: "l3-app", label: `${envA} app tier`, sub: spokeAName, icon: "compute" },
    { id: "l3-drg", label: `drg-${short}-lz-hub`, gw: true, inLabel: "«route» east-west" },
  ];
  const fw3 = fwHopOut("l3");
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
    const note3 = noteRow("lane3", y + 32 + TILE_H + 12);
    note3.add({
      id: "l3-noinsp", label: "no inline inspection — NSG only",
      sub: "hub_e — DRG routes spoke-to-spoke ตรง",
      w: 226, near: at(n3, "l3-drg")?.x, to: "l3-drg",
    });
    note3.flush();
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
    const note4 = noteRow("lane4", y + 32 + TILE_H + 12);
    note4.add({
      id: "l4-insp-note",
      label: inspect ? "hub inspects on-prem traffic" : "on-prem traffic NOT inspected",
      sub: inspect ? "on-prem → DRG → hub firewall → spoke" : "hub_e — DRG routing + spoke NSGs only",
      w: 250, near: (at(n4, "l4-drg")?.x ?? INNER_X) - 60, to: "l4-drg",
    });
    note4.flush();
    y += lane4H + LANE_GAP;
  }

  // ==== right rail: legend · hub route-table policy card · hop glossary ======
  const railX = LANE_X + LANE_W + 26; // 1306 — canvas stays under ~1550
  const legendRows: { left: string; swatch: string }[] = [
    { left: "LANE 1 — INBOUND", swatch: "lb" },
    { left: "LANE 2 — OUTBOUND", swatch: "gateway" },
    { left: "LANE 3 — EAST-WEST", swatch: "fw" },
  ];
  if (conn !== "none") legendRows.push({ left: "LANE 4 — HYBRID", swatch: "actor" });
  legendRows.push({ left: "NSG HOP (SPOKE)", swatch: "resourceTile" });
  addLegend(d, railX, top, legendRows);

  // Next-hops below are the effective chains the generated hub route tables
  // build — no lane claims a device the LaC does not create.
  const policyRows: { left: string; right?: string }[] = [];
  if (hubKind === "hub_a") {
    policyRows.push({ left: "inbound edge", right: "IGW → DMZ NFW" });
    policyRows.push({ left: "inbound spoke", right: hasL7Lb ? "LB → DRG" : "DRG" });
    policyRows.push({ left: "outbound", right: "DRG → Int NFW → NAT" });
    policyRows.push({ left: "east-west", right: "DRG → Int NFW" });
  } else if (hubKind === "hub_c") {
    policyRows.push({ left: "inbound edge", right: "IGW → untrust NLB" });
    policyRows.push({ left: "inbound spoke", right: hasL7Lb ? "FW pair → LB → DRG" : "FW pair → DRG" });
    policyRows.push({ left: "outbound", right: "DRG → trust NLB → FW" });
    policyRows.push({ left: "egress edge", right: "FW pair → IGW (no NAT)" });
    policyRows.push({ left: "east-west", right: "DRG → trust NLB → FW" });
  } else if (hubKind === "hub_e") {
    policyRows.push({ left: "inbound edge", right: hasL7Lb ? "IGW → LB" : "IGW" });
    policyRows.push({ left: "inbound spoke", right: "DRG — no inspection" });
    policyRows.push({ left: "outbound", right: "spoke NAT GW → net" });
    policyRows.push({ left: "east-west", right: "DRG direct" });
  } else {
    policyRows.push({ left: "inbound edge", right: hasL7Lb ? "IGW → LB" : "IGW" });
    policyRows.push({ left: "inbound spoke", right: "NFW → DRG" });
    policyRows.push({ left: "outbound", right: "DRG → NFW → NAT" });
    policyRows.push({ left: "east-west", right: "DRG → NFW" });
  }
  policyRows.push({ left: "oci services", right: "spoke SGW (private)" });
  policyRows.push({
    left: "on-prem",
    right: conn === "none" ? "—" : conn.startsWith("vpn") ? "VPN → DRG" : "FastConnect → DRG",
  });

  const rcY = top + 30 + legendRows.length * 24 + 14;
  const rcH = 20 + 15 + policyRows.length * 16 + 6;
  d.add({
    id: "rtc", kind: "routeCard", label: `rt-${short}-lz-hub — traffic policy`,
    x: railX, y: rcY, w: 210, h: rcH,
    style: "routeCardDrg",
    colHeaders: ["Path", "Next-hop"],
    rows: policyRows,
  });

  const hubFact =
    hubKind === "hub_a"
      ? "hub_a — DMZ NFW หน้า LB, Internal NFW ขาออก"
      : hubKind === "hub_c"
        ? "hub_c — ไม่มี NAT GW · egress ออก IGW"
        : hubKind === "hub_e"
          ? "hub_e — spoke มี NAT GW ของตัวเอง"
          : "hub_b — NFW เดียว อยู่หลัง LB";
  const glossRows: { left: string }[] = [
    { left: "«inspect» — ตรวจสอบที่ firewall" },
    { left: "«route» — DRG / route table" },
    { left: "«igw rt» — route table ผูกกับ IGW" },
    { left: "«NSG allow» — NSG เปิดพอร์ต" },
    { left: "«private» — SGW ไม่ออก internet" },
    { left: hubFact },
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
