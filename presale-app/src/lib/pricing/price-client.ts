// Fetches THB prices from the AIS Cloud (Oracle Alloy, Thailand) price list
// API — https://calculator.g-ais.co.th/api/skus. One request returns the whole
// product list (~660 SKU rows). Prices are already in Thai Baht (AIS applies a
// fixed FX rate to the OCI list price). Graduated tiers are encoded as multiple
// rows per sku_id (step / step_start / step_end).

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

const DEFAULT_URL = "https://calculator.g-ais.co.th/api/skus";

// One row of the AIS price list. A SKU with graduated pricing appears as
// several rows sharing sku_id, one per tier (ordered by `step`).
interface AisSku {
  sku_id: string;
  service_name: string;
  metric: string;
  list_price: number;
  step: number;
  step_start: number | null;
  step_end: number | null;
  max_quantity: number | null;
}

// AIS marks "no upper bound" with very large sentinels (up to Int64 max) or
// null; the largest genuine tier boundary in the catalog is ~5M, so anything
// at/above this threshold is treated as unbounded.
const UNBOUNDED = 1e12;

export async function fetchPriceMap(skus: string[], timeoutMs = 20_000): Promise<PriceMap> {
  const url = process.env.PRICE_API_URL || DEFAULT_URL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`price API returned HTTP ${res.status}`);
    const data = (await res.json()) as AisSku[];
    const wanted = new Set(skus);

    // Group rows by SKU, then fold each SKU's tiers into one PriceEntry.
    const rowsBySku = new Map<string, AisSku[]>();
    for (const row of Array.isArray(data) ? data : []) {
      if (!wanted.has(row.sku_id)) continue;
      const list = rowsBySku.get(row.sku_id);
      if (list) list.push(row);
      else rowsBySku.set(row.sku_id, [row]);
    }

    const map: PriceMap = {};
    for (const [sku, rows] of rowsBySku) {
      // Sort by the band boundary, not by `step`: AIS has shipped feeds where a
      // free first tier carries a higher `step` than the paid tier above it,
      // which would leave the bands out of order.
      rows.sort((a, b) => (a.step_start ?? 0) - (b.step_start ?? 0));
      map[sku] = {
        name: rows[0].service_name,
        metric: rows[0].metric,
        tiers: rows.map((r) => ({
          value: r.list_price,
          min: r.step_start ?? 0,
          max: r.step_end == null || r.step_end >= UNBOUNDED ? null : r.step_end,
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

/**
 * Marginal unit price shown in the BOM (price of the tier the qty lands in).
 * Picks the band containing qty rather than trusting tier order, so a feed that
 * lists a free allowance after the paid tier cannot make the BOM quote the paid
 * rate for a quantity that is actually free.
 */
export function unitPriceAt(entry: PriceEntry, qty: number): number {
  const q = Math.max(qty, 0);
  if (entry.tiers.length === 0) return 0;
  const inBand = entry.tiers.find((t) => q > t.min && q <= (t.max ?? Infinity));
  if (inBand) return inBand.value;
  // q === 0, or a gap in the bands: fall back to the lowest band that starts at
  // or above q, else the highest band.
  const sorted = [...entry.tiers].sort((a, b) => a.min - b.min);
  return (sorted.find((t) => q <= (t.max ?? Infinity)) ?? sorted[sorted.length - 1]).value;
}
