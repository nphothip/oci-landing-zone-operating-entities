import type { BomCategory, GenerateResult, LocalizedText } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { XS, type XlsxCell, type XlsxSheet } from "./xlsx";

// Builds a presentation-ready BOM workbook (two sheets: BOM + Summary) from a
// GenerateResult. Text is localized via the passed `t` so the Excel matches
// the language the user is viewing.

type T = (x: LocalizedText | string) => string;

const CATEGORY_LABEL: Record<BomCategory, LocalizedText> = {
  landing_zone: { th: "Landing Zone", en: "Landing Zone" },
  compute: { th: "Compute", en: "Compute" },
  database: { th: "Database", en: "Database" },
  network: { th: "Network", en: "Network" },
  storage: { th: "Storage", en: "Storage" },
  ai: { th: "AI Services", en: "AI Services" },
  security: { th: "Security", en: "Security" },
  observability: { th: "Observability", en: "Observability" },
};

const HUB_LABEL: Record<string, string> = {
  hub_a: "HUB A (NFW: DMZ + internal)",
  hub_b: "HUB B (1× NFW)",
  hub_c: "HUB C (trust/untrust NLB + 3rd-party FW)",
  hub_e: "HUB E (no inspection)",
};

export function buildBomWorkbook(result: GenerateResult, t: T): XlsxSheet[] {
  const { bom, spec } = result;
  const templateName = t(TEMPLATES[spec.template].name);
  const priceSourceLabel =
    bom.priceSource === "live"
      ? t({ th: "ราคา live", en: "live prices" })
      : t({ th: `snapshot ${bom.priceFetchedAt.slice(0, 10)}`, en: `snapshot ${bom.priceFetchedAt.slice(0, 10)}` });

  const money = (n: number | null, style: number = XS.currency): XlsxCell => (n == null ? null : { v: n, s: style });
  const txt = (v: string, s?: number): XlsxCell => ({ v, s });

  // ---- BOM sheet (flat, filterable table with an Excel AutoFilter) --------
  const scopeLabel = (byLz: boolean) =>
    byLz ? t({ th: "Landing Zone", en: "Landing Zone" }) : t({ th: "หลัง LZ", en: "post-LZ" });

  const rows: XlsxCell[][] = [];
  rows.push([txt(`OCI Presale BOM — ${templateName}`, XS.title)]);
  rows.push([
    txt(
      t({
        th: `Region: ${spec.region.id} · ${HUB_LABEL[spec.hub.kind]} · CIS L${spec.cisLevel} · ${t({ th: "ราคา", en: "prices" })}: ${priceSourceLabel}`,
        en: `Region: ${spec.region.id} · ${HUB_LABEL[spec.hub.kind]} · CIS L${spec.cisLevel} · prices: ${priceSourceLabel}`,
      }),
    ),
  ]);
  rows.push([]);
  const headers = [
    t({ th: "หมวด", en: "Category" }),
    t({ th: "รายการ", en: "Item" }),
    t({ th: "Environment", en: "Environment" }),
    t({ th: "ขอบเขต", en: "Scope" }),
    "SKU",
    t({ th: "จำนวน", en: "Qty" }),
    t({ th: "หน่วย", en: "Unit" }),
    t({ th: "ราคาต่อหน่วย (THB)", en: "Unit price (THB)" }),
    t({ th: "ต่อเดือน (THB)", en: "Monthly (THB)" }),
    t({ th: "หมายเหตุ", en: "Notes" }),
  ];
  const headerRow = rows.length + 1; // 1-based row index of the header
  rows.push(headers.map((h) => txt(h, XS.header)));

  // one flat row per item, ordered by category then env so it groups visually
  const categories = [...new Set(bom.items.map((i) => i.category))];
  const ordered = [...bom.items].sort(
    (a, b) => categories.indexOf(a.category) - categories.indexOf(b.category),
  );
  for (const item of ordered) {
    rows.push([
      txt(t(CATEGORY_LABEL[item.category])),
      txt(t(item.label)),
      txt(item.env ?? "shared"),
      txt(scopeLabel(item.deployedByLz)),
      txt(item.sku ?? ""),
      { v: item.quantity },
      txt(item.unit),
      money(item.unitPriceThb),
      money(item.monthlyThb),
      txt(item.notes ? t(item.notes) : ""),
    ]);
  }
  const lastItemRow = rows.length; // 1-based
  rows.push([]);
  rows.push([
    txt(t({ th: "รวมทั้งหมดต่อเดือน", en: "Total per month" }), XS.header),
    null, null, null, null, null, null, null,
    money(bom.totals.monthlyThb, XS.boldCurrency),
    null,
  ]);
  if (bom.totals.unpricedCount > 0) {
    rows.push([
      txt(
        t({
          th: `* มี ${bom.totals.unpricedCount} รายการที่ยังไม่มีราคา — ยอดรวมเป็นบางส่วน`,
          en: `* ${bom.totals.unpricedCount} item(s) unpriced — total is partial`,
        }),
      ),
    ]);
  }

  const bomSheet: XlsxSheet = {
    name: "BOM",
    cols: [16, 44, 13, 12, 12, 9, 12, 16, 15, 44],
    rows,
    // AutoFilter across the header + item rows (J = 10th column)
    autoFilter: `A${headerRow}:J${lastItemRow}`,
  };

  // ---- Summary sheet ------------------------------------------------------
  const s: XlsxCell[][] = [];
  s.push([txt(`Summary — ${templateName}`, XS.title)]);
  s.push([]);
  const pair = (label: LocalizedText, value: string) => s.push([txt(t(label), XS.header), txt(value)]);
  if (spec.customerName) pair({ th: "ลูกค้า", en: "Customer" }, spec.customerName);
  pair({ th: "โซลูชัน", en: "Solution" }, templateName);
  pair({ th: "Region", en: "Region" }, spec.region.id);
  pair({ th: "Hub model", en: "Hub model" }, HUB_LABEL[spec.hub.kind]);
  pair({ th: "CIS profile", en: "CIS profile" }, `Level ${spec.cisLevel}`);
  pair({ th: "Environments", en: "Environments" }, spec.environments.join(", "));
  pair({ th: "การเชื่อมต่อ", en: "Connectivity" }, spec.hub.connectivity);
  s.push([txt(t({ th: "รวมต่อเดือน (THB)", en: "Monthly total (THB)" }), XS.header), { v: bom.totals.monthlyThb, s: XS.boldCurrency }]);
  pair({ th: "แหล่งราคา", en: "Price source" }, priceSourceLabel);
  s.push([]);
  s.push([txt(t({ th: "สมมติฐานและขอบเขต", en: "Assumptions & scope" }), XS.header)]);
  for (const a of result.assumptions) s.push([txt("• " + t(a))]);
  for (const note of spec.assumptionNotes) s.push([txt("• " + note + " (AI)")]);

  const summarySheet: XlsxSheet = {
    name: "Summary",
    cols: [26, 90],
    rows: s,
  };

  return [bomSheet, summarySheet];
}
