import type { BomItem, EnvironmentConfig, OkePlatformSizing, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";
import { OKE_SERVICES_CIDR, envBlocks, hubMgmtSubnet, orderEnvs } from "@/lib/domain/cidr";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";

// Container platform (OKE) — for SMEs/mid-size teams standardizing on
// Kubernetes. The one template where the LZ deploys the workload platform
// itself (oke_simple extension → cluster + starter node pool in the LaC).

const OKE_K8S_VERSION = "v1.35.2";
const BOOT_GB = 100;

function sizing(spec: SolutionSpec): OkePlatformSizing {
  if (spec.sizing.kind !== "oke_platform") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const okePlatformTemplate: TemplateDefinition = {
  id: "oke_platform",
  name: { th: "Container Platform (OKE)", en: "Container Platform (OKE)" },
  description: {
    th: "แพลตฟอร์ม Kubernetes สำหรับทีมพัฒนา — LZ สร้าง OKE cluster ให้จริงผ่าน oke_simple extension",
    en: "A Kubernetes platform for dev teams — the LZ actually deploys the OKE cluster via the oke_simple extension",
  },
  icon: "☸️",
  defaultHub: "hub_b",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "oke_platform",
      region: { id: "ap-singapore-1", shortName: "sin" },
      cisLevel: 1,
      hub: { kind: "hub_b", connectivity: "none" },
      environments: ["prod"],
      sizing: {
        kind: "oke_platform",
        workerCount: 3,
        workerOcpus: 2,
        workerMemGb: 16,
        registryGb: 100,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.workerCount", label: { th: "Worker nodes ต่อ environment", en: "Worker nodes per environment" }, input: { type: "number", min: 1, max: 50, unit: "nodes" } },
    { path: "sizing.workerOcpus", label: { th: "OCPU ต่อ worker", en: "OCPUs per worker" }, input: { type: "number", min: 1, max: 32, unit: "OCPU" } },
    { path: "sizing.workerMemGb", label: { th: "Memory ต่อ worker (GB)", en: "Memory per worker (GB)" }, input: { type: "number", min: 8, max: 256, step: 8, unit: "GB" } },
    { path: "sizing.registryGb", label: { th: "Container Registry / artifacts (GB)", en: "Container Registry / artifacts (GB)" }, input: { type: "number", min: 0, max: 10000, step: 50, unit: "GB" } },
  ],
  buildFactoryConfig(spec) {
    // OKE-only environments: a platform VCN per env, no project spoke needed
    // (pattern from the oci-lz-ai-agent addon's one-shot OKE example).
    const environments: Record<string, EnvironmentConfig> = {};
    for (const env of orderEnvs(spec.environments)) {
      environments[env] = {
        platforms: {
          oke: {
            network: { vcn: envBlocks(env).platform },
            extension: {
              type: "oke_simple",
              params: {
                kubernetes_version: OKE_K8S_VERSION,
                services_cidr: OKE_SERVICES_CIDR,
                api_endpoint_allowed_cidrs: [hubMgmtSubnet(spec.hub.kind)],
              },
            },
          },
        },
      };
    }
    return {
      realm: "oc1",
      region: spec.region.id,
      region_short_name: spec.region.shortName,
      cis_level: spec.cisLevel,
      hub: { kind: spec.hub.kind, network: { vcn: "10.0.0.0/21" } },
      environments,
    };
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const envs = spec.environments.length;
    const items = lzBaselineBom(spec);

    items.push(
      {
        catalogKey: "oke_cluster",
        label: { th: `OKE Enhanced Cluster ×${envs}`, en: `OKE Enhanced Cluster ×${envs}` },
        category: "compute",
        quantity: envs,
        unit: "cluster",
        monthlyMetricQty: hours(envs),
        deployedByLz: true,
        notes: { th: "สร้างโดย LaC (oke_simple extension) พร้อม NSG/subnet ตามมาตรฐาน", en: "Created by the LaC (oke_simple extension) with standard NSGs/subnets" },
      },
      {
        catalogKey: "compute_e5_ocpu",
        label: { th: `Workers ×${s.workerCount}/env (E5.Flex) — OCPU`, en: `Workers ×${s.workerCount}/env (E5.Flex) — OCPU` },
        category: "compute",
        quantity: s.workerCount * s.workerOcpus * envs,
        unit: "OCPU",
        monthlyMetricQty: hours(s.workerCount * s.workerOcpus * envs),
        deployedByLz: true,
        notes: {
          th: "LaC สร้าง node pool เริ่มต้น 1 node (1 OCPU/8GB) — ขยายเป็นตาม BOM หลัง deploy",
          en: "LaC ships a 1-node starter pool (1 OCPU/8GB) — scale to this BOM after deployment",
        },
      },
      {
        catalogKey: "compute_e5_mem",
        label: { th: "Workers — memory", en: "Workers — memory" },
        category: "compute",
        quantity: s.workerCount * s.workerMemGb * envs,
        unit: "GB",
        monthlyMetricQty: hours(s.workerCount * s.workerMemGb * envs),
        deployedByLz: true,
      },
      {
        catalogKey: "block_storage_gb",
        label: { th: `Worker boot volumes (${BOOT_GB}GB/node)`, en: `Worker boot volumes (${BOOT_GB}GB/node)` },
        category: "storage",
        quantity: s.workerCount * BOOT_GB * envs,
        unit: "GB",
        monthlyMetricQty: s.workerCount * BOOT_GB * envs,
        deployedByLz: true,
      },
      {
        catalogKey: "block_vpu",
        label: { th: "Worker boot performance (Balanced)", en: "Worker boot performance (Balanced)" },
        category: "storage",
        quantity: s.workerCount * BOOT_GB * envs,
        unit: "GB",
        monthlyMetricQty: s.workerCount * BOOT_GB * envs * 10,
        deployedByLz: true,
      },
    );
    if (s.registryGb > 0) {
      items.push({
        catalogKey: "os_standard_gb",
        label: { th: "Container Registry + artifacts (Object Storage)", en: "Container Registry + artifacts (Object Storage)" },
        category: "storage",
        quantity: s.registryGb,
        unit: "GB",
        monthlyMetricQty: s.registryGb,
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
        th: `OKE cluster (private API endpoint จำกัดที่ hub mgmt subnet, native CNI, ${OKE_K8S_VERSION}) ถูก deploy โดย LaC จริง — node pool เริ่ม 1 node แล้ว scale เป็น ${s.workerCount} nodes/env ตาม BOM`,
        en: `The OKE cluster (private API endpoint restricted to the hub mgmt subnet, native CNI, ${OKE_K8S_VERSION}) is deployed by the LaC — the node pool starts at 1 node and scales to ${s.workerCount} nodes/env per this BOM`,
      },
      {
        th: "ดีไซน์ OKE ไม่มี sample hub LB ใน LaC — expose แอปผ่าน LB ที่ Kubernetes service สร้างในซับเน็ต int-lb ของ OKE แล้วต่อ ingress ตามต้องการ",
        en: "OKE designs ship no sample hub LB in the LaC — expose apps via LBs created by Kubernetes services in the OKE int-lb subnet, then wire ingress as needed",
      },
    );
    return list;
  },
};
