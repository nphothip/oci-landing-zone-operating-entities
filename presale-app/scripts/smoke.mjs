// End-to-end API smoke: 17 cases (14 templates x hub/connectivity variants)
// against a running server.
// No LLM key required. Usage:  node scripts/smoke.mjs  (SMOKE_URL to override)
const BASE = process.env.SMOKE_URL || "http://localhost:3000";

// /api/generate returns every view buildDiagrams() produces — keep in step with
// src/lib/diagrams/index.ts (each view must also carry nodes, checked below).
const EXPECTED_VIEWS = 13;

const base = {
  region: { id: "ap-bangkok-1", shortName: "bkk" },
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
  ecommerce: { kind: "ecommerce", appVmCount: 3, ocpusPerVm: 2, memGbPerVm: 16, dbEcpus: 4, dbStorageGb: 300, cacheGb: 8, productMediaGb: 200, ordersPerMonth: 20000, waf: true },
  fileserver: { kind: "fileserver", users: 200, fssGb: 2000, archiveGb: 10000, gatewayVmCount: 1, gatewayOcpus: 2 },
  vdi: { kind: "vdi", desktopCount: 50, profileStorageGb: 500, appVmCount: 1, appOcpus: 4 },
  serverless: { kind: "serverless", apiCallsPerMonth: 20000000, functionInvocationsPerMonth: 20000000, avgFnMemMb: 256, avgFnMs: 200, adbEcpus: 2, adbStorageGb: 100, objectStorageGb: 100 },
  streaming: { kind: "streaming", throughputGbPerMonth: 5000, retentionGb: 500, consumerVmCount: 2, consumerOcpus: 2, adwEcpus: 4, adwStorageGb: 2000 },
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
  { name: "ecommerce/hub_b+preprod", template: "ecommerce", hub: "hub_b", cis: 1, environments: ["prod", "preprod"] },
  { name: "fileserver/hub_b+vpn_ha", template: "fileserver", hub: "hub_b", cis: 1, connectivity: "vpn_ha" },
  { name: "vdi/hub_b+fc_ha", template: "vdi", hub: "hub_b", cis: 1, connectivity: "fastconnect_1g_ha" },
  { name: "serverless/hub_b", template: "serverless", hub: "hub_b", cis: 1 },
  { name: "streaming/hub_b+fc_vpn", template: "streaming", hub: "hub_b", cis: 1, connectivity: "fastconnect_vpn_backup" },
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
    const total = data?.bom?.totals?.monthlyThb ?? -1;
    const diagrams = Array.isArray(data?.diagrams) ? data.diagrams : [];
    const views = diagrams.length;
    // A view that renders no nodes is a silently broken layout, so flag it by name.
    const emptyViews = diagrams.filter((d) => !Array.isArray(d?.nodes) || d.nodes.length === 0).map((d) => d?.view ?? "?");
    const ok =
      res.ok &&
      files >= 5 &&
      total >= 0 &&
      views === EXPECTED_VIEWS &&
      emptyViews.length === 0 &&
      (data?.bom?.totals?.unpricedCount ?? 99) === 0;
    const emptyNote = emptyViews.length ? ` empty=[${emptyViews.join(",")}]` : "";
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(28)} ${String(ms).padStart(5)}ms  files=${files} total=฿${total} views=${views}/${EXPECTED_VIEWS}${emptyNote}${res.ok ? "" : ` err=${data?.error}`}`);
    if (!ok) failed += 1;
  } catch (err) {
    console.log(`FAIL  ${c.name.padEnd(28)} ${err instanceof Error ? err.message : err}`);
    failed += 1;
  }
}

console.log(failed === 0 ? "\nAll smoke cases passed." : `\n${failed} case(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
