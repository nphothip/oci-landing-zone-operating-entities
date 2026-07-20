import type { BomItem, DevtestSizing, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// Dev/Test environments — the SME cost-saver: development and test spokes on
// the free hub, with compute/DB billed only for the hours they actually run
// (stop instances outside working hours ≈ 60-65% off compute).

function sizing(spec: SolutionSpec): DevtestSizing {
  if (spec.sizing.kind !== "devtest") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const devtestTemplate: TemplateDefinition = {
  id: "devtest",
  name: { th: "Dev/Test Environments", en: "Dev/Test Environments" },
  description: {
    th: "สภาพแวดล้อมพัฒนา/ทดสอบราคาประหยัด — เปิดเครื่องเฉพาะเวลาทำงาน จ่ายตามชั่วโมงจริง",
    en: "Budget dev/test environments — run only during working hours, pay for actual hours",
  },
  icon: "🧪",
  defaultHub: "hub_e",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "devtest",
      region: { id: "ap-singapore-1", shortName: "sin" },
      cisLevel: 1,
      hub: { kind: "hub_e", connectivity: "vpn" },
      environments: ["dev", "test"],
      sizing: {
        kind: "devtest",
        vmPerEnv: 4,
        ocpusPerVm: 1,
        memGbPerVm: 8,
        bootGbPerVm: 100,
        dbEcpusPerEnv: 2,
        dbStorageGbPerEnv: 100,
        runningHoursPerMonth: 260,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.vmPerEnv", label: { th: "จำนวน VM ต่อ environment", en: "VMs per environment" }, input: { type: "number", min: 1, max: 20, unit: "VM" } },
    { path: "sizing.ocpusPerVm", label: { th: "OCPU ต่อ VM", en: "OCPUs per VM" }, input: { type: "number", min: 1, max: 8, unit: "OCPU" } },
    { path: "sizing.memGbPerVm", label: { th: "Memory ต่อ VM (GB)", en: "Memory per VM (GB)" }, input: { type: "number", min: 4, max: 128, step: 4, unit: "GB" } },
    { path: "sizing.bootGbPerVm", label: { th: "Boot volume ต่อ VM (GB)", en: "Boot volume per VM (GB)" }, input: { type: "number", min: 50, max: 500, step: 50, unit: "GB" } },
    { path: "sizing.dbEcpusPerEnv", label: { th: "ADB ต่อ env (ECPU, 0 = ไม่ใช้)", en: "ADB per env (ECPUs, 0 = none)" }, input: { type: "number", min: 0, max: 32, step: 2, unit: "ECPU" } },
    { path: "sizing.dbStorageGbPerEnv", label: { th: "ADB storage ต่อ env (GB)", en: "ADB storage per env (GB)" }, input: { type: "number", min: 0, max: 5000, step: 50, unit: "GB" } },
    {
      path: "sizing.runningHoursPerMonth",
      label: { th: "ชั่วโมงเปิดเครื่อง/เดือน", en: "Running hours per month" },
      help: { th: "12 ชม. × 22 วันทำงาน ≈ 260 ชม. (เทียบ 24/7 = 744 ชม.)", en: "12h × 22 working days ≈ 260 hrs (24/7 = 744 hrs)" },
      input: { type: "number", min: 40, max: 744, step: 10, unit: "hrs" },
    },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "workspace");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const envs = spec.environments.length;
    const items = lzBaselineBom(spec);
    const H = s.runningHoursPerMonth;
    const totalOcpu = s.vmPerEnv * s.ocpusPerVm * envs;
    const totalMem = s.vmPerEnv * s.memGbPerVm * envs;
    const savePct = Math.round((1 - H / 744) * 100);

    items.push(
      {
        catalogKey: "compute_e5_ocpu",
        label: { th: `Dev/Test VMs ×${s.vmPerEnv}/env — OCPU (${H} ชม./เดือน)`, en: `Dev/Test VMs ×${s.vmPerEnv}/env — OCPU (${H} hrs/month)` },
        category: "compute",
        quantity: totalOcpu,
        unit: "OCPU",
        monthlyMetricQty: totalOcpu * H,
        deployedByLz: false,
        notes: { th: `ตั้งเวลาปิดเครื่องนอกเวลางาน — ประหยัด ~${savePct}% เทียบ 24/7`, en: `Auto-stop outside working hours — saves ~${savePct}% vs 24/7` },
      },
      {
        catalogKey: "compute_e5_mem",
        label: { th: "Dev/Test VMs — memory", en: "Dev/Test VMs — memory" },
        category: "compute",
        quantity: totalMem,
        unit: "GB",
        monthlyMetricQty: totalMem * H,
        deployedByLz: false,
      },
      {
        catalogKey: "block_storage_gb",
        label: { th: "Boot volumes (คิดเต็มเดือนแม้เครื่องปิด)", en: "Boot volumes (billed full month even when stopped)" },
        category: "storage",
        quantity: s.vmPerEnv * s.bootGbPerVm * envs,
        unit: "GB",
        monthlyMetricQty: s.vmPerEnv * s.bootGbPerVm * envs,
        deployedByLz: false,
      },
      {
        catalogKey: "block_vpu",
        label: { th: "Boot volume performance (Balanced)", en: "Boot volume performance (Balanced)" },
        category: "storage",
        quantity: s.vmPerEnv * s.bootGbPerVm * envs,
        unit: "GB",
        monthlyMetricQty: s.vmPerEnv * s.bootGbPerVm * envs * 10,
        deployedByLz: false,
      },
    );
    if (s.dbEcpusPerEnv > 0) {
      items.push(
        {
          catalogKey: "adb_ecpu",
          label: { th: `ADB ต่อ env — ECPU (${H} ชม./เดือน)`, en: `ADB per env — ECPU (${H} hrs/month)` },
          category: "database",
          quantity: s.dbEcpusPerEnv * envs,
          unit: "ECPU",
          monthlyMetricQty: s.dbEcpusPerEnv * envs * H,
          deployedByLz: false,
          notes: { th: "ADB stop ได้ตอนไม่ใช้ — จ่ายเฉพาะ storage", en: "ADB can be stopped when idle — storage-only billing" },
        },
        {
          catalogKey: "adb_storage_gb",
          label: { th: "ADB — storage", en: "ADB — storage" },
          category: "database",
          quantity: s.dbStorageGbPerEnv * envs,
          unit: "GB",
          monthlyMetricQty: s.dbStorageGbPerEnv * envs,
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
        th: `ค่า compute/DB คิดที่ ${s.runningHoursPerMonth} ชม./เดือน (ตั้ง schedule ปิดเครื่องนอกเวลางานด้วย resource scheduler/automation) — storage คิดเต็มเดือน`,
        en: `Compute/DB priced at ${s.runningHoursPerMonth} hrs/month (auto-stop outside working hours via resource scheduling) — storage bills the full month`,
      },
      {
        th: "Hub E (ฟรี) เหมาะกับ non-prod; แยก spoke ต่อ environment ทำให้ทีมแยกสิทธิ์และลบทิ้งได้ทั้งชุด",
        en: "The free Hub E fits non-prod; one spoke per environment keeps team permissions and teardown clean",
      },
    );
    return list;
  },
};
