import type { LocalizedText } from "@/lib/domain/types";

// Curated OCI SKU catalog. Part numbers are priced against the AIS Cloud
// (Oracle Alloy, Thailand) price list API, which returns THB list prices:
//   https://calculator.g-ais.co.th/api/skus
// Prices apply to the AIS Cloud region (ap-bangkok-1).
// sku: null => free/informational line (no price lookup).

export interface CatalogEntry {
  key: string;
  sku: string | null;
  name: LocalizedText;
  /** Fallback metric label when the price book has none */
  metric?: string;
}

export const CATALOG: Record<string, CatalogEntry> = Object.fromEntries(
  (
    [
      // --- compute -------------------------------------------------------
      { key: "compute_e5_ocpu", sku: "B97384", name: { th: "Compute VM.Standard.E5.Flex — OCPU", en: "Compute VM.Standard.E5.Flex — OCPU" } },
      { key: "compute_e5_mem", sku: "B97385", name: { th: "Compute VM.Standard.E5.Flex — Memory", en: "Compute VM.Standard.E5.Flex — Memory" } },
      { key: "block_storage_gb", sku: "B91961", name: { th: "Block/Boot Volume — ความจุ", en: "Block/Boot Volume — capacity" } },
      { key: "block_vpu", sku: "B91962", name: { th: "Block Volume Performance Units (Balanced 10 VPU/GB)", en: "Block Volume Performance Units (Balanced 10 VPU/GB)" } },
      // --- database ------------------------------------------------------
      { key: "adb_ecpu", sku: "B95702", name: { th: "Autonomous DB (ATP Serverless) — ECPU", en: "Autonomous DB (ATP Serverless) — ECPU" } },
      { key: "adb_storage_gb", sku: "B95706", name: { th: "Autonomous DB — storage (Transaction Processing)", en: "Autonomous DB — storage (Transaction Processing)" } },
      { key: "base_db_ecpu", sku: "B111586", name: { th: "Base Database (VM) Enterprise — ECPU (license-included)", en: "Base Database (VM) Enterprise — ECPU (license-included)" } },
      { key: "base_db_storage_gb", sku: "B111584", name: { th: "Base Database — DB storage", en: "Base Database — DB storage" } },
      // --- network -------------------------------------------------------
      { key: "lb_base", sku: "B93030", name: { th: "Flexible Load Balancer — base (ตัวแรกฟรี)", en: "Flexible Load Balancer — base (first LB free)" } },
      { key: "lb_bandwidth", sku: "B93031", name: { th: "Flexible Load Balancer — bandwidth", en: "Flexible Load Balancer — bandwidth" } },
      { key: "nfw_instance", sku: "B95403", name: { th: "OCI Network Firewall — instance", en: "OCI Network Firewall — instance" } },
      { key: "nfw_data_gb", sku: "B95404", name: { th: "OCI Network Firewall — data processing (10TB แรกฟรี)", en: "OCI Network Firewall — data processing (first 10TB free)" } },
      { key: "fastconnect_1g", sku: "B88325", name: { th: "FastConnect 1 Gbps — port", en: "FastConnect 1 Gbps — port" } },
      { key: "fastconnect_10g", sku: "B88326", name: { th: "FastConnect 10 Gbps — port", en: "FastConnect 10 Gbps — port" } },
      { key: "egress_apac_gb", sku: "B93455", name: { th: "Outbound Data Transfer (APAC) — 10TB แรกฟรี", en: "Outbound Data Transfer (APAC) — first 10TB free" } },
      { key: "vpn_ipsec", sku: null, name: { th: "Site-to-Site VPN (IPSec) — ฟรี", en: "Site-to-Site VPN (IPSec) — free" } },
      { key: "nlb", sku: null, name: { th: "Network Load Balancer — ฟรี", en: "Network Load Balancer — free" } },
      // --- storage -------------------------------------------------------
      { key: "fss_gb", sku: "B89057", name: { th: "File Storage Service — ความจุ", en: "File Storage Service — capacity" } },
      { key: "os_standard_gb", sku: "B91628", name: { th: "Object Storage — Standard", en: "Object Storage — Standard" } },
      { key: "os_requests_10k", sku: "B91627", name: { th: "Object Storage — API requests (ต่อ 10,000)", en: "Object Storage — API requests (per 10,000)" } },
      { key: "os_ia_gb", sku: "B93000", name: { th: "Object Storage — Infrequent Access", en: "Object Storage — Infrequent Access" } },
      { key: "os_archive_gb", sku: "B91633", name: { th: "Object Storage — Archive", en: "Object Storage — Archive" } },
      { key: "os_ia_retrieval_gb", sku: "B93001", name: { th: "Infrequent Access — data retrieval", en: "Infrequent Access — data retrieval" } },
      // --- containers ----------------------------------------------------
      { key: "oke_cluster", sku: "B96545", name: { th: "OKE Enhanced Cluster — control plane", en: "OKE Enhanced Cluster — control plane" } },
      // --- analytics -----------------------------------------------------
      { key: "adw_ecpu", sku: "B95701", name: { th: "Autonomous Data Warehouse — ECPU", en: "Autonomous Data Warehouse — ECPU" } },
      { key: "adw_storage_gb", sku: "B95754", name: { th: "Autonomous Data Warehouse — storage", en: "Autonomous Data Warehouse — storage" } },
      { key: "oac_user_pro", sku: "B92682", name: { th: "Oracle Analytics Cloud Professional — ต่อผู้ใช้", en: "Oracle Analytics Cloud Professional — per user" } },
      { key: "oac_user_ent", sku: "B92683", name: { th: "Oracle Analytics Cloud Enterprise — ต่อผู้ใช้", en: "Oracle Analytics Cloud Enterprise — per user" } },
      { key: "di_workspace_hr", sku: "B92598", name: { th: "OCI Data Integration — workspace", en: "OCI Data Integration — workspace" } },
      // --- AI ------------------------------------------------------------
      { key: "genai_small_10k", sku: "B108078", name: { th: "OCI Generative AI — Small Cohere (on-demand)", en: "OCI Generative AI — Small Cohere (on-demand)" } },
      { key: "genai_large_10k", sku: "B108077", name: { th: "OCI Generative AI — Large Cohere (on-demand)", en: "OCI Generative AI — Large Cohere (on-demand)" } },
      { key: "genai_embed_10k", sku: "B108079", name: { th: "OCI Generative AI — Embed Cohere (RAG)", en: "OCI Generative AI — Embed Cohere (RAG)" } },
      // --- app services --------------------------------------------------
      { key: "redis_gb", sku: "B98217", name: { th: "OCI Cache with Redis — memory", en: "OCI Cache with Redis — memory" } },
      { key: "functions_gbsec", sku: "B90617", name: { th: "Oracle Functions — execution (GB-seconds)", en: "Oracle Functions — execution (GB-seconds)" } },
      { key: "functions_inv", sku: "B90618", name: { th: "Oracle Functions — invocations", en: "Oracle Functions — invocations" } },
      { key: "apigw_calls", sku: "B92072", name: { th: "API Gateway — API calls", en: "API Gateway — API calls" } },
      { key: "streaming_gb", sku: "B90938", name: { th: "Streaming — data (PUT/GET)", en: "Streaming — data (PUT/GET)" } },
      { key: "streaming_storage_gb", sku: "B90939", name: { th: "Streaming — retention storage", en: "Streaming — retention storage" } },
      { key: "vdi_desktop", sku: "B95518", name: { th: "Secure Desktop (VDI) — ต่อ desktop", en: "Secure Desktop (VDI) — per desktop" } },
      { key: "email_1k", sku: "B88523", name: { th: "Email Delivery — ต่อ 1,000 อีเมล", en: "Email Delivery — per 1,000 emails" } },
      { key: "queue_1m", sku: "B95697", name: { th: "OCI Queue — ต่อ 1 ล้าน request", en: "OCI Queue — per 1M requests" } },
      { key: "apex_ecpu", sku: "B99709", name: { th: "APEX Application Development — ECPU", en: "APEX Application Development — ECPU" } },
      // --- open-source & migration databases (AIS-sellable) ----------------
      // Thai public-sector TORs regularly mandate an open-source engine or a
      // migration/replication tool; these are the AIS calculator's own SKUs.
      { key: "mysql_ecpu", sku: "B108030", name: { th: "MySQL HeatWave — ECPU", en: "MySQL HeatWave — ECPU" } },
      { key: "mysql_storage_gb", sku: "B92426", name: { th: "MySQL HeatWave — storage", en: "MySQL HeatWave — storage" } },
      { key: "mysql_backup_gb", sku: "B92483", name: { th: "MySQL HeatWave — backup storage", en: "MySQL HeatWave — backup storage" } },
      { key: "heatwave_node", sku: "B96626", name: { th: "HeatWave Cluster — capacity", en: "HeatWave Cluster — capacity" } },
      { key: "heatwave_storage_gb", sku: "B96625", name: { th: "HeatWave Cluster — storage", en: "HeatWave Cluster — storage" } },
      { key: "pg_ocpu", sku: "B99060", name: { th: "Database with PostgreSQL — OCPU", en: "Database with PostgreSQL — OCPU" } },
      { key: "pg_storage_gb", sku: "B99062", name: { th: "PostgreSQL — optimized storage", en: "PostgreSQL — optimized storage" } },
      { key: "opensearch_node", sku: "B93709", name: { th: "Search with OpenSearch (HA) — node", en: "Search with OpenSearch (HA) — node" } },
      { key: "goldengate_ocpu", sku: "B92992", name: { th: "GoldenGate — OCPU (license-included)", en: "GoldenGate — OCPU (license-included)" } },
      { key: "goldengate_byol_ocpu", sku: "B92993", name: { th: "GoldenGate — OCPU (BYOL)", en: "GoldenGate — OCPU (BYOL)" } },
      // --- VMware (OCVS) — lift-and-shift without re-platforming -----------
      { key: "ocvs_node_hourly", sku: "B108809", name: { th: "OCVS BM.Standard.E5.48 — node (hourly commit)", en: "OCVS BM.Standard.E5.48 — node (hourly commit)" } },
      { key: "ocvs_node_1yr", sku: "B108810", name: { th: "OCVS BM.Standard.E5.48 — node (1-year commit)", en: "OCVS BM.Standard.E5.48 — node (1-year commit)" } },
      { key: "ocvs_node_3yr", sku: "B108811", name: { th: "OCVS BM.Standard.E5.48 — node (3-year commit)", en: "OCVS BM.Standard.E5.48 — node (3-year commit)" } },
      // --- other AIS-sellable services ------------------------------------
      { key: "dns_queries_1m", sku: "B88525", name: { th: "OCI DNS — ต่อ 1 ล้าน query", en: "OCI DNS — per 1M queries" } },
      { key: "dns_traffic_mgmt_1m", sku: "B90327", name: { th: "DNS Traffic Management — ต่อ 1 ล้าน query", en: "DNS Traffic Management — per 1M queries" } },
      { key: "oda_requests", sku: "B90260", name: { th: "Oracle Digital Assistant — ต่อ request", en: "Oracle Digital Assistant — per request" } },
      { key: "language_1k", sku: "B93423", name: { th: "OCI Language — ต่อ 1,000 transaction", en: "OCI Language — per 1,000 transactions" } },
      { key: "access_governance_user", sku: "B97181", name: { th: "Access Governance Premium — ต่อผู้ใช้", en: "Access Governance Premium — per workforce user" } },
      // --- security ------------------------------------------------------
      { key: "waf_requests_m", sku: "B94277", name: { th: "Web Application Firewall — requests (10M แรกฟรี)", en: "Web Application Firewall — requests (first 10M free)" } },
      { key: "waf_instance", sku: "B94579", name: { th: "Web Application Firewall — instance", en: "Web Application Firewall — instance" } },
      { key: "vault_free", sku: null, name: { th: "OCI Vault (default vault + software keys) — ฟรี", en: "OCI Vault (default vault + software keys) — free" } },
      { key: "cloud_guard", sku: null, name: { th: "Cloud Guard — ฟรี", en: "Cloud Guard — free" } },
      { key: "security_zones", sku: null, name: { th: "Security Zones — ฟรี", en: "Security Zones — free" } },
      { key: "vss", sku: null, name: { th: "Vulnerability Scanning Service — ฟรี", en: "Vulnerability Scanning Service — free" } },
      { key: "bastion", sku: null, name: { th: "OCI Bastion — ฟรี", en: "OCI Bastion — free" } },
      // --- observability / governance -----------------------------------
      { key: "logging_gb", sku: "B92593", name: { th: "Logging — log storage (10GB แรกฟรี)", en: "Logging — log storage (first 10GB free)" } },
      { key: "events_notifications", sku: null, name: { th: "Events + Notifications + Alarms — ฟรี (ปริมาณ LZ)", en: "Events + Notifications + Alarms — free (LZ volumes)" } },
      { key: "identity_domain", sku: null, name: { th: "Identity Domain (Free tier) — ฟรี", en: "Identity Domain (Free tier) — free" } },
      { key: "budgets_tags", sku: null, name: { th: "Budgets + Tagging — ฟรี", en: "Budgets + Tagging — free" } },
      { key: "fsdr", sku: null, name: { th: "Full Stack Disaster Recovery — orchestration ฟรี", en: "Full Stack Disaster Recovery — orchestration free" } },
    ] as CatalogEntry[]
  ).map((e) => [e.key, e])
);

/** All part numbers the price book needs. */
export function catalogSkus(): string[] {
  return Object.values(CATALOG)
    .map((e) => e.sku)
    .filter((s): s is string => s !== null);
}
