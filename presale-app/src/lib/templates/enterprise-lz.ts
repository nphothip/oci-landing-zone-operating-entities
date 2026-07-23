import type {
  BomItem,
  EnterpriseEnvPlan,
  EnterpriseLzSizing,
  EnvironmentConfig,
  EnvName,
  LocalizedText,
  SolutionSpec,
  TemplateDefinition,
} from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { pinEnv } from "@/lib/bom/env";
import { HUB_VCN, OKE_SERVICES_CIDR, envBlocks, hubMgmtSubnet, orderEnvs } from "@/lib/domain/cidr";

// Advanced mode — enterprise landing zone for professional-service engagements.
// Full OCI Open LZ shape: hub-and-spoke with MULTIPLE projects per environment
// (each project = its own compartment + web/app/db NSGs inside the env spoke
// VCN), optional OKE platform VCN (/20, oke_simple) per environment, Security
// Zone targets on selected environments, and per-project workload sizing.
// The generated package is deploy-ready (see factory/deploy-bundle.ts).

const OKE_K8S_VERSION = "v1.35.2";
const OKE_WORKER_BOOT_GB = 100; // boot volume per OKE worker (matches oke-platform.ts)

function sizing(spec: SolutionSpec): EnterpriseLzSizing {
  if (spec.sizing.kind !== "enterprise_lz") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

/** Default plan for an environment the user has not configured yet. */
export function defaultEnvPlan(env: EnvName): EnterpriseEnvPlan {
  const prod = env === "prod";
  return {
    projects: [
      {
        name: "app1",
        vmCount: prod ? 2 : 1,
        ocpusPerVm: 2,
        memGbPerVm: 16,
        bootGbPerVm: 100,
        dbEngine: "adb",
        dbEcpus: prod ? 4 : 2,
        dbStorageGb: prod ? 200 : 50,
        objectStorageGb: 100,
      },
    ],
    oke: false,
    okeWorkerCount: 3,
    okeWorkerOcpus: 2,
    okeWorkerMemGb: 16,
  };
}

function planFor(s: EnterpriseLzSizing, env: EnvName): EnterpriseEnvPlan {
  return s.plans[env] ?? defaultEnvPlan(env);
}

/** Generator-safe project name: lowercase alphanumeric, starts with a letter,
 *  max 10 chars (dns_label budget). Falls back to appN. */
function safeName(raw: string, idx: number): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  return /^[a-z]/.test(cleaned) ? cleaned : `app${idx + 1}`;
}

/**
 * Unique generator-safe names for a plan's projects (order-preserving).
 * Duplicate names would silently collapse in the config's project MAP while
 * the BOM (an array) still priced both — so both buildFactoryConfig and
 * buildBom MUST use this same list to stay in agreement.
 */
function uniqueProjectNames(projects: { name: string }[]): string[] {
  const used = new Set<string>();
  return projects.map((p, i) => {
    const base = safeName(p.name, i);
    let name = base;
    let n = 2;
    while (used.has(name)) {
      const suffix = String(n++);
      name = base.slice(0, 10 - suffix.length) + suffix;
    }
    used.add(name);
    return name;
  });
}

/** True when any selected environment has an OKE platform. */
export function enterpriseHasOke(spec: SolutionSpec): boolean {
  if (spec.sizing.kind !== "enterprise_lz") return false;
  const s = spec.sizing;
  return orderEnvs(spec.environments).some((env) => planFor(s, env).oke);
}

const P = (name: string, th: string, en: string): LocalizedText => ({ th: `«${name}» ${th}`, en: `«${name}» ${en}` });

export const enterpriseLzTemplate: TemplateDefinition = {
  id: "enterprise_lz",
  name: { th: "Enterprise Landing Zone (Advanced)", en: "Enterprise Landing Zone (Advanced)" },
  description: {
    th: "โหมดขั้นสูงสำหรับองค์กรใหญ่ — hub-and-spoke หลาย environment, หลาย project ต่อ env (compartment + NSG แยกตาม best practice), OKE platform, Security Zones และแพ็กเกจ IaC พร้อม deploy",
    en: "Advanced mode for large enterprises — hub-and-spoke across environments, multiple projects per env (per-project compartments + NSGs), OKE platforms, Security Zones, and a deploy-ready IaC package",
  },
  icon: "🏛️",
  defaultHub: "hub_a",
  defaultCis: 2,
  // Sizing is edited by the dedicated EnterprisePlanEditor, not generic knobs.
  knobs: [],
  defaults(): SolutionSpec {
    return {
      template: "enterprise_lz",
      region: { id: "ap-bangkok-1", shortName: "bkk" },
      cisLevel: 2,
      hub: { kind: "hub_a", connectivity: "fastconnect_1g_ha", inspection: "standard" },
      environments: ["prod", "preprod", "dev"],
      sizing: {
        kind: "enterprise_lz",
        plans: {
          prod: {
            projects: [
              { name: "core", vmCount: 4, ocpusPerVm: 4, memGbPerVm: 32, bootGbPerVm: 200, dbEngine: "adb", dbEcpus: 8, dbStorageGb: 500, objectStorageGb: 500 },
              { name: "digital", vmCount: 2, ocpusPerVm: 2, memGbPerVm: 16, bootGbPerVm: 100, dbEngine: "adb", dbEcpus: 4, dbStorageGb: 200, objectStorageGb: 200 },
            ],
            oke: true,
            okeWorkerCount: 3,
            okeWorkerOcpus: 2,
            okeWorkerMemGb: 16,
          },
          preprod: {
            projects: [
              { name: "core", vmCount: 2, ocpusPerVm: 2, memGbPerVm: 16, bootGbPerVm: 100, dbEngine: "adb", dbEcpus: 4, dbStorageGb: 100, objectStorageGb: 100 },
            ],
            oke: false,
            okeWorkerCount: 3,
            okeWorkerOcpus: 2,
            okeWorkerMemGb: 16,
          },
          dev: {
            projects: [
              { name: "core", vmCount: 2, ocpusPerVm: 2, memGbPerVm: 16, bootGbPerVm: 100, dbEngine: "adb", dbEcpus: 2, dbStorageGb: 50, objectStorageGb: 50 },
            ],
            oke: false,
            okeWorkerCount: 3,
            okeWorkerOcpus: 2,
            okeWorkerMemGb: 16,
          },
        },
        securityTargetEnvs: ["prod", "preprod"],
        fssGb: 500,
        lbBandwidthMbps: 100,
      },
      assumptionNotes: [],
    };
  },

  buildFactoryConfig(spec) {
    const s = sizing(spec);
    const envs = orderEnvs(spec.environments);
    const environments: Record<string, EnvironmentConfig> = {};
    for (const env of envs) {
      const plan = planFor(s, env);
      const cfg: EnvironmentConfig = {
        // Every env gets a spoke VCN with auto web/app/db/infra subnets shared
        // by its projects (per-project isolation = compartments + NSGs).
        shared_project_network: { network: { vcn: envBlocks(env).spoke } },
        projects: Object.fromEntries(uniqueProjectNames(plan.projects).map((n) => [n, {}])),
      };
      if (plan.oke) {
        cfg.platforms = {
          oke: {
            network: { vcn: envBlocks(env).platform }, // must be exactly /20 (oke_simple "small")
            extension: {
              type: "oke_simple",
              params: {
                kubernetes_version: OKE_K8S_VERSION,
                services_cidr: OKE_SERVICES_CIDR,
                api_endpoint_allowed_cidrs: [hubMgmtSubnet(spec.hub.kind)],
              },
            },
          },
        };
      }
      environments[env] = cfg;
    }
    // security_targets must only reference defined environments.
    const targets = orderEnvs(s.securityTargetEnvs.filter((e) => spec.environments.includes(e)));
    return {
      realm: "oc1",
      region: spec.region.id,
      region_short_name: spec.region.shortName,
      cis_level: spec.cisLevel,
      hub: { kind: spec.hub.kind, network: { vcn: HUB_VCN } },
      environments,
      ...(targets.length > 0 && targets.length < envs.length ? { security_targets: targets } : {}),
    };
  },

  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const hasOke = enterpriseHasOke(spec);
    const items: BomItem[] = [...lzBaselineBom(spec)];

    // --- shared services -------------------------------------------------
    items.push({
      catalogKey: "lb_bandwidth",
      label: { th: `LB bandwidth ${s.lbBandwidthMbps} Mbps`, en: `LB bandwidth ${s.lbBandwidthMbps} Mbps` },
      category: "network",
      quantity: s.lbBandwidthMbps,
      unit: "Mbps",
      monthlyMetricQty: hours(s.lbBandwidthMbps),
      // With any OKE platform the LZ ships no hub sample LB — priced post-LZ.
      deployedByLz: !hasOke,
    });
    if (s.fssGb > 0) {
      items.push({
        catalogKey: "fss_gb",
        label: { th: "Shared File Storage (FSS)", en: "Shared File Storage (FSS)" },
        category: "storage",
        quantity: s.fssGb,
        unit: "GB",
        monthlyMetricQty: s.fssGb,
        deployedByLz: false,
      });
    }

    // --- per environment: projects + optional OKE platform ---------------
    for (const env of orderEnvs(spec.environments)) {
      const plan = planFor(s, env);
      const envItems: BomItem[] = [];

      const projectNames = uniqueProjectNames(plan.projects);
      for (const [i, p] of plan.projects.entries()) {
        const name = projectNames[i];
        if (p.vmCount > 0) {
          envItems.push(
            {
              catalogKey: "compute_e5_ocpu",
              label: P(name, `App VM ×${p.vmCount} (E5.Flex ${p.ocpusPerVm} OCPU) — OCPU`, `App VMs ×${p.vmCount} (E5.Flex ${p.ocpusPerVm} OCPU) — OCPU`),
              category: "compute",
              quantity: p.vmCount * p.ocpusPerVm,
              unit: "OCPU",
              monthlyMetricQty: hours(p.vmCount * p.ocpusPerVm),
              deployedByLz: false,
            },
            {
              catalogKey: "compute_e5_mem",
              label: P(name, "App VM — memory", "App VMs — memory"),
              category: "compute",
              quantity: p.vmCount * p.memGbPerVm,
              unit: "GB",
              monthlyMetricQty: hours(p.vmCount * p.memGbPerVm),
              deployedByLz: false,
            },
            {
              catalogKey: "block_storage_gb",
              label: P(name, "Boot volumes", "Boot volumes"),
              category: "storage",
              quantity: p.vmCount * p.bootGbPerVm,
              unit: "GB",
              monthlyMetricQty: p.vmCount * p.bootGbPerVm,
              deployedByLz: false,
            },
            {
              catalogKey: "block_vpu",
              label: P(name, "Boot volume performance (Balanced)", "Boot volume performance (Balanced)"),
              category: "storage",
              quantity: p.vmCount * p.bootGbPerVm,
              unit: "GB",
              monthlyMetricQty: p.vmCount * p.bootGbPerVm * 10,
              deployedByLz: false,
            },
          );
        }
        if (p.dbEngine === "adb") {
          envItems.push(
            {
              catalogKey: "adb_ecpu",
              label: P(name, "Autonomous DB — ECPU", "Autonomous DB — ECPU"),
              category: "database",
              quantity: p.dbEcpus,
              unit: "ECPU",
              monthlyMetricQty: hours(p.dbEcpus),
              deployedByLz: false,
            },
            {
              catalogKey: "adb_storage_gb",
              label: P(name, "Autonomous DB — storage", "Autonomous DB — storage"),
              category: "database",
              quantity: p.dbStorageGb,
              unit: "GB",
              monthlyMetricQty: p.dbStorageGb,
              deployedByLz: false,
            },
          );
        } else if (p.dbEngine === "base_db") {
          envItems.push(
            {
              catalogKey: "base_db_ecpu",
              label: P(name, "Base Database Enterprise — ECPU", "Base Database Enterprise — ECPU"),
              category: "database",
              quantity: p.dbEcpus,
              unit: "ECPU",
              monthlyMetricQty: hours(p.dbEcpus),
              deployedByLz: false,
            },
            {
              catalogKey: "base_db_storage_gb",
              label: P(name, "Base Database — storage", "Base Database — storage"),
              category: "database",
              quantity: p.dbStorageGb,
              unit: "GB",
              monthlyMetricQty: p.dbStorageGb,
              deployedByLz: false,
            },
          );
        }
        if (p.objectStorageGb > 0) {
          envItems.push({
            catalogKey: "os_standard_gb",
            label: P(name, "Object Storage", "Object Storage"),
            category: "storage",
            quantity: p.objectStorageGb,
            unit: "GB",
            monthlyMetricQty: p.objectStorageGb,
            deployedByLz: false,
          });
        }
      }

      if (plan.oke) {
        envItems.push(
          {
            catalogKey: "oke_cluster",
            label: { th: "OKE Enhanced Cluster", en: "OKE Enhanced Cluster" },
            category: "compute",
            quantity: 1,
            unit: "cluster",
            monthlyMetricQty: hours(1),
            deployedByLz: true,
            notes: { th: "สร้างโดย LaC (oke_simple extension)", en: "Created by the LaC (oke_simple extension)" },
          },
          {
            catalogKey: "compute_e5_ocpu",
            label: { th: `OKE workers ×${plan.okeWorkerCount} (E5.Flex ${plan.okeWorkerOcpus} OCPU) — OCPU`, en: `OKE workers ×${plan.okeWorkerCount} (E5.Flex ${plan.okeWorkerOcpus} OCPU) — OCPU` },
            category: "compute",
            quantity: plan.okeWorkerCount * plan.okeWorkerOcpus,
            unit: "OCPU",
            monthlyMetricQty: hours(plan.okeWorkerCount * plan.okeWorkerOcpus),
            deployedByLz: true,
            notes: {
              th: "LaC สร้าง node pool เริ่มต้น 1 node (1 OCPU/8GB) — ขยายเป็นตาม BOM หลัง deploy",
              en: "LaC ships a 1-node starter pool (1 OCPU/8GB) — scale to this BOM after deployment",
            },
          },
          {
            catalogKey: "compute_e5_mem",
            label: { th: "OKE workers — memory", en: "OKE workers — memory" },
            category: "compute",
            quantity: plan.okeWorkerCount * plan.okeWorkerMemGb,
            unit: "GB",
            monthlyMetricQty: hours(plan.okeWorkerCount * plan.okeWorkerMemGb),
            deployedByLz: true,
          },
          {
            catalogKey: "block_storage_gb",
            label: { th: "OKE worker boot volumes", en: "OKE worker boot volumes" },
            category: "storage",
            quantity: plan.okeWorkerCount * OKE_WORKER_BOOT_GB,
            unit: "GB",
            monthlyMetricQty: plan.okeWorkerCount * OKE_WORKER_BOOT_GB,
            deployedByLz: true,
          },
          {
            catalogKey: "block_vpu",
            label: { th: "OKE worker boot performance (Balanced)", en: "OKE worker boot performance (Balanced)" },
            category: "storage",
            quantity: plan.okeWorkerCount * OKE_WORKER_BOOT_GB,
            unit: "GB",
            monthlyMetricQty: plan.okeWorkerCount * OKE_WORKER_BOOT_GB * 10,
            deployedByLz: true,
          },
        );
      }

      items.push(...pinEnv(envItems, env));
    }
    return items;
  },

  assumptions(spec): LocalizedText[] {
    const s = sizing(spec);
    const envs = orderEnvs(spec.environments);
    const targets = orderEnvs(s.securityTargetEnvs.filter((e) => spec.environments.includes(e)));
    const targetText = targets.length === 0 || targets.length === envs.length ? { th: "ทุก environment", en: "all environments" } : { th: targets.join(", "), en: targets.join(", ") };
    const list = lzBaselineAssumptions(spec);
    list.push(
      {
        th: "แต่ละ project แยกด้วย compartment (cmp-lz-<env>-<project>) และ NSG web/app/db ของตัวเอง — ทุก project ใน env เดียวกันใช้ spoke VCN/subnet ร่วมกันตามแบบแผน OCI Open LZ",
        en: "Each project is isolated by its own compartment (cmp-lz-<env>-<project>) and web/app/db NSGs — projects in the same environment share the env spoke VCN/subnets per the OCI Open LZ pattern",
      },
      {
        th: `Security Zone targets: ${targetText.th} — ที่เหลือยังได้ CIS posture ระดับ tenancy (Cloud Guard, VSS, budgets)`,
        en: `Security Zone targets: ${targetText.en} — remaining environments still get tenancy-wide CIS posture (Cloud Guard, VSS, budgets)`,
      },
      {
        th: "แพ็กเกจ LaC พร้อม deploy ทันทีผ่าน OCI Landing Zones Orchestrator (v2.1.3) — ดู DEPLOY.md + deploy.sh/deploy.ps1 ในไฟล์ ZIP (รองรับ staged 2 ขั้นสำหรับ hub ที่มี firewall)",
        en: "The LaC package is immediately deployable via the OCI Landing Zones Orchestrator (v2.1.3) — see DEPLOY.md + deploy.sh/deploy.ps1 in the ZIP (two-stage flow for firewalled hubs)",
      },
    );
    if (enterpriseHasOke(spec)) {
      list.push({
        th: `OKE platform (oke_simple, ${OKE_K8S_VERSION}) ถูกสร้างโดย LZ ใน env ที่เลือก — VCN /20 แยกต่อ env, private endpoint จำกัดที่ hub mgmt subnet; node pool เริ่ม 1 node แล้วขยายตาม BOM (เมื่อมี OKE, LZ จะไม่สร้าง hub sample LB)`,
        en: `OKE platforms (oke_simple, ${OKE_K8S_VERSION}) are created by the LZ in the selected environments — a /20 VCN per env with the private endpoint restricted to the hub mgmt subnet; node pools start at 1 node and scale to this BOM (with OKE present the LZ ships no hub sample LB)`,
      });
    }
    return list;
  },
};
