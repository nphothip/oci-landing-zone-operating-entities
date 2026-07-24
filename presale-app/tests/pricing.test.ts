import { describe, expect, it } from "vitest";
import { tieredCost, unitPriceAt, type PriceEntry } from "@/lib/pricing/price-client";
import { priceBom } from "@/lib/pricing/resolve";
import { TEMPLATE_LIST } from "@/lib/templates";
import fallback from "@/lib/pricing/fallback-prices.json";

describe("tiered pricing math", () => {
  const lbBase: PriceEntry = {
    name: "Load Balancer Base",
    metric: "Load Balancer",
    tiers: [
      { value: 0, min: 0, max: 744 },
      { value: 0.0113, min: 744, max: null },
    ],
  };

  it("keeps the first LB free and charges the second", () => {
    expect(tieredCost(lbBase, 744)).toBe(0); // one LB month
    expect(tieredCost(lbBase, 1488)).toBeCloseTo(744 * 0.0113, 5); // two LBs
    expect(unitPriceAt(lbBase, 744)).toBe(0);
  });

  it("charges flat SKUs linearly", () => {
    const nfw: PriceEntry = { name: "NFW", metric: "Instance Per Hour", tiers: [{ value: 2.75, min: 0, max: null }] };
    expect(tieredCost(nfw, 744)).toBeCloseTo(2046, 2);
  });

  // The AIS feed has shipped SKUs whose free allowance carries a higher `step`
  // than the paid tier above it, which lands the bands out of order. Totals are
  // order-independent, but the marginal unit price shown in the BOM must not be.
  it("reads the right band even when the free tier is listed last", () => {
    const scrambled: PriceEntry = {
      name: "Object Storage Standard",
      metric: "Gigabyte Storage Capacity Per Month",
      tiers: [
        { value: 1.2052089225, min: 10, max: null },
        { value: 0, min: 0, max: 10 },
      ],
    };
    expect(unitPriceAt(scrambled, 5)).toBe(0); // inside the free allowance
    expect(unitPriceAt(scrambled, 500)).toBeCloseTo(1.2052089225, 6);
    expect(tieredCost(scrambled, 500)).toBeCloseTo(490 * 1.2052089225, 5);
  });

  it("ships a price book whose tiers are stored in ascending band order", () => {
    for (const [sku, entry] of Object.entries(fallback.prices as Record<string, PriceEntry>)) {
      const mins = entry.tiers.map((t) => t.min);
      expect(mins, sku).toEqual([...mins].sort((a, b) => a - b));
    }
  });
});

describe("BOM pricing end-to-end (fallback snapshot)", () => {
  it("prices every default template with a positive total", () => {
    for (const tpl of TEMPLATE_LIST) {
      const bom = priceBom(tpl.buildBom(tpl.defaults()));
      expect(bom.totals.monthlyThb, tpl.id).toBeGreaterThan(0);
      expect(bom.totals.unpricedCount, tpl.id).toBe(0);
    }
  });

  it("fallback snapshot covers key SKUs with expected unit prices", () => {
    const prices = (fallback as { prices: Record<string, { tiers: { value: number }[] }> }).prices;
    expect(prices.B97384.tiers[0].value).toBe(1.41789285); // E5 OCPU (THB)
    expect(prices.B95403.tiers[0].value).toBe(154.04268); // NFW instance (THB)
    expect(prices.B95702.tiers[0].value).toBe(15.88039992); // ADB ECPU (THB)
  });
});
