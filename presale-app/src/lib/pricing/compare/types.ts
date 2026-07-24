import type { BomCategory, LocalizedText } from "@/lib/domain/types";

// Multi-cloud price comparison. Ground rules, in order of importance:
//
// 1. APPLES-TO-APPLES TOTALS. A provider's total is only ever compared against
//    the AIS subtotal of the SAME lines. Comparing a 26-line AWS total against
//    a 28-line AIS total is a lie by omission, so the engine carries both the
//    provider subtotal and the matching AIS subset subtotal for every provider.
// 2. NO SILENT LINES. Every BOM line either maps to a provider cell with a
//    price, or is explicitly excluded with a reason a presale can read aloud.
// 3. EVERY MAPPING SHOWS ITS WORK. Unit conversions (OCPU→vCPU, ECPU→vCPU,
//    Mbps→LCU/GB) and service-equivalence assumptions are recorded per cell.
// 4. NATIVE CURRENCY. Prices stay in the currency the provider publishes
//    (THB for Thai clouds, USD for globals). FX is applied only to compute the
//    THB delta against AIS, never to the displayed native price.
// 5. LIST PRICES ONLY. On-demand public list, no discounts/commitments except
//    where our own BOM line is itself commit-priced (OCVS) — noted per line.

/** Provider ids = keys of rates.json. The engine derives the list at runtime. */
export type CompareProvider = string;

/** AIS list THB = Oracle OCI list USD × this coefficient (verified live). */
export const AIS_OCI_COEFFICIENT = 47.263095;

export type Confidence = "verified" | "derived" | "estimate";
export type Currency = "USD" | "THB";

export interface CloudRate {
  /** Stable id referenced by the mapping layer, e.g. "vcpu_hour". */
  id: string;
  /** Official service + SKU/flavor name. */
  service: string;
  /** Native billing unit, e.g. "vCPU-hour", "GB-month". */
  unit: string;
  /** In the card's native currency. */
  price: number;
  /** Official pricing-page URL the number was read from. */
  source: string;
  /** verified = read off an official page · derived = computed from verified anchors · estimate = knowledge only */
  confidence: Confidence;
  notes?: string;
}

export interface ProviderRateCard {
  provider: CompareProvider;
  label: string;
  region: string;
  /**
   * true = the priced region is in Thailand (Thai→Thai traffic, data stays
   * in-country). false = nearest region abroad (typically Singapore): user
   * traffic and hybrid links cross the border, and the private-link price
   * shown is the cloud-side port only — the TH↔abroad carrier circuit is NOT
   * included and costs far more than a domestic cross-connect.
   */
  inCountry: boolean;
  currency: Currency;
  asOf: string;
  /** Free-text caveats from research (esp. Thai clouds with partial lists). */
  summary?: string;
  /** Behavioural quirks the mapper honours. */
  quirks?: {
    /** L7 LB product already includes the WAF (Azure App GW WAF_v2). */
    l7IncludesWaf?: boolean;
  };
  rates: Record<string, CloudRate>;
}

export type RateCardFile = Record<string, ProviderRateCard>;

/** A successfully mapped provider cell for one BOM line. */
export interface MappedCell {
  excluded: false;
  service: string;
  /** Quantity in the PROVIDER's billing unit (after conversion). */
  qty: number;
  unit: string;
  /** Unit price and monthly cost in the card's native currency. */
  unitPrice: number;
  monthly: number;
  /** Conversion/equivalence assumption, shown as a footnote. */
  note?: string;
  confidence: Confidence;
}

export interface ExcludedCell {
  excluded: true;
  /** Why this line cannot be compared on this provider — presale-readable. */
  reason: string;
}

export type CompareCell = MappedCell | ExcludedCell;

export interface CompareLine {
  catalogKey: string;
  label: LocalizedText;
  category: BomCategory;
  env: string;
  /** Quantity + unit as the AIS BOM states them. */
  aisQty: number;
  aisUnit: string;
  aisThb: number | null;
  /** Oracle OCI global list USD — derived via the coefficient, with per-SKU
   * overrides where AIS lags an Oracle price revision. */
  ociUsd: number | null;
  cells: Record<CompareProvider, CompareCell>;
}

/** A line that moves a provider's delta the most — the presale's talking point. */
export interface GapDriver {
  catalogKey: string;
  label: LocalizedText;
  aisThb: number;
  providerThb: number;
  /** providerThb − aisThb, in THB. Negative = the provider is cheaper here. */
  deltaThb: number;
  /** Share of the provider's total gap this single line accounts for (%). */
  sharePct: number;
  /** The mapping caveat for this line, if any — usually why the gap is large. */
  note?: string;
}

export interface ProviderTotal {
  provider: CompareProvider;
  label: string;
  region: string;
  inCountry: boolean;
  currency: Currency;
  asOf: string;
  /** Sum over the lines this provider could map, in native currency. */
  comparableNative: number;
  /** Native converted to THB (identity for THB providers, ×fx for USD). */
  comparableThb: number;
  /** AIS subtotal over EXACTLY the same lines — the honest baseline. */
  aisComparableThb: number;
  /** (comparableThb − aisComparableThb) / aisComparableThb × 100. */
  deltaPct: number | null;
  mappedLines: number;
  excludedLines: { catalogKey: string; label: LocalizedText; aisThb: number | null; reason: string }[];
  /** Lowest confidence present among mapped cells — the weakest link. */
  worstConfidence: Confidence;
  /**
   * The few lines that explain most of the delta, largest gap first. Without
   * this a presale sees "-70%" and cannot answer "why?" — and in this BOM the
   * answer is usually one or two lines with a cross-product caveat attached.
   */
  gapDrivers: GapDriver[];
}

export interface CompareResult {
  lines: CompareLine[];
  totals: ProviderTotal[];
  providers: CompareProvider[];
  aisTotalThb: number;
  ociTotalUsd: number;
  /** THB per USD used ONLY to convert USD providers for the delta/THB view. */
  fxRate: number;
  disclaimers: LocalizedText[];
}
