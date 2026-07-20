// Regenerates src/lib/pricing/fallback-prices.json from the live OCI price
// list API. Run at development time (npm run prices:snapshot) and commit the
// result so the app always has offline prices.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const catalogSrc = fs.readFileSync(path.join(root, "src/lib/pricing/catalog.ts"), "utf8");
const skus = [...new Set([...catalogSrc.matchAll(/sku: "(B\d+)"/g)].map((m) => m[1]))];

const base = process.env.PRICE_API_BASE || "https://apexapps.oracle.com/pls/apex/cetools/api/v1";
const res = await fetch(`${base}/products/`, { headers: { accept: "application/json" } });
if (!res.ok) throw new Error(`price API HTTP ${res.status}`);
const data = await res.json();

const UNBOUNDED = 999_999_999;
const prices = {};
for (const item of data.items ?? []) {
  if (!skus.includes(item.partNumber)) continue;
  const usd = item.currencyCodeLocalizations?.find((c) => c.currencyCode === "USD");
  const payg = (usd?.prices ?? []).filter((p) => p.model === "PAY_AS_YOU_GO");
  if (payg.length === 0) continue;
  prices[item.partNumber] = {
    name: item.displayName,
    metric: item.metricName,
    tiers: payg.map((p) => ({
      value: p.value,
      min: p.rangeMin ?? 0,
      max: p.rangeMax === undefined || p.rangeMax >= UNBOUNDED ? null : p.rangeMax,
    })),
  };
}

const missing = skus.filter((s) => !prices[s]);
if (missing.length) console.warn(`WARNING: no price found for: ${missing.join(", ")}`);

const out = { fetchedAt: new Date().toISOString(), prices };
const target = path.join(root, "src/lib/pricing/fallback-prices.json");
fs.writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${Object.keys(prices).length}/${skus.length} SKUs to ${target}`);
