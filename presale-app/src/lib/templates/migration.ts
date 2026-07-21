import type { BomItem, MigrationSizing, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// Lift & shift server migration — move an on-prem / hosted VM fleet (VMware,
// Hyper-V, bare metal) onto OCI compute in a governed landing zone. The most
// common first-move deal for SMEs.

function sizing(spec: SolutionSpec): MigrationSizing {
  if (spec.sizing.kind !== "migration") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const migrationTemplate: TemplateDefinition = {
  id: "migration",
  name: { th: "Server Migration (Lift & Shift)", en: "Server Migration (Lift & Shift)" },
  description: {
    th: "ย้าย VM จาก on-prem/VMware/โฮสติ้งเดิมขึ้น OCI compute พร้อม landing zone ควบคุมมาตรฐาน",
    en: "Move VMs from on-prem/VMware/legacy hosting onto OCI compute inside a governed landing zone",
  },
  icon: "🚚",
  defaultHub: "hub_b",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "migration",
      region: { id: "ap-bangkok-1", shortName: "bkk" },
      cisLevel: 1,
      hub: { kind: "hub_b", connectivity: "vpn" },
      environments: ["prod"],
      sizing: {
        kind: "migration",
        vmCount: 15,
        avgOcpusPerVm: 2,
        avgMemGbPerVm: 16,
        windowsVmCount: 8,
        totalStorageGb: 4000,
        monthlyEgressGb: 200,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.vmCount", label: { th: "จำนวน VM ทั้งหมดที่ย้าย", en: "Total VMs to migrate" }, input: { type: "number", min: 1, max: 200, unit: "VM" } },
    { path: "sizing.avgOcpusPerVm", label: { th: "OCPU เฉลี่ยต่อ VM", en: "Avg OCPUs per VM" }, input: { type: "number", min: 1, max: 16, unit: "OCPU" } },
    { path: "sizing.avgMemGbPerVm", label: { th: "Memory เฉลี่ยต่อ VM (GB)", en: "Avg memory per VM (GB)" }, input: { type: "number", min: 4, max: 256, step: 4, unit: "GB" } },
    { path: "sizing.windowsVmCount", label: { th: "ในจำนวนนั้นเป็น Windows กี่ตัว", en: "Of which, Windows VMs" }, input: { type: "number", min: 0, max: 200, unit: "VM" } },
    { path: "sizing.totalStorageGb", label: { th: "พื้นที่ดิสก์รวม (GB)", en: "Total disk capacity (GB)" }, input: { type: "number", min: 100, max: 500000, step: 500, unit: "GB" } },
    { path: "sizing.monthlyEgressGb", label: { th: "Data ขาออก/เดือน (GB)", en: "Monthly egress (GB)" }, input: { type: "number", min: 0, max: 100000, step: 100, unit: "GB" } },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "migrated");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const items = lzBaselineBom(spec);
    const winVms = Math.min(s.windowsVmCount, s.vmCount);
    const totalOcpu = s.vmCount * s.avgOcpusPerVm;

    items.push(
      {
        catalogKey: "compute_e5_ocpu",
        label: { th: `Migrated VMs ×${s.vmCount} (E5.Flex) — OCPU`, en: `Migrated VMs ×${s.vmCount} (E5.Flex) — OCPU` },
        category: "compute",
        quantity: totalOcpu,
        unit: "OCPU",
        monthlyMetricQty: hours(totalOcpu),
        deployedByLz: false,
      },
      {
        catalogKey: "compute_e5_mem",
        label: { th: "Migrated VMs — memory", en: "Migrated VMs — memory" },
        category: "compute",
        quantity: s.vmCount * s.avgMemGbPerVm,
        unit: "GB",
        monthlyMetricQty: hours(s.vmCount * s.avgMemGbPerVm),
        deployedByLz: false,
      },
    );
    if (winVms > 0) {
      items.push({
        catalogKey: "windows_ocpu",
        label: { th: `Windows Server license ×${winVms} VM`, en: `Windows Server license ×${winVms} VMs` },
        category: "compute",
        quantity: winVms * s.avgOcpusPerVm,
        unit: "OCPU",
        monthlyMetricQty: hours(winVms * s.avgOcpusPerVm),
        deployedByLz: false,
      });
    }
    items.push(
      {
        catalogKey: "block_storage_gb",
        label: { th: "Block volumes (boot + data)", en: "Block volumes (boot + data)" },
        category: "storage",
        quantity: s.totalStorageGb,
        unit: "GB",
        monthlyMetricQty: s.totalStorageGb,
        deployedByLz: false,
      },
      {
        catalogKey: "block_vpu",
        label: { th: "Volume performance (Balanced)", en: "Volume performance (Balanced)" },
        category: "storage",
        quantity: s.totalStorageGb,
        unit: "GB",
        monthlyMetricQty: s.totalStorageGb * 10,
        deployedByLz: false,
      },
    );
    if (s.monthlyEgressGb > 0) {
      items.push({
        catalogKey: "egress_apac_gb",
        label: { th: "Outbound data transfer", en: "Outbound data transfer" },
        category: "network",
        quantity: s.monthlyEgressGb,
        unit: "GB",
        monthlyMetricQty: s.monthlyEgressGb,
        deployedByLz: false,
        notes: { th: "10TB แรก/เดือนฟรี", en: "First 10TB/month free" },
      });
    }
    items.push({
      catalogKey: "fsdr",
      label: { th: "Oracle Cloud Migrations (เครื่องมือย้าย)", en: "Oracle Cloud Migrations (migration tooling)" },
      category: "landing_zone",
      quantity: 1,
      unit: "service",
      monthlyMetricQty: 0,
      deployedByLz: false,
      notes: { th: "เครื่องมือ discovery/replication ของ OCI ใช้ฟรี", en: "OCI's discovery/replication tooling is free of charge" },
    });
    return items;
  },
  assumptions(spec) {
    const s = sizing(spec);
    const list = lzBaselineAssumptions(spec);
    list.push(
      {
        th: `ประเมินจาก inventory เฉลี่ย (${s.vmCount} VM × ${s.avgOcpusPerVm} OCPU/${s.avgMemGbPerVm}GB) — ควรเก็บข้อมูล utilization จริง 2-4 สัปดาห์เพื่อ right-size ก่อนย้าย (SME ส่วนใหญ่ลดสเปกลงได้ 20-40%)`,
        en: `Estimated from an averaged inventory (${s.vmCount} VMs × ${s.avgOcpusPerVm} OCPU/${s.avgMemGbPerVm}GB) — collect 2-4 weeks of real utilization to right-size before the move (most SMEs downsize 20-40%)`,
      },
      {
        th: "VM ย้ายเข้าซับเน็ต app/db ของ spoke ตามบทบาท; ย้ายผ่าน VPN ที่ hub (ข้อมูลขาเข้า OCI ฟรี)",
        en: "VMs land in the spoke's app/db subnets by role; replication runs over the hub VPN (inbound data to OCI is free)",
      },
    );
    return list;
  },
};
