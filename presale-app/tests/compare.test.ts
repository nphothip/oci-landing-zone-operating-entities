import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { EnvName, GenerateResult, PricedBomItem } from "@/lib/domain/types";
import { TEMPLATES, TEMPLATE_LIST } from "@/lib/templates";
import { bankingShowcaseSpec } from "@/lib/templates/banking-preset";
import { finalizeBom } from "@/lib/bom/env";
import { applyAddOns } from "@/lib/bom/addons";
import { priceBom } from "@/lib/pricing/resolve";
import { CATALOG } from "@/lib/pricing/catalog";
import { buildDiagrams } from "@/lib/diagrams";
import { mapItem } from "@/lib/pricing/compare/map";
import { buildComparison, getRateCards, providerIds } from "@/lib/pricing/compare/compute";
import { AIS_OCI_COEFFICIENT, type CompareProvider } from "@/lib/pricing/compare/types";
import { buildCompareWorkbook } from "@/lib/export/compare-xlsx";
import { workbookToXlsx } from "@/lib/export/xlsx";

const fx = (n: string) => ({ path: `generated/${n}`, content: readFileSync(path.join(__dirname, "fixtures", n), "utf8") });
const FILES = [fx("iam.json"), fx("network.json"), fx("observability_cis1.json")];
const PROVIDERS: CompareProvider[] = providerIds();
const CARDS = getRateCards();

function fakeResult(template: keyof typeof TEMPLATES = "web_app"): GenerateResult {
  const tpl = TEMPLATES[template];
  const spec = tpl.defaults();
  spec.environments = ["prod", "preprod"] as EnvName[];
  return {
    spec,
    factoryConfig: {} as never,
    bom: priceBom(finalizeBom(applyAddOns(spec, tpl.buildBom(spec)))),
    diagrams: buildDiagrams(spec, FILES),
    lac: { files: FILES },
    assumptions: tpl.assumptions(spec),
    warnings: [],
  };
}

function fakeItem(catalogKey: string, quantity: number, monthlyMetricQty: number): PricedBomItem {
  return {
    catalogKey,
    label: { th: catalogKey, en: catalogKey },
    category: "compute",
    quantity,
    unit: "x",
    monthlyMetricQty,
    deployedByLz: false,
    sku: CATALOG[catalogKey]?.sku ?? null,
    unitPriceThb: 1,
    metric: "m",
    monthlyThb: 100,
  };
}

describe("multi-cloud mapping — coverage and honesty", () => {
  it("maps or explicitly excludes EVERY catalog key on every provider — nothing silent", () => {
    for (const key of Object.keys(CATALOG)) {
      for (const p of PROVIDERS) {
        const c = mapItem(p, fakeItem(key, 2, 1488), CARDS);
        if (c.excluded) {
          expect(c.reason.length, `${p}/${key}`).toBeGreaterThan(10);
          expect(c.reason, `${p}/${key} hit the fallback — add a real mapping`).not.toContain("ยังไม่มี mapping สำหรับ");
        } else {
          expect(Number.isFinite(c.monthly), `${p}/${key}`).toBe(true);
          expect(c.monthly, `${p}/${key}`).toBeGreaterThanOrEqual(0);
          expect(c.service.length, `${p}/${key}`).toBeGreaterThan(2);
        }
      }
    }
  });

  it("converts OCPU-hours to vCPU-hours (×2) for compute", () => {
    const c = mapItem("aws", fakeItem("compute_e5_ocpu", 2, 2 * 744), CARDS);
    expect(c.excluded).toBe(false);
    if (!c.excluded) {
      expect(c.qty).toBe(2 * 744 * 2);
      expect(c.monthly).toBeCloseTo(2 * 744 * 2 * CARDS.aws.rates.vcpu_hour.price, 2);
      expect(c.note).toContain("1 OCPU = 2 vCPU");
    }
  });

  it("converts database ECPU-hours to vCPU-hours (÷2) and prices RAM alongside", () => {
    const c = mapItem("aws", mapDbItem(), CARDS);
    expect(c.excluded).toBe(false);
    if (!c.excluded) {
      const vcpuHours = (4 * 744) / 2;
      const expected = vcpuHours * CARDS.aws.rates.pg_vcpu_hour.price + vcpuHours * 8 * CARDS.aws.rates.pg_ram_gb_hour.price;
      expect(c.qty).toBe(vcpuHours);
      expect(c.monthly).toBeCloseTo(Math.round(expected * 100) / 100, 2);
    }
    function mapDbItem() {
      return fakeItem("adb_ecpu", 4, 4 * 744);
    }
  });

  // VPN and NLB are free on AIS/OCI. Wherever a provider publishes a price for
  // them the comparison must charge it; where a provider publishes none, the
  // cell must say so rather than quietly score a free win for that provider.
  it("charges for VPN/NLB wherever the provider publishes a price, and says so where it does not", () => {
    let priced = 0;
    for (const p of PROVIDERS) {
      const card = CARDS[p];
      const hasVpnRate = ["vpn_tunnel_hour", "vpn_gw_hour", "vpn_conn_hour", "vpn_mo"].some((id) => card.rates[id]);
      const vpn = mapItem(p, fakeItem("vpn_ipsec", 1, 0), CARDS);
      if (hasVpnRate) {
        expect(vpn.excluded, `${p} publishes a VPN rate so it must be charged`).toBe(false);
        if (!vpn.excluded) {
          expect(vpn.monthly, `${p} vpn`).toBeGreaterThan(0);
          priced++;
        }
      } else {
        expect(vpn.excluded, `${p} publishes no VPN rate so the cell must be an explicit exclusion`).toBe(true);
      }
    }
    expect(priced, "at least the global clouds must charge for VPN").toBeGreaterThanOrEqual(3);

    const nlb = mapItem("aws", fakeItem("nlb", 2, 0), CARDS);
    expect(nlb.excluded).toBe(false);
    if (!nlb.excluded) expect(nlb.monthly).toBeCloseTo(2 * 744 * CARDS.aws.rates.nlb_hour.price, 2);
  });

  it("keeps Oracle-only services out of competitor totals instead of faking them", () => {
    for (const key of ["apex_ecpu", "heatwave_node", "genai_large_10k", "oda_requests"]) {
      for (const p of PROVIDERS) {
        expect(mapItem(p, fakeItem(key, 1, 744), CARDS).excluded, `${p}/${key}`).toBe(true);
      }
    }
    // Oracle EE license-included: nearest on AWS only
    expect(mapItem("aws", fakeItem("base_db_ecpu", 4, 2976), CARDS).excluded).toBe(false);
    expect(mapItem("gcp", fakeItem("base_db_ecpu", 4, 2976), CARDS).excluded).toBe(true);
    expect(mapItem("huawei", fakeItem("base_db_ecpu", 4, 2976), CARDS).excluded).toBe(true);
  });

  it("flags cross-border transfer on non-Thai regions and Thai→Thai on Thai regions", () => {
    const gcpEgress = mapItem("gcp", fakeItem("egress_apac_gb", 1000, 1000), CARDS);
    expect(gcpEgress.excluded).toBe(false);
    if (!gcpEgress.excluded) expect(gcpEgress.note).toMatch(/ข้ามประเทศ|สิงคโปร์/);

    const awsEgress = mapItem("aws", fakeItem("egress_apac_gb", 1000, 1000), CARDS);
    expect(awsEgress.excluded).toBe(false);
    if (!awsEgress.excluded && CARDS.aws.inCountry) expect(awsEgress.note).toContain("ไทย→ไทย");

    const gcpLink = mapItem("gcp", fakeItem("fastconnect_1g", 1, 744), CARDS);
    if (!gcpLink.excluded) expect(gcpLink.note).toMatch(/carrier.*ไม่รวม/);
  });

  // A firewall bundled free with every VM is a security group, not an NGFW with
  // L7/IPS/TLS inspection. Pricing our NFW against it invents a five-figure
  // monthly "saving" that does not exist — this was a real defect.
  it("refuses to compare a managed NGFW against a free per-VM packet filter", () => {
    const freeFw = PROVIDERS.filter((p) => CARDS[p].rates.fw_mo?.price === 0);
    expect(freeFw.length, "expected at least one provider bundling a free firewall").toBeGreaterThan(0);
    for (const p of freeFw) {
      const c = mapItem(p, fakeItem("nfw_instance", 1, 744), CARDS);
      expect(c.excluded, `${p} must not price a free packet filter as an NGFW`).toBe(true);
      if (c.excluded) expect(c.reason).toMatch(/security group|NGFW/);
      expect(mapItem(p, fakeItem("nfw_data_gb", 2048, 2048), CARDS).excluded, `${p} nfw data`).toBe(true);
    }
    // A genuinely paid managed firewall still gets compared.
    const paidFw = PROVIDERS.filter((p) => (CARDS[p].rates.fw_mo?.price ?? 0) > 0 || CARDS[p].rates.fw_endpoint_hour);
    expect(paidFw.length).toBeGreaterThan(0);
    for (const p of paidFw) expect(mapItem(p, fakeItem("nfw_instance", 1, 744), CARDS).excluded, p).toBe(false);
  });

  // ADB's ECPU price bundles the Oracle EE licence; managed PostgreSQL does not.
  // Most of that gap is licence, and the cell must say so or the comparison
  // reads as a pure infrastructure premium.
  it("flags the licence difference when pricing Autonomous DB against open-source Postgres", () => {
    for (const p of PROVIDERS) {
      const c = mapItem(p, fakeItem("adb_ecpu", 4, 4 * 744), CARDS);
      if (c.excluded) continue;
      expect(c.note, `${p} adb note`).toContain("⚠");
      expect(c.note, `${p} adb note`).toMatch(/license|licence/i);
      expect(c.service, `${p} adb service`).toMatch(/PostgreSQL/);
    }
  });

  it("keeps VMware honest: no AWS/Huawei offer, GCVE with spec caveat on GCP", () => {
    expect(mapItem("aws", fakeItem("ocvs_node_3yr", 3, 3 * 744), CARDS).excluded).toBe(true);
    expect(mapItem("huawei", fakeItem("ocvs_node_3yr", 3, 3 * 744), CARDS).excluded).toBe(true);
    const gcve = mapItem("gcp", fakeItem("ocvs_node_3yr", 3, 3 * 744), CARDS);
    expect(gcve.excluded).toBe(false);
    if (!gcve.excluded) expect(gcve.note).toContain("commit 3 ปี");
  });
});

describe("comparison engine — apples-to-apples totals", () => {
  const result = fakeResult();
  const cmp = buildComparison(result, 36);

  it("derives the OCI column from the AIS/OCI coefficient", () => {
    for (const l of cmp.lines) {
      // The NFW SKU is deliberately overridden — AIS still bakes Oracle's older
      // $3.26/h list while Oracle now charges $2.75/h (see the next test).
      if (l.catalogKey === "nfw_instance") continue;
      if (l.aisThb == null) expect(l.ociUsd, l.catalogKey).toBeNull();
      else expect(l.ociUsd, l.catalogKey).toBeCloseTo(l.aisThb / AIS_OCI_COEFFICIENT, 2);
    }
  });

  // Oracle cut the Network Firewall list to $2.75/h; AIS's THB list still
  // reflects $3.26/h. Quoting the coefficient blindly would overstate Oracle's
  // OWN price by 18.5% on the landing zone's single biggest cost line.
  it("uses Oracle's current price where AIS lags a revision", () => {
    const nfwSpec = TEMPLATES.web_app.defaults();
    nfwSpec.hub.kind = "hub_b";
    const bom = priceBom(finalizeBom(TEMPLATES.web_app.buildBom(nfwSpec)));
    const r: GenerateResult = { spec: nfwSpec, factoryConfig: {} as never, bom, diagrams: [], lac: { files: [] }, assumptions: [], warnings: [] };
    const line = buildComparison(r, 36).lines.find((l) => l.catalogKey === "nfw_instance");
    expect(line, "hub_b must carry an NFW line").toBeTruthy();
    expect(line!.ociUsd).toBeCloseTo(2.75 * 744, 2); // one NFW-month at Oracle's current list
    expect(line!.ociUsd!).toBeLessThan(line!.aisThb! / AIS_OCI_COEFFICIENT); // strictly cheaper than the stale coefficient
  });

  it("pairs every provider subtotal with the AIS subtotal of the SAME lines", () => {
    for (const p of cmp.totals) {
      let usd = 0;
      let ais = 0;
      for (const l of cmp.lines) {
        const c = l.cells[p.provider];
        if (!c.excluded && l.aisThb != null) {
          usd += c.monthly;
          ais += l.aisThb;
        }
      }
      expect(p.comparableNative, p.provider).toBeCloseTo(Math.round(usd * 100) / 100, 1);
      expect(p.aisComparableThb, p.provider).toBeCloseTo(Math.round(ais * 100) / 100, 1);
      expect(p.aisComparableThb, p.provider).toBeLessThanOrEqual(cmp.aisTotalThb + 0.01);
      if (p.deltaPct != null) {
        expect(p.deltaPct).toBeCloseTo(((p.comparableThb - p.aisComparableThb) / p.aisComparableThb) * 100, 1);
      }
    }
  });

  // FX moves USD providers only. A Thai cloud quoting THB must be completely
  // unaffected by the exchange rate — that immunity is one of its selling
  // points, and hiding it behind an FX conversion would misrepresent the deal.
  it("applies FX to USD providers only, never to THB providers", () => {
    const double = buildComparison(result, 72);
    let usdSeen = 0;
    let thbSeen = 0;
    for (let i = 0; i < cmp.totals.length; i++) {
      const base = cmp.totals[i];
      const dbl = double.totals[i];
      expect(dbl.comparableNative, base.provider).toBeCloseTo(base.comparableNative, 2);
      expect(dbl.aisComparableThb, base.provider).toBeCloseTo(base.aisComparableThb, 2);
      if (base.currency === "USD") {
        expect(dbl.comparableThb, base.provider).toBeCloseTo(base.comparableThb * 2, 1);
        usdSeen++;
      } else {
        expect(dbl.comparableThb, base.provider).toBeCloseTo(base.comparableThb, 2);
        expect(base.comparableThb, base.provider).toBeCloseTo(base.comparableNative, 2);
        thbSeen++;
      }
    }
    expect(usdSeen, "expected USD-quoting providers").toBeGreaterThan(0);
    expect(thbSeen, "expected THB-quoting Thai providers").toBeGreaterThan(0);
  });

  it("guards against a nonsense FX rate", () => {
    expect(buildComparison(result, 0).fxRate).toBe(36);
    expect(buildComparison(result, NaN).fxRate).toBe(36);
  });

  it("carries region + in-country flags for the transfer/latency story", () => {
    const by = (id: string) => cmp.totals.find((p) => p.provider === id)!;
    expect(by("aws").inCountry).toBe(true); // ap-southeast-7 Bangkok
    expect(by("huawei").inCountry).toBe(true); // AP-Bangkok
    expect(by("nt").inCountry).toBe(true);
    expect(by("nipa").inCountry).toBe(true);
    expect(by("gcp").inCountry).toBe(false); // no Thai GCP region — must show cross-border
    expect(by("azure").inCountry).toBe(false); // Thailand Central not GA with prices
    expect(cmp.disclaimers.some((d) => d.th.includes("ข้ามประเทศ"))).toBe(true);
    // In-country providers must be listed first so the Thai option leads.
    const firstOverseas = cmp.totals.findIndex((p) => !p.inCountry);
    const lastInCountry = cmp.totals.map((p) => p.inCountry).lastIndexOf(true);
    expect(lastInCountry).toBeLessThan(firstOverseas);
  });

  it("flags the cross-border cost story on overseas hybrid links and egress", () => {
    const overseas = cmp.totals.filter((p) => !p.inCountry).map((p) => p.provider);
    expect(overseas.length).toBeGreaterThan(0);
    for (const p of overseas) {
      const link = mapItem(p, fakeItem("fastconnect_1g", 1, 744), CARDS);
      if (!link.excluded) expect(link.note, `${p} link`).toMatch(/ข้ามประเทศ/);
      const egress = mapItem(p, fakeItem("egress_apac_gb", 1000, 1000), CARDS);
      if (!egress.excluded) expect(egress.note, `${p} egress`).toMatch(/ข้ามประเทศ|ต่างประเทศ/);
    }
    for (const p of cmp.totals.filter((x) => x.inCountry).map((x) => x.provider)) {
      const egress = mapItem(p, fakeItem("egress_apac_gb", 1000, 1000), CARDS);
      if (!egress.excluded) expect(egress.note, `${p} egress`).toContain("ไทย→ไทย");
    }
  });

  it("produces finite numbers for every template and the banking showcase", () => {
    const specs = [
      ...TEMPLATE_LIST.map((t) => TEMPLATES[t.id].defaults()),
      bankingShowcaseSpec(),
    ];
    for (const spec of specs) {
      const bom = priceBom(finalizeBom(applyAddOns(spec, TEMPLATES[spec.template].buildBom(spec))));
      const r: GenerateResult = { spec, factoryConfig: {} as never, bom, diagrams: [], lac: { files: [] }, assumptions: [], warnings: [] };
      const c = buildComparison(r, 36);
      for (const p of c.totals) {
        expect(Number.isFinite(p.comparableThb), `${spec.template}/${p.provider}`).toBe(true);
        expect(p.comparableThb, `${spec.template}/${p.provider}`).toBeGreaterThanOrEqual(0);
        expect(p.mappedLines, `${spec.template}/${p.provider} maps nothing`).toBeGreaterThan(0);
      }
      // The hyperscalers must cover the bulk of a normal BOM.
      for (const id of ["aws", "azure"]) {
        const p = c.totals.find((x) => x.provider === id)!;
        expect(p.mappedLines / c.lines.length, `${spec.template}/${id}`).toBeGreaterThan(0.5);
      }
    }
  });

  it("every rate in the card has a source URL and a sane magnitude for its currency", () => {
    for (const card of PROVIDERS.map((p) => CARDS[p])) {
      for (const rate of Object.values(card.rates)) {
        expect(rate.source, `${card.provider}/${rate.id}`).toMatch(/^https?:\/\//);
        expect(rate.price, `${card.provider}/${rate.id}`).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(rate.price), `${card.provider}/${rate.id}`).toBe(true);
        // THB figures are ~35x the USD ones, so the ceiling has to follow suit.
        const ceiling = card.currency === "THB" ? 400_000 : 10_000;
        expect(rate.price, `${card.provider}/${rate.id} suspiciously large for ${card.currency}`).toBeLessThan(ceiling);
      }
      // A vCPU-hour costs cents (USD) or a few baht (THB) — never dollars.
      const vcpu = card.rates.vcpu_hour;
      expect(vcpu, `${card.provider} must publish a per-vCPU rate`).toBeTruthy();
      const [lo, hi] = card.currency === "THB" ? [0.15, 7] : [0.005, 0.2];
      expect(vcpu.price, `${card.provider} vcpu_hour (${card.currency})`).toBeGreaterThan(lo);
      expect(vcpu.price, `${card.provider} vcpu_hour (${card.currency})`).toBeLessThan(hi);
    }
  });

  // "-70% vs AIS" is useless — and dangerous — without "because of these lines".
  it("attributes each delta to the lines that actually cause it", () => {
    for (const p of cmp.totals) {
      if (p.mappedLines === 0) continue;
      expect(p.gapDrivers.length, p.provider).toBeGreaterThan(0);
      // ranked by absolute impact, and each share is a real percentage
      for (let i = 1; i < p.gapDrivers.length; i++) {
        expect(Math.abs(p.gapDrivers[i].deltaThb)).toBeLessThanOrEqual(Math.abs(p.gapDrivers[i - 1].deltaThb));
      }
      for (const d of p.gapDrivers) {
        expect(d.deltaThb, `${p.provider}/${d.catalogKey}`).toBeCloseTo(d.providerThb - d.aisThb, 1);
        expect(d.sharePct, `${p.provider}/${d.catalogKey}`).toBeGreaterThan(0);
        expect(d.sharePct, `${p.provider}/${d.catalogKey}`).toBeLessThanOrEqual(100);
      }
      // the top drivers must explain a meaningful chunk of the total gap
      const covered = p.gapDrivers.reduce((a, d) => a + d.sharePct, 0);
      expect(covered, `${p.provider} drivers explain too little of the gap`).toBeGreaterThan(50);
      // every driver has to be a line the provider genuinely priced
      for (const d of p.gapDrivers) {
        expect(cmp.lines.find((l) => l.catalogKey === d.catalogKey)?.cells[p.provider].excluded, `${p.provider}/${d.catalogKey}`).toBe(false);
      }
    }
  });

  it("declares a currency and an as-of date for every provider", () => {
    for (const p of PROVIDERS) {
      const card = CARDS[p];
      expect(["THB", "USD"], p).toContain(card.currency);
      expect(card.asOf, p).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(card.label.length, p).toBeGreaterThan(2);
      expect(card.region.length, p).toBeGreaterThan(2);
    }
  });

  // A Thai cloud publishing only VM packages must not look artificially cheap:
  // its total covers fewer lines, and the UI/export lean on mappedLines to say so.
  it("reports honest coverage for partial-catalogue providers", () => {
    const partial = cmp.totals.filter((p) => p.mappedLines / cmp.lines.length < 0.5);
    for (const p of partial) {
      expect(p.excludedLines.length, `${p.provider} must explain what it cannot price`).toBeGreaterThan(0);
      for (const x of p.excludedLines) expect(x.reason.length, `${p.provider}/${x.catalogKey}`).toBeGreaterThan(10);
      // its AIS baseline must shrink to match, never stay at the full total
      expect(p.aisComparableThb, p.provider).toBeLessThan(cmp.aisTotalThb);
    }
  });
});

describe("comparison workbook", () => {
  it("builds four sheets and a valid xlsx package", async () => {
    const result = fakeResult();
    const cmp = buildComparison(result, 36);
    const sheets = buildCompareWorkbook(cmp, CARDS, result);
    expect(sheets.map((s) => s.name)).toEqual(["Comparison", "Summary", "Rate Card", "Assumptions"]);
    expect(sheets[0].freezeRow).toBeGreaterThan(0);

    const blob = await workbookToXlsx(sheets);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file("xl/worksheets/sheet4.xml")).toBeTruthy();
    const sheet1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet1).toContain(`เปรียบเทียบราคา ${cmp.providers.length + 2} ค่าย`);
    // every provider gets a value column and a service column
    expect(sheets[0].cols.length).toBe(7 + cmp.providers.length * 2);
  });
});
