import { z } from "zod";
import type { SolutionSpec } from "./types";

// Zod schema for SolutionSpec — validates /api/generate request bodies and the
// normalized output of the LLM parser. Ranges are deliberately generous; the
// jsonnet generator remains the authority for LZ-level validation.

const localized = z.object({ th: z.string(), en: z.string() });
void localized; // (kept for future use in richer payload validation)

const regionSchema = z.object({
  id: z.string().min(3),
  shortName: z.string().min(2).max(8),
});

const burstSchema = z
  .object({
    vmBurstable: z.boolean().optional(),
    dbAutoscaling: z.boolean().optional(),
    dbPeakFactor: z.number().min(1).max(3).optional(),
    dbPctMonthAbove: z.number().int().min(0).max(100).optional(),
  })
  .optional();

const trafficSchema = z
  .object({
    lbBandwidthMbps: z.number().int().min(0).max(100000).optional(),
    nfwDataGbPerMonth: z.number().int().min(0).max(10000000).optional(),
    egressGbPerMonth: z.number().int().min(0).max(10000000).optional(),
    wafRequestsM: z.number().int().min(0).max(100000).optional(),
    objectRequestsMPerMonth: z.number().int().min(0).max(1000000).optional(),
    streamingGbPerMonth: z.number().int().min(0).max(100000000).optional(),
  })
  .optional();

const webAppSizing = z.object({
  kind: z.literal("web_app"),
  appVmCount: z.number().int().min(1).max(50),
  ocpusPerVm: z.number().int().min(1).max(64),
  memGbPerVm: z.number().int().min(1).max(1024),
  bootGbPerVm: z.number().int().min(50).max(2000),
  ha: z.boolean(),
  db: z.object({
    engine: z.enum(["adb_serverless", "base_db_vm", "none"]),
    ecpus: z.number().int().min(2).max(512),
    storageGb: z.number().int().min(20).max(100000),
  }),
  lbBandwidthMbps: z.number().int().min(10).max(8000),
  waf: z.boolean(),
});

const chatbotSizing = z.object({
  kind: z.literal("chatbot"),
  runtime: z.enum(["vm", "oke"]),
  chatsPerMonth: z.number().int().min(100).max(100000000),
  avgTokensPerChat: z.number().int().min(100).max(100000),
  modelClass: z.enum(["small", "large"]),
  rag: z.boolean(),
  vectorDbEcpus: z.number().int().min(2).max(512),
  docStorageGb: z.number().int().min(1).max(100000),
  appVmCount: z.number().int().min(1).max(50),
  ocpusPerVm: z.number().int().min(1).max(64),
  memGbPerVm: z.number().int().min(1).max(1024),
  okeWorkerCount: z.number().int().min(1).max(100),
  okeWorkerOcpus: z.number().int().min(1).max(64),
  okeWorkerMemGb: z.number().int().min(1).max(1024),
});

const drSizing = z.object({
  kind: z.literal("dr"),
  mode: z.enum(["pilot_light", "warm_standby"]),
  protectedVmCount: z.number().int().min(1).max(500),
  avgOcpusPerVm: z.number().int().min(1).max(64),
  avgMemGbPerVm: z.number().int().min(1).max(1024),
  avgBootGbPerVm: z.number().int().min(50).max(2000),
  blockReplicaGb: z.number().int().min(0).max(1000000),
  objectBackupGb: z.number().int().min(0).max(10000000),
  dbDr: z.enum(["none", "adb_cross_region", "base_db_data_guard"]),
  dbEcpus: z.number().int().min(2).max(512),
  dbStorageGb: z.number().int().min(20).max(100000),
});

const backupSizing = z.object({
  kind: z.literal("backup"),
  standardGb: z.number().int().min(0).max(10000000),
  infrequentGb: z.number().int().min(0).max(10000000),
  archiveGb: z.number().int().min(0).max(10000000),
  monthlyRestoreGb: z.number().int().min(0).max(10000000),
  dbBackup: z.boolean(),
  dbBackupGb: z.number().int().min(0).max(10000000),
});

const erpSizing = z.object({
  kind: z.literal("erp"),
  users: z.number().int().min(5).max(5000),
  appVmCount: z.number().int().min(1).max(20),
  ocpusPerVm: z.number().int().min(1).max(32),
  memGbPerVm: z.number().int().min(4).max(512),
  bootGbPerVm: z.number().int().min(50).max(2000),
  os: z.enum(["linux", "windows"]),
  db: z.object({
    engine: z.enum(["base_db_vm", "adb_serverless"]),
    ecpus: z.number().int().min(2).max(128),
    storageGb: z.number().int().min(50).max(50000),
  }),
  fssGb: z.number().int().min(0).max(100000),
  backupGb: z.number().int().min(0).max(1000000),
});

const migrationSizing = z.object({
  kind: z.literal("migration"),
  vmCount: z.number().int().min(1).max(300),
  avgOcpusPerVm: z.number().int().min(1).max(32),
  avgMemGbPerVm: z.number().int().min(2).max(512),
  windowsVmCount: z.number().int().min(0).max(300),
  totalStorageGb: z.number().int().min(0).max(2000000),
  monthlyEgressGb: z.number().int().min(0).max(1000000),
});

const analyticsSizing = z.object({
  kind: z.literal("analytics"),
  adwEcpus: z.number().int().min(2).max(512),
  adwStorageGb: z.number().int().min(20).max(500000),
  oacUsers: z.number().int().min(0).max(2000),
  oacTier: z.enum(["professional", "enterprise"]),
  dataLakeGb: z.number().int().min(0).max(5000000),
  etlHoursPerMonth: z.number().int().min(0).max(744),
});

const devtestSizing = z.object({
  kind: z.literal("devtest"),
  vmPerEnv: z.number().int().min(1).max(50),
  ocpusPerVm: z.number().int().min(1).max(16),
  memGbPerVm: z.number().int().min(2).max(256),
  bootGbPerVm: z.number().int().min(50).max(1000),
  dbEcpusPerEnv: z.number().int().min(0).max(64),
  dbStorageGbPerEnv: z.number().int().min(0).max(10000),
  runningHoursPerMonth: z.number().int().min(40).max(744),
});

const okePlatformSizing = z.object({
  kind: z.literal("oke_platform"),
  workerCount: z.number().int().min(1).max(100),
  workerOcpus: z.number().int().min(1).max(64),
  workerMemGb: z.number().int().min(4).max(1024),
  registryGb: z.number().int().min(0).max(100000),
});

const ecommerceSizing = z.object({
  kind: z.literal("ecommerce"),
  appVmCount: z.number().int().min(1).max(50),
  ocpusPerVm: z.number().int().min(1).max(64),
  memGbPerVm: z.number().int().min(4).max(512),
  dbEcpus: z.number().int().min(2).max(256),
  dbStorageGb: z.number().int().min(20).max(100000),
  cacheGb: z.number().int().min(0).max(10000),
  productMediaGb: z.number().int().min(0).max(1000000),
  ordersPerMonth: z.number().int().min(0).max(100000000),
  waf: z.boolean(),
});

const fileserverSizing = z.object({
  kind: z.literal("fileserver"),
  users: z.number().int().min(5).max(50000),
  fssGb: z.number().int().min(10).max(1000000),
  archiveGb: z.number().int().min(0).max(10000000),
  gatewayVmCount: z.number().int().min(0).max(20),
  gatewayOcpus: z.number().int().min(1).max(32),
});

const vdiSizing = z.object({
  kind: z.literal("vdi"),
  desktopCount: z.number().int().min(1).max(5000),
  profileStorageGb: z.number().int().min(0).max(1000000),
  appVmCount: z.number().int().min(0).max(50),
  appOcpus: z.number().int().min(1).max(32),
});

const serverlessSizing = z.object({
  kind: z.literal("serverless"),
  apiCallsPerMonth: z.number().int().min(0).max(10000000000),
  functionInvocationsPerMonth: z.number().int().min(0).max(10000000000),
  avgFnMemMb: z.number().int().min(128).max(32768),
  avgFnMs: z.number().int().min(10).max(300000),
  adbEcpus: z.number().int().min(2).max(512),
  adbStorageGb: z.number().int().min(20).max(100000),
  objectStorageGb: z.number().int().min(0).max(1000000),
});

const envNameEnum = z.enum(["prod", "preprod", "staging", "uat", "dev", "test"]);

const enterpriseProject = z.object({
  // lowercase alphanumeric, starts with a letter, <= 10 chars (generator
  // dns_label budget; see gen/ naming asserts)
  name: z.string().regex(/^[a-z][a-z0-9]{0,9}$/),
  vmCount: z.number().int().min(0).max(100),
  ocpusPerVm: z.number().int().min(1).max(64),
  memGbPerVm: z.number().int().min(1).max(1024),
  bootGbPerVm: z.number().int().min(50).max(2000),
  dbEngine: z.enum(["adb", "base_db", "none"]),
  dbEcpus: z.number().int().min(2).max(512),
  dbStorageGb: z.number().int().min(20).max(100000),
  objectStorageGb: z.number().int().min(0).max(10000000),
});

const enterpriseEnvPlan = z.object({
  projects: z.array(enterpriseProject).min(1).max(8),
  oke: z.boolean(),
  okeWorkerCount: z.number().int().min(1).max(100),
  okeWorkerOcpus: z.number().int().min(1).max(64),
  okeWorkerMemGb: z.number().int().min(4).max(1024),
});

const enterpriseLzSizing = z.object({
  kind: z.literal("enterprise_lz"),
  plans: z
    .object({
      prod: enterpriseEnvPlan.optional(),
      preprod: enterpriseEnvPlan.optional(),
      staging: enterpriseEnvPlan.optional(),
      uat: enterpriseEnvPlan.optional(),
      dev: enterpriseEnvPlan.optional(),
      test: enterpriseEnvPlan.optional(),
    }),
  securityTargetEnvs: z.array(envNameEnum).max(6),
  fssGb: z.number().int().min(0).max(1000000),
  lbBandwidthMbps: z.number().int().min(10).max(8000),
});

const streamingSizing = z.object({
  kind: z.literal("streaming"),
  throughputGbPerMonth: z.number().int().min(0).max(100000000),
  retentionGb: z.number().int().min(0).max(1000000),
  consumerVmCount: z.number().int().min(0).max(50),
  consumerOcpus: z.number().int().min(1).max(64),
  adwEcpus: z.number().int().min(2).max(512),
  adwStorageGb: z.number().int().min(20).max(500000),
});

export const solutionSpecSchema = z.object({
  template: z.enum(["web_app", "chatbot", "dr", "backup", "erp", "migration", "analytics", "devtest", "oke_platform", "ecommerce", "fileserver", "vdi", "serverless", "streaming", "enterprise_lz"]),
  customerName: z.string().max(120).optional(),
  region: regionSchema,
  burst: burstSchema,
  traffic: trafficSchema,
  cisLevel: z.union([z.literal(1), z.literal(2)]),
  hub: z.object({
    kind: z.enum(["hub_a", "hub_b", "hub_c", "hub_e"]),
    connectivity: z.enum([
      "none", "vpn", "vpn_ha", "fastconnect_1g", "fastconnect_1g_ha", "fastconnect_10g", "fastconnect_10g_ha", "fastconnect_vpn_backup",
    ]),
    inspection: z.enum(["standard", "ids_ips", "tls"]).optional(),
  }),
  environments: z
    .array(z.enum(["prod", "preprod", "staging", "uat", "dev", "test"]))
    .min(1)
    .max(4),
  rightsizeNonProd: z.boolean().optional(),
  envScalePct: z
    .object({
      prod: z.number().int().min(1).max(100).optional(),
      preprod: z.number().int().min(1).max(100).optional(),
      staging: z.number().int().min(1).max(100).optional(),
      uat: z.number().int().min(1).max(100).optional(),
      dev: z.number().int().min(1).max(100).optional(),
      test: z.number().int().min(1).max(100).optional(),
    })
    .optional(),
  envOverride: z.record(z.string(), z.record(z.string(), z.number().min(0).max(100000000))).optional(),
  sizing: z.discriminatedUnion("kind", [
    webAppSizing, chatbotSizing, drSizing, backupSizing,
    erpSizing, migrationSizing, analyticsSizing, devtestSizing, okePlatformSizing,
    ecommerceSizing, fileserverSizing, vdiSizing, serverlessSizing, streamingSizing,
    enterpriseLzSizing,
  ]),
  addOns: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        qty: z.number().min(0).max(1_000_000),
        env: z.enum(["prod", "preprod", "staging", "uat", "dev", "test"]).optional(),
      }),
    )
    .max(20)
    .optional(),
  assumptionNotes: z.array(z.string().max(500)).max(30),
}).superRefine((spec, ctx) => {
  if (spec.sizing.kind !== spec.template) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sizing", "kind"],
      message: `sizing.kind (${spec.sizing.kind}) must match template (${spec.template})`,
    });
  }
});

export function parseSolutionSpec(input: unknown):
  | { ok: true; spec: SolutionSpec }
  | { ok: false; message: string } {
  const result = solutionSpecSchema.safeParse(input);
  if (result.success) return { ok: true, spec: result.data as SolutionSpec };
  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, message: issues };
}
