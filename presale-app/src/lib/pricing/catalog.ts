import type { LocalizedText } from "@/lib/domain/types";

// Curated OCI SKU catalog. Part numbers verified against the public price
// list API on 2026-07-20:
//   https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/
// USD list prices are globally uniform, so they apply to ap-singapore-1.
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
      { key: "base_db_infra_ecpu", sku: "B112724", name: { th: "Base Database — compute infrastructure ต่อ ECPU", en: "Base Database — compute infrastructure per ECPU" } },
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
      { key: "os_standard_gb", sku: "B91628", name: { th: "Object Storage — Standard", en: "Object Storage — Standard" } },
      { key: "os_ia_gb", sku: "B93000", name: { th: "Object Storage — Infrequent Access", en: "Object Storage — Infrequent Access" } },
      { key: "os_archive_gb", sku: "B91633", name: { th: "Object Storage — Archive", en: "Object Storage — Archive" } },
      { key: "os_ia_retrieval_gb", sku: "B93001", name: { th: "Infrequent Access — data retrieval", en: "Infrequent Access — data retrieval" } },
      // --- containers ----------------------------------------------------
      { key: "oke_cluster", sku: "B96545", name: { th: "OKE Enhanced Cluster — control plane", en: "OKE Enhanced Cluster — control plane" } },
      // --- AI ------------------------------------------------------------
      { key: "genai_small_10k", sku: "B111035", name: { th: "OCI Generative AI — Meta Llama 4 Scout (on-demand)", en: "OCI Generative AI — Meta Llama 4 Scout (on-demand)" } },
      { key: "genai_large_10k", sku: "B110517", name: { th: "OCI Generative AI — Meta Llama 3.1 405B (on-demand)", en: "OCI Generative AI — Meta Llama 3.1 405B (on-demand)" } },
      { key: "genai_embed_10k", sku: "B108079", name: { th: "OCI Generative AI — Embed Cohere (RAG)", en: "OCI Generative AI — Embed Cohere (RAG)" } },
      // --- security ------------------------------------------------------
      { key: "waf_requests_m", sku: "B94277", name: { th: "Web Application Firewall — requests (10M แรกฟรี)", en: "Web Application Firewall — requests (first 10M free)" } },
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
