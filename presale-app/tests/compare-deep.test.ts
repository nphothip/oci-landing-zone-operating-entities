import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { EnvName, GenerateResult, SolutionSpec } from "@/lib/domain/types";
import { TEMPLATES, TEMPLATE_LIST } from "@/lib/templates";
import { bankingShowcaseSpec } from "@/lib/templates/banking-preset";
import { finalizeBom, applyEnvOverride } from "@/lib/bom/env";
import { applyAddOns, ADDONS } from "@/lib/bom/addons";
import { applyBurst } from "@/lib/bom/burst";
import { applyTraffic } from "@/lib/bom/traffic";
import { priceBom } from "@/lib/pricing/resolve";
import { buildComparison, getRateCards, providerIds } from "@/lib/pricing/compare/compute";
import { buildCompareWorkbook } from "@/lib/export/compare-xlsx";
import { workbookToXlsx } from "@/lib/export/xlsx";

// Adversarial sweep over the comparison: every template, every add-on, every
// provider, plus the shapes of the produced Excel. These are the cases a
// presale hits in a real meeting, not the happy path the unit tests cover.

const PROVIDERS = providerIds();
const CARDS = getRateCards();

function resultFor(spec: SolutionSpec): GenerateResult {
  const tpl = TEMPLATES[spec.template];
  const bom = priceBom(
    finalizeBom(applyAddOns(spec, applyEnvOverride(spec, applyTraffic(spec, applyBurst(spec, tpl.buildBom(spec)))))),
  );
  return { spec, factoryConfig: {} as never, bom, diagrams: [], lac: { files: [] }, assumptions: [], warnings: [] };
}

/** Every spec a user can realistically produce from the UI. */
function allSpecs(): { name: string; spec: SolutionSpec }[] {
  const out: { name: string; spec: SolutionSpec }[] = [];
  for (const t of TEMPLATE_LIST) {
    out.push({ name: t.id, spec: TEMPLATES[t.id].defaults() });
    // multi-env variant exercises per-env scaling through the comparison
    const multi = TEMPLATES[t.id].defaults();
    if (multi.sizing.kind !== "enterprise_lz") {
      multi.environments = ["prod", "preprod", "dev"] as EnvName[];
      out.push({ name: `${t.id}+3env`, spec: multi });
    }
  }
  out.push({ name: "banking", spec: bankingShowcaseSpec() });
  // every add-on switched on at once — the widest possible BOM
  const loaded = TEMPLATES.web_app.defaults();
  loaded.addOns = ADDONS.map((a) => ({ id: a.id, qty: a.defaultQty }));
  out.push({ name: "web_app+all-addons", spec: loaded });
  // hub variants change which LZ lines exist at all
  for (const kind of ["hub_a", "hub_b", "hub_c", "hub_e"] as const) {
    const s = TEMPLATES.web_app.defaults();
    s.hub.kind = kind;
    out.push({ name: `web_app/${kind}`, spec: s });
  }
  return out;
}

describe("comparison sweep — every spec × every provider", () => {
  const specs = allSpecs();

  it(`produces finite, non-negative money for all ${specs.length} specs`, () => {
    // Guard against the sweep silently shrinking to nothing: this must stay a
    // real matrix (~5k cells), not a handful of happy-path checks.
    let cells = 0;
    for (const { spec } of specs) cells += buildComparison(resultFor(spec), 36).lines.length * PROVIDERS.length;
    expect(cells, "sweep coverage collapsed").toBeGreaterThan(3000);

    for (const { name, spec } of specs) {
      const cmp = buildComparison(resultFor(spec), 36);
      expect(cmp.aisTotalThb, name).toBeGreaterThan(0);
      expect(Number.isFinite(cmp.ociTotalUsd), name).toBe(true);
      for (const l of cmp.lines) {
        for (const p of PROVIDERS) {
          const c = l.cells[p];
          if (c.excluded) continue;
          expect(Number.isFinite(c.monthly), `${name}/${p}/${l.catalogKey} monthly`).toBe(true);
          expect(c.monthly, `${name}/${p}/${l.catalogKey} monthly`).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(c.qty), `${name}/${p}/${l.catalogKey} qty`).toBe(true);
          expect(Number.isFinite(c.unitPrice), `${name}/${p}/${l.catalogKey} unitPrice`).toBe(true);
        }
      }
      for (const p of cmp.totals) {
        expect(Number.isFinite(p.comparableNative), `${name}/${p.provider}`).toBe(true);
        expect(Number.isFinite(p.comparableThb), `${name}/${p.provider}`).toBe(true);
        expect(p.comparableNative, `${name}/${p.provider}`).toBeGreaterThanOrEqual(0);
        if (p.deltaPct != null) expect(Number.isFinite(p.deltaPct), `${name}/${p.provider}`).toBe(true);
      }
    }
  });

  it("never lets a provider subtotal outrun the AIS baseline it is paired with", () => {
    for (const { name, spec } of specs) {
      const cmp = buildComparison(resultFor(spec), 36);
      for (const p of cmp.totals) {
        // The paired AIS baseline is a subset of the full AIS total, always.
        expect(p.aisComparableThb, `${name}/${p.provider}`).toBeLessThanOrEqual(cmp.aisTotalThb + 0.01);
        // Every mapped+priced line is counted on both sides or neither.
        const paired = cmp.lines.filter((l) => !l.cells[p.provider].excluded && l.aisThb != null);
        expect(p.mappedLines, `${name}/${p.provider}`).toBeGreaterThanOrEqual(paired.length);
        const sum = paired.reduce((a, l) => a + (l.aisThb ?? 0), 0);
        expect(p.aisComparableThb, `${name}/${p.provider}`).toBeCloseTo(Math.round(sum * 100) / 100, 1);
      }
    }
  });

  it("accounts for every BOM line on every provider — mapped + excluded = total", () => {
    for (const { name, spec } of specs) {
      const cmp = buildComparison(resultFor(spec), 36);
      for (const p of cmp.totals) {
        expect(p.mappedLines + p.excludedLines.length, `${name}/${p.provider}`).toBe(cmp.lines.length);
      }
    }
  });

  it("keeps hyperscaler coverage above half the BOM on every template", () => {
    for (const { name, spec } of specs) {
      const cmp = buildComparison(resultFor(spec), 36);
      for (const id of ["aws", "gcp", "azure"]) {
        const p = cmp.totals.find((x) => x.provider === id)!;
        expect(p.mappedLines / cmp.lines.length, `${name}/${id}`).toBeGreaterThan(0.5);
      }
    }
  });

  it("gives every excluded cell a reason a presale can read aloud", () => {
    const seen = new Set<string>();
    for (const { spec } of specs) {
      const cmp = buildComparison(resultFor(spec), 36);
      for (const p of cmp.totals) {
        for (const x of p.excludedLines) {
          expect(x.reason.length, `${p.provider}/${x.catalogKey}`).toBeGreaterThan(15);
          expect(x.reason, `${p.provider}/${x.catalogKey}`).not.toMatch(/undefined|NaN|\[object/);
          seen.add(x.reason);
        }
      }
    }
    expect(seen.size, "expected a variety of distinct exclusion reasons").toBeGreaterThan(8);
  });

  it("survives a zero-cost and a single-environment BOM without dividing by zero", () => {
    const s = TEMPLATES.web_app.defaults();
    s.environments = ["prod"] as EnvName[];
    s.hub.kind = "hub_e";
    s.hub.connectivity = "none";
    const cmp = buildComparison(resultFor(s), 36);
    for (const p of cmp.totals) {
      expect(Number.isFinite(p.comparableThb), p.provider).toBe(true);
      if (p.deltaPct != null) expect(Number.isFinite(p.deltaPct), p.provider).toBe(true);
    }
  });

  it("holds the FX/currency contract across the whole sweep", () => {
    for (const { name, spec } of specs.slice(0, 8)) {
      const r = resultFor(spec);
      const a = buildComparison(r, 30);
      const b = buildComparison(r, 40);
      for (let i = 0; i < a.totals.length; i++) {
        const [x, y] = [a.totals[i], b.totals[i]];
        expect(y.comparableNative, `${name}/${x.provider}`).toBeCloseTo(x.comparableNative, 2);
        if (x.currency === "THB") expect(y.comparableThb, `${name}/${x.provider}`).toBeCloseTo(x.comparableThb, 2);
        else expect(y.comparableThb / x.comparableThb, `${name}/${x.provider}`).toBeCloseTo(40 / 30, 3);
      }
    }
  });
});

describe("comparison workbook — file-level correctness", () => {
  // Notes now carry ⚠, — and & characters; unescaped they produce a file Excel
  // refuses to open, which a customer would discover, not us.
  it("escapes XML special characters in Thai notes and service names", async () => {
    const spec = TEMPLATES.web_app.defaults();
    spec.customerName = 'Acme & Co <"test">';
    const cmp = buildComparison(resultFor(spec), 36);
    const zip = await JSZip.loadAsync(await (await workbookToXlsx(buildCompareWorkbook(cmp, CARDS, resultFor(spec)))).arrayBuffer());

    for (const name of Object.keys(zip.files).filter((f) => f.endsWith(".xml"))) {
      const xml = await zip.file(name)!.async("string");
      // A raw & that is not the start of an entity means broken XML.
      const badAmp = xml.match(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/g);
      expect(badAmp, `${name} has unescaped &`).toBeNull();
      // Text nodes must not contain a raw < that isn't a tag delimiter.
      expect(xml.match(/<t xml:space="preserve">[^<]*<(?!\/t>)/g), `${name} has unescaped < in text`).toBeNull();
    }
  });

  it("writes one value + one service column per provider, and a filter that spans them", async () => {
    const spec = TEMPLATES.web_app.defaults();
    const r = resultFor(spec);
    const cmp = buildComparison(r, 36);
    const sheets = buildCompareWorkbook(cmp, CARDS, r);
    const comparison = sheets[0];

    // 6 fixed columns + 2 per provider + 1 notes column
    expect(comparison.cols.length).toBe(7 + PROVIDERS.length * 2);
    const [, from, to] = comparison.autoFilter!.match(/^A(\d+):([A-Z]+)\d+$/) ?? [];
    expect(from).toBeTruthy();
    expect(comparison.freezeRow).toBe(Number(from));

    // The filter's last column must actually exist in the sheet.
    const colIndex = to!.split("").reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0);
    expect(colIndex).toBeLessThanOrEqual(comparison.cols.length);

    // Header row names every provider with its currency.
    const header = comparison.rows[Number(from) - 1];
    const headerText = header.map((c) => (c && typeof c.v === "string" ? c.v : "")).join("|");
    for (const p of PROVIDERS) {
      expect(headerText, `header missing ${p}`).toContain(CARDS[p].label);
      expect(headerText).toContain(`${CARDS[p].label} (${CARDS[p].currency})`);
    }
  });

  it("puts every rate in the Rate Card sheet with its source", async () => {
    const spec = TEMPLATES.web_app.defaults();
    const r = resultFor(spec);
    const sheets = buildCompareWorkbook(buildComparison(r, 36), CARDS, r);
    const rateSheet = sheets.find((s) => s.name === "Rate Card")!;
    const flat = rateSheet.rows.map((row) => row.map((c) => (c && typeof c.v === "string" ? c.v : "")).join("|")).join("\n");

    let expected = 0;
    for (const p of PROVIDERS) expected += Object.keys(CARDS[p].rates).length;
    // header + title + blank rows are extra; every rate must appear
    const httpRows = (flat.match(/https?:\/\//g) ?? []).length;
    expect(httpRows, "every rate needs its source URL in the sheet").toBeGreaterThanOrEqual(expected);
    // quote-only providers are named so nobody thinks we forgot them
    expect(flat).toContain("INET");
    expect(flat).toContain("Cloud HM");
  });

  it("lists the gap drivers in the Summary sheet", async () => {
    const spec = TEMPLATES.web_app.defaults();
    const r = resultFor(spec);
    const cmp = buildComparison(r, 36);
    const summary = buildCompareWorkbook(cmp, CARDS, r).find((s) => s.name === "Summary")!;
    const flat = summary.rows.map((row) => row.map((c) => (c && typeof c.v === "string" ? c.v : "")).join("|")).join("\n");
    expect(flat).toContain("อะไรทำให้ราคาต่างกัน");
    for (const p of cmp.totals) {
      if (p.gapDrivers.length > 0) expect(flat, `${p.provider} driver missing`).toContain(p.gapDrivers[0].label.th);
    }
  });

  it("produces a workbook Excel can open for the widest BOM we can build", async () => {
    const spec = TEMPLATES.web_app.defaults();
    spec.environments = ["prod", "preprod", "uat", "dev"] as EnvName[];
    spec.addOns = ADDONS.map((a) => ({ id: a.id, qty: a.defaultQty }));
    const r = resultFor(spec);
    const sheets = buildCompareWorkbook(buildComparison(r, 36), CARDS, r);
    const zip = await JSZip.loadAsync(await (await workbookToXlsx(sheets)).arrayBuffer());

    // Structural requirements of the OOXML package
    for (const required of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml"]) {
      expect(zip.file(required), `missing ${required}`).toBeTruthy();
    }
    for (let i = 1; i <= sheets.length; i++) expect(zip.file(`xl/worksheets/sheet${i}.xml`), `sheet${i}`).toBeTruthy();

    // Declared style counts must match the actual xf entries or Excel repairs.
    const styles = await zip.file("xl/styles.xml")!.async("string");
    const declared = Number(styles.match(/<cellXfs count="(\d+)">/)![1]);
    const actual = (styles.match(/<xf [^>]*\/>|<xf [^>]*>[\s\S]*?<\/xf>/g) ?? []).length - 1; // minus cellStyleXfs
    expect(actual).toBe(declared);

    // Every style index a cell references must exist.
    for (let i = 1; i <= sheets.length; i++) {
      const xml = await zip.file(`xl/worksheets/sheet${i}.xml`)!.async("string");
      for (const m of xml.matchAll(/ s="(\d+)"/g)) expect(Number(m[1]), `sheet${i} style index`).toBeLessThan(declared);
    }
  });
});
