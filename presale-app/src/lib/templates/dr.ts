import type { BomItem, DrSizing, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// DR site on AIS Cloud (Bangkok) for on-prem / other-cloud / other-region primary.
// Landing zone hosts the DR spoke; Full Stack DR orchestrates (free service).
// pilot_light: standby VMs stopped (storage billed only).
// warm_standby: ~half the fleet running continuously.

function sizing(spec: SolutionSpec): DrSizing {
  if (spec.sizing.kind !== "dr") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const drTemplate: TemplateDefinition = {
  id: "dr",
  name: { th: "DR Solution (DR site บน OCI)", en: "DR Solution (DR site on OCI)" },
  description: {
    th: "ไซต์ Disaster Recovery บน OCI SG: pilot light หรือ warm standby + Full Stack DR",
    en: "Disaster Recovery site on OCI SG: pilot light or warm standby + Full Stack DR",
  },
  icon: "🛟",
  defaultHub: "hub_b",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "dr",
      region: { id: "ap-bangkok-1", shortName: "bkk" },
      cisLevel: 1,
      hub: { kind: "hub_b", connectivity: "fastconnect_1g" },
      environments: ["prod"],
      sizing: {
        kind: "dr",
        mode: "pilot_light",
        protectedVmCount: 10,
        avgOcpusPerVm: 2,
        avgMemGbPerVm: 16,
        avgBootGbPerVm: 100,
        blockReplicaGb: 2000,
        objectBackupGb: 1000,
        dbDr: "adb_cross_region",
        dbEcpus: 4,
        dbStorageGb: 500,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    {
      path: "sizing.mode",
      label: { th: "รูปแบบ DR", en: "DR mode" },
      input: {
        type: "select",
        options: [
          { value: "pilot_light", label: { th: "Pilot light (VM หยุด จ่ายแค่ storage)", en: "Pilot light (VMs stopped, storage only)" } },
          { value: "warm_standby", label: { th: "Warm standby (รันครึ่ง fleet)", en: "Warm standby (half fleet running)" } },
        ],
      },
    },
    { path: "sizing.protectedVmCount", label: { th: "จำนวน VM ที่ต้องกู้คืน", en: "Protected VMs" }, input: { type: "number", min: 1, max: 200, unit: "VM" } },
    { path: "sizing.avgOcpusPerVm", label: { th: "OCPU เฉลี่ยต่อ VM", en: "Avg OCPUs per VM" }, input: { type: "number", min: 1, max: 32, unit: "OCPU" } },
    { path: "sizing.avgMemGbPerVm", label: { th: "Memory เฉลี่ยต่อ VM (GB)", en: "Avg memory per VM (GB)" }, input: { type: "number", min: 4, max: 256, step: 4, unit: "GB" } },
    { path: "sizing.avgBootGbPerVm", label: { th: "Boot volume เฉลี่ย (GB)", en: "Avg boot volume (GB)" }, input: { type: "number", min: 50, max: 1000, step: 50, unit: "GB" } },
    { path: "sizing.blockReplicaGb", label: { th: "Block volume ที่ replicate (GB)", en: "Replicated block volumes (GB)" }, input: { type: "number", min: 0, max: 100000, step: 100, unit: "GB" } },
    { path: "sizing.objectBackupGb", label: { th: "Backup ใน Object Storage (GB)", en: "Object Storage backups (GB)" }, input: { type: "number", min: 0, max: 500000, step: 100, unit: "GB" } },
    {
      path: "sizing.dbDr",
      label: { th: "DR ของฐานข้อมูล", en: "Database DR" },
      input: {
        type: "select",
        options: [
          { value: "none", label: { th: "ไม่มี", en: "None" } },
          { value: "adb_cross_region", label: { th: "ADB cross-region standby", en: "ADB cross-region standby" } },
          { value: "base_db_data_guard", label: { th: "Base DB + Data Guard", en: "Base DB + Data Guard" } },
        ],
      },
    },
    { path: "sizing.dbEcpus", label: { th: "DB standby ECPU", en: "Standby DB ECPUs" }, input: { type: "number", min: 2, max: 64, step: 2, unit: "ECPU" }, visibleIf: (s) => sizing(s).dbDr !== "none" },
    { path: "sizing.dbStorageGb", label: { th: "DB storage (GB)", en: "DB storage (GB)" }, input: { type: "number", min: 20, max: 50000, step: 20, unit: "GB" }, visibleIf: (s) => sizing(s).dbDr !== "none" },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "dr");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const items = lzBaselineBom(spec);
    const runningVms = s.mode === "warm_standby" ? Math.ceil(s.protectedVmCount / 2) : 0;

    if (runningVms > 0) {
      items.push(
        {
          catalogKey: "compute_e5_ocpu",
          label: { th: `Warm standby VMs ×${runningVms} — OCPU`, en: `Warm standby VMs ×${runningVms} — OCPU` },
          category: "compute",
          quantity: runningVms * s.avgOcpusPerVm,
          unit: "OCPU",
          monthlyMetricQty: hours(runningVms * s.avgOcpusPerVm),
          deployedByLz: false,
        },
        {
          catalogKey: "compute_e5_mem",
          label: { th: "Warm standby VMs — memory", en: "Warm standby VMs — memory" },
          category: "compute",
          quantity: runningVms * s.avgMemGbPerVm,
          unit: "GB",
          monthlyMetricQty: hours(runningVms * s.avgMemGbPerVm),
          deployedByLz: false,
        },
      );
    }

    const bootGb = s.protectedVmCount * s.avgBootGbPerVm;
    items.push(
      {
        catalogKey: "block_storage_gb",
        label: {
          th: `Boot volumes ของ standby ×${s.protectedVmCount} VM (จ่ายแม้ VM หยุด)`,
          en: `Standby boot volumes ×${s.protectedVmCount} VMs (billed while VMs are stopped)`,
        },
        category: "storage",
        quantity: bootGb,
        unit: "GB",
        monthlyMetricQty: bootGb,
        deployedByLz: false,
      },
      {
        catalogKey: "block_vpu",
        label: { th: "Boot/replica volume performance (Balanced)", en: "Boot/replica volume performance (Balanced)" },
        category: "storage",
        quantity: bootGb + s.blockReplicaGb,
        unit: "GB",
        monthlyMetricQty: (bootGb + s.blockReplicaGb) * 10,
        deployedByLz: false,
      },
    );

    if (s.blockReplicaGb > 0) {
      items.push({
        catalogKey: "block_storage_gb",
        label: { th: "Block volume replicas (ข้อมูลแอป)", en: "Block volume replicas (app data)" },
        category: "storage",
        quantity: s.blockReplicaGb,
        unit: "GB",
        monthlyMetricQty: s.blockReplicaGb,
        deployedByLz: false,
        notes: { th: "Cross-region replication คิดเป็นความจุ volume ปลายทาง", en: "Cross-region replication billed as target volume capacity" },
      });
    }
    if (s.objectBackupGb > 0) {
      items.push({
        catalogKey: "os_standard_gb",
        label: { th: "Object Storage — backup copies", en: "Object Storage — backup copies" },
        category: "storage",
        quantity: s.objectBackupGb,
        unit: "GB",
        monthlyMetricQty: s.objectBackupGb,
        deployedByLz: false,
      });
    }

    if (s.dbDr === "adb_cross_region") {
      items.push(
        {
          catalogKey: "adb_ecpu",
          label: { th: "ADB cross-region standby — ECPU", en: "ADB cross-region standby — ECPU" },
          category: "database",
          quantity: s.dbEcpus,
          unit: "ECPU",
          monthlyMetricQty: hours(s.dbEcpus),
          deployedByLz: false,
          notes: { th: "Autonomous Data Guard standby คิดตาม ECPU/storage ของ standby", en: "Autonomous Data Guard standby billed by standby ECPU/storage" },
        },
        {
          catalogKey: "adb_storage_gb",
          label: { th: "ADB standby — storage", en: "ADB standby — storage" },
          category: "database",
          quantity: s.dbStorageGb,
          unit: "GB",
          monthlyMetricQty: s.dbStorageGb,
          deployedByLz: false,
        },
      );
    } else if (s.dbDr === "base_db_data_guard") {
      items.push(
        {
          catalogKey: "base_db_ecpu",
          label: { th: "Base DB standby (Data Guard) — ECPU", en: "Base DB standby (Data Guard) — ECPU" },
          category: "database",
          quantity: s.dbEcpus,
          unit: "ECPU",
          monthlyMetricQty: hours(s.dbEcpus),
          deployedByLz: false,
        },
        {
          catalogKey: "base_db_storage_gb",
          label: { th: "Base DB standby — storage", en: "Base DB standby — storage" },
          category: "database",
          quantity: s.dbStorageGb,
          unit: "GB",
          monthlyMetricQty: s.dbStorageGb,
          deployedByLz: false,
        },
      );
    }

    items.push({
      catalogKey: "fsdr",
      label: { th: "Full Stack DR (orchestration)", en: "Full Stack DR (orchestration)" },
      category: "landing_zone",
      quantity: 1,
      unit: "plan",
      monthlyMetricQty: 0,
      deployedByLz: false,
      notes: { th: "บริการฟรี — จ่ายเฉพาะทรัพยากรที่ถูก orchestrate", en: "Free service — you pay only for orchestrated resources" },
    });
    return items;
  },
  assumptions(spec) {
    const s = sizing(spec);
    const list = lzBaselineAssumptions(spec);
    list.push(
      {
        th: `โหมด ${s.mode === "pilot_light" ? "Pilot light: VM standby ปิดอยู่ (RTO ระดับชั่วโมง) จ่ายเฉพาะ storage" : "Warm standby: รันประมาณครึ่ง fleet (RTO ระดับนาที)"} — เปิดเครื่องเต็มจำนวนเฉพาะตอน failover แล้วคิดค่า compute ตามชั่วโมงที่ใช้จริง`,
        en: `${s.mode === "pilot_light" ? "Pilot light: standby VMs stopped (hour-level RTO), storage billed only" : "Warm standby: ~half the fleet running (minute-level RTO)"} — full fleet starts on failover, compute billed for actual hours`,
      },
      {
        th: "เชื่อมต่อไซต์หลักผ่าน " + (spec.hub.connectivity.startsWith("fastconnect") ? "FastConnect" : spec.hub.connectivity === "vpn" ? "Site-to-Site VPN" : "อินเทอร์เน็ต/ยังไม่ระบุ") + " เข้าที่ hub DRG",
        en: "Primary site connects via " + (spec.hub.connectivity.startsWith("fastconnect") ? "FastConnect" : spec.hub.connectivity === "vpn" ? "Site-to-Site VPN" : "internet/TBD") + " into the hub DRG",
      },
    );
    return list;
  },
};
