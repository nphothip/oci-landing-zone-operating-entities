import type { SolutionSpec } from "@/lib/domain/types";

// Banking showcase — the maximum-security configuration of the enterprise
// landing zone, preset for a bank-grade engagement. Everything is dialled to
// the top of what the generator supports:
//   hub_a (dual NFW, HA) + TLS inspection · CIS Level 2 (adds Vault/keys)
//   FastConnect 10 Gbps dual (HA) to the data centre
//   4 environments (zod max) · Security Zone targets on ALL of them
//   Banking-style project portfolio per env (core banking, payment, mobile,
//   crm, data lake) with Base DB for the core ledger and ADB elsewhere,
//   plus an OKE platform in prod + preprod for containerized channels.

export function bankingShowcaseSpec(): SolutionSpec {
  return {
    template: "enterprise_lz",
    customerName: "Banking Showcase (แบบจัดเต็ม)",
    region: { id: "ap-bangkok-1", shortName: "bkk" },
    cisLevel: 2,
    hub: { kind: "hub_a", connectivity: "fastconnect_10g_ha", inspection: "tls" },
    environments: ["prod", "preprod", "uat", "dev"],
    sizing: {
      kind: "enterprise_lz",
      plans: {
        prod: {
          projects: [
            { name: "corebank", vmCount: 8, ocpusPerVm: 8, memGbPerVm: 64, bootGbPerVm: 300, dbEngine: "base_db", dbEcpus: 32, dbStorageGb: 2000, objectStorageGb: 1000 },
            { name: "payment", vmCount: 4, ocpusPerVm: 4, memGbPerVm: 32, bootGbPerVm: 200, dbEngine: "adb", dbEcpus: 16, dbStorageGb: 1000, objectStorageGb: 500 },
            { name: "mobile", vmCount: 4, ocpusPerVm: 4, memGbPerVm: 32, bootGbPerVm: 200, dbEngine: "adb", dbEcpus: 8, dbStorageGb: 500, objectStorageGb: 200 },
            { name: "crm", vmCount: 2, ocpusPerVm: 4, memGbPerVm: 32, bootGbPerVm: 200, dbEngine: "adb", dbEcpus: 8, dbStorageGb: 500, objectStorageGb: 200 },
            { name: "datalake", vmCount: 2, ocpusPerVm: 4, memGbPerVm: 64, bootGbPerVm: 200, dbEngine: "adb", dbEcpus: 16, dbStorageGb: 2000, objectStorageGb: 5000 },
          ],
          oke: true,
          okeWorkerCount: 6,
          okeWorkerOcpus: 4,
          okeWorkerMemGb: 32,
        },
        preprod: {
          projects: [
            { name: "corebank", vmCount: 4, ocpusPerVm: 4, memGbPerVm: 32, bootGbPerVm: 300, dbEngine: "base_db", dbEcpus: 16, dbStorageGb: 1000, objectStorageGb: 500 },
            { name: "payment", vmCount: 2, ocpusPerVm: 4, memGbPerVm: 32, bootGbPerVm: 200, dbEngine: "adb", dbEcpus: 8, dbStorageGb: 500, objectStorageGb: 200 },
            { name: "mobile", vmCount: 2, ocpusPerVm: 2, memGbPerVm: 16, bootGbPerVm: 200, dbEngine: "adb", dbEcpus: 4, dbStorageGb: 200, objectStorageGb: 100 },
          ],
          oke: true,
          okeWorkerCount: 3,
          okeWorkerOcpus: 2,
          okeWorkerMemGb: 16,
        },
        uat: {
          projects: [
            { name: "corebank", vmCount: 2, ocpusPerVm: 4, memGbPerVm: 32, bootGbPerVm: 200, dbEngine: "base_db", dbEcpus: 8, dbStorageGb: 500, objectStorageGb: 200 },
            { name: "channels", vmCount: 2, ocpusPerVm: 2, memGbPerVm: 16, bootGbPerVm: 100, dbEngine: "adb", dbEcpus: 4, dbStorageGb: 200, objectStorageGb: 100 },
          ],
          oke: false,
          okeWorkerCount: 3,
          okeWorkerOcpus: 2,
          okeWorkerMemGb: 16,
        },
        dev: {
          projects: [
            { name: "sandbox", vmCount: 2, ocpusPerVm: 2, memGbPerVm: 16, bootGbPerVm: 100, dbEngine: "adb", dbEcpus: 2, dbStorageGb: 100, objectStorageGb: 100 },
          ],
          oke: false,
          okeWorkerCount: 3,
          okeWorkerOcpus: 2,
          okeWorkerMemGb: 16,
        },
      },
      // Empty = Security Zone target on EVERY environment (bank-grade).
      securityTargetEnvs: [],
      fssGb: 2000,
      lbBandwidthMbps: 1000,
    },
    assumptionNotes: [],
  };
}

/** Highlights shown in the Banking mode panel (bilingual). */
export const BANKING_HIGHLIGHTS: { th: string; en: string }[] = [
  { th: "Hub A — Network Firewall คู่ (HA) + TLS inspection ถอดรหัสตรวจทุกทิศทาง", en: "Hub A — dual Network Firewalls (HA) with TLS inspection on every path" },
  { th: "CIS Level 2 — เพิ่ม Vault + customer-managed keys และ recipe ที่เข้มขึ้น", en: "CIS Level 2 — adds Vault + customer-managed keys and the stricter recipe" },
  { th: "Security Zone บังคับทุก environment (preventive policy ~26 ข้อ/env)", en: "Security Zones enforced on EVERY environment (~26 preventive policies each)" },
  { th: "FastConnect 10 Gbps คู่ (HA) เชื่อม data centre — ไม่มีทราฟฟิกวิ่งผ่าน internet", en: "Dual FastConnect 10 Gbps (HA) to the data centre — no traffic over the public internet" },
  { th: "5 ระบบใน prod แยก compartment + NSG ราย project (core banking · payment · mobile · crm · data lake)", en: "5 production systems in isolated per-project compartments + NSGs (core banking · payment · mobile · crm · data lake)" },
  { th: "Base Database (Enterprise) สำหรับ core ledger + ADB สำหรับ channel/analytics + OKE platform ใน prod/preprod", en: "Base Database (Enterprise) for the core ledger + ADB for channels/analytics + OKE platforms in prod/preprod" },
  { th: "MFA ทุกบัญชี, password policy CIS baseline, log รวมศูนย์ + retention 365 วัน, backup ตาม policy — ดูรายละเอียดในเอกสารออกแบบหมวด 8–14", en: "MFA everywhere, CIS-baseline password policy, centralized logs with 365-day retention, policy-driven backups — see design-doc sections 8–14" },
];
