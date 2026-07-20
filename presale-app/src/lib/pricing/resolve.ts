import type { BomItem, BomResult, PricedBomItem } from "@/lib/domain/types";
import { CATALOG } from "./catalog";
import { getPriceBook } from "./cache";
import { tieredCost, unitPriceAt } from "./price-client";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function priceBom(items: BomItem[]): BomResult {
  const book = getPriceBook();
  let total = 0;
  let unpriced = 0;

  const priced: PricedBomItem[] = items.map((item) => {
    const entry = CATALOG[item.catalogKey];
    const sku = entry?.sku ?? null;
    if (!sku) {
      return { ...item, sku: null, unitPriceUsd: null, metric: null, monthlyUsd: 0 };
    }
    const price = book.prices[sku];
    if (!price) {
      unpriced += 1;
      return { ...item, sku, unitPriceUsd: null, metric: null, monthlyUsd: null };
    }
    const monthly = round2(tieredCost(price, item.monthlyMetricQty));
    total += monthly;
    return {
      ...item,
      sku,
      unitPriceUsd: unitPriceAt(price, item.monthlyMetricQty),
      metric: price.metric,
      monthlyUsd: monthly,
    };
  });

  return {
    items: priced,
    totals: { monthlyUsd: round2(total), unpricedCount: unpriced },
    priceSource: book.source === "live" ? "live" : "fallback",
    priceFetchedAt: book.fetchedAt,
  };
}
