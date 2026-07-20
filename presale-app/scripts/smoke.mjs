// End-to-end API smoke: 4 templates x hub variants against a running server.
// No LLM key required. Usage:  node scripts/smoke.mjs  (SMOKE_URL to override)
const BASE = process.env.SMOKE_URL || "http://localhost:3000";

const base = {
  region: { id: "ap-singapore-1", shortName: "sin" },
  cisLevel: 1,
  environments: ["prod"],
  assumptionNotes: [],
};

const sizings = {
  web_app: { kind: "web_app", appVmCount: 2, ocpusPerVm: 2, memGbPerVm: 16, bootGbPerVm: 100, ha: true, db: { engine: "adb_serverless", ecpus: 4, storageGb: 200 }, lbBandwidthMbps: 100, waf: false },
  chatbot: { kind: "chatbot", runtime: "oke", chatsPerMonth: 50000, avgTokensPerChat: 4000, modelClass: "small", rag: true, vectorDbEcpus: 4, docStorageGb: 20, appVmCount: 2, ocpusPerVm: 2, memGbPerVm: 16, okeWorkerCount: 3, okeWorkerOcpus: 2, okeWorkerMemGb: 16 },
  dr: { kind: "dr", mode: "pilot_light", protectedVmCount: 10, avgOcpusPerVm: 2, avgMemGbPerVm: 16, avgBootGbPerVm: 100, blockReplicaGb: 2000, objectBackupGb: 1000, dbDr: "adb_cross_region", dbEcpus: 4, dbStorageGb: 500 },
  backup: { kind: "backup", standardGb: 1000, infrequentGb: 5000, archiveGb: 20000, monthlyRestoreGb: 500, dbBackup: false, dbBackupGb: 0 },
  erp: { kind: "erp", users: 50, appVmCount: 2, ocpusPerVm: 4, memGbPerVm: 32, bootGbPerVm: 200, os: "windows", db: { engine: "base_db_vm", ecpus: 8, storageGb: 500 }, fssGb: 200, backupGb: 500 },
  migration: { kind: "migration", vmCount: 15, avgOcpusPerVm: 2, avgMemGbPerVm: 16, windowsVmCount: 8, totalStorageGb: 4000, monthlyEgressGb: 200 },
  analytics: { kind: "analytics", adwEcpus: 4, adwStorageGb: 1000, oacUsers: 20, oacTier: "professional", dataLakeGb: 500, etlHoursPerMonth: 80 },
  devtest: { kind: "devtest", vmPerEnv: 4, ocpusPerVm: 1, memGbPerVm: 8, bootGbPerVm: 100, dbEcpusPerEnv: 2, dbStorageGbPerEnv: 100, runningHoursPerMonth: 260 },
  oke_platform: { kind: "oke_platform", workerCount: 3, workerOcpus: 2, workerMemGb: 16, registryGb: 100 },
};

const cases = [
  { name: "web_app/hub_b", template: "web_app", hub: "hub_b", cis: 1 },
  { name: "web_app/hub_a+preprod+cis2", template: "web_app", hub: "hub_a", cis: 2, environments: ["prod", "preprod"] },
  { name: "web_app/hub_e", template: "web_app", hub: "hub_e", cis: 1 },
  { name: "web_app/hub_c", template: "web_app", hub: "hub_c", cis: 1 },
  { name: "chatbot/oke/hub_b", template: "chatbot", hub: "hub_b", cis: 1 },
  { name: "dr/fastconnect", template: "dr", hub: "hub_b", cis: 1, connectivity: "fastconnect_1g" },
  { name: "backup/hub_e+vpn", template: "backup", hub: "hub_e", cis: 1, connectivity: "vpn" },
  { name: "erp/hub_b+vpn+windows", template: "erp", hub: "hub_b", cis: 1, connectivity: "vpn" },
  { name: "migration/hub_b+vpn", template: "migration", hub: "hub_b", cis: 1, connectivity: "vpn" },
  { name: "analytics/hub_e", template: "analytics", hub: "hub_e", cis: 1, connectivity: "vpn" },
  { name: "devtest/hub_e/dev+test", template: "devtest", hub: "hub_e", cis: 1, connectivity: "vpn", environments: ["dev", "test"] },
  { name: "oke_platform/hub_b", template: "oke_platform", hub: "hub_b", cis: 1 },
];

let failed = 0;

const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
console.log(`health: ok=${health.ok} jsonnet=${health.jsonnet} python=${health.python} llm=${health.llmProvider} prices=${health.priceSource}`);
if (!health.ok) {
  console.error("FAIL: /api/health not ok");
  process.exit(1);
}

for (const c of cases) {
  const spec = {
    ...base,
    template: c.template,
    cisLevel: c.cis,
    environments: c.environments ?? base.environments,
    hub: { kind: c.hub, connectivity: c.connectivity ?? "none" },
    sizing: sizings[c.template],
  };
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });
    const data = await res.json();
    const ms = Date.now() - started;
    const files = data?.lac?.files?.length ?? 0;
    const total = data?.bom?.totals?.monthlyUsd ?? -1;
    const views = data?.diagrams?.length ?? 0;
    const ok = res.ok && files >= 5 && total >= 0 && views === 5 && (data?.bom?.totals?.unpricedCount ?? 99) === 0;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(28)} ${String(ms).padStart(5)}ms  files=${files} total=$${total} views=${views}${res.ok ? "" : ` err=${data?.error}`}`);
    if (!ok) failed += 1;
  } catch (err) {
    console.log(`FAIL  ${c.name.padEnd(28)} ${err instanceof Error ? err.message : err}`);
    failed += 1;
  }
}

console.log(failed === 0 ? "\nAll smoke cases passed." : `\n${failed} case(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
