// Fetches USD PAY_AS_YOU_GO prices from the public OCI Price List API
// (the same backend the OCI cost estimator uses). One request returns the
// whole product list (~650 SKUs) — no pagination parameters are accepted.

export interface PriceTier {
  value: number;
  min: number;
  /** null = unbounded */
  max: number | null;
}

export interface PriceEntry {
  name: string;
  metric: string;
  tiers: PriceTier[];
}

export type PriceMap = Record<string, PriceEntry>;

const DEFAULT_BASE = "https://apexapps.oracle.com/pls/apex/cetools/api/v1";

interface ApiPrice {
  model: string;
  value: number;
  rangeMin?: number;
  rangeMax?: number;
}
interface ApiItem {
  partNumber: string;
  displayName: string;
  metricName: string;
  currencyCodeLocalizations?: { currencyCode: string; prices: ApiPrice[] }[];
}

const UNBOUNDED = 999_999_999; // API encodes "no upper bound" as 999999999(+)

export async function fetchPriceMap(skus: string[], timeoutMs = 20_000): Promise<PriceMap> {
  const base = process.env.PRICE_API_BASE || DEFAULT_BASE;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/products/`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`price API returned HTTP ${res.status}`);
    const data = (await res.json()) as { items: ApiItem[] };
    const wanted = new Set(skus);
    const map: PriceMap = {};
    for (const item of data.items ?? []) {
      if (!wanted.has(item.partNumber)) continue;
      const usd = item.currencyCodeLocalizations?.find((c) => c.currencyCode === "USD");
      const payg = (usd?.prices ?? []).filter((p) => p.model === "PAY_AS_YOU_GO");
      if (payg.length === 0) continue;
      map[item.partNumber] = {
        name: item.displayName,
        metric: item.metricName,
        tiers: payg.map((p) => ({
          value: p.value,
          min: p.rangeMin ?? 0,
          max: p.rangeMax === undefined || p.rangeMax >= UNBOUNDED ? null : p.rangeMax,
        })),
      };
    }
    return map;
  } finally {
    clearTimeout(timer);
  }
}

/** Graduated tiered cost: sum over tiers of the quantity falling in each band. */
export function tieredCost(entry: PriceEntry, qty: number): number {
  if (qty <= 0) return 0;
  let cost = 0;
  for (const t of entry.tiers) {
    const upper = t.max ?? Infinity;
    const band = Math.min(qty, upper) - t.min;
    if (band > 0) cost += band * t.value;
  }
  return cost;
}

/** Marginal unit price shown in the BOM (price of the tier the qty lands in). */
export function unitPriceAt(entry: PriceEntry, qty: number): number {
  const q = Math.max(qty, 0);
  for (const t of entry.tiers) {
    const upper = t.max ?? Infinity;
    if (q <= upper || t === entry.tiers[entry.tiers.length - 1]) return t.value;
  }
  return entry.tiers[entry.tiers.length - 1]?.value ?? 0;
}
