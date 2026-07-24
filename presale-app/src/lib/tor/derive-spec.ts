import type { CisLevel, Connectivity, EnvName, HubKind, LocalizedText, SolutionSpec, TemplateId } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { ADDON_BY_ID } from "@/lib/bom/addons";
import type { TorRequirement } from "./types";

// Turns extracted TOR requirements into a SolutionSpec — deterministically.
//
// The model never sees this file. It structured the document; every design
// decision below is a rule over that structure, and each one records WHY and
// WHICH CLAUSE drove it. A presale must be able to defend the proposal clause
// by clause, so "the AI chose it" is never an acceptable answer.
//
// Two directions of influence, and they are not symmetric:
//   - The TOR can always push the design UP (more firewalling, higher CIS,
//     bigger sizing, extra services).
//   - Silence never pushes it DOWN. Where the TOR says nothing we apply the
//     best-practice floor (inspected hub, CIS L1, HA, backup), because a
//     procurement design that is merely "not disallowed" is not a good design.

export interface SpecDecision {
  /** Dotted spec path the rule set, e.g. "hub.kind". */
  field: string;
  value: string;
  reason: LocalizedText;
  /** TOR clauses that drove it; empty means it is our best-practice default. */
  clauses: string[];
  source: "tor" | "best_practice";
}

export interface DerivedSpec {
  spec: SolutionSpec;
  decisions: SpecDecision[];
  /** Quantitative clauses we could not turn into a knob — a human must size these. */
  unmapped: TorRequirement[];
}

const L = (th: string, en: string): LocalizedText => ({ th, en });

/** Requirement text joined once; every rule below matches against this. */
interface Corpus {
  all: string;
  reqs: TorRequirement[];
  /** Clauses whose text matches a pattern — the traceability trail. */
  hits: (re: RegExp) => string[];
  has: (re: RegExp) => boolean;
  /**
   * Same two helpers over EVERY clause, including the ones the extractor
   * classified as legal/commercial. Used only where a clause outside the
   * infrastructure scope still binds the design — a regulation named anywhere
   * in a TOR governs the whole solution, so a PDPA clause filed as "legal"
   * must still raise the security baseline.
   */
  hitsAll: (re: RegExp) => string[];
  hasAll: (re: RegExp) => boolean;
}

function corpus(reqs: TorRequirement[]): Corpus {
  const infra = reqs.filter((r) => r.infraRelevant);
  const join = (rs: TorRequirement[]) => rs.map((r) => r.text).join("\n");
  const clausesOf = (rs: TorRequirement[], re: RegExp) => rs.filter((r) => re.test(r.text)).map((r) => r.clause || r.id).slice(0, 4);
  const all = join(infra);
  const everything = join(reqs);
  return {
    all,
    reqs: infra,
    hits: (re) => clausesOf(infra, re),
    has: (re) => re.test(all),
    hitsAll: (re) => [...new Set(clausesOf(reqs, re))].slice(0, 4),
    hasAll: (re) => re.test(everything),
  };
}

// ---------------------------------------------------------------------------
// Template selection
// ---------------------------------------------------------------------------

const TEMPLATE_SIGNALS: { id: TemplateId; re: RegExp; weight: number }[] = [
  { id: "web_app", re: /เว็บ|web (site|application|portal)|เว็บไซต์|ระบบสารสนเทศ|application server/i, weight: 2 },
  { id: "ecommerce", re: /e-?commerce|พาณิชย์อิเล็กทรอนิกส์|ร้านค้าออนไลน์|ตะกร้าสินค้า|ชำระเงินออนไลน์/i, weight: 4 },
  { id: "erp", re: /\berp\b|oracle e-?business|sap|ระบบบริหารทรัพยากร|บัญชีแยกประเภท/i, weight: 4 },
  { id: "dr", re: /disaster recovery|\bdr site\b|ศูนย์คอมพิวเตอร์สำรอง|ระบบสำรองฉุกเฉิน|กู้คืนระบบ.*ภัยพิบัติ/i, weight: 4 },
  { id: "backup", re: /ระบบสำรองข้อมูล(?!.*ฐานข้อมูล)|backup (solution|system|service)|คลังสำรองข้อมูล/i, weight: 3 },
  { id: "migration", re: /ย้ายระบบ|migrat|โยกย้ายข้อมูล|lift.?and.?shift|ยกเครื่อง/i, weight: 3 },
  { id: "analytics", re: /data warehouse|คลังข้อมูล|business intelligence|\bbi\b|วิเคราะห์ข้อมูลขนาดใหญ่|dashboard ผู้บริหาร/i, weight: 4 },
  { id: "devtest", re: /development.*environment|สภาพแวดล้อมสำหรับพัฒนา|dev\/test|ระบบทดสอบ/i, weight: 2 },
  { id: "oke_platform", re: /kubernetes|\bk8s\b|container platform|คอนเทนเนอร์|microservice|\boke\b/i, weight: 4 },
  { id: "fileserver", re: /file server|แฟ้มข้อมูลกลาง|จัดเก็บไฟล์ร่วมกัน|\bnas\b|shared folder/i, weight: 3 },
  { id: "vdi", re: /\bvdi\b|virtual desktop|เดสก์ท็อปเสมือน|remote desktop/i, weight: 4 },
  { id: "serverless", re: /serverless|function as a service|\bfaas\b|api gateway/i, weight: 3 },
  { id: "streaming", re: /streaming|\bkafka\b|event.?driven|ประมวลผลแบบเรียลไทม์|iot/i, weight: 3 },
  { id: "chatbot", re: /chat ?bot|แชตบอต|แชทบอท|generative ai|ปัญญาประดิษฐ์.*สนทนา|ผู้ช่วยอัตโนมัติ/i, weight: 4 },
  { id: "enterprise_lz", re: /landing zone|หลายหน่วยงาน|หลายระบบงาน|ศูนย์กลางคลาวด์|cloud center of excellence|กรอบธรรมาภิบาล/i, weight: 3 },
];

function pickTemplate(c: Corpus): { id: TemplateId; decision: SpecDecision } {
  const scores = new Map<TemplateId, { score: number; clauses: string[] }>();
  for (const s of TEMPLATE_SIGNALS) {
    const clauses = c.hits(s.re);
    if (!clauses.length) continue;
    const cur = scores.get(s.id) ?? { score: 0, clauses: [] };
    cur.score += s.weight * clauses.length;
    cur.clauses = [...new Set([...cur.clauses, ...clauses])].slice(0, 4);
    scores.set(s.id, cur);
  }
  const best = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)[0];
  if (!best) {
    return {
      id: "web_app",
      decision: {
        field: "template",
        value: "web_app",
        source: "best_practice",
        clauses: [],
        reason: L(
          "TOR ไม่ได้ระบุประเภทระบบงานชัดเจน จึงตั้งต้นด้วย 3-tier web application ซึ่งเป็นรูปแบบที่ปรับต่อได้ง่ายที่สุด",
          "The TOR does not clearly state the workload type, so we start from a 3-tier web application — the easiest shape to adapt.",
        ),
      },
    };
  }
  return {
    id: best[0],
    decision: {
      field: "template",
      value: best[0],
      source: "tor",
      clauses: best[1].clauses,
      reason: L(
        `ข้อความใน TOR ชี้ไปที่ระบบงานแบบ ${TEMPLATES[best[0]].name.th}`,
        `The TOR wording points at a ${TEMPLATES[best[0]].name.en} workload.`,
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Landing-zone decisions
// ---------------------------------------------------------------------------

const RE = {
  thirdPartyFw: /palo ?alto|fortinet|forti ?gate|check ?point|sophos|cisco (asa|ftd)|firewall.*(ยี่ห้อ|แบรนด์)|next.?generation firewall/i,
  dmz: /\bdmz\b|แยก.*โซน|zone.*แยก|segmentation|แบ่งส่วนเครือข่าย|north.?south.*east.?west/i,
  bothDirections: /ขาเข้าและขาออก|ทั้งขาเข้า.*ขาออก|inbound and outbound|ingress and egress/i,
  firewall: /firewall|ไฟร์วอลล์|\bids\b|\bips\b|ตรวจจับการบุกรุก|ป้องกันการบุกรุก|\butm\b/i,
  tlsInspect: /tls inspection|ssl inspection|ถอดรหัส.*ตรวจ|decrypt.*inspect/i,
  idsIps: /\bids\b|\bips\b|intrusion (detection|prevention)|ตรวจจับการบุกรุก/i,
  compliance: /pdpa|ข้อมูลส่วนบุคคล|iso ?27001|ธปท\.|ธนาคารแห่งประเทศไทย|\bbot\b|\bpci ?dss\b|มาตรฐานความมั่นคงปลอดภัย|hsm|customer.?managed key|กุญแจ.*ลูกค้า/i,
  fastconnect: /fastconnect|leased line|วงจรเช่า|private link|\bmpls\b|สายเช่า/i,
  vpn: /\bvpn\b|ipsec|อุโมงค์เข้ารหัส/i,
  redundantLink: /สำรอง.*เส้นทาง|redundan|\bha\b|สองเส้นทาง|dual (link|path|circuit)|เส้นทางสำรอง/i,
  envDev: /development|สภาพแวดล้อม.*พัฒนา|ระบบพัฒนา|\bdev\b/i,
  envUat: /\buat\b|user acceptance|ทดสอบการยอมรับ|ทดสอบโดยผู้ใช้/i,
  envTest: /ระบบทดสอบ|test environment|สภาพแวดล้อม.*ทดสอบ/i,
  envPreprod: /pre.?production|staging|ก่อนขึ้นระบบจริง|เสมือนจริง/i,
  ha: /\bha\b|high availab|ความพร้อมใช้|redundan|สำรองการทำงาน|ไม่หยุดชะงัก|fault tolerance/i,
  waf: /\bwaf\b|web application firewall|owasp/i,
};

function deriveHub(c: Corpus): { kind: HubKind; inspection?: "standard" | "ids_ips" | "tls"; decisions: SpecDecision[] } {
  const decisions: SpecDecision[] = [];
  let kind: HubKind;

  if (c.has(RE.thirdPartyFw)) {
    kind = "hub_c";
    decisions.push({
      field: "hub.kind",
      value: "hub_c",
      source: "tor",
      clauses: c.hits(RE.thirdPartyFw),
      reason: L(
        "TOR ระบุยี่ห้อ firewall เฉพาะ จึงใช้ Hub C ที่วาง firewall ของผู้ผลิตนั้นไว้หลัง NLB คู่ trust/untrust (ค่า license ลูกค้าจัดหาเอง ไม่รวมใน BOM)",
        "The TOR names a specific firewall vendor, so Hub C places those appliances behind trust/untrust NLBs (licence supplied by the customer, excluded from the BOM).",
      ),
    });
  } else if (c.has(RE.dmz) || c.has(RE.bothDirections)) {
    kind = "hub_a";
    decisions.push({
      field: "hub.kind",
      value: "hub_a",
      source: "tor",
      clauses: [...new Set([...c.hits(RE.dmz), ...c.hits(RE.bothDirections)])].slice(0, 4),
      reason: L(
        "TOR ต้องการแยกโซน/ตรวจทั้งขาเข้าและขาออก จึงใช้ Hub A ที่มี Network Firewall แยกบทบาท: ตัวหนึ่งคุม DMZ ขาเข้า อีกตัวคุม egress และ east-west",
        "The TOR asks for zone separation / inspection in both directions, so Hub A gives two role-separated Network Firewalls: one for DMZ ingress, one for egress and east-west.",
      ),
    });
  } else if (c.has(RE.firewall)) {
    kind = "hub_b";
    decisions.push({
      field: "hub.kind",
      value: "hub_b",
      source: "tor",
      clauses: c.hits(RE.firewall),
      reason: L(
        "TOR ต้องการ firewall ตรวจทราฟฟิก จึงใช้ Hub B (OCI Network Firewall 1 ชุด) ซึ่งคุ้มค่าที่สุดที่ยังตรวจครบทุกทิศทาง",
        "The TOR requires traffic inspection, so Hub B (one OCI Network Firewall) — the cheapest option that still inspects every direction.",
      ),
    });
  } else {
    kind = "hub_b";
    decisions.push({
      field: "hub.kind",
      value: "hub_b",
      source: "best_practice",
      clauses: [],
      reason: L(
        "TOR ไม่ได้บังคับเรื่อง firewall แต่ไม่เสนอ Hub E เพราะ landing zone ที่ใช้งานจริงควรมีจุดตรวจทราฟฟิกเสมอ — เลือก Hub B เป็นระดับต่ำสุดที่ยอมรับได้",
        "The TOR does not mandate a firewall, but we do not propose Hub E: a production landing zone should always inspect traffic. Hub B is the lowest acceptable baseline.",
      ),
    });
  }

  let inspection: "standard" | "ids_ips" | "tls" | undefined;
  if (kind === "hub_a" || kind === "hub_b") {
    if (c.has(RE.tlsInspect)) {
      inspection = "tls";
      decisions.push({
        field: "hub.inspection",
        value: "tls",
        source: "tor",
        clauses: c.hits(RE.tlsInspect),
        reason: L("TOR ต้องการตรวจทราฟฟิกที่เข้ารหัส จึงเปิด TLS inspection", "The TOR requires inspecting encrypted traffic, so TLS inspection is enabled."),
      });
    } else if (c.has(RE.idsIps)) {
      inspection = "ids_ips";
      decisions.push({
        field: "hub.inspection",
        value: "ids_ips",
        source: "tor",
        clauses: c.hits(RE.idsIps),
        reason: L("TOR ระบุการตรวจจับ/ป้องกันการบุกรุก จึงเปิด IDS/IPS บน Network Firewall", "The TOR specifies intrusion detection/prevention, so IDS/IPS is enabled on the Network Firewall."),
      });
    }
  }
  return { kind, inspection, decisions };
}

function deriveCis(c: Corpus): { level: CisLevel; decision: SpecDecision } {
  // Read the WHOLE document here, not just the infra-relevant clauses: an
  // extractor will often file "ต้องเป็นไปตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล"
  // as a legal clause, yet it is exactly the sort of requirement that has to
  // raise the security baseline.
  if (c.hasAll(RE.compliance)) {
    return {
      level: 2,
      decision: {
        field: "cisLevel",
        value: "2",
        source: "tor",
        clauses: c.hitsAll(RE.compliance),
        reason: L(
          "TOR อ้างถึงมาตรฐาน/กฎระเบียบด้านความมั่นคงปลอดภัยหรือการจัดการกุญแจ จึงใช้ CIS Level 2 (เพิ่ม OCI Vault + customer-managed keys และ recipe ที่เข้มขึ้น)",
          "The TOR cites a security standard/regulation or key management, so CIS Level 2 — adding OCI Vault, customer-managed keys, and stricter recipes.",
        ),
      },
    };
  }
  return {
    level: 1,
    decision: {
      field: "cisLevel",
      value: "1",
      source: "best_practice",
      clauses: [],
      reason: L(
        "TOR ไม่ได้อ้างมาตรฐานเฉพาะ จึงใช้ CIS Level 1 เป็นพื้นฐาน (Cloud Guard + Security Zones + VSS เปิดทั้ง tenancy) — ยกเป็น Level 2 ได้ทันทีถ้าลูกค้าต้องการ",
        "No specific standard is cited, so CIS Level 1 is the baseline (Cloud Guard + Security Zones + VSS tenancy-wide). It can be raised to Level 2 on request.",
      ),
    },
  };
}

function deriveConnectivity(c: Corpus): { value: Connectivity; decision: SpecDecision } {
  const redundant = c.has(RE.redundantLink);
  if (c.has(RE.fastconnect)) {
    const value: Connectivity = redundant ? "fastconnect_1g_ha" : "fastconnect_1g";
    return {
      value,
      decision: {
        field: "hub.connectivity",
        value,
        source: "tor",
        clauses: c.hits(RE.fastconnect),
        reason: redundant
          ? L("TOR ต้องการวงจรเช่า/private link และมีเส้นทางสำรอง จึงเสนอ FastConnect 1 Gbps แบบคู่ (เส้นทางแยกกัน)", "The TOR asks for a leased line/private link with a redundant path, so a dual FastConnect 1 Gbps (diverse paths).")
          : L("TOR ต้องการเชื่อมต่อแบบ private ไม่ผ่านอินเทอร์เน็ต จึงเสนอ FastConnect 1 Gbps", "The TOR asks for private connectivity that avoids the internet, so FastConnect 1 Gbps."),
      },
    };
  }
  if (c.has(RE.vpn)) {
    const value: Connectivity = redundant ? "vpn_ha" : "vpn";
    return {
      value,
      decision: {
        field: "hub.connectivity",
        value,
        source: "tor",
        clauses: c.hits(RE.vpn),
        reason: redundant
          ? L("TOR ระบุ VPN พร้อมความพร้อมใช้ จึงเสนอ Site-to-Site VPN แบบ redundant (2 CPE / 4 tunnel)", "The TOR specifies VPN with availability, so a redundant Site-to-Site VPN (2 CPE / 4 tunnels).")
          : L("TOR ระบุการเชื่อมต่อผ่าน VPN จึงเสนอ Site-to-Site VPN (IPSec) 2 tunnel", "The TOR specifies VPN connectivity, so Site-to-Site VPN (IPSec) with 2 tunnels."),
      },
    };
  }
  return {
    value: "vpn",
    decision: {
      field: "hub.connectivity",
      value: "vpn",
      source: "best_practice",
      clauses: [],
      reason: L(
        "TOR ไม่ได้ระบุวิธีเชื่อมต่อกับระบบเดิม จึงเสนอ Site-to-Site VPN ซึ่งไม่มีค่าบริการเพิ่ม และใช้บริหารจัดการระบบได้ทันที (เปลี่ยนเป็น FastConnect ได้ถ้าลูกค้าต้องการ)",
        "The TOR is silent on hybrid connectivity, so Site-to-Site VPN — free of charge and immediately usable for administration (swap to FastConnect on request).",
      ),
    },
  };
}

function deriveEnvironments(c: Corpus): { envs: EnvName[]; decision: SpecDecision } {
  const envs: EnvName[] = ["prod"];
  const clauses: string[] = [];
  const add = (env: EnvName, re: RegExp) => {
    const h = c.hits(re);
    if (h.length && envs.length < 4) {
      envs.push(env);
      clauses.push(...h);
    }
  };
  add("preprod", RE.envPreprod);
  add("uat", RE.envUat);
  add("dev", RE.envDev);
  if (envs.length === 1) add("test", RE.envTest);

  return {
    envs,
    decision: {
      field: "environments",
      value: envs.join(", "),
      source: clauses.length ? "tor" : "best_practice",
      clauses: [...new Set(clauses)].slice(0, 4),
      reason: clauses.length
        ? L("TOR กล่าวถึงสภาพแวดล้อมเหล่านี้ จึงสร้าง spoke VCN + compartment แยกให้แต่ละตัว", "The TOR mentions these environments, so each gets its own spoke VCN and compartment tree.")
        : L(
            "TOR ไม่ได้ระบุจำนวนสภาพแวดล้อม จึงเสนอเฉพาะ production ไว้ก่อนเพื่อไม่ให้ราคาสูงเกินจำเป็น — เพิ่ม dev/uat ได้ในฟอร์มโดยราคาจะปรับตามอัตโนมัติ",
            "The TOR does not state how many environments are needed, so only production is quoted to avoid inflating the price — add dev/uat in the form and the price follows.",
          ),
    },
  };
}

// ---------------------------------------------------------------------------
// Sizing from quantitative clauses
// ---------------------------------------------------------------------------

/** Set a numeric field only if this sizing shape actually has it. */
function setIfPresent(sizing: Record<string, unknown>, field: string, value: number): boolean {
  if (typeof sizing[field] !== "number") return false;
  sizing[field] = value;
  return true;
}

const METRIC_RE = {
  cpu: /vcpu|ocpu|\bcpu\b|core|หน่วยประมวลผล|ประมวลผล/i,
  memory: /memory|\bram\b|หน่วยความจำ/i,
  storage: /storage|disk|พื้นที่|ความจุ|เก็บข้อมูล/i,
  vmCount: /server|เครื่อง|\bvm\b|instance|node/i,
  dbEcpu: /ecpu|database.*cpu|ฐานข้อมูล/i,
};

/**
 * Models name metrics in snake_case ("total_cpu", "storage_capacity").
 * `_` is a word character, so `\bcpu\b` never matches "total_cpu" — normalise
 * separators to spaces before matching or quantitative clauses fall through to
 * "unmapped" and the design silently ignores a stated minimum.
 */
export function normalizeMetricName(name: string): string {
  return name.replace(/[_\-.]+/g, " ").toLowerCase().trim();
}

/** A TOR that says "vCPU" means half as many OCPUs — the classic sizing trap. */
function toOcpu(name: string, unit: string, value: number): { ocpu: number; converted: boolean } {
  const isVcpu = /vcpu/i.test(unit) || /vcpu/i.test(name);
  return isVcpu ? { ocpu: Math.ceil(value / 2), converted: true } : { ocpu: Math.ceil(value), converted: false };
}

function applySizing(
  spec: SolutionSpec,
  c: Corpus,
): { decisions: SpecDecision[]; unmapped: TorRequirement[] } {
  const decisions: SpecDecision[] = [];
  const unmapped: TorRequirement[] = [];
  const sizing = spec.sizing as unknown as Record<string, unknown>;
  // Lower bounds only: a TOR floor never shrinks the template's own default.
  const atLeast = (field: string, want: number) => Math.max(want, typeof sizing[field] === "number" ? (sizing[field] as number) : 0);

  for (const r of c.reqs) {
    const m = r.metric;
    if (!m || !(m.value > 0)) continue;
    // "<=" bounds (latency, RTO, cost ceilings) are not sizing knobs.
    if (m.op === "<=" || m.op === "range") {
      unmapped.push(r);
      continue;
    }
    const name = normalizeMetricName(m.name);
    const clause = r.clause || r.id;
    let handled = false;

    if (METRIC_RE.vmCount.test(name) && !METRIC_RE.cpu.test(name) && !METRIC_RE.storage.test(name)) {
      const want = Math.ceil(m.value);
      handled = setIfPresent(sizing, "appVmCount", atLeast("appVmCount", want)) || setIfPresent(sizing, "protectedVmCount", atLeast("protectedVmCount", want)) || setIfPresent(sizing, "gatewayVmCount", atLeast("gatewayVmCount", want));
      if (handled) {
        decisions.push({
          field: "sizing.vmCount",
          value: String(want),
          source: "tor",
          clauses: [clause],
          reason: L(`TOR กำหนดจำนวนเครื่องขั้นต่ำ ${m.value} ${m.unit}`, `The TOR sets a minimum of ${m.value} ${m.unit} servers.`),
        });
      }
    } else if (METRIC_RE.cpu.test(name)) {
      const { ocpu, converted } = toOcpu(m.name, m.unit, m.value);
      const vms = typeof sizing.appVmCount === "number" ? Math.max(1, sizing.appVmCount as number) : 1;
      // A total CPU floor is met across the fleet, so divide by the VM count.
      const perVm = Math.max(1, Math.ceil(ocpu / vms));
      handled = setIfPresent(sizing, "ocpusPerVm", atLeast("ocpusPerVm", perVm));
      if (handled) {
        decisions.push({
          field: "sizing.ocpusPerVm",
          value: String(perVm),
          source: "tor",
          clauses: [clause],
          reason: converted
            ? L(
                `TOR กำหนด ${m.value} ${m.unit} — OCI คิดเป็น OCPU โดย 1 OCPU = 2 vCPU จึงเท่ากับ ${ocpu} OCPU กระจายบน ${vms} เครื่อง = ${perVm} OCPU/เครื่อง`,
                `The TOR sets ${m.value} ${m.unit}. OCI bills OCPUs and 1 OCPU = 2 vCPU, so that is ${ocpu} OCPU across ${vms} VM(s) = ${perVm} OCPU each.`,
              )
            : L(
                `TOR กำหนด ${m.value} ${m.unit} กระจายบน ${vms} เครื่อง = ${perVm} OCPU/เครื่อง`,
                `The TOR sets ${m.value} ${m.unit} across ${vms} VM(s) = ${perVm} OCPU each.`,
              ),
        });
      }
    } else if (METRIC_RE.memory.test(name)) {
      const vms = typeof sizing.appVmCount === "number" ? Math.max(1, sizing.appVmCount as number) : 1;
      const perVm = Math.max(1, Math.ceil(m.value / vms));
      handled = setIfPresent(sizing, "memGbPerVm", atLeast("memGbPerVm", perVm));
      if (handled) {
        decisions.push({
          field: "sizing.memGbPerVm",
          value: String(perVm),
          source: "tor",
          clauses: [clause],
          reason: L(`TOR กำหนดหน่วยความจำ ${m.value} ${m.unit} กระจายบน ${vms} เครื่อง`, `The TOR sets ${m.value} ${m.unit} of memory across ${vms} VM(s).`),
        });
      }
    } else if (METRIC_RE.storage.test(name)) {
      const want = Math.ceil(m.value);
      handled =
        setIfPresent(sizing, "dataGb", atLeast("dataGb", want)) ||
        setIfPresent(sizing, "storageGb", atLeast("storageGb", want)) ||
        setIfPresent(sizing, "capacityGb", atLeast("capacityGb", want));
      if (!handled && typeof (sizing.db as Record<string, unknown> | undefined)?.storageGb === "number") {
        const db = sizing.db as Record<string, unknown>;
        db.storageGb = Math.max(want, db.storageGb as number);
        handled = true;
      }
      if (handled) {
        decisions.push({
          field: "sizing.storageGb",
          value: String(want),
          source: "tor",
          clauses: [clause],
          reason: L(`TOR กำหนดความจุขั้นต่ำ ${m.value} ${m.unit}`, `The TOR sets a minimum capacity of ${m.value} ${m.unit}.`),
        });
      }
    } else if (METRIC_RE.dbEcpu.test(name)) {
      const db = sizing.db as Record<string, unknown> | undefined;
      if (db && typeof db.ecpus === "number") {
        db.ecpus = Math.max(Math.ceil(m.value), db.ecpus);
        handled = true;
        decisions.push({
          field: "sizing.db.ecpus",
          value: String(db.ecpus),
          source: "tor",
          clauses: [clause],
          reason: L(`TOR กำหนดกำลังประมวลผลฐานข้อมูล ${m.value} ${m.unit}`, `The TOR sets database compute at ${m.value} ${m.unit}.`),
        });
      }
    }

    if (!handled) unmapped.push(r);
  }

  // HA floor: a production workload gets at least two VMs in separate FDs. The
  // decision is always recorded, even when the template already defaults to HA
  // — a reviewer must be able to see that availability was considered at all,
  // not have it silently inherited.
  if (typeof sizing.ha === "boolean") {
    const haClauses = c.hits(RE.ha);
    const wasOn = sizing.ha === true;
    sizing.ha = true;
    if (typeof sizing.appVmCount === "number" && (sizing.appVmCount as number) < 2) sizing.appVmCount = 2;
    decisions.push({
      field: "sizing.ha",
      value: "true",
      source: haClauses.length ? "tor" : "best_practice",
      clauses: haClauses,
      reason: haClauses.length
        ? L("TOR ต้องการความพร้อมใช้งานสูง จึงกระจายเครื่องอย่างน้อย 2 ตัวข้าม fault domain", "The TOR requires high availability, so at least two VMs spread across fault domains.")
        : wasOn
          ? L(
              "TOR ไม่ได้ระบุ HA แต่คงการกระจายเครื่องข้าม fault domain ไว้ตามค่าตั้งต้นของแบบ — ระบบ production ที่เสนอราคาจริงควรมีเครื่องอย่างน้อย 2 ตัวเสมอ",
              "The TOR does not mention HA; the template's fault-domain spread is kept — a production system we actually quote should always run at least two VMs.",
            )
          : L(
              "TOR ไม่ได้ระบุ HA แต่ปรับให้กระจายเครื่องอย่างน้อย 2 ตัวข้าม fault domain เพราะระบบ production ที่เสนอราคาจริงควรทนการล่มของ 1 fault domain ได้",
              "The TOR does not mention HA, but we raise it to at least two VMs across fault domains: a production system we quote should survive losing one fault domain.",
            ),
    });
  }

  if (typeof sizing.waf === "boolean" && !sizing.waf && c.has(RE.waf)) {
    sizing.waf = true;
    decisions.push({
      field: "sizing.waf",
      value: "true",
      source: "tor",
      clauses: c.hits(RE.waf),
      reason: L("TOR ระบุ WAF/OWASP จึงเปิด Web Application Firewall หน้า load balancer", "The TOR specifies a WAF/OWASP, so a Web Application Firewall fronts the load balancer."),
    });
  }

  return { decisions, unmapped };
}

// ---------------------------------------------------------------------------
// Add-on services the TOR asks for by name
// ---------------------------------------------------------------------------

const ADDON_SIGNALS: { id: string; re: RegExp; why: LocalizedText }[] = [
  { id: "postgresql", re: /postgre|\bpg\b(?!p)/i, why: L("TOR ระบุ PostgreSQL", "The TOR names PostgreSQL") },
  { id: "mysql_heatwave", re: /mysql|mariadb/i, why: L("TOR ระบุ MySQL/MariaDB", "The TOR names MySQL/MariaDB") },
  { id: "opensearch", re: /opensearch|elastic ?search|\belk\b|full.?text search|ค้นหาข้อความ/i, why: L("TOR ต้องการระบบค้นหา/วิเคราะห์ log", "The TOR requires search / log analytics") },
  { id: "goldengate", re: /golden ?gate|\bcdc\b|replicat.*ฐานข้อมูล|ย้ายข้อมูล.*ไม่หยุดบริการ/i, why: L("TOR ต้องการทำซ้ำ/ย้ายข้อมูลแบบต่อเนื่อง", "The TOR requires continuous replication/migration") },
  { id: "ocvs_3yr", re: /vmware|vsphere|vcenter|\bnsx\b|\bvsan\b/i, why: L("TOR ระบุ VMware", "The TOR names VMware") },
  { id: "dns", re: /\bdns\b|โดเมน.*ระบบชื่อ|name server/i, why: L("TOR ต้องการบริการ DNS", "The TOR requires DNS") },
  { id: "digital_assistant", re: /chat ?bot|แชตบอต|แชทบอท|ผู้ช่วยอัตโนมัติ/i, why: L("TOR ต้องการแชตบอต", "The TOR requires a chatbot") },
  { id: "access_governance", re: /access review|recertif|ทบทวนสิทธิ|สอบทานสิทธิ/i, why: L("TOR ต้องการทบทวนสิทธิ์ตามรอบ", "The TOR requires periodic access review") },
  { id: "email_delivery", re: /email delivery|ส่งอีเมล|แจ้งเตือน.*อีเมล|\bsmtp\b/i, why: L("TOR ต้องการส่งอีเมลจากระบบ", "The TOR requires outbound email") },
  { id: "vdi", re: /\bvdi\b|virtual desktop|เดสก์ท็อปเสมือน/i, why: L("TOR ต้องการเดสก์ท็อปเสมือน", "The TOR requires virtual desktops") },
];

function deriveAddOns(c: Corpus, template: TemplateId): { addOns: SolutionSpec["addOns"]; decisions: SpecDecision[] } {
  const addOns: NonNullable<SolutionSpec["addOns"]> = [];
  const decisions: SpecDecision[] = [];
  for (const s of ADDON_SIGNALS) {
    const clauses = c.hits(s.re);
    if (!clauses.length) continue;
    // The dedicated template already covers it — no double-quoting.
    if (s.id === "vdi" && template === "vdi") continue;
    if (s.id === "digital_assistant" && template === "chatbot") continue;
    const def = ADDON_BY_ID[s.id];
    if (!def) continue;
    addOns.push({ id: s.id, qty: def.defaultQty });
    decisions.push({
      field: `addOns.${s.id}`,
      value: `${def.defaultQty} ${def.unit.en}`,
      source: "tor",
      clauses,
      reason: L(
        `${s.why.th} จึงเพิ่ม ${def.name.th} ${def.defaultQty} ${def.unit.th} (ปริมาณเริ่มต้น — ปรับได้)`,
        `${s.why.en}, so ${def.name.en} is added at ${def.defaultQty} ${def.unit.en} (starting quantity — adjustable).`,
      ),
    });
  }
  return { addOns: addOns.length ? addOns : undefined, decisions };
}

// ---------------------------------------------------------------------------

/**
 * Build a defensible SolutionSpec from extracted TOR requirements.
 * Pure and synchronous — the same TOR always yields the same proposal.
 */
export function deriveSpecFromTor(requirements: TorRequirement[], customerName?: string): DerivedSpec {
  const c = corpus(requirements);
  const { id: template, decision: templateDecision } = pickTemplate(c);
  const spec = TEMPLATES[template].defaults();
  const decisions: SpecDecision[] = [templateDecision];

  const hub = deriveHub(c);
  spec.hub.kind = hub.kind;
  if (hub.inspection) spec.hub.inspection = hub.inspection;
  decisions.push(...hub.decisions);

  const cis = deriveCis(c);
  spec.cisLevel = cis.level;
  decisions.push(cis.decision);

  const conn = deriveConnectivity(c);
  spec.hub.connectivity = conn.value;
  decisions.push(conn.decision);

  const envs = deriveEnvironments(c);
  spec.environments = envs.envs;
  decisions.push(envs.decision);

  const sized = applySizing(spec, c);
  decisions.push(...sized.decisions);

  const addOns = deriveAddOns(c, template);
  if (addOns.addOns) spec.addOns = addOns.addOns;
  decisions.push(...addOns.decisions);

  if (customerName) spec.customerName = customerName;
  spec.assumptionNotes = [
    ...spec.assumptionNotes,
    "สร้างจากการอ่าน TOR โดยอัตโนมัติ — ทุกค่าปรับได้ในฟอร์มก่อนยื่นจริง",
  ];

  return { spec, decisions, unmapped: sized.unmapped };
}
