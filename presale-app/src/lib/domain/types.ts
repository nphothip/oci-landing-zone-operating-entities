// Core domain model for the presale app.
//
// A SolutionSpec is the single source of truth for one presale request. It is
// produced either by the template form or by the LLM free-text parser, and is
// consumed by:
//   - templates/*.buildFactoryConfig  -> Blueprint Factory config (gen/ input)
//   - templates/*.buildBom            -> BOM items -> pricing/resolve
//   - diagrams/layout/*               -> the five architecture views

export type TemplateId = "web_app" | "chatbot" | "dr" | "backup";
export type HubKind = "hub_a" | "hub_b" | "hub_c" | "hub_e";
export type CisLevel = 1 | 2;
// Environment names the generator orders canonically (gen/topology.libsonnet).
export type EnvName = "prod" | "preprod" | "staging" | "uat" | "dev" | "test";
export type Connectivity = "none" | "vpn" | "fastconnect_1g" | "fastconnect_10g";

export interface LocalizedText {
  th: string;
  en: string;
}

export interface RegionRef {
  /** OCI region identifier, e.g. "ap-singapore-1" */
  id: string;
  /** Short name used by the LZ naming convention, e.g. "sin" */
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

export type Sizing = WebAppSizing | ChatbotSizing | DrSizing | BackupSizing;

// ---------------------------------------------------------------------------
// SolutionSpec
// ---------------------------------------------------------------------------

export interface SolutionSpec {
  template: TemplateId;
  customerName?: string;
  region: RegionRef;
  cisLevel: CisLevel;
  hub: {
    kind: HubKind;
    connectivity: Connectivity;
  };
  /** Environments to create (each becomes a spoke VCN + compartment tree) */
  environments: EnvName[];
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
  /** USD per pricing metric unit; null when the SKU has no price (free) */
  unitPriceUsd: number | null;
  /** Pricing metric name, e.g. "OCPU PER HOUR" */
  metric: string | null;
  monthlyUsd: number | null;
}

export interface BomResult {
  items: PricedBomItem[];
  totals: {
    monthlyUsd: number;
    /** Items with a catalog SKU that could not be priced */
    unpricedCount: number;
  };
  priceSource: "live" | "fallback" | "mixed";
  priceFetchedAt: string;
}

// ---------------------------------------------------------------------------
// Diagrams — one layout model rendered as SVG, draw.io XML and PNG
// ---------------------------------------------------------------------------

export type ViewId = "functional" | "security" | "network" | "operations" | "runtime";

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
  /** routeCard rows */
  rows?: { left: string; right: string }[];
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  kind: "assoc" | "flow" | "drgLink";
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
