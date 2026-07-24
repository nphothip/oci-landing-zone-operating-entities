import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { parseSolutionSpec } from "@/lib/domain/spec-schema";
import { ADDONS, applyAddOns, addOnAssumptions } from "@/lib/bom/addons";
import { finalizeBom, applyEnvOverride } from "@/lib/bom/env";
import { priceBom } from "@/lib/pricing/resolve";
import { CATALOG } from "@/lib/pricing/catalog";
import type { SolutionSpec } from "@/lib/domain/types";

function specWithAddOns(addOns: SolutionSpec["addOns"]): SolutionSpec {
  const spec = TEMPLATES.web_app.defaults();
  spec.environments = ["prod", "dev"];
  spec.addOns = addOns;
  return spec;
}

describe("AIS add-on services", () => {
  it("every add-on line points at a catalog entry with a real AIS SKU", () => {
    for (const a of ADDONS) {
      for (const l of a.lines(a.defaultQty)) {
        const entry = CATALOG[l.catalogKey];
        expect(entry, `${a.id} -> ${l.catalogKey}`).toBeDefined();
        expect(entry.sku, `${a.id} -> ${l.catalogKey} must be priceable`).toMatch(/^B\d{5,6}$/);
        expect(l.deployedByLz, `${a.id} is provisioned after the LZ`).toBe(false);
        expect(l.quantity).toBeGreaterThan(0);
      }
    }
  });

  it("has unique ids and non-empty bilingual copy", () => {
    expect(new Set(ADDONS.map((a) => a.id)).size).toBe(ADDONS.length);
    for (const a of ADDONS) {
      for (const s of [a.name, a.unit, a.hint]) {
        expect(s.th.length, a.id).toBeGreaterThan(1);
        expect(s.en.length, a.id).toBeGreaterThan(1);
      }
    }
  });

  it("appends priced lines to the BOM and leaves the base BOM untouched", () => {
    const base = TEMPLATES.web_app.buildBom(specWithAddOns(undefined));
    const spec = specWithAddOns([{ id: "postgresql", qty: 8 }]);
    const withAddOn = applyAddOns(spec, TEMPLATES.web_app.buildBom(spec));
    expect(withAddOn.length).toBe(base.length + 2); // OCPU + storage
    const pg = withAddOn.find((i) => i.catalogKey === "pg_ocpu")!;
    expect(pg.quantity).toBe(8);
    expect(pg.monthlyMetricQty).toBe(8 * 744);

    const priced = priceBom(finalizeBom(withAddOn));
    const line = priced.items.find((i) => i.catalogKey === "pg_ocpu")!;
    expect(line.sku).toBe("B99060");
    expect(line.monthlyThb ?? 0).toBeGreaterThan(0);
  });

  it("drops unknown ids and non-positive quantities instead of pricing them as free", () => {
    const spec = specWithAddOns([
      { id: "does_not_exist", qty: 5 },
      { id: "postgresql", qty: 0 },
      { id: "opensearch", qty: -3 },
    ]);
    const items = TEMPLATES.web_app.buildBom(spec);
    expect(applyAddOns(spec, items)).toHaveLength(items.length);
    expect(addOnAssumptions(spec)).toHaveLength(0);
  });

  it("never re-scales an add-on the presale sized for a specific environment", () => {
    const spec = specWithAddOns([{ id: "mysql_heatwave", qty: 16, env: "dev" }]);
    spec.rightsizeNonProd = true; // dev would normally shrink hard
    const items = applyAddOns(spec, applyEnvOverride(spec, TEMPLATES.web_app.buildBom(spec)));
    const mysql = items.find((i) => i.catalogKey === "mysql_ecpu")!;
    expect(mysql.quantity).toBe(16);
    expect(mysql.env).toBe("dev");
  });

  it("defaults an add-on without an env to shared", () => {
    const spec = specWithAddOns([{ id: "queue", qty: 25 }]);
    const items = applyAddOns(spec, TEMPLATES.web_app.buildBom(spec));
    expect(items.find((i) => i.catalogKey === "queue_1m")!.env).toBe("shared");
  });

  it("records an assumption line per chosen add-on", () => {
    const spec = specWithAddOns([{ id: "goldengate", qty: 4 }, { id: "opensearch", qty: 3 }]);
    const notes = addOnAssumptions(spec);
    expect(notes).toHaveLength(2);
    expect(notes[0].th).toContain("GoldenGate");
    expect(notes[0].th).toContain("4");
    expect(notes[1].en).toContain("OpenSearch");
  });

  it("passes the spec schema, and rejects malformed add-on entries", () => {
    expect(parseSolutionSpec(specWithAddOns([{ id: "postgresql", qty: 4, env: "prod" }])).ok).toBe(true);
    const bad = specWithAddOns([{ id: "postgresql", qty: 4 }]) as unknown as Record<string, unknown>;
    bad.addOns = [{ id: "", qty: 4 }];
    expect(parseSolutionSpec(bad).ok).toBe(false);
    bad.addOns = [{ id: "postgresql", qty: "four" }];
    expect(parseSolutionSpec(bad).ok).toBe(false);
    bad.addOns = [{ id: "postgresql", qty: 4, env: "qa" }];
    expect(parseSolutionSpec(bad).ok).toBe(false);
  });

  it("prices every add-on at its default quantity against the live/snapshot price book", () => {
    for (const a of ADDONS) {
      const spec = specWithAddOns([{ id: a.id, qty: a.defaultQty }]);
      const priced = priceBom(finalizeBom(applyAddOns(spec, [])));
      expect(priced.items.length, a.id).toBeGreaterThan(0);
      // WAF's request line is legitimately free at 10M/month or less
      const unpriced = priced.items.filter((i) => i.monthlyThb == null);
      expect(unpriced.map((i) => i.catalogKey), a.id).toEqual([]);
    }
  });
});
