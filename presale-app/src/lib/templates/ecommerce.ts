import type { BomItem, EcommerceSizing, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";
import { perEnv, scaled } from "@/lib/bom/env";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// Online store / e-commerce: web+app tier, Autonomous DB, Redis cache, product
// media on Object Storage, WAF at the edge, and order-confirmation email.

function sizing(spec: SolutionSpec): EcommerceSizing {
  if (spec.sizing.kind !== "ecommerce") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const ecommerceTemplate: TemplateDefinition = {
  id: "ecommerce",
  name: { th: "E-commerce / ร้านค้าออนไลน์", en: "E-commerce / Online Store" },
  description: {
    th: "ร้านค้าออนไลน์: web/app + Autonomous DB + Redis cache + WAF + สื่อสินค้าบน Object Storage",
    en: "Online store: web/app + Autonomous DB + Redis cache + WAF + product media on Object Storage",
  },
  icon: "🛒",
  defaultHub: "hub_b",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "ecommerce",
      region: { id: "ap-bangkok-1", shortName: "bkk" },
      cisLevel: 1,
      hub: { kind: "hub_b", connectivity: "none" },
      environments: ["prod"],
      sizing: {
        kind: "ecommerce",
        appVmCount: 3,
        ocpusPerVm: 2,
        memGbPerVm: 16,
        dbEcpus: 4,
        dbStorageGb: 300,
        cacheGb: 8,
        productMediaGb: 200,
        ordersPerMonth: 20000,
        waf: true,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.appVmCount", label: { th: "จำนวน web/app VM", en: "Web/app VMs" }, input: { type: "number", min: 1, max: 30, unit: "VM" } },
    { path: "sizing.ocpusPerVm", label: { th: "OCPU ต่อ VM", en: "OCPUs per VM" }, input: { type: "number", min: 1, max: 32, unit: "OCPU" } },
    { path: "sizing.memGbPerVm", label: { th: "Memory ต่อ VM (GB)", en: "Memory per VM (GB)" }, input: { type: "number", min: 4, max: 256, step: 4, unit: "GB" } },
    { path: "sizing.dbEcpus", label: { th: "Autonomous DB ECPU", en: "Autonomous DB ECPUs" }, input: { type: "number", min: 2, max: 64, step: 2, unit: "ECPU" } },
    { path: "sizing.dbStorageGb", label: { th: "DB storage (GB)", en: "DB storage (GB)" }, input: { type: "number", min: 20, max: 20000, step: 20, unit: "GB" } },
    { path: "sizing.cacheGb", label: { th: "Redis cache (GB)", en: "Redis cache (GB)" }, input: { type: "number", min: 0, max: 1000, unit: "GB" } },
    { path: "sizing.productMediaGb", label: { th: "สื่อสินค้า (Object Storage, GB)", en: "Product media (Object Storage, GB)" }, input: { type: "number", min: 0, max: 100000, step: 50, unit: "GB" } },
    { path: "sizing.ordersPerMonth", label: { th: "ออเดอร์ต่อเดือน", en: "Orders per month" }, input: { type: "number", min: 0, max: 10000000, step: 1000, unit: "orders" } },
    { path: "sizing.waf", label: { th: "เปิด Web Application Firewall", en: "Enable Web Application Firewall" }, input: { type: "boolean" } },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "store");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const shared: BomItem[] = [...lzBaselineBom(spec)];
    if (s.waf) {
      shared.push(
        {
          catalogKey: "waf_instance",
          label: { th: "Web Application Firewall — instance", en: "Web Application Firewall — instance" },
          category: "security",
          quantity: 1,
          unit: "instance",
          monthlyMetricQty: 1,
          deployedByLz: false,
        },
        {
          catalogKey: "waf_requests_m",
          label: { th: "WAF — requests", en: "WAF — requests" },
          category: "security",
          quantity: Math.max(1, Math.round((s.ordersPerMonth * 25) / 1e6)),
          unit: "M requests",
          monthlyMetricQty: (s.ordersPerMonth * 25) / 1e6,
          deployedByLz: false,
          notes: { th: "สมมติ ~25 requests ต่อออเดอร์ (browse+checkout); 10M แรกฟรี", en: "Assumes ~25 requests/order (browse+checkout); first 10M free" },
        },
      );
    }
    if (s.productMediaGb > 0) {
      shared.push({
        catalogKey: "os_standard_gb",
        label: { th: "Object Storage — สื่อสินค้า", en: "Object Storage — product media" },
        category: "storage",
        quantity: s.productMediaGb,
        unit: "GB",
        monthlyMetricQty: s.productMediaGb,
        deployedByLz: false,
      });
    }
    if (s.ordersPerMonth > 0) {
      shared.push({
        catalogKey: "email_1k",
        label: { th: "Email Delivery — ยืนยันคำสั่งซื้อ", en: "Email Delivery — order confirmations" },
        category: "network",
        quantity: Math.ceil(s.ordersPerMonth / 1000),
        unit: "×1,000 emails",
        monthlyMetricQty: s.ordersPerMonth / 1000,
        deployedByLz: false,
      });
    }

    const workload = perEnv(spec, (_env, scale) => {
      const vms = scaled(s.appVmCount, scale);
      const dbEcpus = scaled(s.dbEcpus, scale, 2);
      const dbStorage = scaled(s.dbStorageGb, scale, 20);
      const cache = scaled(s.cacheGb, scale, 0);
      const list: BomItem[] = [
        {
          catalogKey: "compute_e5_ocpu",
          label: { th: `Web/App VM ×${vms} — OCPU`, en: `Web/App VMs ×${vms} — OCPU` },
          category: "compute",
          quantity: vms * s.ocpusPerVm,
          unit: "OCPU",
          monthlyMetricQty: hours(vms * s.ocpusPerVm),
          deployedByLz: false,
        },
        {
          catalogKey: "compute_e5_mem",
          label: { th: "Web/App VM — memory", en: "Web/App VMs — memory" },
          category: "compute",
          quantity: vms * s.memGbPerVm,
          unit: "GB",
          monthlyMetricQty: hours(vms * s.memGbPerVm),
          deployedByLz: false,
        },
        {
          catalogKey: "adb_ecpu",
          label: { th: "Autonomous DB — ECPU", en: "Autonomous DB — ECPU" },
          category: "database",
          quantity: dbEcpus,
          unit: "ECPU",
          monthlyMetricQty: hours(dbEcpus),
          deployedByLz: false,
        },
        {
          catalogKey: "adb_storage_gb",
          label: { th: "Autonomous DB — storage", en: "Autonomous DB — storage" },
          category: "database",
          quantity: dbStorage,
          unit: "GB",
          monthlyMetricQty: dbStorage,
          deployedByLz: false,
        },
      ];
      if (cache > 0) {
        list.push({
          catalogKey: "redis_gb",
          label: { th: "OCI Cache with Redis", en: "OCI Cache with Redis" },
          category: "database",
          quantity: cache,
          unit: "GB",
          monthlyMetricQty: hours(cache),
          deployedByLz: false,
          notes: { th: "cache session/สินค้า ลดภาระ DB", en: "session/catalog cache to offload the DB" },
        });
      }
      return list;
    });

    return [...shared, ...workload];
  },
  assumptions(spec) {
    const s = sizing(spec);
    const list = lzBaselineAssumptions(spec);
    list.push(
      {
        th: `ประเมิน ${s.ordersPerMonth.toLocaleString()} ออเดอร์/เดือน — WAF ป้องกันหน้าร้าน, Redis cache ลดภาระ DB, สื่อสินค้าเสิร์ฟจาก Object Storage`,
        en: `Assumes ${s.ordersPerMonth.toLocaleString()} orders/month — WAF protects the storefront, Redis offloads the DB, product media served from Object Storage.`,
      },
      {
        th: "payment gateway/PSP เป็นบริการภายนอก ไม่รวมในราคานี้ (เชื่อมผ่าน API)",
        en: "The payment gateway/PSP is an external service (integrated via API), not included here.",
      },
    );
    return list;
  },
};
