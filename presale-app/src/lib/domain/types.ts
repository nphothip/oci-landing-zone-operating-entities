// Core domain model for the presale app.
//
// A SolutionSpec is the single source of truth for one presale request. It is
// produced either by the template form or by the LLM free-text parser, and is
// consumed by:
//   - templates/*.buildFactoryConfig  -> Blueprint Factory config (gen/ input)
//   - templates/*.buildBom            -> BOM items -> pricing/resolve
//   - diagrams/layout/*               -> the five architecture views

export type TemplateId =
  | "web_app"
  | "chatbot"
  | "dr"
  | "backup"
  | "erp"
  | "migration"
  | "analytics"
  | "devtest"
  | "oke_platform"
  | "ecommerce"
  | "fileserver"
  | "vdi"
  | "serverless"
  | "streaming"
  | "enterprise_lz";
export type HubKind = "hub_a" | "hub_b" | "hub_c" | "hub_e";
export type CisLevel = 1 | 2;
// Environment names the generator orders canonically (gen/topology.libsonnet).
export type EnvName = "prod" | "preprod" | "staging" | "uat" | "dev" | "test";
export type Connectivity =
  | "none"
  | "vpn"
  | "vpn_ha"
  | "fastconnect_1g"
  | "fastconnect_1g_ha"
  | "fastconnect_10g"
  | "fastconnect_10g_ha"
  | "fastconnect_vpn_backup";

export interface LocalizedText {
  th: string;
  en: string;
}

export interface RegionRef {
  /** OCI region identifier, e.g. "ap-bangkok-1" */
  id: string;
  /** Short name used by the LZ naming convention, e.g. "bkk" */
  shortName: string;
}

// ---------------------------------------------------------------------------
// Sizing knobs per template (discriminated union on `kind`)
// ---------------------------------------------------------------------------

export interface WebAppSizing {
  kind: "web_app";
  /** Application VMs per environment (VM.Standard.E5.Flex) */
  appVmCount: number;
  ocpusPerVm: number;
  memGbPerVm: number;
  bootGbPerVm: number;
  /** HA forces >= 2 VMs spread across fault domains */
  ha: boolean;
  db: {
    engine: "adb_serverless" | "base_db_vm" | "none";
    /** ADB serverless ECPUs (adb_serverless only) */
    ecpus: number;
    storageGb: number;
  };
  lbBandwidthMbps: number;
  waf: boolean;
}

export interface ChatbotSizing {
  kind: "chatbot";
  runtime: "vm" | "oke";
  chatsPerMonth: number;
  avgTokensPerChat: number;
  modelClass: "small" | "large";
  rag: boolean;
  /** ADB (vector store) ECPUs, used when rag = true */
  vectorDbEcpus: number;
  docStorageGb: number;
  /** VM runtime sizing */
  appVmCount: number;
  ocpusPerVm: number;
  memGbPerVm: number;
  /** OKE runtime sizing */
  okeWorkerCount: number;
  okeWorkerOcpus: number;
  okeWorkerMemGb: number;
}

export interface DrSizing {
  kind: "dr";
  /** pilot_light: VMs stopped (storage only). warm_standby: half fleet running. */
  mode: "pilot_light" | "warm_standby";
  protectedVmCount: number;
  avgOcpusPerVm: number;
  avgMemGbPerVm: number;
  avgBootGbPerVm: number;
  /** Cross-region/on-prem replicated Block Volume capacity */
  blockReplicaGb: number;
  /** Object Storage backup copies held at the DR site */
  objectBackupGb: number;
  dbDr: "none" | "adb_cross_region" | "base_db_data_guard";
  dbEcpus: number;
  dbStorageGb: number;
}

export interface BackupSizing {
  kind: "backup";
  standardGb: number;
  infrequentGb: number;
  archiveGb: number;
  /** Expected restore volume per month (egress beyond free tier) */
  monthlyRestoreGb: number;
  dbBackup: boolean;
  dbBackupGb: number;
}

export interface ErpSizing {
  kind: "erp";
  /** Named/concurrent business users — drives default sizing sanity checks */
  users: number;
  appVmCount: number;
  ocpusPerVm: number;
  memGbPerVm: number;
  bootGbPerVm: number;
  os: "linux" | "windows";
  db: {
    engine: "base_db_vm" | "adb_serverless";
    ecpus: number;
    storageGb: number;
  };
  /** Shared file storage (interfaces, attachments, reports) */
  fssGb: number;
  backupGb: number;
}

export interface MigrationSizing {
  kind: "migration";
  vmCount: number;
  avgOcpusPerVm: number;
  avgMemGbPerVm: number;
  /** Of vmCount, how many run Windows Server (license billed per OCPU) */
  windowsVmCount: number;
  totalStorageGb: number;
  monthlyEgressGb: number;
}

export interface AnalyticsSizing {
  kind: "analytics";
  adwEcpus: number;
  adwStorageGb: number;
  oacUsers: number;
  oacTier: "professional" | "enterprise";
  dataLakeGb: number;
  /** OCI Data Integration workspace hours per month (0 = not used) */
  etlHoursPerMonth: number;
}

export interface DevtestSizing {
  kind: "devtest";
  vmPerEnv: number;
  ocpusPerVm: number;
  memGbPerVm: number;
  bootGbPerVm: number;
  dbEcpusPerEnv: number;
  dbStorageGbPerEnv: number;
  /** Compute/DB running hours per month (e.g. 12h × 22 days ≈ 260) */
  runningHoursPerMonth: number;
}

export interface OkePlatformSizing {
  kind: "oke_platform";
  workerCount: number;
  workerOcpus: number;
  workerMemGb: number;
  /** Container Registry + artifacts on Object Storage */
  registryGb: number;
}

export interface EcommerceSizing {
  kind: "ecommerce";
  appVmCount: number;
  ocpusPerVm: number;
  memGbPerVm: number;
  dbEcpus: number;
  dbStorageGb: number;
  cacheGb: number;
  productMediaGb: number;
  ordersPerMonth: number;
  waf: boolean;
}

export interface FileserverSizing {
  kind: "fileserver";
  users: number;
  fssGb: number;
  archiveGb: number;
  gatewayVmCount: number;
  gatewayOcpus: number;
}

export interface VdiSizing {
  kind: "vdi";
  desktopCount: number;
  profileStorageGb: number;
  appVmCount: number;
  appOcpus: number;
}

export interface ServerlessSizing {
  kind: "serverless";
  apiCallsPerMonth: number;
  functionInvocationsPerMonth: number;
  avgFnMemMb: number;
  avgFnMs: number;
  adbEcpus: number;
  adbStorageGb: number;
  objectStorageGb: number;
}

export interface StreamingSizing {
  kind: "streaming";
  throughputGbPerMonth: number;
  retentionGb: number;
  consumerVmCount: number;
  consumerOcpus: number;
  adwEcpus: number;
  adwStorageGb: number;
}

// --- Advanced mode (enterprise landing zone, professional-service sale) ----

export interface EnterpriseProjectPlan {
  /** Project/compartment name — lowercase alphanumeric, <= 10 chars (generator
   *  dns_label budget). Becomes cmp-lz-<env>-<name> + per-project web/app/db NSGs. */
  name: string;
  vmCount: number;
  ocpusPerVm: number;
  memGbPerVm: number;
  bootGbPerVm: number;
  dbEngine: "adb" | "base_db" | "none";
  dbEcpus: number;
  dbStorageGb: number;
  objectStorageGb: number;
}

export interface EnterpriseEnvPlan {
  /** Projects sharing this env's spoke VCN (isolated by compartment + NSGs). */
  projects: EnterpriseProjectPlan[];
  /** Add an OKE platform VCN (/20, oke_simple) to this environment. */
  oke: boolean;
  okeWorkerCount: number;
  okeWorkerOcpus: number;
  okeWorkerMemGb: number;
}

export interface EnterpriseLzSizing {
  kind: "enterprise_lz";
  /** Per-environment plan, keyed by env; an env without a plan gets a default. */
  plans: Partial<Record<EnvName, EnterpriseEnvPlan>>;
  /** Environments that get a Security Zone target (empty = ALL environments). */
  securityTargetEnvs: EnvName[];
  /** Shared file storage (FSS) capacity in GB (0 = none). */
  fssGb: number;
  /** Hub load-balancer bandwidth (Mbps). */
  lbBandwidthMbps: number;
}

export type Sizing =
  | WebAppSizing
  | ChatbotSizing
  | DrSizing
  | BackupSizing
  | ErpSizing
  | MigrationSizing
  | AnalyticsSizing
  | DevtestSizing
  | OkePlatformSizing
  | EcommerceSizing
  | FileserverSizing
  | VdiSizing
  | ServerlessSizing
  | StreamingSizing
  | EnterpriseLzSizing;

// ---------------------------------------------------------------------------
// SolutionSpec
// ---------------------------------------------------------------------------

/** Optional burst / autoscaling knobs applied across VM + ADB lines. */
export interface BurstConfig {
  /**
   * VM burstable. Matches AIS presale: selectable but billed at the full OCPU
   * rate (OCI's baseline discount is NOT applied) — a label only.
   */
  vmBurstable?: boolean;
  /** Enable ADB/ADW autoscaling (base ECPUs billed always + burst above baseline). */
  dbAutoscaling?: boolean;
  /** Peak ECPUs as a multiple of the base ECPUs; OCI autoscaling allows up to 3×. */
  dbPeakFactor?: number;
  /** % of the month running above the ECPU baseline (AIS calculator default 5). */
  dbPctMonthAbove?: number;
}

/** Optional traffic / data-transfer quantities. Any field left undefined keeps
 *  the template's built-in default; a set field overrides (or adds) that line. */
export interface TrafficConfig {
  /** Load Balancer bandwidth (Mbps). First 10 Mbps is free via the SKU tier. */
  lbBandwidthMbps?: number;
  /** Hub Network Firewall data processed per month (GB). First 10 TB free. */
  nfwDataGbPerMonth?: number;
  /** Outbound data transfer / internet egress per month (GB). */
  egressGbPerMonth?: number;
  /** WAF incoming requests per month, in millions. First 10 M free. */
  wafRequestsM?: number;
  /** Object Storage API requests per month, in millions (billed per 10k). */
  objectRequestsMPerMonth?: number;
  /** Streaming data throughput per month (GB, PUT/GET). Overrides the line. */
  streamingGbPerMonth?: number;
}

export interface SolutionSpec {
  template: TemplateId;
  customerName?: string;
  region: RegionRef;
  cisLevel: CisLevel;
  /** Burst / autoscaling options (undefined = off; existing totals unchanged). */
  burst?: BurstConfig;
  /** Traffic / data-transfer overrides (undefined = template defaults). */
  traffic?: TrafficConfig;
  hub: {
    kind: HubKind;
    connectivity: Connectivity;
    /** Network Firewall inspection depth (hub_a/hub_b only). */
    inspection?: "standard" | "ids_ips" | "tls";
  };
  /** Environments to create (each becomes a spoke VCN + compartment tree) */
  environments: EnvName[];
  /** Right-size non-production environments down from prod (default true). */
  rightsizeNonProd?: boolean;
  /**
   * Custom sizing per environment, as a percentage of the prod (base) sizing.
   * Overrides rightsizeNonProd for the envs set here (e.g. { dev: 20, uat: 60 }).
   * An env not listed falls back to the rightsizeNonProd ratio (or 100%).
   */
  envScalePct?: Partial<Record<EnvName, number>>;
  /**
   * Absolute per-environment overrides of a workload line's human quantity,
   * keyed by env then catalog key (e.g. { dev: { block_storage_gb: 200 } }).
   * Wins over the % scale; the billing metric is scaled proportionally.
   */
  envOverride?: Partial<Record<EnvName, Record<string, number>>>;
  sizing: Sizing;
  /** Assumptions recorded by the LLM parser or the form defaults */
  assumptionNotes: string[];
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

export type KnobInput =
  | { type: "number"; min: number; max: number; step?: number; unit?: string }
  | { type: "select"; options: { value: string; label: LocalizedText }[] }
  | { type: "boolean" };

export interface KnobDef {
  /** Dot-path into SolutionSpec, e.g. "sizing.appVmCount" */
  path: string;
  label: LocalizedText;
  help?: LocalizedText;
  input: KnobInput;
  /** Only show the knob when this predicate passes (e.g. runtime === "oke") */
  visibleIf?: (spec: SolutionSpec) => boolean;
}

export interface TemplateDefinition {
  id: TemplateId;
  name: LocalizedText;
  description: LocalizedText;
  icon: string;
  defaultHub: HubKind;
  defaultCis: CisLevel;
  knobs: KnobDef[];
  defaults(): SolutionSpec;
  buildFactoryConfig(spec: SolutionSpec): FactoryConfig;
  buildBom(spec: SolutionSpec): BomItem[];
  assumptions(spec: SolutionSpec): LocalizedText[];
}

// ---------------------------------------------------------------------------
// Blueprint Factory config (input to gen/generate.sh --config)
// Mirrors the schema validated by gen/config.libsonnet. Kept intentionally
// loose (Record<...>) — the generator is the authority on validation.
// ---------------------------------------------------------------------------

export interface PlatformConfig {
  network?: { vcn: string; subnets?: Record<string, unknown> };
  extension?: {
    type: "oke_simple" | "exacc" | "exacs" | "ocvs";
    params: Record<string, unknown>;
  };
}

export interface EnvironmentConfig {
  shared_project_network?: { network: { vcn: string } };
  projects?: Record<string, Record<string, never>>;
  platforms?: Record<string, PlatformConfig>;
}

export interface FactoryConfig {
  realm: "oc1";
  region: string;
  region_short_name: string;
  cis_level: CisLevel;
  hub: { kind: HubKind; network: { vcn: string } };
  environments: Record<string, EnvironmentConfig>;
  shared_platforms?: Record<string, PlatformConfig>;
  security_targets?: string[];
}

// ---------------------------------------------------------------------------
// BOM + pricing
// ---------------------------------------------------------------------------

export type BomCategory =
  | "landing_zone"
  | "compute"
  | "database"
  | "network"
  | "storage"
  | "ai"
  | "security"
  | "observability";

export interface BomItem {
  /** Key into the pricing catalog (pricing/catalog.ts). */
  catalogKey: string;
  label: LocalizedText;
  category: BomCategory;
  /**
   * Which environment this line belongs to, for filtering:
   * "shared" = hub/tenancy-level infra, or an env name ("prod", "preprod", …)
   * for per-environment workload. Set by finalizeBom / perEnv.
   */
  env?: string;
  /** Human-facing quantity, e.g. 4 (OCPU), 500 (GB) */
  quantity: number;
  /** Human-facing unit, e.g. "OCPU", "GB", "M tokens" */
  unit: string;
  /**
   * Metric quantity per month in the pricing metric of the SKU,
   * e.g. OCPU-hours = 4 OCPU x 744 h. For free items keep 0.
   */
  monthlyMetricQty: number;
  /** true = resource exists in the generated LZ JSON; false = priced here, provisioned post-LZ */
  deployedByLz: boolean;
  notes?: LocalizedText;
}

export interface PricedBomItem extends BomItem {
  /** OCI part number (from catalog), null for free/informational lines */
  sku: string | null;
  /** THB per pricing metric unit; null when the SKU has no price (free) */
  unitPriceThb: number | null;
  /** Pricing metric name, e.g. "OCPU PER HOUR" */
  metric: string | null;
  monthlyThb: number | null;
}

export interface BomResult {
  items: PricedBomItem[];
  totals: {
    monthlyThb: number;
    /** Items with a catalog SKU that could not be priced */
    unpricedCount: number;
  };
  priceSource: "live" | "fallback" | "mixed";
  priceFetchedAt: string;
}

// ---------------------------------------------------------------------------
// Diagrams — one layout model rendered as SVG, draw.io XML and PNG
// ---------------------------------------------------------------------------

export type ViewId =
  | "functional"
  | "security"
  | "network"
  | "operations"
  | "runtime"
  | "governance"
  | "identity"
  | "logging"
  | "backup"
  | "traffic";

export type NodeKind =
  | "canvasTitle"
  | "compartment"
  | "vcn"
  | "subnet"
  | "gateway"
  | "drg"
  | "service"
  | "group"
  | "routeCard"
  | "block"
  | "persona"
  | "note"
  | "zone"
  | "legend"
  | "arrowLabel";

export interface DiagramNode {
  id: string;
  kind: NodeKind;
  label: string;
  sublabel?: string;
  /** Absolute canvas coordinates (px) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Nesting: id of the containing node (compartment/vcn/zone) */
  parent?: string;
  /** Style token key into diagrams/theme.ts */
  style: string;
  /** routeCard / list rows; legend rows use `swatch` as a theme token per row */
  rows?: { left: string; right?: string; swatch?: string; bold?: boolean }[];
  /** routeCard column header labels (rendered as a header row) */
  colHeaders?: [string, string];
  /** line-art glyph key (diagrams/icons registry) drawn inside/above the shape */
  icon?: string;
  /** render label as a caption below the shape (gateway/icon services) */
  captionBelow?: boolean;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  kind: "assoc" | "flow" | "drgLink" | "leader";
  label?: string;
  /** Optional waypoints (absolute) between from/to anchors */
  points?: { x: number; y: number }[];
  dashed?: boolean;
}

export interface DiagramDoc {
  view: ViewId;
  title: LocalizedText;
  width: number;
  height: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

export interface LacFile {
  /** Path inside the LaC package, e.g. "generated/network.json" */
  path: string;
  content: string;
}

export interface GenerateResult {
  spec: SolutionSpec;
  factoryConfig: FactoryConfig;
  bom: BomResult;
  diagrams: DiagramDoc[];
  lac: { files: LacFile[] };
  assumptions: LocalizedText[];
  warnings: string[];
}

export type ParseResponse =
  | { status: "ok"; spec: SolutionSpec }
  | { status: "clarify"; questions: string[] }
  | { status: "llm_unavailable"; reason?: string }
  | { status: "error"; message: string };
