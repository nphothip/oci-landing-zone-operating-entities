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
  hub_a: "HUB A (2× NFW)",
  hub_b: "HUB B (1× NFW)",
  hub_c: "HUB C (2× NLB)",
  hub_e: "HUB E (no firewall)",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildBomWorkbook(result: GenerateResult, t: T): XlsxSheet[] {
  const { bom, spec } = result;
  const templateName = t(TEMPLATES[spec.template].name);
  const priceSourceLabel =
    bom.priceSource === "live"
      ? t({ th: "ราคา live", en: "live prices" })
      : t({ th: `snapshot ${bom.priceFetchedAt.slice(0, 10)}`, en: `snapshot ${bom.priceFetchedAt.slice(0, 10)}` });

  const money = (n: number | null, style: number = XS.currency): XlsxCell => (n == null ? null : { v: n, s: style });
  const txt = (v: string, s?: number): XlsxCell => ({ v, s });

  // ---- BOM sheet ----------------------------------------------------------
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
    t({ th: "รายการ", en: "Item" }),
    "SKU",
    t({ th: "จำนวน", en: "Qty" }),
    t({ th: "หน่วย", en: "Unit" }),
    t({ th: "ราคาต่อหน่วย (USD)", en: "Unit price (USD)" }),
    t({ th: "ต่อเดือน (USD)", en: "Monthly (USD)" }),
    t({ th: "ขอบเขต", en: "Scope" }),
    t({ th: "หมายเหตุ", en: "Notes" }),
  ];
  rows.push(headers.map((h) => txt(h, XS.header)));

  const categories = [...new Set(bom.items.map((i) => i.category))];
  for (const cat of categories) {
    const catItems = bom.items.filter((i) => i.category === cat);
    const subtotal = round2(catItems.reduce((acc, i) => acc + (i.monthlyUsd ?? 0), 0));
    rows.push([txt(t(CATEGORY_LABEL[cat]), XS.catLabel), null, null, null, null, money(subtotal, XS.catCurrency), null, null]);
    for (const item of catItems) {
      rows.push([
        txt(t(item.label)),
        txt(item.sku ?? ""),
        { v: item.quantity },
        txt(item.unit),
        money(item.unitPriceUsd),
        money(item.monthlyUsd),
        txt(item.deployedByLz ? t({ th: "Landing Zone", en: "Landing Zone" }) : t({ th: "หลัง LZ", en: "post-LZ" })),
        txt(item.notes ? t(item.notes) : ""),
      ]);
    }
  }
  rows.push([]);
  rows.push([
    txt(t({ th: "รวมทั้งหมดต่อเดือน", en: "Total per month" }), XS.header),
    null, null, null, null,
    money(bom.totals.monthlyUsd, XS.boldCurrency),
    null, null,
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
    cols: [46, 12, 9, 14, 16, 15, 13, 48],
    rows,
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
  s.push([txt(t({ th: "รวมต่อเดือน (USD)", en: "Monthly total (USD)" }), XS.header), { v: bom.totals.monthlyUsd, s: XS.boldCurrency }]);
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
