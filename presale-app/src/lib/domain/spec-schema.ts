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

export const solutionSpecSchema = z.object({
  template: z.enum(["web_app", "chatbot", "dr", "backup"]),
  customerName: z.string().max(120).optional(),
  region: regionSchema,
  cisLevel: z.union([z.literal(1), z.literal(2)]),
  hub: z.object({
    kind: z.enum(["hub_a", "hub_b", "hub_c", "hub_e"]),
    connectivity: z.enum(["none", "vpn", "fastconnect_1g", "fastconnect_10g"]),
  }),
  environments: z
    .array(z.enum(["prod", "preprod", "staging", "uat", "dev", "test"]))
    .min(1)
    .max(4),
  sizing: z.discriminatedUnion("kind", [webAppSizing, chatbotSizing, drSizing, backupSizing]),
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
