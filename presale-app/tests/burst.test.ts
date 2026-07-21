import { describe, expect, it } from "vitest";
import type { BomItem, SolutionSpec } from "@/lib/domain/types";
import { applyBurst, burstAssumptions } from "@/lib/bom/burst";
import { TEMPLATES } from "@/lib/templates";
import { finalizeBom } from "@/lib/bom/env";
import { priceBom } from "@/lib/pricing/resolve";

const baseItems: BomItem[] = [
  { catalogKey: "adb_ecpu", label: { th: "ADB", en: "ADB" }, category: "database", quantity: 4, unit: "ECPU", monthlyMetricQty: 4 * 744, deployedByLz: false },
  { catalogKey: "compute_e5_ocpu", label: { th: "OCPU", en: "OCPU" }, category: "compute", quantity: 2, unit: "OCPU", monthlyMetricQty: 2 * 744, deployedByLz: false },
];

const specWith = (burst: SolutionSpec["burst"]): SolutionSpec => ({ ...TEMPLATES.web_app.defaults(), burst });

describe("applyBurst", () => {
  it("is a no-op when burst is undefined or all-off", () => {
    expect(applyBurst(specWith(undefined), baseItems)).toBe(baseItems);
    expect(applyBurst(specWith({}), baseItems)).toBe(baseItems);
  });

  it("adds a DB burst line = base ECPU-hours × (factor-1) × pct, same SKU", () => {
    const out = applyBurst(specWith({ dbAutoscaling: true, dbPeakFactor: 3, dbPctMonthAbove: 5 }), baseItems);
    expect(out).toHaveLength(3);
    const burst = out.find((i) => i.label.en.includes("autoscaling burst"))!;
    expect(burst.catalogKey).toBe("adb_ecpu");
    expect(burst.monthlyMetricQty).toBeCloseTo(4 * 744 * (3 - 1) * 0.05, 5); // 297.6 ECPU-hours
    expect(burst.quantity).toBe(8); // 4 × (3−1) extra ECPUs on burst
  });

  it("VM burstable only tags the OCPU note — no extra line, no ADB change", () => {
    const out = applyBurst(specWith({ vmBurstable: true }), baseItems);
    expect(out).toHaveLength(2);
    expect(out.find((i) => i.catalogKey === "compute_e5_ocpu")!.notes?.en).toContain("burstable");
    expect(out.find((i) => i.catalogKey === "adb_ecpu")!.notes).toBeUndefined();
  });

  it("DB autoscaling raises the priced total; VM burstable leaves it unchanged", () => {
    const spec = TEMPLATES.web_app.defaults();
    const items = TEMPLATES.web_app.buildBom(spec);
    const base = priceBom(finalizeBom(applyBurst(spec, items))).totals.monthlyThb;
    const withDb = priceBom(finalizeBom(applyBurst({ ...spec, burst: { dbAutoscaling: true, dbPeakFactor: 3, dbPctMonthAbove: 5 } }, items))).totals.monthlyThb;
    const withVm = priceBom(finalizeBom(applyBurst({ ...spec, burst: { vmBurstable: true } }, items))).totals.monthlyThb;
    expect(withDb).toBeGreaterThan(base);
    expect(withVm).toBe(base);
  });

  it("emits assumption notes only when enabled", () => {
    expect(burstAssumptions(specWith(undefined))).toHaveLength(0);
    expect(burstAssumptions(specWith({ vmBurstable: true, dbAutoscaling: true }))).toHaveLength(2);
  });
});
