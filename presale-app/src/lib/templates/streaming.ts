import type { BomItem, SolutionSpec, StreamingSizing, TemplateDefinition } from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// Event / streaming platform: OCI Streaming (Kafka-compatible) ingest +
// consumer compute + Autonomous Data Warehouse as the analytical sink. Common
// for IoT / clickstream / log ingestion.

function sizing(spec: SolutionSpec): StreamingSizing {
  if (spec.sizing.kind !== "streaming") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const streamingTemplate: TemplateDefinition = {
  id: "streaming",
  name: { th: "Streaming / Event Platform", en: "Streaming / Event Platform" },
  description: {
    th: "รับข้อมูลเรียลไทม์ (IoT/clickstream/logs): OCI Streaming (Kafka) → consumer → Autonomous Data Warehouse",
    en: "Real-time ingestion (IoT/clickstream/logs): OCI Streaming (Kafka) → consumers → Autonomous Data Warehouse",
  },
  icon: "🌊",
  defaultHub: "hub_b",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "streaming",
      region: { id: "ap-bangkok-1", shortName: "bkk" },
      cisLevel: 1,
      hub: { kind: "hub_b", connectivity: "vpn" },
      environments: ["prod"],
      sizing: {
        kind: "streaming",
        throughputGbPerMonth: 5000,
        retentionGb: 500,
        consumerVmCount: 2,
        consumerOcpus: 2,
        adwEcpus: 4,
        adwStorageGb: 2000,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.throughputGbPerMonth", label: { th: "ปริมาณข้อมูลต่อเดือน (GB)", en: "Data throughput per month (GB)" }, input: { type: "number", min: 0, max: 10000000, step: 100, unit: "GB" } },
    { path: "sizing.retentionGb", label: { th: "Retention storage (GB)", en: "Retention storage (GB)" }, input: { type: "number", min: 0, max: 500000, step: 50, unit: "GB" } },
    { path: "sizing.consumerVmCount", label: { th: "Consumer/processing VM", en: "Consumer/processing VMs" }, input: { type: "number", min: 0, max: 30, unit: "VM" } },
    { path: "sizing.consumerOcpus", label: { th: "OCPU ต่อ consumer", en: "OCPUs per consumer" }, input: { type: "number", min: 1, max: 32, unit: "OCPU" }, visibleIf: (s) => sizing(s).consumerVmCount > 0 },
    { path: "sizing.adwEcpus", label: { th: "ADW ECPU (sink)", en: "ADW ECPUs (sink)" }, input: { type: "number", min: 2, max: 128, step: 2, unit: "ECPU" } },
    { path: "sizing.adwStorageGb", label: { th: "ADW storage (GB)", en: "ADW storage (GB)" }, input: { type: "number", min: 100, max: 100000, step: 100, unit: "GB" } },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "streaming");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const items = lzBaselineBom(spec);

    if (s.throughputGbPerMonth > 0) {
      items.push({
        catalogKey: "streaming_gb",
        label: { th: "OCI Streaming — data (PUT/GET)", en: "OCI Streaming — data (PUT/GET)" },
        category: "network",
        quantity: s.throughputGbPerMonth,
        unit: "GB",
        monthlyMetricQty: s.throughputGbPerMonth,
        deployedByLz: false,
        notes: { th: "คิดตาม GB ที่ producer PUT + consumer GET", en: "billed per GB producers PUT + consumers GET" },
      });
    }
    if (s.retentionGb > 0) {
      items.push({
        catalogKey: "streaming_storage_gb",
        label: { th: "OCI Streaming — retention storage", en: "OCI Streaming — retention storage" },
        category: "storage",
        quantity: s.retentionGb,
        unit: "GB",
        monthlyMetricQty: hours(s.retentionGb),
        deployedByLz: false,
      });
    }
    if (s.consumerVmCount > 0) {
      items.push(
        {
          catalogKey: "compute_e5_ocpu",
          label: { th: `Consumer/processing VM ×${s.consumerVmCount} — OCPU`, en: `Consumer/processing VMs ×${s.consumerVmCount} — OCPU` },
          category: "compute",
          quantity: s.consumerVmCount * s.consumerOcpus,
          unit: "OCPU",
          monthlyMetricQty: hours(s.consumerVmCount * s.consumerOcpus),
          deployedByLz: false,
          notes: { th: "Kafka Connect / stream processing / ETL", en: "Kafka Connect / stream processing / ETL" },
        },
        {
          catalogKey: "compute_e5_mem",
          label: { th: "Consumer/processing VM — memory", en: "Consumer/processing VMs — memory" },
          category: "compute",
          quantity: s.consumerVmCount * s.consumerOcpus * 8,
          unit: "GB",
          monthlyMetricQty: hours(s.consumerVmCount * s.consumerOcpus * 8),
          deployedByLz: false,
        },
      );
    }
    items.push(
      {
        catalogKey: "adw_ecpu",
        label: { th: "Autonomous Data Warehouse — ECPU (sink)", en: "Autonomous Data Warehouse — ECPU (sink)" },
        category: "database",
        quantity: s.adwEcpus,
        unit: "ECPU",
        monthlyMetricQty: hours(s.adwEcpus),
        deployedByLz: false,
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
    return items;
  },
  assumptions(spec) {
    const s = sizing(spec);
    const list = lzBaselineAssumptions(spec);
    list.push(
      {
        th: `~${s.throughputGbPerMonth.toLocaleString()} GB/เดือนผ่าน OCI Streaming (Kafka-compatible) — producer ป้อนจากอุปกรณ์/แอป, consumer ประมวลผลแล้วเก็บลง ADW`,
        en: `~${s.throughputGbPerMonth.toLocaleString()} GB/month through OCI Streaming (Kafka-compatible) — producers feed from devices/apps, consumers process and land into ADW.`,
      },
      {
        th: "OCI Streaming เป็นบริการ serverless (ไม่มี broker ให้ดูแล); เชื่อม producer ผ่าน private endpoint",
        en: "OCI Streaming is serverless (no brokers to manage); producers connect via a private endpoint.",
      },
    );
    return list;
  },
};
