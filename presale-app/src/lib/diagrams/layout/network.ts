import type { DiagramDoc, SolutionSpec } from "@/lib/domain/types";
import { Doc } from "../model";
import type { ParsedGenerated, VcnInfo } from "../generated-parse";

// Network View — hub-and-spoke structure rendered from the generated
// network.json (styled after 4_network_view_structure.jpg / hub deployment
// views: dashed red VCN frames, green public / red private subnets, gateway
// circles on the VCN border, DRG in the middle, route cards on the right).

const SUB_H = 30;
const SUB_GAP = 8;

function isHub(v: VcnInfo): boolean {
  return v.name.includes("-hub") || v.category.startsWith("0-");
}

function subnetStyle(v: VcnInfo, subnetName: string): string {
  // Public edges: the hub LB subnet (all hubs) and the hub untrust subnet
  // (hub_c's internet-facing side). Everything else is private.
  return isHub(v) && /(^|-)(lb|untrust)($|-)/.test(subnetName) ? "subnetPublic" : "subnetPrivate";
}

function drawVcn(d: Doc, v: VcnInfo, x: number, y: number, w: number, extras: { nfw: boolean; lb: boolean }): number {
  const id = `vcn:${v.key}`;
  const innerX = x + 14;
  const innerW = w - 28;
  let cy = y + 30;
  const vcnNode = d.add({ id, kind: "vcn", label: v.name, sublabel: v.cidr, x, y, w, h: 0, style: "vcn" });

  for (const sn of v.subnets) {
    const sub = d.add({
      kind: "subnet",
      label: sn.name,
      sublabel: sn.cidr,
      x: innerX,
      y: cy,
      w: innerW,
      h: SUB_H,
      parent: id,
      style: subnetStyle(v, sn.name),
    });
    if (extras.nfw && /(^|-)fw($|-)|fw-dmz|fw-int/.test(sn.name)) {
      d.add({ kind: "service", label: "NFW", x: innerX + innerW - 62, y: cy + 4, w: 52, h: SUB_H - 8, parent: sub.id, style: "fw" });
    }
    if (extras.lb && /(^|-)lb($|-)/.test(sn.name)) {
      d.add({ kind: "service", label: "LB", x: innerX + innerW - 62, y: cy + 4, w: 52, h: SUB_H - 8, parent: sub.id, style: "lb" });
    }
    cy += SUB_H + SUB_GAP;
  }
  const h = cy - y + 10;
  vcnNode.h = h;

  // gateway circles sitting on the bottom border
  let gx = x + 24;
  for (const gw of v.gateways) {
    d.add({ kind: "gateway", label: gw, x: gx, y: y + h - 14, w: 28, h: 28, parent: id, style: "gateway" });
    gx += 40;
  }
  return h;
}

export function layoutNetworkView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: `Network View — ${spec.hub.kind.replace("_", " ").toUpperCase()} hub-and-spoke (${spec.region.id})`,
    x: 24, y: 16, w: 700, h: 26, style: "canvasTitle",
  });

  const hub = gen.vcns.find(isHub);
  const spokes = gen.vcns.filter((v) => !isHub(v));

  const hubW = 380;
  const spokeW = 300;
  const left = 24;
  const hubX = left + 150;
  let hubBottom = 60;

  if (hub) {
    hubBottom = 60 + drawVcn(d, hub, hubX, 60, hubW, { nfw: gen.hasNfw, lb: gen.hasHubLb });
  }

  if (spec.hub.connectivity !== "none") {
    d.add({
      id: "onprem",
      kind: "service",
      label: "On-premises",
      sublabel: spec.hub.connectivity === "vpn" ? "Site-to-Site VPN" : `FastConnect ${spec.hub.connectivity.endsWith("10g") ? "10 Gbps" : "1 Gbps"}`,
      x: hubX + hubW + 90, y: 84, w: 170, h: 56, style: "actor",
    });
  }

  const drgY = hubBottom + 42;
  d.add({ id: "drg", kind: "drg", label: "DRG", sublabel: "hub-and-spoke router", x: hubX + hubW / 2 - 90, y: drgY, w: 180, h: 46, style: "drg" });
  if (hub) d.edge({ from: `vcn:${hub.key}`, to: "drg", kind: "drgLink" });
  if (spec.hub.connectivity !== "none") {
    d.edge({ from: "drg", to: "onprem", kind: "drgLink", label: spec.hub.connectivity === "vpn" ? "IPSec" : "virtual circuit" });
  }

  const spokesY = drgY + 46 + 44;
  let sx = left;
  for (const spoke of spokes) {
    drawVcn(d, spoke, sx, spokesY, spokeW, { nfw: false, lb: false });
    d.edge({ from: "drg", to: `vcn:${spoke.key}`, kind: "drgLink" });
    sx += spokeW + 28;
  }

  // route cards column on the right
  const cardX = Math.max(sx + 30, hubX + hubW + 90, 820);
  let cardY = 170;
  const mkCard = (title: string, style: string, rules: { dest: string; via: string }[]) => {
    if (!rules.length) return;
    const h = 26 + rules.length * 18 + 8;
    d.add({
      kind: "routeCard",
      label: title,
      x: cardX, y: cardY, w: 250, h,
      style,
      rows: rules.map((r) => ({ left: r.dest, right: r.via || "—" })),
    });
    cardY += h + 14;
  };
  if (hub) mkCard("route — hub VCN", "routeCardHub", hub.routeRules);
  if (spokes[0]) mkCard(`route — ${spokes[0].name.replace(/^vcn-[a-z]+-/, "")}`, "routeCardSpoke", spokes[0].routeRules);
  if (gen.drgPresent) {
    mkCard("DRG routing", "routeCardDrg", [
      { dest: "spoke ↔ spoke", via: gen.hasNfw ? "inspect @ hub FW" : "direct" },
      { dest: "north-south", via: gen.hasHubLb ? "hub LB ingress" : "hub" },
    ]);
  }

  return d.finish({ view: "network", title: { th: "มุมมองเครือข่าย (Network View)", en: "Network View" } });
}
