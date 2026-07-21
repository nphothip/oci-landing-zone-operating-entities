import type { BackupSizing, BomItem, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// Backup-to-OCI: minimal landing zone (hub_e by default) + tiered Object
// Storage. The spoke hosts restore targets / backup gateways.

function sizing(spec: SolutionSpec): BackupSizing {
  if (spec.sizing.kind !== "backup") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const backupTemplate: TemplateDefinition = {
  id: "backup",
  name: { th: "Backup Solution (Backup to OCI)", en: "Backup Solution (Backup to OCI)" },
  description: {
    th: "สำรองข้อมูลขึ้น OCI Object Storage (Standard/IA/Archive) บน landing zone ขั้นต่ำ",
    en: "Back up to OCI Object Storage (Standard/IA/Archive) on a minimal landing zone",
  },
  icon: "💾",
  defaultHub: "hub_e",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "backup",
      region: { id: "ap-bangkok-1", shortName: "bkk" },
      cisLevel: 1,
      hub: { kind: "hub_e", connectivity: "vpn" },
      environments: ["prod"],
      sizing: {
        kind: "backup",
        standardGb: 1000,
        infrequentGb: 5000,
        archiveGb: 20000,
        monthlyRestoreGb: 500,
        dbBackup: false,
        dbBackupGb: 0,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.standardGb", label: { th: "Standard tier (GB) — กู้คืนบ่อย", en: "Standard tier (GB) — frequent restore" }, input: { type: "number", min: 0, max: 1_000_000, step: 100, unit: "GB" } },
    { path: "sizing.infrequentGb", label: { th: "Infrequent Access tier (GB)", en: "Infrequent Access tier (GB)" }, input: { type: "number", min: 0, max: 1_000_000, step: 100, unit: "GB" } },
    { path: "sizing.archiveGb", label: { th: "Archive tier (GB) — เก็บระยะยาว", en: "Archive tier (GB) — long-term retention" }, input: { type: "number", min: 0, max: 10_000_000, step: 1000, unit: "GB" } },
    { path: "sizing.monthlyRestoreGb", label: { th: "ปริมาณ restore ต่อเดือน (GB)", en: "Monthly restore volume (GB)" }, input: { type: "number", min: 0, max: 100_000, step: 100, unit: "GB" } },
    { path: "sizing.dbBackup", label: { th: "สำรองฐานข้อมูล Oracle ด้วย", en: "Include Oracle DB backups" }, input: { type: "boolean" } },
    { path: "sizing.dbBackupGb", label: { th: "ขนาด DB backup (GB)", en: "DB backup size (GB)" }, input: { type: "number", min: 0, max: 500_000, step: 100, unit: "GB" }, visibleIf: (s) => sizing(s).dbBackup },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "backup");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const items = lzBaselineBom(spec);

    if (s.standardGb > 0)
      items.push({
        catalogKey: "os_standard_gb",
        label: { th: "Object Storage — Standard", en: "Object Storage — Standard" },
        category: "storage",
        quantity: s.standardGb,
        unit: "GB",
        monthlyMetricQty: s.standardGb,
        deployedByLz: false,
      });
    if (s.infrequentGb > 0)
      items.push({
        catalogKey: "os_ia_gb",
        label: { th: "Object Storage — Infrequent Access", en: "Object Storage — Infrequent Access" },
        category: "storage",
        quantity: s.infrequentGb,
        unit: "GB",
        monthlyMetricQty: s.infrequentGb,
        deployedByLz: false,
        notes: { th: "มีค่า retrieval ต่อ GB ตอนกู้คืน + ระยะเก็บขั้นต่ำ 31 วัน", en: "Retrieval fee per GB on restore + 31-day minimum retention" },
      });
    if (s.archiveGb > 0)
      items.push({
        catalogKey: "os_archive_gb",
        label: { th: "Object Storage — Archive", en: "Object Storage — Archive" },
        category: "storage",
        quantity: s.archiveGb,
        unit: "GB",
        monthlyMetricQty: s.archiveGb,
        deployedByLz: false,
        notes: { th: "ระยะเก็บขั้นต่ำ 90 วัน ต้อง restore ก่อนอ่าน (~1 ชม.)", en: "90-day minimum retention; must be restored before reads (~1 hr)" },
      });
    if (s.dbBackup && s.dbBackupGb > 0)
      items.push({
        catalogKey: "os_standard_gb",
        label: { th: "Oracle DB backups (RMAN → Object Storage)", en: "Oracle DB backups (RMAN → Object Storage)" },
        category: "database",
        quantity: s.dbBackupGb,
        unit: "GB",
        monthlyMetricQty: s.dbBackupGb,
        deployedByLz: false,
      });

    if (s.monthlyRestoreGb > 0) {
      items.push(
        {
          catalogKey: "egress_apac_gb",
          label: { th: "Data transfer ขาออกตอน restore", en: "Outbound transfer during restores" },
          category: "network",
          quantity: s.monthlyRestoreGb,
          unit: "GB",
          monthlyMetricQty: s.monthlyRestoreGb,
          deployedByLz: false,
          notes: { th: "10TB แรก/เดือนฟรี — ผ่าน FastConnect ไม่คิด egress", en: "First 10TB/month free — no egress charge over FastConnect" },
        },
        {
          catalogKey: "os_ia_retrieval_gb",
          label: { th: "IA retrieval ตอน restore", en: "IA retrieval on restore" },
          category: "storage",
          quantity: Math.min(s.monthlyRestoreGb, s.infrequentGb),
          unit: "GB",
          monthlyMetricQty: Math.min(s.monthlyRestoreGb, s.infrequentGb),
          deployedByLz: false,
        },
      );
    }
    return items;
  },
  assumptions(spec) {
    const s = sizing(spec);
    const list = lzBaselineAssumptions(spec);
    list.push(
      {
        th: "เครื่องมือ backup ฝั่งลูกค้า (Veeam/Commvault/RMAN ฯลฯ) ชี้ปลายทางมาที่ OCI Object Storage ผ่าน S3-compatible API หรือ OCI SDK",
        en: "Customer backup software (Veeam/Commvault/RMAN, etc.) targets OCI Object Storage via the S3-compatible API or OCI SDK",
      },
      {
        th: `สัดส่วน tier ปัจจุบัน: Standard ${s.standardGb.toLocaleString()} / IA ${s.infrequentGb.toLocaleString()} / Archive ${s.archiveGb.toLocaleString()} GB — ปรับตาม retention policy ลูกค้า`,
        en: `Current tier split: Standard ${s.standardGb.toLocaleString()} / IA ${s.infrequentGb.toLocaleString()} / Archive ${s.archiveGb.toLocaleString()} GB — tune to the customer's retention policy`,
      },
    );
    return list;
  },
};
