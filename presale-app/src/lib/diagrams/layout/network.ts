import type { DiagramDoc, DiagramNode, SolutionSpec } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated, VcnInfo } from "../generated-parse";

// Network View — Oracle OCI Open LZ deployment-view language:
// OCI Region ▸ OCI Tenancy ▸ cmp-landingzone ▸ cream network compartments,
// white VCNs with orange dashed borders, 60px subnet rows (name + blue CIDR),
// gateway circles straddling the VCN bottom border with captions below,
// route-table cards with colored header bars on the left rail + dashed
// leaders, and a legend rail on the right.

const SUB_H = 56;
const SUB_GAP = 10;
const VCN_HEAD = 54;
const GW_ZONE = 44; // caption space under the vcn bottom border

function isHub(v: VcnInfo): boolean {
  return v.name.includes("-hub") || v.category.startsWith("0-");
}

function envOf(v: VcnInfo): string {
  const m = v.category.match(/^\d+-(.+)$/);
  return m ? m[1] : v.category;
}

function subnetPublic(v: VcnInfo, subnetName: string): boolean {
  return isHub(v) && /(^|-)(lb|untrust)($|-)/.test(subnetName);
}

const GW_CAPTION: Record<string, string> = {
  IGW: "Internet\nGateway",
  NAT: "NAT\nGateway",
  SGW: "Service\nGateway",
};
const GW_ICON: Record<string, string> = { IGW: "igw", NAT: "natgw", SGW: "sgw" };

function vcnHeight(v: VcnInfo): number {
  return VCN_HEAD + v.subnets.length * (SUB_H + SUB_GAP) + 8;
}

/** Draws one VCN (frame, subnets, in-row service icons, border gateways). */
function drawVcn(d: Doc, v: VcnInfo, x: number, y: number, w: number, extras: { nfw: boolean; lb: boolean }, parent?: string): number {
  const id = `vcn:${v.key}`;
  const h = vcnHeight(v);
  d.add({ id, kind: "vcn", label: v.name, sublabel: v.cidr, x, y, w, h, style: "vcn", parent });

  const innerX = x + 12;
  const innerW = w - 24;
  let cy = y + VCN_HEAD;
  for (const sn of v.subnets) {
    const pub = subnetPublic(v, sn.name);
    const sub = d.add({
      kind: "subnet",
      label: sn.name,
      sublabel: sn.cidr,
      x: innerX,
      y: cy,
      w: innerW,
      h: SUB_H,
      parent: id,
      style: pub ? "subnetPublic" : "subnetPrivate",
      icon: "rt",
    });
    const isFw = extras.nfw && /(^|-)fw($|-)|fw-dmz|fw-int/.test(sn.name);
    const isLb = extras.lb && /(^|-)lb($|-)/.test(sn.name);
    if (isFw || isLb) {
      d.add({
        kind: "service",
        label: isFw ? "network firewall" : "load balancer (L7)",
        x: innerX + innerW - 132,
        y: cy + 5,
        w: 120,
        h: SUB_H - 10,
        parent: sub.id,
        style: isFw ? "fw" : "lb",
        icon: isFw ? "fw" : "lb",
        captionBelow: true,
      });
    }
    cy += SUB_H + SUB_GAP;
  }

  // gateway circles straddling the bottom border, captions outside below
  let gx = x + 30;
  for (const gw of v.gateways) {
    d.add({
      kind: "gateway",
      label: GW_CAPTION[gw] ?? gw,
      icon: GW_ICON[gw] ?? "drg",
      x: gx,
      y: y + h - 19,
      w: 38,
      h: 38,
      parent: id,
      style: "gateway",
    });
    gx += 72;
  }
  return h;
}

export function layoutNetworkView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  d.add({
    kind: "canvasTitle",
    label: "Network View",
    sublabel: `${spec.hub.kind.replace("_", " ").toUpperCase()} hub-and-spoke · ${spec.region.id} · CIS L${spec.cisLevel}`,
    x: 24, y: 14, w: 700, h: 40, style: "canvasTitle",
  });

  const hub = gen.vcns.find(isHub);
  const spokes = gen.vcns.filter((v) => !isHub(v));
  const ENV_ORDER = ["prod", "preprod", "staging", "uat", "dev", "test"];
  const envRank = (e: string) => (ENV_ORDER.indexOf(e) === -1 ? 99 : ENV_ORDER.indexOf(e));
  const envNames = [...new Set(spokes.map(envOf))].sort((a, b) => envRank(a) - envRank(b));

  // ---- fixed rails --------------------------------------------------------
  const railX = 24;
  const railW = 248;
  const regionX = railX + railW + 34;
  const top = 64;

  // wrappers: region ▸ tenancy ▸ landing zone
  const PAD = 14;
  const tenX = regionX + PAD;
  const lzX = tenX + PAD;
  const contentX = lzX + PAD;
  const contentY = top + 26 * 3 + 8;

  // ---- hub network compartment -------------------------------------------
  const hubVcnW = 430;
  const hubPanelW = hubVcnW + 32;
  let hubPanelH = 0;
  const hubPanelY = contentY;
  if (hub) {
    // AD tabs peeking over the VCN top edge (drawn before the panel/vcn)
    hubPanelH = 30 + vcnHeight(hub) + GW_ZONE + 8;
    const panel = d.add({
      id: "cmp-hub-net",
      kind: "compartment",
      label: "cmp-lz-network",
      x: contentX, y: hubPanelY, w: hubPanelW, h: hubPanelH,
      style: "compartmentShared",
      parent: "lz",
    });
    drawVcn(d, hub, contentX + 16, hubPanelY + 30, hubVcnW, { nfw: gen.hasNfw, lb: gen.hasHubLb }, panel.id);
  }

  // ---- DRG between hub and spokes ----------------------------------------
  const hubCenter = contentX + 16 + hubVcnW / 2;
  const drgY = hubPanelY + hubPanelH + 30;
  d.add({
    id: "drg",
    kind: "gateway",
    label: `drg-${spec.region.shortName}-lz-hub`,
    icon: "drg",
    x: hubCenter - 23, y: drgY, w: 46, h: 46,
    style: "gateway",
    parent: "lz",
  });
  if (hub) d.edge({ from: `vcn:${hub.key}`, to: "drg", kind: "drgLink" });

  // ---- environment compartments (spokes grouped per env, max 2 per row) ---
  const spokeVcnW = 330;
  const envsY = drgY + 46 + 40;
  let ey = envsY;
  let maxRight = contentX + hubPanelW;
  const envPanels: { env: string; node: DiagramNode }[] = [];
  for (let i = 0; i < envNames.length; i += 2) {
    const rowEnvs = envNames.slice(i, i + 2);
    let ex = contentX;
    let rowH = 0;
    for (const env of rowEnvs) {
      const envVcns = spokes.filter((v) => envOf(v) === env);
      const innerH = Math.max(...envVcns.map(vcnHeight)) + 30 + GW_ZONE;
      const netW = envVcns.length * (spokeVcnW + 16) + 16;
      const panelW = netW + 28;
      const panelH = innerH + 44;
      const envPanel = d.add({
        id: `env:${env}`,
        kind: "compartment",
        label: `cmp-lz-${env}`,
        x: ex, y: ey, w: panelW, h: panelH,
        style: "compartmentEnv",
        parent: "lz",
      });
      envPanels.push({ env, node: envPanel });
      d.add({
        id: `envnet:${env}`,
        kind: "compartment",
        label: `cmp-lz-${env}-network`,
        x: ex + 14, y: ey + 28, w: netW, h: innerH,
        parent: envPanel.id,
        style: "compartmentShared",
      });
      let vx = ex + 14 + 16;
      for (const v of envVcns) {
        drawVcn(d, v, vx, ey + 28 + 26, spokeVcnW, { nfw: false, lb: false }, `envnet:${env}`);
        // orthogonal elbow: DRG ▸ down ▸ across ▸ into spoke top
        const spokeCx = vx + spokeVcnW / 2;
        d.edge({
          from: "drg",
          to: `vcn:${v.key}`,
          kind: "drgLink",
          points: [
            { x: hubCenter, y: envsY - 18 },
            { x: spokeCx, y: envsY - 18 },
          ],
        });
        vx += spokeVcnW + 16;
      }
      ex += panelW + 22;
      rowH = Math.max(rowH, panelH);
    }
    maxRight = Math.max(maxRight, ex - 22);
    ey += rowH + 22;
  }
  const contentBottom = ey - 22 + (envNames.length ? 0 : hubPanelH);

  // ---- wrappers sized to content -----------------------------------------
  const lzW = maxRight - contentX + PAD * 2;
  const lzH = contentBottom - contentY + PAD * 2 + 12;
  d.nodes.unshift(
    {
      id: "region", kind: "compartment", label: `OCI Region — ${spec.region.id}`,
      x: regionX, y: top, w: lzW + PAD * 4, h: lzH + 26 * 3, style: "region",
    } as DiagramNode,
    {
      id: "tenancy", kind: "compartment", label: "OCI Tenancy — Operating Entity", parent: "region",
      x: tenX, y: top + 26, w: lzW + PAD * 2, h: lzH + 26 * 2, style: "tenancy",
    } as DiagramNode,
    {
      id: "lz", kind: "compartment", label: "cmp-landingzone", parent: "tenancy",
      x: lzX, y: top + 52, w: lzW, h: lzH + 26, style: "landingZone",
    } as DiagramNode,
  );

  // ---- route-table cards (left rail) with leaders -------------------------
  let cardY = top + 12;
  const mkCard = (id: string, title: string, style: string, rules: { dest: string; via: string }[], target?: string) => {
    if (!rules.length) return;
    const h = 20 + 15 + rules.length * 16 + 6;
    d.add({
      id, kind: "routeCard", label: title,
      x: railX, y: cardY, w: railW, h,
      style,
      colHeaders: ["Destination", "Next-hop"],
      rows: rules.map((r) => ({ left: r.dest, right: r.via || "—" })),
    });
    if (target) d.edge({ from: id, to: target, kind: "leader" });
    cardY += h + 18;
  };
  if (hub) mkCard("rtc-hub", `rt-${hub.name.replace(/^vcn-/, "")}`, "routeCardHub", hub.routeRules, `vcn:${hub.key}`);
  if (spokes[0]) mkCard("rtc-spoke", `rt-${spokes[0].name.replace(/^vcn-/, "")}`, "routeCardSpoke", spokes[0].routeRules, `vcn:${spokes[0].key}`);
  if (gen.drgPresent) {
    mkCard("rtc-drg", `drgrt-${spec.region.shortName}-lz-hub`, "routeCardDrg", [
      { dest: "spoke ↔ spoke", via: gen.hasNfw ? "hub firewall" : "direct" },
      { dest: "north-south", via: gen.hasHubLb ? "hub LB" : "hub" },
    ], "drg");
  }

  // ---- right rail: on-prem actor + legend ---------------------------------
  const rightX = regionX + lzW + PAD * 4 + 30;
  if (spec.hub.connectivity !== "none") {
    d.add({
      id: "onprem",
      kind: "block",
      label: "On-premises",
      sublabel: spec.hub.connectivity === "vpn" ? "Site-to-Site VPN (IPSec)" : `FastConnect ${spec.hub.connectivity.endsWith("10g") ? "10 Gbps" : "1 Gbps"}`,
      icon: "onprem",
      captionBelow: true,
      x: rightX, y: top + 10, w: 150, h: 96,
      style: "actor",
    });
    d.edge({
      from: "onprem", to: "drg", kind: "drgLink", dashed: true,
      points: [{ x: rightX + 75, y: drgY + 23 }],
      label: "«connects»",
    });
  }
  addLegend(d, rightX, top + (spec.hub.connectivity !== "none" ? 140 : 10), [
    { left: "OCI REGION", swatch: "region" },
    { left: "OCI TENANCY", swatch: "tenancy" },
    { left: "LZ ENVIRONMENT", swatch: "landingZone" },
    { left: "SHARED / NETWORK CMP", swatch: "compartmentShared" },
    { left: "WORKLOAD ENVIRONMENT", swatch: "compartmentEnv" },
    { left: "VCN", swatch: "vcn" },
    { left: "PUBLIC SUBNET", swatch: "subnetPublic" },
    { left: "PRIVATE SUBNET", swatch: "subnetPrivate" },
  ]);

  return d.finish({ view: "network", title: { th: "มุมมองเครือข่าย (Network View)", en: "Network View" } });
}
