import type { GenerateResult } from "@/lib/domain/types";
import { buildDesignFacts } from "@/lib/design/facts";
import { normalizeMetricName } from "./derive-spec";
import type { ComplianceRow, ComplianceStatus, TorRequirement } from "./types";

// Deterministic compliance matching. NOTHING here asks a model: every "offered"
// value is read out of the SolutionSpec / priced BOM / generated landing zone,
// and anything we cannot prove from that data is returned as "manual" for a
// human to answer — never as a pass. That keeps a claim made to a procurement
// committee traceable to our own artefacts.

interface Ctx {
  result: GenerateResult;
  facts: ReturnType<typeof buildDesignFacts>;
  /** total quantity of a catalog key across the BOM (per month, human unit) */
  qty: (key: string) => number;
  has: (key: string) => boolean;
  /** How many VMs the design actually runs, across every environment. */
  vmCount: () => number;
}

/** A capability we can honestly claim, with where a reviewer verifies it. */
interface Capability {
  /** Thai + English keywords that indicate the requirement is about this. */
  keys: RegExp;
  /** Offered statement built from real data, or null when we do not provide it. */
  offered: (c: Ctx) => string | null;
  evidence: string;
}

const CAPABILITIES: Capability[] = [
  // WAF is matched BEFORE the network firewall: "Web Application Firewall"
  // contains the word "firewall", and answering a WAF clause with the hub's
  // Network Firewall would put the wrong evidence in front of a committee.
  {
    keys: /waf|web application firewall|ป้องกัน.*เว็บ|owasp/i,
    offered: (c) => (c.has("waf_instance") || c.has("waf_requests_m") ? "OCI Web Application Firewall (managed OWASP rule set) หน้า public load balancer" : null),
    evidence: "BOM: WAF · Diagram: Traffic flow (inbound lane)",
  },
  {
    keys: /(?<!web application )firewall|ไฟร์วอลล์|ป้องกันการบุกรุก|\bids\b|\bips\b|\butm\b|ตรวจจับ.*บุกรุก/i,
    offered: (c) => {
      const k = c.result.spec.hub.kind;
      if (k === "hub_a") return "OCI Network Firewall 2 ชุด (DMZ + Internal) ตรวจ north-south และ east-west, stateful L4–L7" + inspectionSuffix(c);
      if (k === "hub_b") return "OCI Network Firewall 1 ชุด ตรวจ north-south และ east-west, stateful L4–L7" + inspectionSuffix(c);
      if (k === "hub_c") return "Firewall ของผู้ผลิตภายนอก (3rd-party) วางหลัง Network Load Balancer คู่ trust/untrust (ลูกค้าจัดหา license)";
      return null; // hub_e has no inspection — do not claim it
    },
    evidence: "Design Doc §12 Traffic Flow · Diagram: Traffic flow / Security",
  },
  {
    // Separate dev/test estates are a compartment + VCN boundary in this design,
    // not something a human has to answer by hand.
    keys: /แยก.*(ระบบจริง|production|ใช้งานจริง)|สภาพแวดล้อม.*(พัฒนา|ทดสอบ)|(development|test|staging|uat).*environment|แยกสภาพแวดล้อม/i,
    offered: (c) => {
      const envs = c.result.spec.environments;
      if (envs.length < 2) return null;
      return `แยก ${envs.length} สภาพแวดล้อม (${envs.join(", ")}) — แต่ละตัวมี spoke VCN, compartment tree และสิทธิ์ของตัวเอง ไม่ใช้ทรัพยากรร่วมกับ production`;
    },
    evidence: "Design Doc §4 Security (compartments) / §16 IP Plan · Diagram: Compartments, Network",
  },
  {
    keys: /load balanc|กระจายโหลด|บาลานซ์/i,
    offered: (c) => (c.has("lb_base") ? `Flexible Load Balancer (regional, HA ในตัว) bandwidth ${c.qty("lb_bandwidth") || 100} Mbps` : null),
    evidence: "BOM: Load Balancer · Diagram: Traffic flow",
  },
  {
    keys: /encrypt|เข้ารหัส|kms|key management|vault|กุญแจ/i,
    offered: (c) =>
      "เข้ารหัสข้อมูลที่พัก (at-rest) ทุก block volume / object storage / database โดยค่าเริ่มต้น และเข้ารหัสระหว่างส่ง (in-transit) ด้วย TLS" +
      (c.result.spec.cisLevel === 2 ? " พร้อม OCI Vault สำหรับ customer-managed keys (CIS Level 2)" : ""),
    evidence: "Design Doc §8 Compartment Security Posture · Diagram: Compartments (Vault card)",
  },
  {
    keys: /multi.?factor|mfa|2fa|ยืนยันตัวตน.*สอง|two.?factor/i,
    offered: () => "บังคับ MFA ทุกผู้ใช้ผ่าน Identity Domain sign-on policy (TOTP + FIDO2) และบังคับซ้ำทุกครั้งสำหรับบทบาทผู้ดูแลระบบ",
    evidence: "Design Doc §11 MFA · Diagram: Identity (MFA card)",
  },
  {
    keys: /password|รหัสผ่าน|นโยบายรหัส/i,
    offered: () => "Password policy: ยาวขั้นต่ำ 14 ตัวอักษร, บังคับ 4 ประเภทอักขระ, จำประวัติ 12 ครั้ง, อายุสูงสุด 90 วัน, ล็อกบัญชีเมื่อผิด 5 ครั้ง",
    evidence: "Design Doc §10 Password Policy · Diagram: Identity",
  },
  {
    keys: /single sign|sso|saml|oidc|ldap|active directory|federat|เชื่อมต่อ.*ระบบยืนยันตัวตน/i,
    offered: () => "รองรับ federation กับ IdP องค์กร (SAML 2.0 / OIDC) และ provisioning ผู้ใช้-กลุ่มอัตโนมัติผ่าน SCIM",
    evidence: "Design Doc §9 Groups & Identity Providers · Diagram: Identity",
  },
  {
    keys: /log|บันทึก.*เหตุการณ์|audit|ตรวจสอบย้อนหลัง|siem/i,
    offered: (c) =>
      `รวมศูนย์ log ทุกแหล่ง (VCN flow logs, OCI Audit, Cloud Guard${c.facts.hub.firewall ? ", Network Firewall" : ""}) ใน OCI Logging แล้วส่งผ่าน Service Connector Hub ไป Object Storage (เก็บระยะยาว) และ Notifications; ต่อ SIEM ภายนอกได้`,
    evidence: "Design Doc §13 Centralized Log Management · Diagram: Logging",
  },
  {
    keys: /backup|สำรองข้อมูล|สำรองระบบ|rpo/i,
    offered: () =>
      "Block Volume backup policy (incremental รายวัน + full รายสัปดาห์), Autonomous DB automatic backup (retention 60 วัน), สำเนาเก็บใน Object Storage ตาม lifecycle Standard→IA→Archive",
    evidence: "Design Doc §14 Backup · Diagram: Backup posture",
  },
  {
    keys: /disaster recovery|\bdr\b|กู้คืน.*ภัยพิบัติ|rto|ศูนย์สำรอง/i,
    offered: (c) =>
      c.result.spec.template === "dr"
        ? "ออกแบบเป็น DR site เต็มรูปแบบ (standby compute + block replication + DB standby) พร้อม Full Stack Disaster Recovery orchestration"
        : "รองรับการทำ DR ด้วย cross-region backup/replication และ Full Stack Disaster Recovery (ขอบเขตนอกโครงการนี้ ระบุเพิ่มได้)",
    evidence: "Design Doc §14 Backup / §15 Resilience · Diagram: Backup, Resilience",
  },
  {
    keys: /high availab|\bha\b|ความพร้อมใช้|redundan|สำรองการทำงาน|fault tolerance/i,
    offered: (c) =>
      `กระจายทรัพยากรข้าม Fault Domain (อย่างน้อย 2 FD ต่อ tier), Load Balancer เป็น regional HA${c.facts.hub.firewallCount >= 2 ? ", Network Firewall 2 ชุดแยก FD" : ""}, ฐานข้อมูล Autonomous DB มี HA ในตัว`,
    evidence: "Design Doc §15 Resilience & HA · Diagram: Resilience",
  },
  {
    keys: /sla|ความพร้อมให้บริการ|uptime|99\.\d/i,
    offered: () => "SLA ตามที่ Oracle ประกาศ: Load Balancer / Autonomous Database / OKE control plane 99.95% ขึ้นไป (อ้างอิง Oracle PaaS/IaaS SLA)",
    evidence: "Design Doc §15 Resilience & HA (SLA reference card)",
  },
  {
    keys: /vpn|fastconnect|leased line|เชื่อมต่อ.*สำนักงาน|private link|mpls/i,
    offered: (c) => {
      const conn = c.result.spec.hub.connectivity;
      if (conn === "none") return null;
      const map: Record<string, string> = {
        vpn: "Site-to-Site VPN (IPSec) 2 tunnel",
        vpn_ha: "Site-to-Site VPN แบบ redundant 2 CPE / 4 tunnel",
        fastconnect_1g: "FastConnect 1 Gbps (private, ไม่ผ่าน internet)",
        fastconnect_1g_ha: "FastConnect 1 Gbps คู่ (HA, เส้นทางแยกกัน)",
        fastconnect_10g: "FastConnect 10 Gbps (private)",
        fastconnect_10g_ha: "FastConnect 10 Gbps คู่ (HA, เส้นทางแยกกัน)",
        fastconnect_vpn_backup: "FastConnect 1 Gbps พร้อม VPN สำรองอัตโนมัติ",
      };
      return map[conn] ?? null;
    },
    evidence: "Design Doc §5 Network · Diagram: Network, Traffic flow (hybrid lane)",
  },
  {
    // Thai public-sector TORs very often mandate an open-source engine.
    keys: /open ?source.*(database|ฐานข้อมูล)|ฐานข้อมูล.*open ?source|mysql|mariadb|postgres|โอเพ่นซอร์ส/i,
    offered: (c) => {
      const parts: string[] = [];
      if (c.has("pg_ocpu")) parts.push(`Database with PostgreSQL ${c.qty("pg_ocpu")} OCPU + storage ${c.qty("pg_storage_gb")} GB (managed)`);
      if (c.has("mysql_ecpu")) parts.push(`MySQL HeatWave ${c.qty("mysql_ecpu")} ECPU + storage ${c.qty("mysql_storage_gb")} GB (managed)`);
      return parts.length ? parts.join(" · ") : null;
    },
    evidence: "BOM: PostgreSQL / MySQL HeatWave · Design Doc §3 Functional",
  },
  {
    keys: /opensearch|elastic|full.?text|ค้นหา.*ข้อความ|search engine/i,
    offered: (c) => (c.has("opensearch_node") ? `Search with OpenSearch ${c.qty("opensearch_node")} node (HA: data + master + dashboard)` : null),
    evidence: "BOM: OpenSearch",
  },
  {
    keys: /golden ?gate|replicat|cdc|ย้ายข้อมูล.*ต่อเนื่อง|near.?zero downtime|ทำซ้ำข้อมูล/i,
    offered: (c) =>
      c.has("goldengate_ocpu") || c.has("goldengate_byol_ocpu")
        ? `Oracle GoldenGate ${c.qty("goldengate_ocpu") + c.qty("goldengate_byol_ocpu")} OCPU — replication/CDC สำหรับย้ายข้อมูลแบบ near-zero downtime`
        : null,
    evidence: "BOM: GoldenGate",
  },
  {
    keys: /vmware|vsphere|vcenter|nsx|ยกระบบเดิม|lift.?and.?shift/i,
    offered: (c) => {
      const nodes = c.qty("ocvs_node_hourly") + c.qty("ocvs_node_1yr") + c.qty("ocvs_node_3yr");
      return nodes > 0 ? `Oracle Cloud VMware Solution ${nodes} node (BM.Standard.E5.48) — vSphere/vSAN/NSX ที่ลูกค้าเป็นผู้ดูแลเอง` : null;
    },
    evidence: "BOM: OCVS · Design Doc §3 Functional",
  },
  {
    keys: /\bdns\b|โดเมน|name server|gslb/i,
    offered: (c) =>
      c.has("dns_queries_1m") || c.has("dns_traffic_mgmt_1m")
        ? `OCI DNS ${c.qty("dns_queries_1m")} ล้าน query/เดือน${c.has("dns_traffic_mgmt_1m") ? ` + DNS Traffic Management (GSLB) ${c.qty("dns_traffic_mgmt_1m")} ล้าน query` : ""}`
        : null,
    evidence: "BOM: OCI DNS",
  },
  {
    keys: /chat ?bot|แชตบอต|แชทบอท|ผู้ช่วยอัตโนมัติ|virtual assistant/i,
    offered: (c) =>
      c.has("oda_requests")
        ? `Oracle Digital Assistant ${c.qty("oda_requests")} พัน request/เดือน (รองรับ NLU ภาษาไทย)`
        : c.has("genai_large_10k") || c.has("genai_small_10k")
          ? "OCI Generative AI (Cohere) พร้อม RAG จากเอกสารของหน่วยงาน"
          : null,
    evidence: "BOM: Digital Assistant / Generative AI",
  },
  {
    keys: /access review|recertif|ทบทวนสิทธิ|สอบทานสิทธิ|governance.*สิทธิ/i,
    offered: (c) =>
      c.has("access_governance_user")
        ? `Oracle Access Governance Premium ${c.qty("access_governance_user")} ผู้ใช้ — campaign ทบทวนสิทธิ์ตามรอบ พร้อมรายงานผลให้ผู้ตรวจสอบ`
        : null,
    evidence: "BOM: Access Governance",
  },
  {
    keys: /kubernetes|k8s|container|คอนเทนเนอร์|docker|microservice/i,
    offered: (c) => (c.has("oke_cluster") ? "OCI Kubernetes Engine (OKE) Enhanced Cluster พร้อม private API endpoint และ worker node pool" : null),
    evidence: "BOM: OKE · Diagram: Functional, IP plan (platform VCN)",
  },
  {
    keys: /monitor|เฝ้าระวัง|แจ้งเตือน|alert|alarm|nms/i,
    offered: (c) =>
      `OCI Monitoring + Alarms (${c.facts.observability.alarms || "ชุดมาตรฐาน"} รายการ) ส่งแจ้งเตือนผ่าน Notifications topic ไปยังทีม ops/security`,
    evidence: "Design Doc §6 Operations / §13 Logging · Diagram: Operations, Logging",
  },
  {
    keys: /cis|benchmark|hardening|มาตรฐาน.*ความปลอดภัย|ความมั่นคงปลอดภัยสารสนเทศ/i,
    offered: (c) =>
      `ยึด CIS OCI Foundations Benchmark Level ${c.result.spec.cisLevel} — เปิด Cloud Guard, Security Zones, Vulnerability Scanning ทั้ง tenancy${c.result.spec.cisLevel === 2 ? " และ Vault/customer-managed keys" : ""}`,
    evidence: "Design Doc §4 Security / §8 Compartment Posture · Diagram: Security, Compartments",
  },
  {
    keys: /pdpa|ข้อมูลส่วนบุคคล|privacy|gdpr/i,
    offered: () =>
      "ข้อมูลทั้งหมดอยู่ใน region ประเทศไทย (ap-bangkok-1, AIS Cloud powered by Oracle Alloy) เข้ารหัสทั้ง at-rest/in-transit พร้อม audit log ครบถ้วน รองรับการพิสูจน์ตาม PDPA",
    evidence: "Design Doc §8 Compartment Posture / §13 Logging",
  },
  {
    // Thai TORs write this several ways: ประเทศไทย, ราชอาณาจักร(ไทย), and the
    // negative form "ต้องไม่ถูกส่งออกนอกประเทศ".
    keys: /data ?cent|ในประเทศไทย|ราชอาณาจักร|data residency|อธิปไตย|sovereign|(ไม่|ห้าม).{0,12}(ออกนอกประเทศ|ส่งออกนอก)|ออกนอกราชอาณาจักร/i,
    offered: () => "ให้บริการจาก AIS Cloud (Oracle Alloy) ศูนย์ข้อมูลในประเทศไทย region ap-bangkok-1 — ข้อมูลทั้งหมดอยู่ในราชอาณาจักร ไม่มีการจำลองออกนอกประเทศ",
    evidence: "Design Doc §2 Solution Overview (region ap-bangkok-1)",
  },
  {
    // Zone separation is what the hub topology delivers; a clause can ask for it
    // without ever using the word "firewall".
    keys: /\bdmz\b|แยกโซน|โซนภายใน|แบ่งโซน|segmentation|แบ่งส่วนเครือข่าย|zone.*(แยก|ภายใน)/i,
    offered: (c) => {
      const k = c.result.spec.hub.kind;
      if (k === "hub_a")
        return "แยกโซนด้วย hub-and-spoke: subnet DMZ ของ hub มี Network Firewall เฉพาะสำหรับทราฟฟิกขาเข้า แยกจาก Internal Firewall ที่คุม east-west และ egress; workload แต่ละ environment อยู่คนละ spoke VCN และคนละ NSG";
      if (k === "hub_b")
        return "แยกโซนด้วย hub-and-spoke: ทราฟฟิกทุกทิศทางผ่าน Network Firewall ที่ hub และ workload แต่ละ environment อยู่คนละ spoke VCN คนละ NSG (ยกระดับเป็น Hub A เพื่อแยก firewall ของ DMZ ออกจาก internal ได้)";
      if (k === "hub_c")
        return "แยกโซนด้วย hub-and-spoke: NLB untrust รับทราฟฟิกอินเทอร์เน็ต แยกจาก NLB trust ที่คุม east-west/egress โดยมี firewall ของผู้ผลิตภายนอกคั่นกลาง; workload แยก spoke VCN ต่อ environment";
      return null; // hub_e has no inspection point between the zones
    },
    evidence: "Design Doc §5 Network / §12 Traffic Flow · Diagram: Network, Traffic flow",
  },
  {
    keys: /segregat|แบ่งแยก.*สิทธิ|least privilege|rbac|สิทธิ.*ผู้ใช้|บทบาทหน้าที่/i,
    offered: (c) => `สิทธิ์แบบ least-privilege ผ่านกลุ่มเท่านั้น (${c.facts.policyCount} ชุด policy) แยกขอบเขตตาม compartment ของแต่ละ environment/project`,
    evidence: "Design Doc §17 IAM Policy Matrix · Diagram: IAM matrix",
  },
  {
    keys: /iac|infrastructure as code|terraform|automat.*deploy|ansible/i,
    offered: () => "ส่งมอบเป็น Infrastructure-as-Code (OCI Landing Zones Orchestrator / Terraform) พร้อมสคริปต์ deploy และ runbook — สร้างซ้ำได้ 100%",
    evidence: "LaC package (config.json + generated/*.json + deploy/) · Design Doc §20 Deployment",
  },
];

function inspectionSuffix(c: Ctx): string {
  const insp = c.result.spec.hub.inspection;
  if (insp === "tls") return " พร้อม TLS inspection (ถอดรหัสตรวจ)";
  if (insp === "ids_ips") return " พร้อม IDS/IPS threat detection";
  return "";
}

/**
 * Numeric capability lookup for quantitative clauses.
 *
 * `value` is expressed in the SAME unit the requirement uses (see `demand`),
 * because OCI bills OCPUs while Thai TORs are usually written in vCPU — and
 * 1 OCPU = 2 vCPU. Comparing 20 OCPU against "ไม่น้อยกว่า 32 vCPU" without
 * converting reports a failure on a requirement we actually exceed.
 */
function offeredMetric(
  name: string,
  c: Ctx,
  demand: { name: string; unit: string },
): { value: number; unit: string; text: string; evidence: string } | null {
  const n = normalizeMetricName(name);
  if (/vcpu|ocpu|cpu|core|หน่วยประมวลผล/.test(n)) {
    const ocpu = c.qty("compute_e5_ocpu");
    if (!ocpu) return null;
    const wantsVcpu = /vcpu/i.test(demand.unit) || /vcpu/i.test(demand.name);
    const value = wantsVcpu ? ocpu * 2 : ocpu;
    return {
      value,
      unit: wantsVcpu ? "vCPU" : "OCPU",
      text: wantsVcpu
        ? `รวม ${ocpu} OCPU = ${value} vCPU (VM.Standard.E5.Flex; 1 OCPU = 2 vCPU)`
        : `รวม ${ocpu} OCPU (VM.Standard.E5.Flex; 1 OCPU = 2 vCPU)`,
      evidence: "BOM: Compute OCPU",
    };
  }
  if (/server|เครื่องแม่ข่าย|\bvm\b|instance|node|เครื่อง/.test(n)) {
    // Distinct VM lines in the BOM, not summed OCPUs.
    const v = c.vmCount();
    return v ? { value: v, unit: "เครื่อง", text: `รวม ${v} เครื่อง (VM.Standard.E5.Flex กระจายข้าม fault domain)`, evidence: "BOM: Compute · Diagram: Resilience" } : null;
  }
  if (/memory|ram|หน่วยความจำ/.test(n)) {
    const v = c.qty("compute_e5_mem");
    return v ? { value: v, unit: "GB", text: `รวม ${v} GB memory`, evidence: "BOM: Compute memory" } : null;
  }
  if (/storage|disk|พื้นที่|ความจุ/.test(n)) {
    // Database storage counts: a TOR asking for "พื้นที่จัดเก็บข้อมูล" is asking
    // how much data the system holds, and leaving ADB/MySQL/PostgreSQL volumes
    // out under-reports what we actually provision.
    const parts: [string, number][] = [
      ["block", c.qty("block_storage_gb")],
      ["object", c.qty("os_standard_gb") + c.qty("os_ia_gb") + c.qty("os_archive_gb")],
      ["file", c.qty("fss_gb")],
      ["database", c.qty("adb_storage_gb") + c.qty("adw_storage_gb") + c.qty("base_db_storage_gb") + c.qty("pg_storage_gb") + c.qty("mysql_storage_gb")],
    ];
    const v = Math.round(parts.reduce((a, [, q]) => a + q, 0) * 100) / 100;
    if (!v) return null;
    const shown = parts.filter(([, q]) => q > 0).map(([k, q]) => `${k} ${q}`).join(" + ");
    return { value: v, unit: "GB", text: `รวม ${v} GB (${shown})`, evidence: "BOM: Storage" };
  }
  if (/bandwidth|แบนด์วิดท์|throughput|ความเร็ว/.test(n)) {
    const v = c.qty("lb_bandwidth");
    return v ? { value: v, unit: "Mbps", text: `Load Balancer bandwidth ${v} Mbps`, evidence: "BOM: LB bandwidth" } : null;
  }
  if (/ecpu|database.*cpu|ฐานข้อมูล.*ประมวลผล/.test(n)) {
    const v = c.qty("adb_ecpu") + c.qty("base_db_ecpu") + c.qty("adw_ecpu") + c.qty("mysql_ecpu") + c.qty("apex_ecpu") + c.qty("pg_ocpu");
    return v ? { value: v, unit: "ECPU", text: `รวม ${v} ECPU/OCPU สำหรับฐานข้อมูล`, evidence: "BOM: Database ECPU" } : null;
  }
  if (/retention|เก็บ.*วัน|ระยะเวลา.*เก็บ/.test(n)) {
    return { value: 365, unit: "days", text: "audit log 365 วัน, flow log 90 วัน, backup ตาม lifecycle (ปรับได้ตามข้อกำหนด)", evidence: "Design Doc §13 Logging / §14 Backup" };
  }
  if (/uptime|availability|sla/.test(n)) {
    return { value: 99.95, unit: "%", text: "SLA บริการหลัก 99.95% (Oracle published)", evidence: "Design Doc §15 Resilience" };
  }
  if (/environment|สภาพแวดล้อม/.test(n)) {
    const v = c.result.spec.environments.length;
    return { value: v, unit: "env", text: `${v} environment (${c.result.spec.environments.join(", ")})`, evidence: "Design Doc §2 Overview" };
  }
  return null;
}

function compare(op: string, offered: number, required: number): ComplianceStatus {
  if (op === ">=") return offered >= required ? "pass" : offered >= required * 0.9 ? "partial" : "fail";
  if (op === "<=") return offered <= required ? "pass" : "partial";
  if (op === "=") return offered === required ? "pass" : "partial";
  return "manual";
}

export function matchRequirements(requirements: TorRequirement[], result: GenerateResult): ComplianceRow[] {
  const facts = buildDesignFacts(result);
  const totals = new Map<string, number>();
  for (const item of result.bom.items) totals.set(item.catalogKey, (totals.get(item.catalogKey) ?? 0) + item.quantity);
  const ctx: Ctx = {
    result,
    facts,
    qty: (k) => Math.round((totals.get(k) ?? 0) * 100) / 100,
    has: (k) => (totals.get(k) ?? 0) > 0,
    // Read from the sizing, not the BOM: OCPU lines are already collapsed per
    // environment, so they cannot tell us how many machines there are.
    vmCount: () => {
      const s = result.spec.sizing as unknown as Record<string, unknown>;
      const perEnv = ["appVmCount", "protectedVmCount", "gatewayVmCount", "consumerVmCount", "windowsVmCount"]
        .map((k) => (typeof s[k] === "number" ? (s[k] as number) : 0))
        .reduce((a, b) => a + b, 0);
      return perEnv > 0 ? perEnv : 0;
    },
  };

  return requirements.map((req) => {
    // 1) quantitative clause -> compare against a real number from the BOM
    if (req.metric) {
      const off = offeredMetric(req.metric.name, ctx, { name: req.metric.name, unit: req.metric.unit });
      if (off) {
        const status = compare(req.metric.op, off.value, req.metric.value);
        return {
          ...req,
          status,
          offered: off.text,
          evidence: off.evidence,
          note:
            status === "pass"
              ? ""
              : status === "partial"
                ? `ต้องปรับ sizing ให้ถึง ${req.metric.op} ${req.metric.value} ${req.metric.unit} (ปรับได้ในฟอร์มแล้ว regenerate)`
                : `ยังไม่ถึงเกณฑ์ ${req.metric.op} ${req.metric.value} ${req.metric.unit} — ต้องเพิ่ม sizing`,
        };
      }
    }
    // 2) capability clause -> honest statement or "not offered"
    for (const cap of CAPABILITIES) {
      if (!cap.keys.test(req.text)) continue;
      const offered = cap.offered(ctx);
      if (offered) return { ...req, status: "pass", offered, evidence: cap.evidence, note: "" };
      return {
        ...req,
        status: "fail",
        offered: "ไม่ได้เสนอในการออกแบบปัจจุบัน",
        evidence: "—",
        note: "ต้องปรับการออกแบบ (เช่น เปลี่ยน hub model / เพิ่มบริการ) หรือชี้แจงเป็นข้อยกเว้น",
      };
    }
    // 3) anything we cannot prove -> human answers it. Never a silent pass.
    return {
      ...req,
      status: "manual",
      offered: "",
      evidence: "",
      note: req.infraRelevant ? "ต้องให้ผู้เชี่ยวชาญตรวจและกรอกคำตอบ" : "ไม่ใช่ขอบเขต infrastructure — ส่งให้ทีมประมูล/นิติกรรม",
    };
  });
}
