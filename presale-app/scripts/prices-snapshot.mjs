// Regenerates src/lib/pricing/fallback-prices.json from the live AIS Cloud
// (Oracle Alloy, Thailand) price list API. Prices are in THB. Run at
// development time (npm run prices:snapshot) and commit the result so the app
// always has offline prices.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const catalogSrc = fs.readFileSync(path.join(root, "src/lib/pricing/catalog.ts"), "utf8");
const skus = [...new Set([...catalogSrc.matchAll(/sku: "(B\d+)"/g)].map((m) => m[1]))];

const url = process.env.PRICE_API_URL || "https://calculator.g-ais.co.th/api/skus";
const res = await fetch(url, { headers: { accept: "application/json" } });
if (!res.ok) throw new Error(`price API HTTP ${res.status}`);
const data = await res.json();

const UNBOUNDED = 1e12;
const wanted = new Set(skus);
const rowsBySku = new Map();
for (const row of Array.isArray(data) ? data : []) {
  if (!wanted.has(row.sku_id)) continue;
  (rowsBySku.get(row.sku_id) ?? rowsBySku.set(row.sku_id, []).get(row.sku_id)).push(row);
}

const prices = {};
for (const [sku, rows] of rowsBySku) {
  // Sort by band boundary, matching price-client.ts — AIS sometimes gives a
  // free first tier a higher `step` than the paid tier above it.
  rows.sort((a, b) => (a.step_start ?? 0) - (b.step_start ?? 0));
  prices[sku] = {
    name: rows[0].service_name,
    metric: rows[0].metric,
    tiers: rows.map((r) => ({
      value: r.list_price,
      min: r.step_start ?? 0,
      max: r.step_end == null || r.step_end >= UNBOUNDED ? null : r.step_end,
    })),
  };
}

const missing = skus.filter((s) => !prices[s]);
if (missing.length) console.warn(`WARNING: no price found for: ${missing.join(", ")}`);

const out = { currency: "THB", fetchedAt: new Date().toISOString(), prices };
const target = path.join(root, "src/lib/pricing/fallback-prices.json");
fs.writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${Object.keys(prices).length}/${skus.length} SKUs (THB) to ${target}`);
