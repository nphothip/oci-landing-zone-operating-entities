import type { BomItem, ServerlessSizing, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { hours, toMillions } from "@/lib/bom/formulas";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// Serverless API backend: OCI API Gateway + Oracle Functions + Autonomous DB +
// Object Storage. Pay-per-use, minimal always-on compute.

function sizing(spec: SolutionSpec): ServerlessSizing {
  if (spec.sizing.kind !== "serverless") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const serverlessTemplate: TemplateDefinition = {
  id: "serverless",
  name: { th: "Serverless API / Integration", en: "Serverless API / Integration" },
  description: {
    th: "API backend แบบ serverless: API Gateway + Oracle Functions + Autonomous DB — จ่ายตามการใช้จริง",
    en: "Serverless API backend: API Gateway + Oracle Functions + Autonomous DB — pay-per-use",
  },
  icon: "⚡",
  defaultHub: "hub_b",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "serverless",
      region: { id: "ap-bangkok-1", shortName: "bkk" },
      cisLevel: 1,
      hub: { kind: "hub_b", connectivity: "none" },
      environments: ["prod"],
      sizing: {
        kind: "serverless",
        apiCallsPerMonth: 20000000,
        functionInvocationsPerMonth: 20000000,
        avgFnMemMb: 256,
        avgFnMs: 200,
        adbEcpus: 2,
        adbStorageGb: 100,
        objectStorageGb: 100,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.apiCallsPerMonth", label: { th: "API calls ต่อเดือน", en: "API calls per month" }, input: { type: "number", min: 0, max: 5000000000, step: 1000000, unit: "calls" } },
    { path: "sizing.functionInvocationsPerMonth", label: { th: "Function invocations ต่อเดือน", en: "Function invocations per month" }, input: { type: "number", min: 0, max: 5000000000, step: 1000000, unit: "inv" } },
    { path: "sizing.avgFnMemMb", label: { th: "Function memory (MB)", en: "Function memory (MB)" }, input: { type: "number", min: 128, max: 8192, step: 128, unit: "MB" } },
    { path: "sizing.avgFnMs", label: { th: "เวลา execution เฉลี่ย (ms)", en: "Avg execution time (ms)" }, input: { type: "number", min: 10, max: 60000, step: 10, unit: "ms" } },
    { path: "sizing.adbEcpus", label: { th: "Autonomous DB ECPU", en: "Autonomous DB ECPUs" }, input: { type: "number", min: 2, max: 64, step: 2, unit: "ECPU" } },
    { path: "sizing.adbStorageGb", label: { th: "DB storage (GB)", en: "DB storage (GB)" }, input: { type: "number", min: 20, max: 20000, step: 20, unit: "GB" } },
    { path: "sizing.objectStorageGb", label: { th: "Object Storage (GB)", en: "Object Storage (GB)" }, input: { type: "number", min: 0, max: 100000, step: 50, unit: "GB" } },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "api");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const items = lzBaselineBom(spec);

    if (s.apiCallsPerMonth > 0) {
      items.push({
        catalogKey: "apigw_calls",
        label: { th: "API Gateway — API calls", en: "API Gateway — API calls" },
        category: "network",
        quantity: Math.round(toMillions(s.apiCallsPerMonth)),
        unit: "M calls",
        monthlyMetricQty: toMillions(s.apiCallsPerMonth),
        deployedByLz: false,
      });
    }
    if (s.functionInvocationsPerMonth > 0) {
      const gbSeconds = (s.functionInvocationsPerMonth * (s.avgFnMemMb / 1024) * (s.avgFnMs / 1000));
      items.push(
        {
          catalogKey: "functions_inv",
          label: { th: "Oracle Functions — invocations", en: "Oracle Functions — invocations" },
          category: "compute",
          quantity: Math.round(toMillions(s.functionInvocationsPerMonth)),
          unit: "M invocations",
          monthlyMetricQty: toMillions(s.functionInvocationsPerMonth),
          deployedByLz: false,
          notes: { th: "2M invocations แรก/เดือนฟรี", en: "first 2M invocations/month free" },
        },
        {
          catalogKey: "functions_gbsec",
          label: { th: "Oracle Functions — execution (GB-seconds)", en: "Oracle Functions — execution (GB-seconds)" },
          category: "compute",
          quantity: Math.round(gbSeconds / 10000),
          unit: "×10k GB-sec",
          monthlyMetricQty: gbSeconds / 10000,
          deployedByLz: false,
          notes: {
            th: `${(gbSeconds / 1e6).toFixed(1)}M GB-sec (${s.avgFnMemMb}MB × ${s.avgFnMs}ms) — 400k GB-sec แรกฟรี`,
            en: `${(gbSeconds / 1e6).toFixed(1)}M GB-sec (${s.avgFnMemMb}MB × ${s.avgFnMs}ms) — first 400k GB-sec free`,
          },
        },
      );
    }
    items.push(
      {
        catalogKey: "adb_ecpu",
        label: { th: "Autonomous DB — ECPU", en: "Autonomous DB — ECPU" },
        category: "database",
        quantity: s.adbEcpus,
        unit: "ECPU",
        monthlyMetricQty: hours(s.adbEcpus),
        deployedByLz: false,
        notes: { th: "auto-scale ได้ตามโหลด API", en: "auto-scales with API load" },
      },
      {
        catalogKey: "adb_storage_gb",
        label: { th: "Autonomous DB — storage", en: "Autonomous DB — storage" },
        category: "database",
        quantity: s.adbStorageGb,
        unit: "GB",
        monthlyMetricQty: s.adbStorageGb,
        deployedByLz: false,
      },
    );
    if (s.objectStorageGb > 0) {
      items.push({
        catalogKey: "os_standard_gb",
        label: { th: "Object Storage (assets/uploads)", en: "Object Storage (assets/uploads)" },
        category: "storage",
        quantity: s.objectStorageGb,
        unit: "GB",
        monthlyMetricQty: s.objectStorageGb,
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
        th: `${(s.apiCallsPerMonth / 1e6).toFixed(0)}M API calls + ${(s.functionInvocationsPerMonth / 1e6).toFixed(0)}M invocations/เดือน — จ่ายตามการใช้จริง มี free tier รองรับ, ไม่มี compute always-on (นอกจาก DB)`,
        en: `${(s.apiCallsPerMonth / 1e6).toFixed(0)}M API calls + ${(s.functionInvocationsPerMonth / 1e6).toFixed(0)}M invocations/month — pay-per-use with free tiers, no always-on compute (besides the DB).`,
      },
      {
        th: "Functions รันในซับเน็ต private ของ spoke; API Gateway เป็น ingress สู่ backend",
        en: "Functions run in the spoke's private subnet; API Gateway is the ingress to the backend.",
      },
    );
    return list;
  },
};
