import type {
  Connectivity,
  DiagramDoc,
  EnvName,
  SolutionSpec,
  ViewId,
} from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated, SubnetInfo, VcnInfo } from "../generated-parse";

// Traffic Flow View — how packets actually move through the hub-and-spoke:
//   · north-south : Internet users → hub LB (+WAF note) → NFW inspection →
//     DRG → env spoke (web → app → db subnets, NSG hops)
//   · east-west   : spoke A → DRG → hub firewall → spoke B
//   · on-prem     : VPN / FastConnect → DRG
// Every traffic hop is an edge of kind "flow" so the web canvas can animate
// packets along it. Lanes are separated with explicit waypoints so the three
// path families never share a segment. Hub inspection follows spec.hub.kind:
// hub_a = 2 firewalls (DMZ + internal), hub_b = single NFW, hub_c = NLB
// sandwich with a 3rd-party FW pair, hub_e = routing only (note, no FW).

// "traffic" is not (yet) part of the ViewId union in domain/types.ts; the
// contract for this view requires the exact runtime string "traffic", so we
// widen deliberately instead of editing the shared types file.
const VIEW = "traffic" as unknown as ViewId;

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
  const short = (spec.region && spec.region.shortName) || "oci";
  const hubKind = (spec.hub && spec.hub.kind) || "hub_b";
  const conn: Connectivity = (spec.hub && spec.hub.connectivity) || "none";
  const inspection = (spec.hub && spec.hub.inspection) || "standard";
  const szAny = spec.sizing as unknown as { waf?: boolean; lbBandwidthMbps?: number };
  const wafOn = szAny.waf === true || (spec.traffic?.wafRequestsM ?? 0) > 0;

  const envList: EnvName[] =
    spec.environments && spec.environments.length ? spec.environments : (["prod"] as EnvName[]);
  const envA: EnvName = envList[0];
  const envB: EnvName | undefined = envList[1];

  const spokes = gen.vcns.filter((v) => !isHub(v));
  const hubVcn = gen.vcns.find(isHub);
  const spokeA = spokes.find((v) => v.category.endsWith(envA)) ?? spokes[0];
  const spokeB =
    (envB ? spokes.find((v) => v.category.endsWith(envB)) : undefined) ??
    spokes.find((v) => v !== spokeA);

  const subOf = (re: RegExp, i: number, fallback: string): SubnetInfo => {
    const byName = spokeA?.subnets.find((s) => re.test(s.name));
    return byName ?? spokeA?.subnets[i] ?? { key: fallback, name: fallback, cidr: "" };
  };
  const webSub = subOf(/web/, 0, `sn-${short}-${envA}-web`);
  const appSub = subOf(/app/, 1, `sn-${short}-${envA}-app`);
  const dbSub = subOf(/db/, 2, `sn-${short}-${envA}-db`);

  // ---- title ----------------------------------------------------------------
  d.add({
    kind: "canvasTitle",
    label: "Traffic Flow View",
    sublabel: `north-south · east-west · hybrid — ${hubKind.replace("_", " ").toUpperCase()} inspection · ${spec.region?.id ?? ""}`,
    x: 24, y: 14, w: 760, h: 40, style: "canvasTitle",
  });

  // ---- wrappers: region ▸ tenancy ▸ landing zone (network-view idiom) -------
  d.add({
    id: "region", kind: "compartment", label: `OCI Region — ${spec.region?.id ?? "oci"}`,
    x: 210, y: 64, w: 922, h: 550, style: "region",
  });
  d.add({
    id: "tenancy", kind: "compartment", label: "OCI Tenancy — Operating Entity", parent: "region",
    x: 224, y: 90, w: 894, h: 510, style: "tenancy",
  });
  d.add({
    id: "lz", kind: "compartment", label: "cmp-landingzone", parent: "tenancy",
    x: 238, y: 116, w: 866, h: 470, style: "landingZone",
  });

  // ---- hub: cmp-lz-network ▸ hub VCN ▸ LB + inspection tiles ---------------
  const TILE_X = 302;
  const TILE_W = 200;
  const TILE_H = 52;
  const lastBottom = hubKind === "hub_a" ? 404 : hubKind === "hub_e" ? 352 : 340;
  const vcnH = lastBottom + 16 - 180;
  d.add({
    id: "hub-panel", kind: "compartment", label: "cmp-lz-network — hub",
    x: 252, y: 150, w: 300, h: vcnH + 46, style: "compartmentShared", parent: "lz",
  });
  d.add({
    id: "hub-vcn", kind: "vcn",
    label: hubVcn?.name ?? `vcn-${short}-lz-hub`,
    sublabel: hubVcn?.cidr ?? "",
    x: 268, y: 180, w: 268, h: vcnH, style: "vcn", parent: "hub-panel",
  });

  const lbMbps = spec.traffic?.lbBandwidthMbps ?? szAny.lbBandwidthMbps;
  d.add({
    id: "lb", kind: "service",
    label: hubKind === "hub_c" ? "Network Load Balancer" : "Load Balancer (L7)",
    sublabel:
      hubKind === "hub_c"
        ? "flow-hash to FW pair"
        : typeof lbMbps === "number" && lbMbps > 0
          ? `${lbMbps} Mbps flexible`
          : "flexible shape",
    icon: "lb",
    x: TILE_X, y: 224, w: TILE_W, h: TILE_H, style: "resourceTile", parent: "hub-vcn",
  });

  const inspLabel =
    inspection === "tls" ? "TLS inspection" : inspection === "ids_ips" ? "IDS / IPS" : "stateful L4–L7";
  let nsExitId = "lb"; // last hub hop before the DRG on the north-south lane
  let ewFwId: string | null = null; // inspection hop on the east-west lane
  if (hubKind === "hub_a") {
    d.add({
      id: "fw-dmz", kind: "service", label: "OCI Network Firewall — DMZ", sublabel: inspLabel,
      icon: "fw", x: TILE_X, y: 288, w: TILE_W, h: TILE_H, style: "resourceTile", parent: "hub-vcn",
    });
    d.add({
      id: "fw-int", kind: "service", label: "OCI Network Firewall — internal", sublabel: inspLabel,
      icon: "fw", x: TILE_X, y: 352, w: TILE_W, h: TILE_H, style: "resourceTile", parent: "hub-vcn",
    });
    d.edge({ from: "lb", to: "fw-dmz", kind: "flow", label: "«inspect»" });
    d.edge({ from: "fw-dmz", to: "fw-int", kind: "flow", label: "«inspect»" });
    nsExitId = "fw-int";
    ewFwId = "fw-int";
  } else if (hubKind === "hub_b") {
    d.add({
      id: "nfw", kind: "service", label: "OCI Network Firewall", sublabel: inspLabel,
      icon: "fw", x: TILE_X, y: 288, w: TILE_W, h: TILE_H, style: "resourceTile", parent: "hub-vcn",
    });
    d.edge({ from: "lb", to: "nfw", kind: "flow", label: "«inspect»" });
    nsExitId = "nfw";
    ewFwId = "nfw";
  } else if (hubKind === "hub_c") {
    d.add({
      id: "fw1", kind: "service", label: "3rd-party FW #1",
      icon: "fw", x: 302, y: 288, w: 94, h: TILE_H, style: "resourceTile", parent: "hub-vcn",
    });
    d.add({
      id: "fw2", kind: "service", label: "3rd-party FW #2",
      icon: "fw", x: 408, y: 288, w: 94, h: TILE_H, style: "resourceTile", parent: "hub-vcn",
    });
    d.edge({ from: "lb", to: "fw1", kind: "flow", label: "«inspect»" });
    nsExitId = "fw1";
    ewFwId = "fw2";
  } else {
    // hub_e — routing hub only, no inline inspection
    d.add({
      id: "no-insp", kind: "note", label: "hub_e — no inline inspection",
      sublabel: "ทราฟฟิกวิ่งผ่าน DRG โดยตรง (routing only)",
      x: TILE_X, y: 288, w: TILE_W, h: 64, style: "note", parent: "hub-vcn",
    });
  }

  // ---- DRG ------------------------------------------------------------------
  d.add({
    id: "drg", kind: "gateway", label: `drg-${short}-lz-hub`, icon: "drg",
    x: 610, y: 328, w: 46, h: 46, style: "gateway", parent: "lz",
  });
  d.edge({
    from: nsExitId, to: "drg", kind: "flow",
    label: hubKind === "hub_e" ? "«route» — no inspection" : "«route»",
  });

  // ---- spoke A: env VCN with web → app → db ---------------------------------
  d.add({
    id: "pa", kind: "compartment", label: `cmp-lz-${envA}`,
    x: 710, y: 150, w: 380, h: 272, style: "compartmentEnv", parent: "lz",
  });
  d.add({
    id: "vcnA", kind: "vcn",
    label: spokeA?.name ?? `vcn-${short}-${envA}-spoke`,
    sublabel: spokeA?.cidr ?? "",
    x: 726, y: 180, w: 348, h: 226, style: "vcn", parent: "pa",
  });
  const tiers: { id: string; sub: SubnetInfo; y: number }[] = [
    { id: "web", sub: webSub, y: 224 },
    { id: "app", sub: appSub, y: 282 },
    { id: "db", sub: dbSub, y: 340 },
  ];
  for (const t of tiers) {
    d.add({
      id: t.id, kind: "subnet", label: t.sub.name, sublabel: t.sub.cidr,
      x: 738, y: t.y, w: 324, h: 48, style: "subnetPrivate", icon: "rt", parent: "vcnA",
    });
  }
  d.edge({ from: "web", to: "app", kind: "flow", label: "«NSG allow» app port" });
  d.edge({ from: "app", to: "db", kind: "flow", label: "«NSG allow» 1521" });

  // north-south entry into the spoke (lane at x=690)
  d.edge({
    from: "drg", to: "web", kind: "flow", label: "«route» · «NSG allow 443»",
    points: [{ x: 690, y: 351 }, { x: 690, y: 248 }],
  });

  // ---- spoke B (second env / platform spoke) --------------------------------
  d.add({
    id: "pb", kind: "compartment",
    label: envB ? `cmp-lz-${envB}` : "cmp-lz — second spoke",
    x: 710, y: 460, w: 380, h: 110, style: "compartmentEnv", parent: "lz",
  });
  d.add({
    id: "vcnB", kind: "vcn",
    label: spokeB?.name ?? (envB ? `vcn-${short}-${envB}-spoke` : `vcn-${short}-platform-spoke`),
    sublabel: spokeB?.cidr ?? "workload subnets",
    x: 726, y: 490, w: 348, h: 64, style: "vcn", parent: "pb",
  });

  // ---- east-west lane: spoke A → DRG → firewall → spoke B -------------------
  d.edge({
    from: "app", to: "drg", kind: "flow", label: "«route» east-west",
    points: [{ x: 672, y: 306 }],
  });
  if (ewFwId) {
    d.edge({
      from: "drg", to: ewFwId, kind: "flow", label: "«inspect»",
      points: [{ x: 618, y: 430 }, { x: 451, y: 430 }],
    });
    const fwDropX = hubKind === "hub_c" ? 455 : 402;
    d.edge({
      from: ewFwId, to: "vcnB", kind: "flow", label: "«route»",
      points: [{ x: fwDropX, y: 522 }],
    });
  } else {
    d.edge({
      from: "drg", to: "vcnB", kind: "flow", label: "«route» — no inspection",
      points: [{ x: 618, y: 430 }, { x: 618, y: 522 }],
    });
  }

  // ---- actors (left column) -------------------------------------------------
  d.add({
    id: "users", kind: "block", label: "Internet users", sublabel: "public clients",
    icon: "user", captionBelow: true,
    x: 24, y: 202, w: 150, h: 96, style: "actor",
  });
  d.edge({ from: "users", to: "lb", kind: "flow", label: "«HTTPS 443»" });

  if (wafOn) {
    d.add({
      id: "waf-note", kind: "note", label: "WAF policy in front of LB",
      sublabel: "OWASP core rules — กรองก่อนเข้า hub",
      x: 24, y: 330, w: 176, h: 56, style: "note",
    });
    d.edge({ from: "waf-note", to: "lb", kind: "leader", dashed: true });
  }

  if (conn !== "none") {
    d.add({
      id: "onprem", kind: "block", label: "On-premises DC", sublabel: connLabel(conn),
      icon: "onprem", captionBelow: true,
      x: 24, y: 640, w: 150, h: 96, style: "actor",
    });
    const linkName = conn.startsWith("vpn")
      ? "IPSec VPN"
      : conn === "fastconnect_vpn_backup"
        ? "FastConnect + VPN"
        : "FastConnect";
    d.edge({
      from: "onprem", to: "drg", kind: "flow", label: `«${linkName}» → «route»`,
      points: [{ x: 648, y: 688 }, { x: 648, y: 400 }],
    });
  }

  // ---- right rail: legend, DRG traffic policy card, hop glossary ------------
  const railX = 1162;
  addLegend(d, railX, 64, [
    { left: "NORTH-SOUTH — INTERNET", swatch: "lb" },
    { left: "EAST-WEST — SPOKE ⇄ SPOKE", swatch: "fw" },
    { left: "ON-PREM — HYBRID PATH", swatch: "actor" },
    { left: "VCN", swatch: "vcn" },
    { left: "PRIVATE SUBNET", swatch: "subnetPrivate" },
  ]);

  const nsHop = hubKind === "hub_e" ? "hub LB → DRG" : "hub LB → firewall";
  const ewHop = hubKind === "hub_e" ? "DRG (direct)" : hubKind === "hub_c" ? "NLB + FW pair" : "hub firewall";
  const opHop = conn === "none" ? "—" : conn.startsWith("vpn") ? "VPN → DRG" : "FastConnect → DRG";
  d.add({
    id: "rtc", kind: "routeCard", label: `drgrt-${short}-lz-hub — traffic policy`,
    x: railX, y: 234, w: 210, h: 20 + 15 + 3 * 16 + 6,
    style: "routeCardDrg",
    colHeaders: ["Path", "Next-hop"],
    rows: [
      { left: "north-south", right: nsHop },
      { left: "east-west", right: ewHop },
      { left: "on-prem", right: opHop },
    ],
  });
  d.edge({ from: "rtc", to: "drg", kind: "leader" });

  const noteRows: { left: string }[] = [
    { left: "«inspect» — ตรวจสอบที่ firewall" },
    { left: "«route» — DRG / route table" },
    { left: "«NSG allow» — NSG เปิดพอร์ต" },
  ];
  if (spec.sizing.kind === "enterprise_lz") {
    const projs = (spec.sizing.plans?.[envA]?.projects ?? []).map((p) => p.name).slice(0, 4);
    if (projs.length) noteRows.push({ left: `per-project NSGs: ${projs.join(", ")}` });
  }
  d.add({
    id: "hops", kind: "group", label: "Hop labels — คำอธิบาย",
    x: railX, y: 343, w: 210, h: 34 + noteRows.length * 18 + 8,
    style: "resourceTile", rows: noteRows,
  });

  return d.finish({
    view: VIEW,
    title: { th: "มุมมองการไหลของทราฟฟิก (Traffic Flow View)", en: "Traffic Flow View" },
  });
}
