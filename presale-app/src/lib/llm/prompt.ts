// Shared prompt + wire schema for the free-text parser. The wire object is a
// FLAT shape with every field nullable — this satisfies OpenAI strict
// structured outputs (all keys required, no oneOf) and stays simple enough to
// embed as text for Gemini.

export const WIRE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    template: { type: ["string", "null"], enum: ["web_app", "chatbot", "dr", "backup", "erp", "migration", "analytics", "devtest", "oke_platform", null] },
    customerName: { type: ["string", "null"] },
    hubKind: { type: ["string", "null"], enum: ["hub_a", "hub_b", "hub_c", "hub_e", null] },
    cisLevel: { type: ["integer", "null"], enum: [1, 2, null] },
    connectivity: { type: ["string", "null"], enum: ["none", "vpn", "fastconnect_1g", "fastconnect_10g", null] },
    environments: { type: ["array", "null"], items: { type: "string", enum: ["prod", "preprod", "staging", "uat", "dev", "test"] } },
    webAppSizing: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        appVmCount: { type: ["integer", "null"] },
        ocpusPerVm: { type: ["integer", "null"] },
        memGbPerVm: { type: ["integer", "null"] },
        bootGbPerVm: { type: ["integer", "null"] },
        ha: { type: ["boolean", "null"] },
        dbEngine: { type: ["string", "null"], enum: ["adb_serverless", "base_db_vm", "none", null] },
        dbEcpus: { type: ["integer", "null"] },
        dbStorageGb: { type: ["integer", "null"] },
        lbBandwidthMbps: { type: ["integer", "null"] },
        waf: { type: ["boolean", "null"] },
      },
      required: ["appVmCount", "ocpusPerVm", "memGbPerVm", "bootGbPerVm", "ha", "dbEngine", "dbEcpus", "dbStorageGb", "lbBandwidthMbps", "waf"],
    },
    chatbotSizing: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        runtime: { type: ["string", "null"], enum: ["vm", "oke", null] },
        chatsPerMonth: { type: ["integer", "null"] },
        avgTokensPerChat: { type: ["integer", "null"] },
        modelClass: { type: ["string", "null"], enum: ["small", "large", null] },
        rag: { type: ["boolean", "null"] },
        vectorDbEcpus: { type: ["integer", "null"] },
        docStorageGb: { type: ["integer", "null"] },
        appVmCount: { type: ["integer", "null"] },
        okeWorkerCount: { type: ["integer", "null"] },
      },
      required: ["runtime", "chatsPerMonth", "avgTokensPerChat", "modelClass", "rag", "vectorDbEcpus", "docStorageGb", "appVmCount", "okeWorkerCount"],
    },
    drSizing: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        mode: { type: ["string", "null"], enum: ["pilot_light", "warm_standby", null] },
        protectedVmCount: { type: ["integer", "null"] },
        avgOcpusPerVm: { type: ["integer", "null"] },
        avgMemGbPerVm: { type: ["integer", "null"] },
        blockReplicaGb: { type: ["integer", "null"] },
        objectBackupGb: { type: ["integer", "null"] },
        dbDr: { type: ["string", "null"], enum: ["none", "adb_cross_region", "base_db_data_guard", null] },
        dbEcpus: { type: ["integer", "null"] },
        dbStorageGb: { type: ["integer", "null"] },
      },
      required: ["mode", "protectedVmCount", "avgOcpusPerVm", "avgMemGbPerVm", "blockReplicaGb", "objectBackupGb", "dbDr", "dbEcpus", "dbStorageGb"],
    },
    backupSizing: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        standardGb: { type: ["integer", "null"] },
        infrequentGb: { type: ["integer", "null"] },
        archiveGb: { type: ["integer", "null"] },
        monthlyRestoreGb: { type: ["integer", "null"] },
        dbBackup: { type: ["boolean", "null"] },
        dbBackupGb: { type: ["integer", "null"] },
      },
      required: ["standardGb", "infrequentGb", "archiveGb", "monthlyRestoreGb", "dbBackup", "dbBackupGb"],
    },
    erpSizing: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        users: { type: ["integer", "null"] },
        appVmCount: { type: ["integer", "null"] },
        ocpusPerVm: { type: ["integer", "null"] },
        memGbPerVm: { type: ["integer", "null"] },
        os: { type: ["string", "null"], enum: ["linux", "windows", null] },
        dbEngine: { type: ["string", "null"], enum: ["base_db_vm", "adb_serverless", null] },
        dbEcpus: { type: ["integer", "null"] },
        dbStorageGb: { type: ["integer", "null"] },
        fssGb: { type: ["integer", "null"] },
        backupGb: { type: ["integer", "null"] },
      },
      required: ["users", "appVmCount", "ocpusPerVm", "memGbPerVm", "os", "dbEngine", "dbEcpus", "dbStorageGb", "fssGb", "backupGb"],
    },
    migrationSizing: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        vmCount: { type: ["integer", "null"] },
        avgOcpusPerVm: { type: ["integer", "null"] },
        avgMemGbPerVm: { type: ["integer", "null"] },
        windowsVmCount: { type: ["integer", "null"] },
        totalStorageGb: { type: ["integer", "null"] },
        monthlyEgressGb: { type: ["integer", "null"] },
      },
      required: ["vmCount", "avgOcpusPerVm", "avgMemGbPerVm", "windowsVmCount", "totalStorageGb", "monthlyEgressGb"],
    },
    analyticsSizing: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        adwEcpus: { type: ["integer", "null"] },
        adwStorageGb: { type: ["integer", "null"] },
        oacUsers: { type: ["integer", "null"] },
        oacTier: { type: ["string", "null"], enum: ["professional", "enterprise", null] },
        dataLakeGb: { type: ["integer", "null"] },
        etlHoursPerMonth: { type: ["integer", "null"] },
      },
      required: ["adwEcpus", "adwStorageGb", "oacUsers", "oacTier", "dataLakeGb", "etlHoursPerMonth"],
    },
    devtestSizing: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        vmPerEnv: { type: ["integer", "null"] },
        ocpusPerVm: { type: ["integer", "null"] },
        memGbPerVm: { type: ["integer", "null"] },
        dbEcpusPerEnv: { type: ["integer", "null"] },
        runningHoursPerMonth: { type: ["integer", "null"] },
      },
      required: ["vmPerEnv", "ocpusPerVm", "memGbPerVm", "dbEcpusPerEnv", "runningHoursPerMonth"],
    },
    okePlatformSizing: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        workerCount: { type: ["integer", "null"] },
        workerOcpus: { type: ["integer", "null"] },
        workerMemGb: { type: ["integer", "null"] },
        registryGb: { type: ["integer", "null"] },
      },
      required: ["workerCount", "workerOcpus", "workerMemGb", "registryGb"],
    },
    assumptionNotes: { type: "array", items: { type: "string" } },
    clarifyingQuestions: { type: "array", items: { type: "string" } },
  },
  required: [
    "template", "customerName", "hubKind", "cisLevel", "connectivity", "environments",
    "webAppSizing", "chatbotSizing", "drSizing", "backupSizing",
    "erpSizing", "migrationSizing", "analyticsSizing", "devtestSizing", "okePlatformSizing",
    "assumptionNotes", "clarifyingQuestions",
  ],
} as const;

export interface WireResult {
  template: "web_app" | "chatbot" | "dr" | "backup" | "erp" | "migration" | "analytics" | "devtest" | "oke_platform" | null;
  customerName: string | null;
  hubKind: "hub_a" | "hub_b" | "hub_c" | "hub_e" | null;
  cisLevel: 1 | 2 | null;
  connectivity: "none" | "vpn" | "fastconnect_1g" | "fastconnect_10g" | null;
  environments: string[] | null;
  webAppSizing: Record<string, unknown> | null;
  chatbotSizing: Record<string, unknown> | null;
  drSizing: Record<string, unknown> | null;
  backupSizing: Record<string, unknown> | null;
  erpSizing: Record<string, unknown> | null;
  migrationSizing: Record<string, unknown> | null;
  analyticsSizing: Record<string, unknown> | null;
  devtestSizing: Record<string, unknown> | null;
  okePlatformSizing: Record<string, unknown> | null;
  assumptionNotes: string[];
  clarifyingQuestions: string[];
}

export const SYSTEM_PROMPT = `You are an OCI presale solution-sizing assistant for a team that builds
OCI landing zones from the "OCI Open LZ / Operating Entities" blueprints.

Task: read the user's free-text requirement (any language — often Thai) and
map it onto EXACTLY ONE solution template plus sizing values, returned as JSON
matching the provided schema. Do not write prose outside the JSON.

Templates:
- web_app     : 3-tier web application (LB -> app VMs [VM.Standard.E5.Flex] -> DB)
- erp         : ERP / business application hosting (SAP B1, Dynamics, payroll,
                accounting, custom ERP; app VMs [linux|windows] + Oracle DB +
                file share + VPN to office)
- migration   : lift & shift server migration (move an existing VM fleet from
                on-prem/VMware/hosting onto OCI compute; mixed Windows/Linux)
- chatbot     : Generative-AI chatbot (OCI GenAI on-demand, optional RAG with
                vector ADB + Object Storage; runtime "vm" or "oke")
- analytics   : data warehouse & BI (Autonomous Data Warehouse + Oracle
                Analytics Cloud per-user dashboards + Object Storage data lake)
- oke_platform: Kubernetes/container platform (OKE cluster deployed by the LZ)
- devtest     : dev/test environments (cheap non-prod on the free hub; compute
                billed per running hour, e.g. 12h x 22 days = 260 h/month)
- dr          : DR site on OCI (pilot_light = standby VMs stopped, storage only;
                warm_standby = ~half fleet running; block replicas, object
                backups, optional DB standby)
- backup      : backup-to-OCI (Object Storage Standard/IA/Archive tiers)

Thai keyword hints: เว็บแอป/เว็บไซต์/ระบบเว็บ -> web_app; อีอาร์พี/ERP/ระบบบัญชี/เงินเดือน/payroll/SAP -> erp;
ย้ายเซิร์ฟเวอร์/ย้ายขึ้นคลาวด์/migrate/ยกระบบเดิม/VMware -> migration; แชทบอท/บอทตอบลูกค้า/AI ตอบแชท -> chatbot;
คลังข้อมูล/รายงานผู้บริหาร/BI/dashboard/data warehouse -> analytics; คูเบอร์เนเตส/kubernetes/container/microservices -> oke_platform;
เครื่องทดสอบ/สภาพแวดล้อมพัฒนา/dev/test/UAT -> devtest; ดีอาร์/กู้คืนระบบ/ศูนย์สำรอง/แผนฉุกเฉิน -> dr;
สำรองข้อมูล/แบ็คอัพ/backup -> backup.

Landing zone options:
- hubKind: hub_a (2x OCI Network Firewall, HA, expensive), hub_b (1x NFW,
  default for production), hub_c (2x NLB for 3rd-party firewalls),
  hub_e (no firewall, cheapest — pick for PoC / tight budget / backup-only).
- cisLevel: 1 (default) or 2 (adds Vault, stricter recipes — pick when the
  user mentions strong compliance/regulator requirements).
- connectivity: none | vpn | fastconnect_1g | fastconnect_10g (on-prem link).
- environments: subset of prod, preprod, staging, uat, dev, test (default ["prod"]).

Sizing guidance: prefer filling values with sensible defaults derived from the
text (e.g. "500 concurrent users" -> 2-4 app VMs of 2 OCPU; "2TB of backups"
-> backup tiers summing 2000 GB). Every guess you make MUST be recorded as a
short note in assumptionNotes, in the same language as the user's text.

Clarifying questions: ONLY when the template choice itself or a
cost-dominant number (e.g. backup volume, chat volume, VM fleet size) is
genuinely impossible to infer, put up to 3 short questions (same language as
the user) in clarifyingQuestions and leave the uncertain fields null. If you
can proceed with assumptions, do so and keep clarifyingQuestions empty.

Set the sizing object that matches the chosen template; leave the other three
sizing objects null. Region is fixed by the app (ap-singapore-1) — ignore
region requests but note them in assumptionNotes.`;

export function schemaAsText(): string {
  return JSON.stringify(WIRE_SCHEMA, null, 1);
}
