import { catalogSkus } from "./catalog";
import { fetchPriceMap, type PriceMap } from "./price-client";
import fallback from "./fallback-prices.json";

// In-memory price book (stateless app: resets on restart, seeded from the
// committed fallback snapshot so the app always works offline).

export interface PriceBook {
  source: "live" | "fallback";
  fetchedAt: string;
  prices: PriceMap;
}

const TTL_MS = Number(process.env.PRICE_TTL_HOURS || 24) * 3600_000;

const fallbackBook: PriceBook = {
  source: "fallback",
  fetchedAt: (fallback as { fetchedAt: string }).fetchedAt,
  prices: (fallback as { prices: PriceMap }).prices,
};

let book: PriceBook = fallbackBook;
let lastLiveAttempt = 0;
let refreshing: Promise<void> | null = null;

async function refresh(): Promise<void> {
  lastLiveAttempt = Date.now();
  const live = await fetchPriceMap(catalogSkus());
  // Only accept a live book that covers most catalog SKUs.
  if (Object.keys(live).length >= catalogSkus().length * 0.8) {
    book = { source: "live", fetchedAt: new Date().toISOString(), prices: live };
  }
}

/**
 * Returns the current price book immediately (fallback on cold start) and
 * refreshes from the live API in the background when stale. Never throws.
 */
export function getPriceBook(): PriceBook {
  const stale =
    book.source === "fallback"
      ? Date.now() - lastLiveAttempt > 5 * 60_000 // retry live every 5 min
      : Date.now() - new Date(book.fetchedAt).getTime() > TTL_MS;
  if (stale && !refreshing) {
    refreshing = refresh()
      .catch(() => {})
      .finally(() => {
        refreshing = null;
      });
  }
  return book;
}

/** Force a synchronous refresh (POST /api/prices?action=refresh). */
export async function refreshPriceBook(): Promise<PriceBook> {
  try {
    await refresh();
  } catch {
    // keep previous book
  }
  return book;
}
