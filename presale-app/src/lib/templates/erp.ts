import type { BomItem, ErpSizing, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// ERP / business application hosting — the classic Thai SME deal: SAP
// Business One, Dynamics, payroll/accounting or a custom ERP moved onto OCI
// with an Oracle database underneath and a VPN back to the office.

function sizing(spec: SolutionSpec): ErpSizing {
  if (spec.sizing.kind !== "erp") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const erpTemplate: TemplateDefinition = {
  id: "erp",
  name: { th: "ERP / Business Application", en: "ERP / Business Application" },
  description: {
    th: "โฮสต์ ERP/ระบบบัญชี/payroll (SAP B1, Dynamics, ERP custom) พร้อมฐานข้อมูล Oracle และ VPN กลับออฟฟิศ",
    en: "Host ERP/accounting/payroll (SAP B1, Dynamics, custom ERP) with an Oracle database and a VPN to the office",
  },
  icon: "🏢",
  defaultHub: "hub_b",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "erp",
      region: { id: "ap-singapore-1", shortName: "sin" },
      cisLevel: 1,
      hub: { kind: "hub_b", connectivity: "vpn" },
      environments: ["prod"],
      sizing: {
        kind: "erp",
        users: 50,
        appVmCount: 2,
        ocpusPerVm: 4,
        memGbPerVm: 32,
        bootGbPerVm: 200,
        os: "windows",
        db: { engine: "base_db_vm", ecpus: 8, storageGb: 500 },
        fssGb: 200,
        backupGb: 500,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.users", label: { th: "จำนวนผู้ใช้งานระบบ", en: "Business users" }, input: { type: "number", min: 5, max: 2000, step: 5, unit: "users" } },
    { path: "sizing.appVmCount", label: { th: "จำนวน App/Terminal VM", en: "App/terminal VMs" }, input: { type: "number", min: 1, max: 10, unit: "VM" } },
    { path: "sizing.ocpusPerVm", label: { th: "OCPU ต่อ VM", en: "OCPUs per VM" }, input: { type: "number", min: 2, max: 16, unit: "OCPU" } },
    { path: "sizing.memGbPerVm", label: { th: "Memory ต่อ VM (GB)", en: "Memory per VM (GB)" }, input: { type: "number", min: 8, max: 256, step: 8, unit: "GB" } },
    { path: "sizing.bootGbPerVm", label: { th: "Boot/data volume ต่อ VM (GB)", en: "Boot/data volume per VM (GB)" }, input: { type: "number", min: 100, max: 2000, step: 50, unit: "GB" } },
    {
      path: "sizing.os",
      label: { th: "ระบบปฏิบัติการ App tier", en: "App tier OS" },
      input: {
        type: "select",
        options: [
          { value: "windows", label: { th: "Windows Server (คิด license ต่อ OCPU)", en: "Windows Server (license per OCPU)" } },
          { value: "linux", label: { th: "Linux (ไม่มีค่า license)", en: "Linux (no license cost)" } },
        ],
      },
    },
    {
      path: "sizing.db.engine",
      label: { th: "ฐานข้อมูล", en: "Database" },
      input: {
        type: "select",
        options: [
          { value: "base_db_vm", label: { th: "Base Database Enterprise (ควบคุมเวอร์ชันเอง)", en: "Base Database Enterprise (version control)" } },
          { value: "adb_serverless", label: { th: "Autonomous DB (จัดการให้อัตโนมัติ)", en: "Autonomous DB (self-managing)" } },
        ],
      },
    },
    { path: "sizing.db.ecpus", label: { th: "DB ECPU", en: "DB ECPUs" }, input: { type: "number", min: 2, max: 64, step: 2, unit: "ECPU" } },
    { path: "sizing.db.storageGb", label: { th: "DB storage (GB)", en: "DB storage (GB)" }, input: { type: "number", min: 100, max: 20000, step: 100, unit: "GB" } },
    { path: "sizing.fssGb", label: { th: "File share (FSS) สำหรับเอกสาร/interface (GB)", en: "File share (FSS) for docs/interfaces (GB)" }, input: { type: "number", min: 0, max: 10000, step: 50, unit: "GB" } },
    { path: "sizing.backupGb", label: { th: "พื้นที่ backup (GB)", en: "Backup capacity (GB)" }, input: { type: "number", min: 0, max: 100000, step: 100, unit: "GB" } },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "erp");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const envs = spec.environments.length;
    const items = lzBaselineBom(spec);
    const totalOcpu = s.appVmCount * s.ocpusPerVm * envs;

    items.push(
      {
        catalogKey: "compute_e5_ocpu",
        label: { th: `ERP App VM ×${s.appVmCount}/env (E5.Flex) — OCPU`, en: `ERP app VMs ×${s.appVmCount}/env (E5.Flex) — OCPU` },
        category: "compute",
        quantity: totalOcpu,
        unit: "OCPU",
        monthlyMetricQty: hours(totalOcpu),
        deployedByLz: false,
      },
      {
        catalogKey: "compute_e5_mem",
        label: { th: "ERP App VM — memory", en: "ERP app VMs — memory" },
        category: "compute",
        quantity: s.appVmCount * s.memGbPerVm * envs,
        unit: "GB",
        monthlyMetricQty: hours(s.appVmCount * s.memGbPerVm * envs),
        deployedByLz: false,
      },
    );
    if (s.os === "windows") {
      items.push({
        catalogKey: "windows_ocpu",
        label: { th: "Windows Server license", en: "Windows Server license" },
        category: "compute",
        quantity: totalOcpu,
        unit: "OCPU",
        monthlyMetricQty: hours(totalOcpu),
        deployedByLz: false,
        notes: { th: "คิดต่อ OCPU ที่รัน Windows — ใช้ license-included ของ OCI", en: "Billed per Windows OCPU — OCI license-included" },
      });
    }
    items.push(
      {
        catalogKey: "block_storage_gb",
        label: { th: "Boot/data volumes", en: "Boot/data volumes" },
        category: "storage",
        quantity: s.appVmCount * s.bootGbPerVm * envs,
        unit: "GB",
        monthlyMetricQty: s.appVmCount * s.bootGbPerVm * envs,
        deployedByLz: false,
      },
      {
        catalogKey: "block_vpu",
        label: { th: "Volume performance (Balanced)", en: "Volume performance (Balanced)" },
        category: "storage",
        quantity: s.appVmCount * s.bootGbPerVm * envs,
        unit: "GB",
        monthlyMetricQty: s.appVmCount * s.bootGbPerVm * envs * 10,
        deployedByLz: false,
      },
    );

    if (s.db.engine === "base_db_vm") {
      items.push(
        {
          catalogKey: "base_db_ecpu",
          label: { th: "Base Database Enterprise — ECPU", en: "Base Database Enterprise — ECPU" },
          category: "database",
          quantity: s.db.ecpus,
          unit: "ECPU",
          monthlyMetricQty: hours(s.db.ecpus),
          deployedByLz: false,
        },
        {
          catalogKey: "base_db_infra_ecpu",
          label: { th: "Base Database — compute infrastructure", en: "Base Database — compute infrastructure" },
          category: "database",
          quantity: s.db.ecpus,
          unit: "ECPU",
          monthlyMetricQty: hours(s.db.ecpus),
          deployedByLz: false,
        },
        {
          catalogKey: "base_db_storage_gb",
          label: { th: "Base Database — storage", en: "Base Database — storage" },
          category: "database",
          quantity: s.db.storageGb,
          unit: "GB",
          monthlyMetricQty: s.db.storageGb,
          deployedByLz: false,
        },
      );
    } else {
      items.push(
        {
          catalogKey: "adb_ecpu",
          label: { th: "Autonomous DB — ECPU", en: "Autonomous DB — ECPU" },
          category: "database",
          quantity: s.db.ecpus,
          unit: "ECPU",
          monthlyMetricQty: hours(s.db.ecpus),
          deployedByLz: false,
        },
        {
          catalogKey: "adb_storage_gb",
          label: { th: "Autonomous DB — storage", en: "Autonomous DB — storage" },
          category: "database",
          quantity: s.db.storageGb,
          unit: "GB",
          monthlyMetricQty: s.db.storageGb,
          deployedByLz: false,
        },
      );
    }

    if (s.fssGb > 0) {
      items.push({
        catalogKey: "fss_gb",
        label: { th: "File Storage (shared NFS/SMB)", en: "File Storage (shared NFS/SMB)" },
        category: "storage",
        quantity: s.fssGb,
        unit: "GB",
        monthlyMetricQty: s.fssGb,
        deployedByLz: false,
        notes: { th: "แชร์เอกสาร/interface files ระหว่าง app VMs", en: "Shared docs/interface files across app VMs" },
      });
    }
    if (s.backupGb > 0) {
      items.push({
        catalogKey: "os_standard_gb",
        label: { th: "Backups (RMAN + VM) → Object Storage", en: "Backups (RMAN + VM) → Object Storage" },
        category: "storage",
        quantity: s.backupGb,
        unit: "GB",
        monthlyMetricQty: s.backupGb,
        deployedByLz: false,
      });
    }
    return items;
  },
  assumptions(spec) {
    const s = sizing(spec);
    const list = lzBaselineAssumptions(spec);
    list.push(
      {
        th: `ขนาดตั้งต้นอิงผู้ใช้ ~${s.users} คน (${s.appVmCount}×${s.ocpusPerVm} OCPU app + ${s.db.ecpus} ECPU DB) — ปรับตาม sizing guide ของผู้ผลิต ERP จริงก่อนเสนอราคา`,
        en: `Initial sizing assumes ~${s.users} users (${s.appVmCount}×${s.ocpusPerVm} OCPU app + ${s.db.ecpus} ECPU DB) — validate against the ERP vendor's sizing guide before quoting`,
      },
      {
        th: "License ของตัว ERP (SAP/Microsoft ฯลฯ) เป็นของลูกค้า ไม่รวมในราคานี้",
        en: "The ERP software license (SAP/Microsoft, etc.) is customer-provided and not included",
      },
      {
        th: "ผู้ใช้เข้าระบบผ่าน VPN/private จาก office — ไม่เปิด ERP สู่อินเทอร์เน็ตตรง ๆ",
        en: "Users access via VPN/private connectivity from the office — the ERP is not exposed directly to the internet",
      },
    );
    return list;
  },
};
