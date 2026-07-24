import type { GenerateResult, LocalizedText } from "@/lib/domain/types";
import rateFile from "./rates.json";
import { mapItem } from "./map";
import {
  AIS_OCI_COEFFICIENT,
  type CompareLine,
  type CompareProvider,
  type CompareResult,
  type Confidence,
  type GapDriver,
  type ProviderTotal,
  type RateCardFile,
} from "./types";

// Builds the multi-cloud comparison from a priced GenerateResult. Pure and
// synchronous — same BOM + same fx always yields the same table, and the only
// data source is the committed rate card (transparent, versioned, reviewable).

const CARDS = rateFile as unknown as RateCardFile;
const CONF_ORDER: Record<Confidence, number> = { verified: 0, derived: 1, estimate: 2 };

/**
 * Oracle's CURRENT global USD unit price for SKUs where AIS still bakes an
 * older Oracle list (verified against apexapps.oracle.com cetools, 2026-07-24:
 * 7/8 sampled SKUs matched the coefficient exactly; NFW did not — Oracle cut
 * it to $2.75/h while AIS still reflects $3.26/h). Without this the OCI column
 * would overstate Oracle's own list by 18.5% on the LZ's dominant cost line.
 */
const OCI_USD_UNIT_OVERRIDES: Record<string, number> = {
  B95403: 2.75, // OCI Network Firewall — instance-hour
};

const L = (th: string, en: string): LocalizedText => ({ th, en });

/**
 * Providers we researched that publish NO public price list. Recorded so the
 * table can say "checked, quote-only" instead of leaving a presale wondering
 * whether we simply forgot them.
 */
export const QUOTE_ONLY_PROVIDERS: { label: string; note: LocalizedText }[] = [
  {
    label: "INET (Internet Thailand)",
    note: L(
      "ไม่ประกาศราคาสาธารณะ — เว็บไซต์มีแต่ข้อมูลบริการและให้ติดต่อฝ่ายขาย (ตรวจเมื่อ 2026-07-24); แบรนด์ในเครือ OpenLandscape Cloud มีราคาเผยแพร่",
      "No public price list — the site carries service information and a sales contact only (checked 2026-07-24); its sibling brand OpenLandscape Cloud does publish THB prices.",
    ),
  },
  {
    label: "Cloud HM",
    note: L(
      "ไม่ประกาศราคาสาธารณะ — เสนอราคาเป็นรายดีล (Sovereign Cloud บน VMware/Nutanix, 3 ศูนย์ข้อมูลในไทย Tier IV) (ตรวจเมื่อ 2026-07-24)",
      "No public price list — quoted per deal (Sovereign Cloud on VMware/Nutanix, three Tier IV Thai data centres) (checked 2026-07-24).",
    ),
  },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

export function getRateCards(): RateCardFile {
  return CARDS;
}

/** Provider ids in a stable display order: Thai regions first, then the rest. */
export function providerIds(): CompareProvider[] {
  return Object.keys(CARDS).sort((a, b) => {
    const A = CARDS[a];
    const B = CARDS[b];
    if (A.inCountry !== B.inCountry) return A.inCountry ? -1 : 1;
    return A.label.localeCompare(B.label);
  });
}

export function buildComparison(result: GenerateResult, fxRate: number): CompareResult {
  const fx = fxRate > 0 && Number.isFinite(fxRate) ? fxRate : 36;
  const providers = providerIds();

  const lines: CompareLine[] = result.bom.items.map((item) => {
    const aisThb = item.monthlyThb;
    // AIS list THB is Oracle's global USD list × the verified coefficient, so
    // the OCI column is derived exactly — except SKUs where AIS lags an Oracle
    // price revision, which use Oracle's current unit price directly.
    const override = item.sku ? OCI_USD_UNIT_OVERRIDES[item.sku] : undefined;
    const ociUsd =
      override != null && item.monthlyMetricQty > 0
        ? r2(override * item.monthlyMetricQty)
        : aisThb == null
          ? null
          : r2(aisThb / AIS_OCI_COEFFICIENT);

    const cells: CompareLine["cells"] = {};
    for (const p of providers) cells[p] = mapItem(p, item, CARDS);

    return {
      catalogKey: item.catalogKey,
      label: item.label,
      category: item.category,
      env: item.env ?? "shared",
      aisQty: item.quantity,
      aisUnit: item.unit,
      aisThb,
      ociUsd,
      cells,
    };
  });

  const totals: ProviderTotal[] = providers.map((p) => {
    const card = CARDS[p];
    const toThb = (n: number) => (card.currency === "THB" ? n : n * fx);
    let native = 0;
    let aisSubset = 0;
    let mapped = 0;
    let worst: Confidence = "verified";
    const excludedLines: ProviderTotal["excludedLines"] = [];
    const drivers: GapDriver[] = [];

    for (const line of lines) {
      const c = line.cells[p];
      if (c.excluded) {
        excludedLines.push({ catalogKey: line.catalogKey, label: line.label, aisThb: line.aisThb, reason: c.reason });
        continue;
      }
      mapped += 1;
      if (CONF_ORDER[c.confidence] > CONF_ORDER[worst]) worst = c.confidence;
      // Apples-to-apples: only lines AIS itself has a price for enter the
      // subtotal pair. A provider cell without an AIS price still renders in
      // the table, but cannot honestly move a delta.
      if (line.aisThb != null) {
        native += c.monthly;
        aisSubset += line.aisThb;
        const providerThb = r2(toThb(c.monthly));
        drivers.push({
          catalogKey: line.catalogKey,
          label: line.label,
          aisThb: line.aisThb,
          providerThb,
          deltaThb: r2(providerThb - line.aisThb),
          sharePct: 0, // filled once the total gap is known
          note: c.note,
        });
      }
    }

    // THB providers are already in THB; USD providers convert at the user's fx.
    const comparableThb = r2(toThb(native));

    // Rank by absolute gap and keep the lines that explain the bulk of it, so
    // "-70%" always comes with "because of these two lines".
    const totalGap = drivers.reduce((a, d) => a + Math.abs(d.deltaThb), 0);
    const gapDrivers = drivers
      .filter((d) => Math.abs(d.deltaThb) > 0.01)
      .sort((a, b) => Math.abs(b.deltaThb) - Math.abs(a.deltaThb))
      .slice(0, 5)
      .map((d) => ({ ...d, sharePct: totalGap > 0 ? r2((Math.abs(d.deltaThb) / totalGap) * 100) : 0 }));

    return {
      provider: p,
      label: card.label,
      region: card.region,
      inCountry: card.inCountry,
      currency: card.currency,
      asOf: card.asOf,
      comparableNative: r2(native),
      comparableThb,
      aisComparableThb: r2(aisSubset),
      deltaPct: aisSubset > 0 ? r2(((comparableThb - aisSubset) / aisSubset) * 100) : null,
      mappedLines: mapped,
      excludedLines,
      worstConfidence: worst,
      gapDrivers,
    };
  });

  const aisTotalThb = result.bom.totals.monthlyThb;

  return {
    lines,
    totals,
    providers,
    aisTotalThb,
    ociTotalUsd: r2(lines.reduce((a, l) => a + (l.ociUsd ?? 0), 0)),
    fxRate: fx,
    disclaimers: [
      L(
        "ราคาทุกค่ายเป็น on-demand list price สาธารณะ ไม่รวมส่วนลด/committed use — ส่วนลดจริงต่างกันมากในแต่ละดีล",
        "All figures are public on-demand list prices with no discounts/commitments — real discounts vary widely per deal.",
      ),
      L(
        "แสดงราคาตามสกุลเงินที่แต่ละค่ายประกาศจริง (ค่ายไทยเป็นบาท ค่ายต่างชาติเป็น USD) — อัตราแลกเปลี่ยนใช้เฉพาะตอนเทียบส่วนต่างกับ AIS เท่านั้น",
        "Prices are shown in the currency each provider publishes (THB for Thai clouds, USD for globals); FX is applied only to compute the delta against AIS.",
      ),
      L(
        `คอลัมน์ OCI คือ list ราคา global (USD) จากความสัมพันธ์ AIS = OCI × ${AIS_OCI_COEFFICIENT} (ตรวจกับ price API ทั้งสองฝั่ง 2026-07-24: ตรง 7/8 SKU; Network Firewall ใช้ราคาปัจจุบันของ Oracle $2.75/ชม. เพราะ AIS ยังอิง list เก่า $3.26)`,
        `The OCI column is the global USD list via AIS = OCI × ${AIS_OCI_COEFFICIENT} (verified 2026-07-24 against both price APIs: 7/8 SKUs exact; Network Firewall uses Oracle's current $2.75/h where AIS still bakes the older $3.26).`,
      ),
      L(
        "ค่ายที่มี region ในไทยให้บริการแบบไทย→ไทย; ค่ายที่อยู่ต่างประเทศ ทราฟฟิกผู้ใช้และวงจรเชื่อมต่อต้องข้ามประเทศ (latency สูงขึ้น, ค่าวงจรข้ามประเทศไม่รวมในตาราง, และมีประเด็น data residency/PDPA)",
        "Providers with a Thai region serve Thai→Thai; overseas regions add cross-border latency, an uncounted international circuit cost, and data-residency/PDPA considerations.",
      ),
      L(
        "เดือนคิดที่ 744 ชั่วโมงตามแนวทาง OCI/AIS; บางค่ายคิด 730 ชม. ต่างกัน ~1.9% ในทิศที่เป็นผลดีต่อค่ายนั้น",
        "Months are 744 hours per the OCI/AIS convention; providers quoting 730h differ by ~1.9% in their favour.",
      ),
      L(
        "รายการที่เทียบไม่ได้ถูกแยกไว้พร้อมเหตุผล และไม่ถูกนับในผลรวมของทั้งสองฝั่ง (ผลรวมเทียบเฉพาะรายการที่ map ได้จริง)",
        "Non-comparable lines are listed with reasons and excluded from BOTH sides of each subtotal (totals compare only genuinely mapped lines).",
      ),
      L(
        "ค่ายไทยบางรายประกาศราคาเฉพาะแพ็กเกจ VM — คอลัมน์จึงครอบคลุมน้อยกว่าและต้องอ่านคู่กับจำนวนรายการที่เทียบได้",
        "Some Thai providers publish only VM package prices, so their columns cover fewer lines — always read them alongside the mapped-line count.",
      ),
    ],
  };
}
