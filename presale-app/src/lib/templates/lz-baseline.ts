import type { BomItem, LocalizedText, SolutionSpec } from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";

// BOM lines every landing zone carries, driven by hub model + CIS level +
// connectivity. Free services are listed with qty/price 0 so the BOM reads
// as a complete architecture, not just the paid parts.

export function lzBaselineBom(spec: SolutionSpec): BomItem[] {
  const items: BomItem[] = [];
  const envCount = spec.environments.length;

  // --- hub firewall/inspection layer ---------------------------------------
  if (spec.hub.kind === "hub_a" || spec.hub.kind === "hub_b") {
    const fwCount = spec.hub.kind === "hub_a" ? 2 : 1;
    items.push(
      {
        catalogKey: "nfw_instance",
        label: {
          th: `OCI Network Firewall (${spec.hub.kind === "hub_a" ? "HA คู่" : "เดี่ยว"})`,
          en: `OCI Network Firewall (${spec.hub.kind === "hub_a" ? "HA pair" : "single"})`,
        },
        category: "landing_zone",
        quantity: fwCount,
        unit: "instance",
        monthlyMetricQty: hours(fwCount),
        deployedByLz: true,
        notes: {
          th: "ตัวขับ cost หลักของ LZ — ลดได้โดยเลือก Hub E (ไม่มี firewall)",
          en: "Dominant LZ cost — choose Hub E (no firewall) to remove it",
        },
      },
      {
        catalogKey: "nfw_data_gb",
        label: { th: "NFW data processing (สมมติ ~2TB/เดือน)", en: "NFW data processing (assumes ~2TB/month)" },
        category: "landing_zone",
        quantity: 2048,
        unit: "GB",
        monthlyMetricQty: 2048,
        deployedByLz: true,
        notes: {
          th: "10TB แรก/เดือนฟรี — เกินคิด ฿0.56/GB; ปรับตาม traffic ที่ผ่าน firewall จริง",
          en: "First 10TB/month free — ฿0.56/GB beyond; adjust to real inspected traffic",
        },
      },
    );
  }
  if (spec.hub.kind === "hub_c") {
    items.push({
      catalogKey: "nlb",
      label: { th: "Network Load Balancer ×2 (สำหรับ 3rd-party firewall)", en: "Network Load Balancer ×2 (for 3rd-party firewalls)" },
      category: "landing_zone",
      quantity: 2,
      unit: "instance",
      monthlyMetricQty: 0,
      deployedByLz: true,
      notes: {
        th: "NLB ฟรี — ราคา firewall 3rd-party (BYOL/marketplace) ไม่รวมในนี้",
        en: "NLB is free — 3rd-party firewall (BYOL/marketplace) cost not included",
      },
    });
  }

  // --- hub public load balancer --------------------------------------------
  // The generator ships a sample hub LB only for spoke-based designs; when an
  // OKE platform is present it omits it (ingress via the OKE int-lb subnet).
  const lzShipsHubLb =
    spec.template !== "oke_platform" &&
    !(spec.template === "chatbot" && spec.sizing.kind === "chatbot" && spec.sizing.runtime === "oke");
  items.push({
    catalogKey: "lb_base",
    label: { th: "Flexible Load Balancer (hub public ingress)", en: "Flexible Load Balancer (hub public ingress)" },
    category: "landing_zone",
    quantity: 1,
    unit: "LB",
    monthlyMetricQty: hours(1), // first 744 LB-hours are free per price list
    deployedByLz: lzShipsHubLb,
    notes: lzShipsHubLb
      ? undefined
      : {
          th: "ดีไซน์ OKE ไม่มี sample LB ใน LaC — สร้าง ingress ชี้ OKE int-lb หลัง deploy",
          en: "OKE designs ship no sample LB in the LaC — provision ingress towards the OKE int-lb after deploy",
        },
  });

  // --- connectivity ---------------------------------------------------------
  // Redundancy-aware: HA variants provision paired links across DRG for
  // active/active or active/standby resilience (our connectivity strength).
  const conn = spec.hub.connectivity;
  const vpnTunnels = conn === "vpn" ? 2 : conn === "vpn_ha" ? 4 : conn === "fastconnect_vpn_backup" ? 2 : 0;
  if (vpnTunnels > 0) {
    items.push({
      catalogKey: "vpn_ipsec",
      label: {
        th: `Site-to-Site VPN (IPSec) — ${vpnTunnels} tunnels${conn === "vpn_ha" ? " (redundant, 2 CPE)" : conn === "fastconnect_vpn_backup" ? " (backup path)" : " (HA pair)"}`,
        en: `Site-to-Site VPN (IPSec) — ${vpnTunnels} tunnels${conn === "vpn_ha" ? " (redundant, 2 CPE)" : conn === "fastconnect_vpn_backup" ? " (backup path)" : " (HA pair)"}`,
      },
      category: "landing_zone",
      quantity: vpnTunnels,
      unit: "tunnel",
      monthlyMetricQty: 0,
      deployedByLz: false,
      notes: { th: "บริการฟรี — CPE/BGP ฝั่งลูกค้าตั้งค่าหลัง LZ; แต่ละ IPSec มี 2 tunnel redundant ที่ OCI", en: "Free service — customer CPE/BGP configured post-LZ; each IPSec connection has 2 redundant OCI tunnels" },
    });
  }
  const fcPorts = conn === "fastconnect_1g" || conn === "fastconnect_10g" || conn === "fastconnect_vpn_backup"
    ? 1
    : conn === "fastconnect_1g_ha" || conn === "fastconnect_10g_ha"
      ? 2
      : 0;
  if (fcPorts > 0) {
    const is10g = conn === "fastconnect_10g" || conn === "fastconnect_10g_ha";
    items.push({
      catalogKey: is10g ? "fastconnect_10g" : "fastconnect_1g",
      label: {
        th: `FastConnect ${is10g ? "10" : "1"} Gbps port ×${fcPorts}${fcPorts > 1 ? " (dual, HA)" : conn === "fastconnect_vpn_backup" ? " (primary)" : ""}`,
        en: `FastConnect ${is10g ? "10" : "1"} Gbps port ×${fcPorts}${fcPorts > 1 ? " (dual, HA)" : conn === "fastconnect_vpn_backup" ? " (primary)" : ""}`,
      },
      category: "landing_zone",
      quantity: fcPorts,
      unit: "port",
      monthlyMetricQty: hours(fcPorts),
      deployedByLz: false,
      notes: {
        th: fcPorts > 1
          ? "2 ports ต่าง edge/router เพื่อ HA — ค่า provider/cross-connect (Equinix/Megaport ฯลฯ) คิดแยก"
          : "ราคา port ฝั่ง OCI — ค่า provider/cross-connect คิดแยกโดยผู้ให้บริการ",
        en: fcPorts > 1
          ? "2 ports on separate edges/routers for HA — provider/cross-connect (Equinix/Megaport, etc.) billed separately"
          : "OCI port charge only — provider/cross-connect fees billed separately",
      },
    });
  }

  // --- security posture (free tier services the LZ enables) -----------------
  const free = (catalogKey: string, label: LocalizedText): BomItem => ({
    catalogKey,
    label,
    category: "security",
    quantity: 1,
    unit: "service",
    monthlyMetricQty: 0,
    deployedByLz: true,
  });
  items.push(
    free("cloud_guard", { th: "Cloud Guard (posture management)", en: "Cloud Guard (posture management)" }),
    free("security_zones", { th: `Security Zones (CIS L${spec.cisLevel} recipes)`, en: `Security Zones (CIS L${spec.cisLevel} recipes)` }),
    free("vss", { th: "Vulnerability Scanning Service", en: "Vulnerability Scanning Service" }),
  );
  if (spec.cisLevel === 2) {
    items.push({
      catalogKey: "vault_free",
      label: { th: "OCI Vault + software keys (CIS L2)", en: "OCI Vault + software keys (CIS L2)" },
      category: "security",
      quantity: 1,
      unit: "vault",
      monthlyMetricQty: 0,
      deployedByLz: true,
    });
  }

  // --- observability --------------------------------------------------------
  const logGb = 15 + envCount * 15; // rough flow-log + audit estimate per env
  items.push(
    {
      catalogKey: "logging_gb",
      label: { th: "Logging (VCN flow logs + audit)", en: "Logging (VCN flow logs + audit)" },
      category: "observability",
      quantity: logGb,
      unit: "GB/เดือน",
      monthlyMetricQty: logGb,
      deployedByLz: true,
      notes: { th: "ประมาณการ — 10GB แรกฟรี", en: "Estimate — first 10GB free" },
    },
    {
      catalogKey: "events_notifications",
      label: { th: "Events + Alarms + Notifications + Service Connector", en: "Events + Alarms + Notifications + Service Connector" },
      category: "observability",
      quantity: 1,
      unit: "set",
      monthlyMetricQty: 0,
      deployedByLz: true,
    },
  );

  // --- governance / IAM -----------------------------------------------------
  items.push(
    {
      catalogKey: "identity_domain",
      label: { th: "Identity Domain + IAM groups/policies", en: "Identity Domain + IAM groups/policies" },
      category: "landing_zone",
      quantity: 1,
      unit: "domain",
      monthlyMetricQty: 0,
      deployedByLz: true,
    },
    {
      catalogKey: "budgets_tags",
      label: { th: "Budgets + cost tracking tags", en: "Budgets + cost tracking tags" },
      category: "landing_zone",
      quantity: 1,
      unit: "set",
      monthlyMetricQty: 0,
      deployedByLz: true,
    },
  );

  return items;
}

export function lzBaselineAssumptions(spec: SolutionSpec): LocalizedText[] {
  const list: LocalizedText[] = [
    {
      th: "ราคาเป็น AIS Cloud list price (THB, Pay-As-You-Go) ไม่รวมส่วนลดสัญญา — อ้างอิง region ap-bangkok-1 (AIS Cloud powered by Oracle Alloy)",
      en: "Prices are AIS Cloud list prices (THB, Pay-As-You-Go) with no contract discount — for region ap-bangkok-1 (AIS Cloud powered by Oracle Alloy)",
    },
    {
      th: "คำนวณรายเดือนที่ 744 ชั่วโมง/เดือน ตามมาตรฐาน OCI cost estimator",
      en: "Monthly figures use 744 hours/month per the OCI cost estimator convention",
    },
    {
      th: "Landing zone (network/IAM/security/observability/governance) deploy ได้จริงจากไฟล์ JSON ที่แนบ ผ่าน OCI Landing Zones Orchestrator — ทรัพยากร workload (VM/DB/GenAI) คิดราคาไว้แต่ provision หลังวาง LZ",
      en: "The landing zone (network/IAM/security/observability/governance) deploys from the attached JSON via the OCI Landing Zones Orchestrator — workload resources (VM/DB/GenAI) are priced here but provisioned after the LZ",
    },
  ];
  if (spec.hub.kind === "hub_e") {
    list.push({
      th: "Hub E ไม่มี network firewall — เหมาะกับ PoC/งบจำกัด; อัปเกรดเป็น Hub B/A ได้ภายหลัง",
      en: "Hub E has no network firewall — fits PoC/tight budgets; upgrade to Hub B/A later",
    });
  }
  if (spec.environments.length > 1 && spec.rightsizeNonProd !== false) {
    list.push({
      th: "สเปกของ workload ในแต่ละ environment ถูกลดตามความเหมาะสม (preprod~50% · uat~40% · dev/test~30% ของ prod) — ปิดได้ที่ตัวเลือก “ลดสเปก non-prod”",
      en: "Per-environment workload specs are right-sized down (preprod~50% · uat~40% · dev/test~30% of prod) — toggle off via the “right-size non-prod” option",
    });
  }
  return list;
}
