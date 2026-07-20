import type { AnalyticsSizing, BomItem, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// Data warehouse & BI — management reporting / dashboards for a growing SME:
// Autonomous Data Warehouse + Oracle Analytics Cloud (per-user) + an Object
// Storage data lake, with optional OCI Data Integration for ETL.

function sizing(spec: SolutionSpec): AnalyticsSizing {
  if (spec.sizing.kind !== "analytics") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const analyticsTemplate: TemplateDefinition = {
  id: "analytics",
  name: { th: "Data Warehouse & BI", en: "Data Warehouse & BI" },
  description: {
    th: "คลังข้อมูล + dashboard ผู้บริหาร: Autonomous Data Warehouse + Oracle Analytics Cloud (คิดต่อผู้ใช้)",
    en: "Data warehouse + executive dashboards: Autonomous Data Warehouse + Oracle Analytics Cloud (per-user)",
  },
  icon: "📊",
  defaultHub: "hub_e",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "analytics",
      region: { id: "ap-singapore-1", shortName: "sin" },
      cisLevel: 1,
      hub: { kind: "hub_e", connectivity: "vpn" },
      environments: ["prod"],
      sizing: {
        kind: "analytics",
        adwEcpus: 4,
        adwStorageGb: 1000,
        oacUsers: 20,
        oacTier: "professional",
        dataLakeGb: 500,
        etlHoursPerMonth: 80,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.adwEcpus", label: { th: "ADW ECPU", en: "ADW ECPUs" }, input: { type: "number", min: 2, max: 128, step: 2, unit: "ECPU" } },
    { path: "sizing.adwStorageGb", label: { th: "ADW storage (GB)", en: "ADW storage (GB)" }, input: { type: "number", min: 100, max: 100000, step: 100, unit: "GB" } },
    { path: "sizing.oacUsers", label: { th: "ผู้ใช้ dashboard (OAC)", en: "Dashboard users (OAC)" }, input: { type: "number", min: 0, max: 500, step: 5, unit: "users" } },
    {
      path: "sizing.oacTier",
      label: { th: "รุ่น Analytics Cloud", en: "Analytics Cloud tier" },
      input: {
        type: "select",
        options: [
          { value: "professional", label: { th: "Professional ($16/ผู้ใช้)", en: "Professional ($16/user)" } },
          { value: "enterprise", label: { th: "Enterprise ($80/ผู้ใช้ — มี data flow/ML)", en: "Enterprise ($80/user — data flows/ML)" } },
        ],
      },
    },
    { path: "sizing.dataLakeGb", label: { th: "Data lake (Object Storage, GB)", en: "Data lake (Object Storage, GB)" }, input: { type: "number", min: 0, max: 1000000, step: 100, unit: "GB" } },
    { path: "sizing.etlHoursPerMonth", label: { th: "ETL (Data Integration) ชั่วโมง/เดือน", en: "ETL (Data Integration) hours/month" }, input: { type: "number", min: 0, max: 744, step: 10, unit: "hrs" } },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "analytics");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const items = lzBaselineBom(spec);

    items.push(
      {
        catalogKey: "adw_ecpu",
        label: { th: "Autonomous Data Warehouse — ECPU", en: "Autonomous Data Warehouse — ECPU" },
        category: "database",
        quantity: s.adwEcpus,
        unit: "ECPU",
        monthlyMetricQty: hours(s.adwEcpus),
        deployedByLz: false,
        notes: { th: "auto-scaling ปิด/ลดได้นอกเวลาทำการเพื่อลดค่าใช้จ่าย", en: "Auto-scaling can pause/shrink off-hours to cut cost" },
      },
      {
        catalogKey: "adw_storage_gb",
        label: { th: "ADW — storage", en: "ADW — storage" },
        category: "database",
        quantity: s.adwStorageGb,
        unit: "GB",
        monthlyMetricQty: s.adwStorageGb,
        deployedByLz: false,
      },
    );
    if (s.oacUsers > 0) {
      items.push({
        catalogKey: s.oacTier === "professional" ? "oac_user_pro" : "oac_user_ent",
        label: {
          th: `Oracle Analytics Cloud ${s.oacTier === "professional" ? "Professional" : "Enterprise"} ×${s.oacUsers} ผู้ใช้`,
          en: `Oracle Analytics Cloud ${s.oacTier === "professional" ? "Professional" : "Enterprise"} ×${s.oacUsers} users`,
        },
        category: "ai",
        quantity: s.oacUsers,
        unit: "users",
        monthlyMetricQty: s.oacUsers,
        deployedByLz: false,
      });
    }
    if (s.dataLakeGb > 0) {
      items.push({
        catalogKey: "os_standard_gb",
        label: { th: "Data lake — Object Storage", en: "Data lake — Object Storage" },
        category: "storage",
        quantity: s.dataLakeGb,
        unit: "GB",
        monthlyMetricQty: s.dataLakeGb,
        deployedByLz: false,
      });
    }
    if (s.etlHoursPerMonth > 0) {
      items.push({
        catalogKey: "di_workspace_hr",
        label: { th: "OCI Data Integration — ETL workspace", en: "OCI Data Integration — ETL workspace" },
        category: "database",
        quantity: s.etlHoursPerMonth,
        unit: "hrs",
        monthlyMetricQty: s.etlHoursPerMonth,
        deployedByLz: false,
        notes: { th: "รันเป็นรอบ ETL — คิดเฉพาะชั่วโมง workspace ที่เปิด", en: "Batch ETL — billed only for active workspace hours" },
      });
    }
    return items;
  },
  assumptions(spec) {
    const s = sizing(spec);
    const list = lzBaselineAssumptions(spec);
    list.push(
      {
        th: `แหล่งข้อมูล (ERP/POS/ไฟล์) ป้อนเข้า data lake แล้วแปลงลง ADW; ผู้ใช้ ${s.oacUsers} คนดู dashboard ผ่าน OAC — ราคา OAC เป็นราย user/เดือน เหมาะ SME (สลับเป็นแบบ OCPU ได้เมื่อผู้ใช้ >50)`,
        en: `Sources (ERP/POS/files) land in the data lake then transform into ADW; ${s.oacUsers} users consume dashboards via OAC — per-user pricing suits SMEs (switch to OCPU-based beyond ~50 users)`,
      },
      {
        th: "Hub E (ไม่มี firewall) เป็นค่าเริ่มต้นเพราะ traffic เป็น private/เข้าระบบวิเคราะห์ — อัปเกรดเป็น Hub B ได้ถ้ามี compliance เข้ม",
        en: "Hub E (no firewall) is the default since traffic is private/analytical — upgrade to Hub B for stricter compliance",
      },
    );
    return list;
  },
};
