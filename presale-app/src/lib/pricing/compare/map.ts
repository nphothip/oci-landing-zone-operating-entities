import type { PricedBomItem } from "@/lib/domain/types";
import type { CloudRate, CompareCell, CompareProvider, Confidence, MappedCell, ProviderRateCard, RateCardFile } from "./types";

// One BOM line -> one provider cell. Every conversion shows its math in `note`
// and every impossible comparison is an explicit exclusion — never a silent
// zero. Rate ids are looked up generically, so adding a provider to rates.json
// with the standard ids needs no change here.
//
// AIS metric semantics this file relies on:
//   compute_e5_ocpu.monthlyMetricQty = OCPU-hours    (1 OCPU = 2 vCPU)
//   adb/adw/base_db/mysql/apex ECPU  = ECPU-hours    (1 OCPU = 4 ECPU = 2 vCPU)
//   pg_ocpu                          = OCPU-hours
//   *_gb storage                     = GB-month
//   lb_bandwidth.quantity            = Mbps  (sustained; 1 Mbps ≈ 0.45 GB/h)
//   *_hours SKUs (nfw, fc, oke, …)   = resource-hours (744 h/month)

const CONF_ORDER: Record<Confidence, number> = { verified: 0, derived: 1, estimate: 2 };
const worse = (a: Confidence, b: Confidence): Confidence => (CONF_ORDER[a] >= CONF_ORDER[b] ? a : b);
const r2 = (n: number) => Math.round(n * 100) / 100;
const H = 744; // hours/month, matching the AIS/OCI convention

function excluded(reason: string): CompareCell {
  return { excluded: true, reason };
}

/** First rate id present on the card — lets providers use their native shape. */
function pick(card: ProviderRateCard, ...ids: string[]): CloudRate | undefined {
  for (const id of ids) {
    const r = card.rates[id];
    if (r) return r;
  }
  return undefined;
}

/** Simple qty × rate cell. */
function cell(rate: CloudRate | undefined, qty: number, note?: string): CompareCell {
  if (!rate) return excluded("ผู้ให้บริการนี้ไม่ได้ประกาศราคาบริการนี้ต่อสาธารณะ");
  if (rate.notes?.startsWith("NO_EQUIVALENT")) return excluded(rate.notes.replace(/^NO_EQUIVALENT:\s*/, ""));
  const q = Math.max(0, qty);
  return {
    excluded: false,
    service: rate.service,
    qty: r2(q),
    unit: rate.unit,
    unitPrice: rate.price,
    monthly: r2(q * rate.price),
    note,
    confidence: rate.confidence,
  };
}

/** compute+RAM cell built from two rates (vCPU + GB-RAM decomposition). */
function duoCell(
  vcpuRate: CloudRate | undefined,
  ramRate: CloudRate | undefined,
  vcpuHours: number,
  ramGbPerVcpu: number,
  service: string,
  note: string,
): CompareCell {
  if (!vcpuRate || !ramRate) return excluded("ผู้ให้บริการนี้ไม่ได้ประกาศราคาบริการนี้ต่อสาธารณะ");
  const unitPrice = vcpuRate.price + ramGbPerVcpu * ramRate.price;
  return {
    excluded: false,
    service,
    qty: r2(vcpuHours),
    unit: "vCPU-ชม. (รวม RAM)",
    unitPrice: Math.round(unitPrice * 1e6) / 1e6,
    monthly: r2(vcpuHours * vcpuRate.price + vcpuHours * ramGbPerVcpu * ramRate.price),
    note,
    confidence: worse(vcpuRate.confidence, ramRate.confidence),
  };
}

/** A genuinely-free equivalent — counts as compared, at zero. */
function freeCell(service: string, note: string): MappedCell {
  return { excluded: false, service, qty: 1, unit: "รวมแล้ว", unitPrice: 0, monthly: 0, note, confidence: "verified" };
}

/** Cross-border caveat for hybrid links / egress when the region is not Thai. */
function borderNote(card: ProviderRateCard, kind: "link" | "egress"): string {
  if (kind === "link") {
    return card.inCountry
      ? "ราคา port ฝั่ง cloud เท่านั้น — cross-connect ในประเทศไม่รวม"
      : "ราคา port ฝั่ง cloud เท่านั้น — วงจร carrier ข้ามประเทศจากไทยไม่รวม และแพงกว่าวงจรในประเทศมาก";
  }
  return card.inCountry
    ? "ทราฟฟิกไทย→ไทย"
    : "เสิร์ฟจากต่างประเทศ — ผู้ใช้ไทยดึงข้อมูลข้ามประเทศ (latency สูงขึ้น และข้อมูลออกนอกประเทศ)";
}

export function mapItem(provider: CompareProvider, item: PricedBomItem, cards: RateCardFile): CompareCell {
  const card = cards[provider];
  if (!card) return excluded("ไม่มีตารางอัตราของผู้ให้บริการนี้");
  const R = (...ids: string[]) => pick(card, ...ids);
  const m = item.monthlyMetricQty;
  const q = item.quantity;

  switch (item.catalogKey) {
    // ---- compute ----------------------------------------------------------
    case "compute_e5_ocpu":
      return cell(R("vcpu_hour"), m * 2, "1 OCPU = 2 vCPU");
    case "compute_e5_mem":
      return cell(R("ram_gb_hour"), m);
    case "block_storage_gb":
      return cell(R("block_gb_mo"), m);
    case "block_vpu":
      return freeCell("รวมในราคา disk", "SSD ทั่วไปของค่ายอื่นมี IOPS พื้นฐานรวมแล้ว — ไม่คิดแยกแบบ VPU");

    // ---- database ---------------------------------------------------------
    case "adb_ecpu": {
      // The single most misleading cell in the whole table if left unqualified:
      // ADB's ECPU price bundles the Oracle Database EE licence plus every
      // option, while managed PostgreSQL is open-source software. Most of the
      // gap a customer sees here is licence, not infrastructure — say so, and
      // quote the provider's own licensed-Oracle rate when it has one.
      const oracleLi = R("oracle_se2_li_vcpu_hour");
      const licensed = oracleLi
        ? ` · ทางเลือกที่มี license Oracle จริงบนค่ายนี้คือ ${oracleLi.service} ${oracleLi.price}/vCPU-ชม. (SE2 เท่านั้น ไม่ใช่ EE)`
        : " · ค่ายนี้ไม่มี managed Oracle แบบ license-included ให้เทียบ";
      return duoCell(
        R("pg_vcpu_hour"),
        R("pg_ram_gb_hour"),
        m / 2,
        8,
        "Managed PostgreSQL (open source)",
        `1 OCPU = 4 ECPU = 2 vCPU; RAM 8 GB/vCPU. ⚠ เทียบข้ามชนิดฐานข้อมูล: ราคา ADB รวม license Oracle Database Enterprise Edition + ทุก option + auto-tuning/patching/scaling ส่วน PostgreSQL เป็น open source — ส่วนต่างส่วนใหญ่คือค่า license ไม่ใช่ค่าเครื่อง${licensed}`,
      );
    }
    case "adb_storage_gb":
      return cell(R("pg_storage_gb_mo"), m, "storage ของ managed DB ที่ใช้เทียบ");
    case "base_db_ecpu": {
      const oracle = R("oracle_se2_li_vcpu_hour");
      if (oracle) return cell(oracle, m / 2, "managed Oracle SE2 license-included (EE แบบ LI ไม่มี — SE2 เป็นตัวใกล้สุด); 2 ECPU = 1 vCPU");
      return excluded("ไม่มี managed Oracle database แบบ license-included");
    }
    case "base_db_storage_gb":
      if (R("oracle_se2_li_vcpu_hour")) return cell(R("pg_storage_gb_mo"), m, "storage ของ managed DB");
      return excluded("ตามรายการ database ที่ไม่มีเทียบเท่า");
    case "mysql_ecpu":
      return duoCell(
        R("mysql_vcpu_hour", "pg_vcpu_hour"),
        R("mysql_ram_gb_hour", "pg_ram_gb_hour"),
        m / 2,
        16,
        "Managed MySQL",
        "2 ECPU = 1 vCPU; HeatWave ให้ RAM 8 GB/ECPU = 16 GB/vCPU",
      );
    case "mysql_storage_gb":
      return cell(R("pg_storage_gb_mo"), m, "อัตรา storage ของ managed DB");
    case "mysql_backup_gb":
      return cell(R("pg_storage_gb_mo"), m, "คิดที่อัตรา storage (backup เกินโควตาฟรีคิดใกล้เคียงกัน)");
    case "heatwave_node":
    case "heatwave_storage_gb":
      return excluded("HeatWave (in-database analytics) ไม่มีบริการเทียบเท่า — ค่ายอื่นต้องใช้ data warehouse แยกต่างหาก");
    case "pg_ocpu":
      return duoCell(R("pg_vcpu_hour"), R("pg_ram_gb_hour"), m * 2, 4, "Managed PostgreSQL", "1 OCPU = 2 vCPU; RAM 8 GB/OCPU = 4 GB/vCPU");
    case "pg_storage_gb":
      return cell(R("pg_storage_gb_mo"), m);
    case "apex_ecpu":
      return excluded("APEX (low-code รวมในฐานข้อมูล) เป็นบริการเฉพาะของ Oracle");

    // ---- analytics --------------------------------------------------------
    case "adw_ecpu": {
      const dw = R("dw_vcpu_hour", "redshift_vcpu_hour", "dws_vcpu_hour", "bq_slot_hour");
      if (!dw) return cell(R("dw_unit"), m / 2, "data warehouse ของค่ายนี้คิดคนละโมเดล — เทียบด้วยหน่วยประมวลผลโดยประมาณ (2 ECPU = 1 หน่วย)");
      return cell(dw, m / 2, "เทียบด้วยหน่วยประมวลผล (2 ECPU = 1 vCPU/slot); โมเดลราคาต่างจาก ECPU");
    }
    case "adw_storage_gb":
      return cell(R("dw_storage_gb_mo", "os_std_gb_mo", "block_gb_mo"), m, "storage ของ data warehouse (คิดใกล้ระดับ object/block storage)");
    case "oac_user_pro":
    case "oac_user_ent":
      return cell(R("bi_user_mo", "quicksight_user_mo", "looker_user_mo"), q, "BI คิดต่อผู้ใช้ (ชุดฟีเจอร์ไม่เท่ากับ OAC ทุกด้าน)");
    case "di_workspace_hr":
      return excluded("ETL คิดเงินคนละหน่วย (DPU/serverless ตามงานจริง) — ต้องประเมินจาก workload");

    // ---- network ----------------------------------------------------------
    case "lb_base": {
      const note = card.quirks?.l7IncludesWaf
        ? `LB ${q} ตัว × 744 ชม. — ผลิตภัณฑ์นี้รวม WAF ในตัว (บรรทัด WAF จึงไม่คิดซ้ำ)`
        : `LB ${q} ตัว × 744 ชม. — ทุกตัวคิดเงิน (AIS/OCI ตัวแรกฟรี)`;
      return cell(R("alb_hour", "elb_hour", "lb_mo"), R("lb_mo") && !R("alb_hour") && !R("elb_hour") ? q : q * H, note);
    }
    case "lb_bandwidth": {
      // Sustained Mbps -> GB/h processed: 1 Mbps = 0.125 MB/s = 0.45 GB/h.
      const gbPerHour = q * 0.45;
      const dataRate = R("lb_data_gb");
      if (dataRate) return cell(dataRate, gbPerHour * H, `${q} Mbps ≈ ${r2(gbPerHour * H)} GB/เดือน ที่ประมวลผ่าน LB`);
      const lcu = R("lcu_hour", "elb_lcu_hour", "lb_cu_hour");
      if (!lcu) return excluded("ค่ายนี้รวม bandwidth ในราคา LB (ไม่มีมิติคิดแยก)");
      return cell(lcu, gbPerHour * H, `${q} Mbps ≈ ${r2(gbPerHour)} capacity unit (มิติ bandwidth) × 744 ชม.`);
    }
    case "nlb": {
      const rate = R("nlb_hour", "elb_hour", "alb_hour");
      return cell(rate, q * H, `NLB ${q} ตัว × 744 ชม. (AIS/OCI ฟรี)`);
    }
    case "nfw_instance": {
      const perHour = R("fw_endpoint_hour", "fw_hour");
      if (perHour) return cell(perHour, m, "managed NGFW คิดต่อ endpoint-ชั่วโมง (NFW แต่ละตัวของเราเป็น endpoint แยกกัน)");
      const perMonth = R("fw_mo");
      // A firewall that costs nothing is a per-VM packet filter (security group
      // equivalent), not a managed NGFW with IPS/TLS inspection. Pricing our
      // NGFW against it would hand that provider a fictitious saving.
      if (perMonth && perMonth.price > 0)
        return cell(perMonth, 1, "managed firewall คิดรายเดือนระดับ tenant 1 ชุด (สถาปัตยกรรมต่างจาก NFW ราย instance — ไม่คูณจำนวน)");
      if (perMonth)
        return excluded(
          "firewall ที่แถมฟรีกับเครื่องเป็นระดับ security group/packet filter ไม่ใช่ NGFW ที่ตรวจ L7 + IDS/IPS + TLS inspection — เทียบกันไม่ได้",
        );
      return excluded("ไม่มี managed network firewall (NGFW) ที่ประกาศราคา");
    }
    case "nfw_data_gb": {
      const gb = R("fw_gb");
      if (gb) return cell(gb, q, "คิดทุก GB (AIS: 10TB แรกฟรี)");
      const perMonth = R("fw_mo");
      if (perMonth && perMonth.price > 0) return freeCell("รวมในแพ็กเกจ firewall", "โควตาทราฟฟิกรวมในราคารายเดือนของ firewall");
      return excluded("ไม่มี managed network firewall (NGFW) ที่ประกาศราคา");
    }
    case "fastconnect_1g":
    case "fastconnect_10g": {
      const g10 = item.catalogKey === "fastconnect_10g";
      const hourly = R(g10 ? "dc_10g_hour" : "dc_1g_hour", g10 ? "dx_10g_hour" : "dx_1g_hour", g10 ? "ic_10g_hour" : "ic_1g_hour");
      if (hourly) return cell(hourly, m, borderNote(card, "link"));
      const monthly = R(g10 ? "dc_10g_mo" : "dc_1g_mo", g10 ? "dc_10g" : "dc_1g");
      if (monthly) return cell(monthly, m / H, borderNote(card, "link"));
      return excluded("ไม่มีบริการเชื่อมต่อแบบ private (dedicated port) ที่ประกาศราคา");
    }
    case "vpn_ipsec": {
      const tunnel = R("vpn_tunnel_hour");
      if (tunnel) return cell(tunnel, 2 * H, `คิดต่อ tunnel — HA ใช้ 2 tunnel × 744 ชม. (AIS ฟรี) · ${borderNote(card, "link")}`);
      const hourly = R("vpn_gw_hour", "vpn_conn_hour");
      if (hourly) return cell(hourly, H, `gateway/connection × 744 ชม. (AIS ฟรี) · ${borderNote(card, "link")}`);
      const monthly = R("vpn_mo");
      if (monthly) return cell(monthly, 1, `คิดรายเดือน (AIS ฟรี) · ${borderNote(card, "link")}`);
      return excluded("ไม่มีบริการ site-to-site VPN ที่ประกาศราคา");
    }
    case "egress_apac_gb":
      return cell(R("egress_gb"), q, `คิดทุก GB (AIS: 10TB แรกฟรี) · ${borderNote(card, "egress")}`);
    case "dns_queries_1m":
      return cell(R("dns_1m"), m);
    case "dns_traffic_mgmt_1m": {
      const dns = R("dns_1m");
      if (!dns) return excluded("ไม่มีบริการ DNS ที่ประกาศราคา");
      return cell(dns, m, "ค่า traffic-policy/GSLB เพิ่มเติมของบางค่ายไม่รวม");
    }

    // ---- storage ----------------------------------------------------------
    case "fss_gb":
      return cell(R("fss_gb_mo"), m);
    case "os_standard_gb":
      return cell(R("os_std_gb_mo"), m, "คิดทุก GB (AIS: 10GB แรกฟรี)");
    case "os_ia_gb":
      return cell(R("os_ia_gb_mo", "os_std_gb_mo"), m);
    case "os_archive_gb":
      return cell(R("os_arch_gb_mo", "os_ia_gb_mo", "os_std_gb_mo"), m);
    case "os_ia_retrieval_gb":
      return cell(R("os_retrieval_gb"), m);
    case "os_requests_10k":
      return cell(R("os_req_10k"), m, "เทียบที่อัตรา read (write แพงกว่าหลายเท่าทุกค่าย)");

    // ---- containers / app services ---------------------------------------
    case "oke_cluster": {
      const k8s = R("k8s_cluster_hour");
      if (!k8s) return excluded("ไม่มี managed Kubernetes ที่ประกาศราคา");
      if (k8s.price === 0) return freeCell(k8s.service, "control plane ฟรี — worker node คิดเป็น compute แยกเหมือนกันทุกค่าย");
      return cell(k8s, m, "ค่า control plane; worker node คิดเป็น compute แยกเหมือนกันทุกค่าย");
    }
    case "redis_gb":
      return cell(R("redis_gb_hour"), m);
    case "functions_gbsec":
      return cell(R("functions_gbs", "lambda_gbs"), m);
    case "functions_inv":
      return cell(R("functions_1m_inv", "lambda_1m_inv"), m);
    case "apigw_calls": {
      const per1m = R("apigw_1m", "apig_1m");
      if (per1m) return cell(per1m, m);
      const hourly = R("apig_hour", "apigw_hour");
      if (hourly) return cell(hourly, H, "ค่ายนี้ขายเฉพาะ gateway แบบ dedicated รายชั่วโมง — ไม่มีคิดต่อ call");
      return excluded("ไม่มี API gateway ที่ประกาศราคา");
    }
    case "streaming_gb": {
      const perTib = R("pubsub_tib");
      if (perTib) return cell(perTib, q / 1024, "คิดต่อ TiB throughput");
      const perGb = R("stream_gb_in");
      const streamHour = R("stream_hour");
      if (perGb && streamHour) {
        return {
          excluded: false,
          service: `${perGb.service} + stream`,
          qty: r2(q),
          unit: "GB (รวมค่า stream 744 ชม.)",
          unitPrice: perGb.price,
          monthly: r2(q * perGb.price + H * streamHour.price),
          note: "on-demand: ต่อ GB ที่รับเข้า + ค่า stream 1 ตัว 744 ชม.",
          confidence: worse(perGb.confidence, streamHour.confidence),
        };
      }
      if (perGb) return cell(perGb, q, "คิดต่อ GB ที่รับเข้า");
      const cluster = R("kafka_hour", "tu_hour");
      if (cluster) return cell(cluster, H, "ค่ายนี้คิดตามคลัสเตอร์/throughput unit รายชั่วโมง (ไม่ใช่ปริมาณข้อมูล) × 744 ชม.");
      return excluded("ไม่มีบริการ streaming ที่ประกาศราคา");
    }
    case "streaming_storage_gb": {
      const s = R("stream_storage_gb_mo");
      if (s) return cell(s, m, "retention เกินโควตาพื้นฐาน");
      if (R("pubsub_tib") || R("kafka_hour") || R("tu_hour") || R("stream_gb_in")) {
        return freeCell("รวมในบริการ streaming", "retention พื้นฐานรวมในราคา throughput/คลัสเตอร์แล้ว");
      }
      return excluded("ไม่มีบริการ streaming ที่ประกาศราคา");
    }

    // ---- security ---------------------------------------------------------
    case "waf_instance": {
      if (card.quirks?.l7IncludesWaf) return freeCell("รวมใน L7 load balancer", "ผลิตภัณฑ์ LB ของค่ายนี้เป็น WAF ในตัว — คิดไปแล้วในบรรทัด Load Balancer");
      const base = R("waf_base_mo", "waf_acl_mo", "waf_policy_mo", "waf_mo");
      if (!base) return excluded("ไม่มี WAF ที่ประกาศราคา");
      if (base.price === 0) return freeCell(base.service, "โหมด pay-per-use ไม่มีค่า base (คิดต่อ rule/request)");
      return cell(base, q, "ค่า rule รายตัวเพิ่มเติมไม่รวม");
    }
    case "waf_requests_m": {
      if (card.quirks?.l7IncludesWaf) return freeCell("รวมใน L7 load balancer", "ปริมาณ request คิดผ่าน capacity unit ของ LB แล้ว");
      const req = R("waf_1m_req");
      if (!req) return excluded("ไม่มี WAF ที่ประกาศราคา");
      return cell(req, q, "คิดทุกล้าน request (AIS: 10M แรกฟรี)");
    }

    // ---- observability ----------------------------------------------------
    case "logging_gb":
      return cell(R("log_ingest_gb"), q, "คิดทุก GB (AIS: 10GB แรกฟรี)");

    // ---- end-user / misc services -----------------------------------------
    case "vdi_desktop":
      return cell(R("vdi_desktop_mo"), q, "ต่อ desktop ต่อเดือน");
    case "email_1k":
      return cell(R("email_1k"), m);
    case "queue_1m":
      return cell(R("queue_1m"), m);
    case "opensearch_node":
      return cell(R("opensearch_node_hour", "css_node_hour"), m, "managed OpenSearch/Elasticsearch (สเปก node ใกล้เคียง 4 vCPU/8-16GB)");
    case "goldengate_ocpu":
    case "goldengate_byol_ocpu": {
      const byol = item.catalogKey === "goldengate_byol_ocpu" ? " (ฝั่งเราเป็นราคา BYOL — ไม่รวม license เดิมของลูกค้า)" : "";
      const perInstance = R("dms_instance_hour", "drs_hour");
      if (perInstance) return cell(perInstance, m / 2, `บริการ replication/CDC คิดต่อ instance-ชม. (2 vCPU ≈ 1 OCPU)${byol}`);
      const perGb = R("datastream_gb");
      if (perGb) return excluded("บริการ CDC ของค่ายนี้คิดต่อ GB ที่ประมวลผล — เทียบไม่ได้โดยไม่รู้ปริมาณข้อมูลจริง");
      return excluded("ไม่มีบริการ replication/CDC แบบ managed ที่ประกาศราคา");
    }
    case "ocvs_node_hourly":
    case "ocvs_node_1yr":
    case "ocvs_node_3yr": {
      const commit =
        item.catalogKey === "ocvs_node_1yr" ? " (ฝั่งเราเป็นราคา commit 1 ปี)" : item.catalogKey === "ocvs_node_3yr" ? " (ฝั่งเราเป็นราคา commit 3 ปี)" : "";
      const node = R("vmware_node_hour", "gcve_node_hour");
      if (!node) return excluded("ไม่มีบริการ VMware แบบ managed");
      return cell(node, m, `node ของค่ายนี้สเปกต่างจาก BM.Standard.E5.48${commit}`);
    }

    // ---- AI (model-specific pricing — refuse to fake a comparison) --------
    case "genai_small_10k":
    case "genai_large_10k":
    case "genai_embed_10k":
      return excluded("Generative AI คิดต่อโทเคนแยกตามโมเดล — เทียบตรงกับ Cohere on-demand ของ OCI ไม่ได้");
    case "oda_requests":
      return excluded("Digital Assistant ไม่มีเทียบเท่าเชิงราคา (คิดคนละหน่วย)");
    case "language_1k":
      return excluded("AI language คิดคนละหน่วย (ต่อ 100 ตัวอักษร/ต่อ record) — ขนาด transaction ไม่เท่ากัน");
    case "access_governance_user":
      return excluded("ไม่มี access-governance คิดต่อผู้ใช้ (IAM พื้นฐานฟรีทุกค่าย แต่ไม่มี campaign/recertification)");

    // ---- free posture/ops lines ------------------------------------------
    case "vault_free":
      return excluded("KMS ของค่ายอื่นคิดต่อ key + ต่อ API call — จำนวน key ไม่อยู่ใน BOM ระดับนี้");
    case "cloud_guard":
      return excluded("CSPM ของค่ายอื่นคิดตามปริมาณ event/asset");
    case "security_zones":
      return freeCell("Policy guardrails", "policy/organization rules ฟรีเทียบเท่า");
    case "vss":
      return excluded("vulnerability scanning คิดต่อ instance/รูปแบบต่างกัน");
    case "bastion":
      return excluded("ทางเข้า admin แบบ managed คิดต่างกันมาก (บางค่ายฟรี บางค่ายเป็นบริการเสียเงินรายเดือน)");
    case "events_notifications":
      return freeCell("Events + notifications ปริมาณ LZ", "ปริมาณ event ระดับ landing zone อยู่ใน free tier ทุกค่าย");
    case "identity_domain":
      return freeCell("IAM", "identity พื้นฐานฟรีทุกค่าย");
    case "budgets_tags":
      return freeCell("Budgets + tagging", "ฟรีทุกค่าย");
    case "fsdr":
      return excluded("DR orchestration คิดต่อ server ที่ป้องกัน — นอกขอบเขต BOM นี้");

    default:
      return excluded(`ยังไม่มี mapping สำหรับ ${item.catalogKey}`);
  }
}
