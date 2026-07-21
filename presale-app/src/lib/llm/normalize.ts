import type { SolutionSpec, TemplateId } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { parseSolutionSpec } from "@/lib/domain/spec-schema";
import type { WireResult } from "./prompt";

// Turns the LLM wire object into a valid SolutionSpec by overlaying the
// template defaults. Every value is clamped/coerced defensively — the LLM is
// untrusted input.

const int = (v: unknown, min: number, max: number, dflt: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : dflt;
  return Math.min(Math.max(n, min), max);
};
const bool = (v: unknown, dflt: boolean): boolean => (typeof v === "boolean" ? v : dflt);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], dflt: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;

export function normalizeWire(wire: WireResult):
  | { ok: true; spec: SolutionSpec }
  | { ok: false; message: string } {
  const template = oneOf<TemplateId>(
    wire.template,
    ["web_app", "chatbot", "dr", "backup", "erp", "migration", "analytics", "devtest", "oke_platform", "ecommerce", "fileserver", "vdi", "serverless", "streaming"],
    "web_app",
  );
  const spec = TEMPLATES[template].defaults();

  if (typeof wire.customerName === "string" && wire.customerName.trim()) {
    spec.customerName = wire.customerName.trim().slice(0, 120);
  }
  spec.hub.kind = oneOf(wire.hubKind, ["hub_a", "hub_b", "hub_c", "hub_e"], spec.hub.kind);
  spec.cisLevel = wire.cisLevel === 1 || wire.cisLevel === 2 ? wire.cisLevel : spec.cisLevel;
  spec.hub.connectivity = oneOf(wire.connectivity, ["none", "vpn", "vpn_ha", "fastconnect_1g", "fastconnect_1g_ha", "fastconnect_10g", "fastconnect_10g_ha", "fastconnect_vpn_backup"], spec.hub.connectivity);

  const envs = Array.isArray(wire.environments)
    ? wire.environments.filter((e): e is SolutionSpec["environments"][number] =>
        ["prod", "preprod", "staging", "uat", "dev", "test"].includes(e))
    : [];
  if (envs.length > 0) spec.environments = [...new Set(envs)].slice(0, 4);

  if (template === "web_app" && spec.sizing.kind === "web_app") {
    const w = wire.webAppSizing ?? {};
    spec.sizing.appVmCount = int(w.appVmCount, 1, 50, spec.sizing.appVmCount);
    spec.sizing.ocpusPerVm = int(w.ocpusPerVm, 1, 64, spec.sizing.ocpusPerVm);
    spec.sizing.memGbPerVm = int(w.memGbPerVm, 1, 1024, spec.sizing.memGbPerVm);
    spec.sizing.bootGbPerVm = int(w.bootGbPerVm, 50, 2000, spec.sizing.bootGbPerVm);
    spec.sizing.ha = bool(w.ha, spec.sizing.ha);
    spec.sizing.db.engine = oneOf(w.dbEngine, ["adb_serverless", "base_db_vm", "none"], spec.sizing.db.engine);
    spec.sizing.db.ecpus = int(w.dbEcpus, 2, 512, spec.sizing.db.ecpus);
    spec.sizing.db.storageGb = int(w.dbStorageGb, 20, 100000, spec.sizing.db.storageGb);
    spec.sizing.lbBandwidthMbps = int(w.lbBandwidthMbps, 10, 8000, spec.sizing.lbBandwidthMbps);
    spec.sizing.waf = bool(w.waf, spec.sizing.waf);
  } else if (template === "chatbot" && spec.sizing.kind === "chatbot") {
    const c = wire.chatbotSizing ?? {};
    spec.sizing.runtime = oneOf(c.runtime, ["vm", "oke"], spec.sizing.runtime);
    spec.sizing.chatsPerMonth = int(c.chatsPerMonth, 100, 100000000, spec.sizing.chatsPerMonth);
    spec.sizing.avgTokensPerChat = int(c.avgTokensPerChat, 100, 100000, spec.sizing.avgTokensPerChat);
    spec.sizing.modelClass = oneOf(c.modelClass, ["small", "large"], spec.sizing.modelClass);
    spec.sizing.rag = bool(c.rag, spec.sizing.rag);
    spec.sizing.vectorDbEcpus = int(c.vectorDbEcpus, 2, 512, spec.sizing.vectorDbEcpus);
    spec.sizing.docStorageGb = int(c.docStorageGb, 1, 100000, spec.sizing.docStorageGb);
    spec.sizing.appVmCount = int(c.appVmCount, 1, 50, spec.sizing.appVmCount);
    spec.sizing.okeWorkerCount = int(c.okeWorkerCount, 1, 100, spec.sizing.okeWorkerCount);
  } else if (template === "dr" && spec.sizing.kind === "dr") {
    const r = wire.drSizing ?? {};
    spec.sizing.mode = oneOf(r.mode, ["pilot_light", "warm_standby"], spec.sizing.mode);
    spec.sizing.protectedVmCount = int(r.protectedVmCount, 1, 500, spec.sizing.protectedVmCount);
    spec.sizing.avgOcpusPerVm = int(r.avgOcpusPerVm, 1, 64, spec.sizing.avgOcpusPerVm);
    spec.sizing.avgMemGbPerVm = int(r.avgMemGbPerVm, 1, 1024, spec.sizing.avgMemGbPerVm);
    spec.sizing.blockReplicaGb = int(r.blockReplicaGb, 0, 1000000, spec.sizing.blockReplicaGb);
    spec.sizing.objectBackupGb = int(r.objectBackupGb, 0, 10000000, spec.sizing.objectBackupGb);
    spec.sizing.dbDr = oneOf(r.dbDr, ["none", "adb_cross_region", "base_db_data_guard"], spec.sizing.dbDr);
    spec.sizing.dbEcpus = int(r.dbEcpus, 2, 512, spec.sizing.dbEcpus);
    spec.sizing.dbStorageGb = int(r.dbStorageGb, 20, 100000, spec.sizing.dbStorageGb);
  } else if (template === "backup" && spec.sizing.kind === "backup") {
    const b = wire.backupSizing ?? {};
    spec.sizing.standardGb = int(b.standardGb, 0, 10000000, spec.sizing.standardGb);
    spec.sizing.infrequentGb = int(b.infrequentGb, 0, 10000000, spec.sizing.infrequentGb);
    spec.sizing.archiveGb = int(b.archiveGb, 0, 10000000, spec.sizing.archiveGb);
    spec.sizing.monthlyRestoreGb = int(b.monthlyRestoreGb, 0, 10000000, spec.sizing.monthlyRestoreGb);
    spec.sizing.dbBackup = bool(b.dbBackup, spec.sizing.dbBackup);
    spec.sizing.dbBackupGb = int(b.dbBackupGb, 0, 10000000, spec.sizing.dbBackupGb);
  } else if (template === "erp" && spec.sizing.kind === "erp") {
    const e = wire.erpSizing ?? {};
    spec.sizing.users = int(e.users, 5, 5000, spec.sizing.users);
    spec.sizing.appVmCount = int(e.appVmCount, 1, 20, spec.sizing.appVmCount);
    spec.sizing.ocpusPerVm = int(e.ocpusPerVm, 1, 32, spec.sizing.ocpusPerVm);
    spec.sizing.memGbPerVm = int(e.memGbPerVm, 4, 512, spec.sizing.memGbPerVm);
    spec.sizing.os = oneOf(e.os, ["linux", "windows"], spec.sizing.os);
    spec.sizing.db.engine = oneOf(e.dbEngine, ["base_db_vm", "adb_serverless"], spec.sizing.db.engine);
    spec.sizing.db.ecpus = int(e.dbEcpus, 2, 128, spec.sizing.db.ecpus);
    spec.sizing.db.storageGb = int(e.dbStorageGb, 50, 50000, spec.sizing.db.storageGb);
    spec.sizing.fssGb = int(e.fssGb, 0, 100000, spec.sizing.fssGb);
    spec.sizing.backupGb = int(e.backupGb, 0, 1000000, spec.sizing.backupGb);
  } else if (template === "migration" && spec.sizing.kind === "migration") {
    const m = wire.migrationSizing ?? {};
    spec.sizing.vmCount = int(m.vmCount, 1, 300, spec.sizing.vmCount);
    spec.sizing.avgOcpusPerVm = int(m.avgOcpusPerVm, 1, 32, spec.sizing.avgOcpusPerVm);
    spec.sizing.avgMemGbPerVm = int(m.avgMemGbPerVm, 2, 512, spec.sizing.avgMemGbPerVm);
    spec.sizing.windowsVmCount = int(m.windowsVmCount, 0, 300, spec.sizing.windowsVmCount);
    spec.sizing.totalStorageGb = int(m.totalStorageGb, 0, 2000000, spec.sizing.totalStorageGb);
    spec.sizing.monthlyEgressGb = int(m.monthlyEgressGb, 0, 1000000, spec.sizing.monthlyEgressGb);
  } else if (template === "analytics" && spec.sizing.kind === "analytics") {
    const a = wire.analyticsSizing ?? {};
    spec.sizing.adwEcpus = int(a.adwEcpus, 2, 512, spec.sizing.adwEcpus);
    spec.sizing.adwStorageGb = int(a.adwStorageGb, 20, 500000, spec.sizing.adwStorageGb);
    spec.sizing.oacUsers = int(a.oacUsers, 0, 2000, spec.sizing.oacUsers);
    spec.sizing.oacTier = oneOf(a.oacTier, ["professional", "enterprise"], spec.sizing.oacTier);
    spec.sizing.dataLakeGb = int(a.dataLakeGb, 0, 5000000, spec.sizing.dataLakeGb);
    spec.sizing.etlHoursPerMonth = int(a.etlHoursPerMonth, 0, 744, spec.sizing.etlHoursPerMonth);
  } else if (template === "devtest" && spec.sizing.kind === "devtest") {
    const v = wire.devtestSizing ?? {};
    spec.sizing.vmPerEnv = int(v.vmPerEnv, 1, 50, spec.sizing.vmPerEnv);
    spec.sizing.ocpusPerVm = int(v.ocpusPerVm, 1, 16, spec.sizing.ocpusPerVm);
    spec.sizing.memGbPerVm = int(v.memGbPerVm, 2, 256, spec.sizing.memGbPerVm);
    spec.sizing.dbEcpusPerEnv = int(v.dbEcpusPerEnv, 0, 64, spec.sizing.dbEcpusPerEnv);
    spec.sizing.runningHoursPerMonth = int(v.runningHoursPerMonth, 40, 744, spec.sizing.runningHoursPerMonth);
  } else if (template === "oke_platform" && spec.sizing.kind === "oke_platform") {
    const k = wire.okePlatformSizing ?? {};
    spec.sizing.workerCount = int(k.workerCount, 1, 100, spec.sizing.workerCount);
    spec.sizing.workerOcpus = int(k.workerOcpus, 1, 64, spec.sizing.workerOcpus);
    spec.sizing.workerMemGb = int(k.workerMemGb, 4, 1024, spec.sizing.workerMemGb);
    spec.sizing.registryGb = int(k.registryGb, 0, 100000, spec.sizing.registryGb);
  }

  spec.assumptionNotes = (Array.isArray(wire.assumptionNotes) ? wire.assumptionNotes : [])
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map((n) => n.slice(0, 500))
    .slice(0, 30);

  const validated = parseSolutionSpec(spec);
  if (!validated.ok) return { ok: false, message: `normalized spec invalid: ${validated.message}` };
  return { ok: true, spec: validated.spec };
}
