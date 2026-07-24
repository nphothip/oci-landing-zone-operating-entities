import type { BomCategory, BomItem, LocalizedText, SolutionSpec } from "@/lib/domain/types";
import { HOURS_PER_MONTH, hours } from "./formulas";

// Optional AIS-sellable services a presale bolts onto any template. Every SKU
// here is one the AIS calculator itself quotes (verified against
// calculator.g-ais.co.th/api/configurations), so a line added from this list is
// something AIS can actually sell — not an Oracle SKU AIS does not carry.
//
// Add-ons are always post-LZ (deployedByLz: false): the landing zone gives them
// a compartment and a subnet, but the service itself is provisioned afterwards.

export interface AddOnDef {
  id: string;
  name: LocalizedText;
  category: BomCategory;
  /** What the number the user types means. */
  unit: LocalizedText;
  /** Sensible starting quantity for the picker. */
  defaultQty: number;
  /** Short "when do I quote this" hint for the presale. */
  hint: LocalizedText;
  lines: (qty: number) => BomItem[];
}

const L = (th: string, en: string): LocalizedText => ({ th, en });

/** One BOM line, always post-LZ. */
function line(
  catalogKey: string,
  label: LocalizedText,
  category: BomCategory,
  quantity: number,
  unit: string,
  monthlyMetricQty: number,
  notes?: LocalizedText,
): BomItem {
  return { catalogKey, label, category, quantity, unit, monthlyMetricQty, deployedByLz: false, notes };
}

export const ADDONS: AddOnDef[] = [
  {
    id: "mysql_heatwave",
    name: L("MySQL HeatWave", "MySQL HeatWave"),
    category: "database",
    unit: L("ECPU", "ECPU"),
    defaultQty: 4,
    hint: L("TOR ที่ระบุฐานข้อมูล open source / MySQL", "TORs mandating an open-source or MySQL engine"),
    lines: (q) => [
      line("mysql_ecpu", L("MySQL HeatWave — ECPU", "MySQL HeatWave — ECPU"), "database", q, "ECPU", hours(q)),
      // AIS's calculator fixes MySQL memory at 8 GB per ECPU; storage is sized
      // by the user, so quote a conservative 50 GB per ECPU plus equal backup.
      line("mysql_storage_gb", L("MySQL HeatWave — storage", "MySQL HeatWave — storage"), "database", q * 50, "GB", q * 50),
      line("mysql_backup_gb", L("MySQL HeatWave — backup storage", "MySQL HeatWave — backup storage"), "database", q * 50, "GB", q * 50, L("สำรองเท่าขนาด data (ปรับได้)", "backup sized 1:1 with data (adjustable)")),
    ],
  },
  {
    id: "heatwave_cluster",
    name: L("HeatWave Cluster (analytics in-DB)", "HeatWave Cluster (in-database analytics)"),
    category: "database",
    unit: L("node", "nodes"),
    defaultQty: 2,
    hint: L("ต้องการ analytics/HTAP บน MySQL เดิมโดยไม่ย้ายข้อมูล", "HTAP analytics on MySQL without moving the data"),
    lines: (q) => [
      line("heatwave_node", L("HeatWave Cluster — capacity", "HeatWave Cluster — capacity"), "database", q, "node", hours(q)),
      line("heatwave_storage_gb", L("HeatWave Cluster — storage", "HeatWave Cluster — storage"), "database", q * 512, "GB", q * 512),
    ],
  },
  {
    id: "postgresql",
    name: L("Database with PostgreSQL", "Database with PostgreSQL"),
    category: "database",
    unit: L("OCPU", "OCPU"),
    defaultQty: 4,
    hint: L("TOR ภาครัฐที่บังคับ PostgreSQL หรือหลีกเลี่ยง license เชิงพาณิชย์", "Public-sector TORs mandating PostgreSQL or avoiding commercial licences"),
    lines: (q) => [
      line("pg_ocpu", L("PostgreSQL — OCPU", "PostgreSQL — OCPU"), "database", q, "OCPU", hours(q)),
      line("pg_storage_gb", L("PostgreSQL — optimized storage", "PostgreSQL — optimized storage"), "database", q * 100, "GB", q * 100),
    ],
  },
  {
    id: "opensearch",
    name: L("Search with OpenSearch (HA)", "Search with OpenSearch (HA)"),
    category: "observability",
    unit: L("node", "nodes"),
    defaultQty: 3,
    hint: L("ค้นหา/วิเคราะห์ log แบบ ELK หรือ full-text search", "ELK-style log analytics or full-text search"),
    lines: (q) => [
      line("opensearch_node", L("OpenSearch — node (HA)", "OpenSearch — node (HA)"), "observability", q, "node", hours(q), L("ขั้นต่ำ 3 node สำหรับ HA (data + master + dashboard)", "3 nodes minimum for HA (data + master + dashboard)")),
    ],
  },
  {
    id: "goldengate",
    name: L("GoldenGate (replication / migration)", "GoldenGate (replication / migration)"),
    category: "database",
    unit: L("OCPU", "OCPU"),
    defaultQty: 2,
    hint: L("ย้ายฐานข้อมูลแบบ near-zero downtime หรือ CDC ต่อเนื่อง", "Near-zero-downtime database migration or continuous CDC"),
    lines: (q) => [
      line("goldengate_ocpu", L("GoldenGate — OCPU (license-included)", "GoldenGate — OCPU (license-included)"), "database", q, "OCPU", hours(q), L("มี BYOL ถูกกว่าราว 4 เท่า ถ้าลูกค้ามี license เดิม", "BYOL is ~4× cheaper if the customer already owns licences")),
    ],
  },
  {
    id: "goldengate_byol",
    name: L("GoldenGate — BYOL", "GoldenGate — BYOL"),
    category: "database",
    unit: L("OCPU", "OCPU"),
    defaultQty: 2,
    hint: L("ลูกค้ามี license GoldenGate อยู่แล้ว", "The customer already owns GoldenGate licences"),
    lines: (q) => [
      line("goldengate_byol_ocpu", L("GoldenGate — OCPU (BYOL)", "GoldenGate — OCPU (BYOL)"), "database", q, "OCPU", hours(q), L("ราคานี้ไม่รวมค่า license เดิมของลูกค้า", "excludes the customer's own licence cost")),
    ],
  },
  {
    id: "ocvs_hourly",
    name: L("OCVS (VMware) — hourly commit", "OCVS (VMware) — hourly commit"),
    category: "compute",
    unit: L("node (BM.Standard.E5.48)", "nodes (BM.Standard.E5.48)"),
    defaultQty: 3,
    hint: L("ยก VMware เดิมขึ้นคลาวด์โดยไม่แก้ระบบ — PoC/ระยะสั้น", "Lift VMware as-is — PoC or short term"),
    lines: (q) => [
      line("ocvs_node_hourly", L("OCVS — node (hourly commit)", "OCVS — node (hourly commit)"), "compute", q, "node", hours(q), L("SDDC ขั้นต่ำ 3 node · 1-year/3-year commit ถูกกว่ามาก", "SDDC minimum 3 nodes · 1-/3-year commits are far cheaper")),
    ],
  },
  {
    id: "ocvs_3yr",
    name: L("OCVS (VMware) — 3-year commit", "OCVS (VMware) — 3-year commit"),
    category: "compute",
    unit: L("node (BM.Standard.E5.48)", "nodes (BM.Standard.E5.48)"),
    defaultQty: 3,
    hint: L("ย้าย VMware ระยะยาว — ราคาต่อ node ต่ำสุด", "Long-term VMware migration — lowest per-node price"),
    lines: (q) => [
      line("ocvs_node_3yr", L("OCVS — node (3-year commit)", "OCVS — node (3-year commit)"), "compute", q, "node", hours(q), L("ผูกพัน 3 ปี · SDDC ขั้นต่ำ 3 node", "3-year commitment · SDDC minimum 3 nodes")),
    ],
  },
  {
    id: "apex",
    name: L("APEX Application Development", "APEX Application Development"),
    category: "database",
    unit: L("ECPU", "ECPU"),
    defaultQty: 2,
    hint: L("สร้างแอปภายใน/ฟอร์มราชการเร็ว ๆ บนฐานข้อมูลเดียวกัน", "Rapid internal apps / government forms on the same database"),
    lines: (q) => [
      line("apex_ecpu", L("APEX — ECPU", "APEX — ECPU"), "database", q, "ECPU", hours(q)),
      line("adb_storage_gb", L("APEX — database storage", "APEX — database storage"), "database", 20 * Math.max(1, Math.ceil(q / 2)), "GB", 20 * Math.max(1, Math.ceil(q / 2))),
    ],
  },
  {
    id: "queue",
    name: L("OCI Queue", "OCI Queue"),
    category: "network",
    unit: L("ล้าน request/เดือน", "M requests/month"),
    defaultQty: 10,
    hint: L("แยกส่วนระบบแบบ async โดยไม่ต้องดูแล broker เอง", "Async decoupling without running your own broker"),
    lines: (q) => [line("queue_1m", L("OCI Queue — requests", "OCI Queue — requests"), "network", q, "M requests", q)],
  },
  {
    id: "dns",
    name: L("OCI DNS (public zones)", "OCI DNS (public zones)"),
    category: "network",
    unit: L("ล้าน query/เดือน", "M queries/month"),
    defaultQty: 10,
    hint: L("โฮสต์ public DNS zone ของหน่วยงานบนคลาวด์", "Host the organisation's public DNS zones on OCI"),
    lines: (q) => [line("dns_queries_1m", L("OCI DNS — queries", "OCI DNS — queries"), "network", q, "M queries", q)],
  },
  {
    id: "dns_traffic_mgmt",
    name: L("DNS Traffic Management (GSLB)", "DNS Traffic Management (GSLB)"),
    category: "network",
    unit: L("ล้าน query/เดือน", "M queries/month"),
    defaultQty: 5,
    hint: L("สลับ traffic ข้าม region/DC อัตโนมัติเมื่อ site หลักล่ม", "Automatic cross-region/DC failover steering"),
    lines: (q) => [line("dns_traffic_mgmt_1m", L("DNS Traffic Management — queries", "DNS Traffic Management — queries"), "network", q, "M queries", q)],
  },
  {
    id: "digital_assistant",
    name: L("Oracle Digital Assistant", "Oracle Digital Assistant"),
    category: "ai",
    unit: L("พัน request/เดือน", "K requests/month"),
    defaultQty: 100,
    hint: L("แชตบอตบริการประชาชน/พนักงาน พร้อม NLU ภาษาไทย", "Citizen/employee chatbot with Thai NLU"),
    lines: (q) => [line("oda_requests", L("Digital Assistant — requests", "Digital Assistant — requests"), "ai", q, "K requests", q * 1_000)],
  },
  {
    id: "language",
    name: L("OCI Language (NLP)", "OCI Language (NLP)"),
    category: "ai",
    unit: L("พัน transaction/เดือน", "K transactions/month"),
    defaultQty: 50,
    hint: L("วิเคราะห์ความเห็น/จำแนกเอกสาร/สกัดข้อมูลจากข้อความไทย", "Sentiment, classification, and entity extraction on Thai text"),
    lines: (q) => [line("language_1k", L("OCI Language — transactions", "OCI Language — transactions"), "ai", q, "K transactions", q)],
  },
  {
    id: "access_governance",
    name: L("Access Governance Premium", "Access Governance Premium"),
    category: "security",
    unit: L("ผู้ใช้", "workforce users"),
    defaultQty: 200,
    hint: L("TOR ที่ต้องการ access review / recertification ตามรอบ", "TORs requiring periodic access review and recertification"),
    lines: (q) => [line("access_governance_user", L("Access Governance — users", "Access Governance — users"), "security", q, "user", q)],
  },
  {
    id: "waf_managed",
    name: L("Web Application Firewall (managed)", "Web Application Firewall (managed)"),
    category: "security",
    unit: L("ล้าน request/เดือน", "M requests/month"),
    defaultQty: 20,
    hint: L("TOR ที่ระบุ WAF/OWASP Top 10 หน้าเว็บสาธารณะ", "TORs specifying a WAF / OWASP Top 10 for public sites"),
    lines: (q) => [
      line("waf_instance", L("WAF — instance", "WAF — instance"), "security", 1, "instance", HOURS_PER_MONTH),
      line("waf_requests_m", L("WAF — requests", "WAF — requests"), "security", q, "M requests", Math.max(0, q - 10), L("10 ล้าน request แรกฟรี", "first 10M requests free")),
    ],
  },
  {
    id: "email_delivery",
    name: L("Email Delivery", "Email Delivery"),
    category: "network",
    unit: L("พันอีเมล/เดือน", "K emails/month"),
    defaultQty: 100,
    hint: L("ส่งอีเมลแจ้งเตือน/ใบเสร็จจากระบบโดยไม่ถูกตีเป็นสแปม", "Transactional mail that stays out of spam folders"),
    lines: (q) => [line("email_1k", L("Email Delivery — emails", "Email Delivery — emails"), "network", q, "K emails", q)],
  },
  {
    id: "vdi",
    name: L("Secure Desktop (VDI)", "Secure Desktop (VDI)"),
    category: "compute",
    unit: L("desktop", "desktops"),
    defaultQty: 50,
    hint: L("ให้ผู้รับเหมา/พนักงานเข้าถึงระบบภายในโดยข้อมูลไม่ออกจากคลาวด์", "Contractor/staff access with no data leaving the cloud"),
    lines: (q) => [line("vdi_desktop", L("Secure Desktop — desktops", "Secure Desktop — desktops"), "compute", q, "desktop", hours(q))],
  },
];

export const ADDON_BY_ID: Record<string, AddOnDef> = Object.fromEntries(ADDONS.map((a) => [a.id, a]));

/**
 * Append the spec's chosen add-ons to a BOM. Unknown ids and non-positive
 * quantities are dropped rather than priced as zero, so a stale saved spec can
 * never silently add a free line to a customer quotation.
 */
export function applyAddOns(spec: SolutionSpec, items: BomItem[]): BomItem[] {
  if (!spec.addOns?.length) return items;
  const extra: BomItem[] = [];
  for (const chosen of spec.addOns) {
    const def = ADDON_BY_ID[chosen.id];
    if (!def) continue;
    const qty = Number(chosen.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const env = chosen.env ?? "shared";
    for (const l of def.lines(qty)) extra.push({ ...l, env });
  }
  return extra.length ? [...items, ...extra] : items;
}

/** Assumption lines so the quotation states what an add-on's sizing implies. */
export function addOnAssumptions(spec: SolutionSpec): LocalizedText[] {
  const out: LocalizedText[] = [];
  for (const chosen of spec.addOns ?? []) {
    const def = ADDON_BY_ID[chosen.id];
    if (!def || !(chosen.qty > 0)) continue;
    out.push(
      L(
        `บริการเสริม ${def.name.th}: ${chosen.qty} ${def.unit.th} — provision หลังวาง landing zone`,
        `Add-on ${def.name.en}: ${chosen.qty} ${def.unit.en} — provisioned after the landing zone`,
      ),
    );
  }
  return out;
}
