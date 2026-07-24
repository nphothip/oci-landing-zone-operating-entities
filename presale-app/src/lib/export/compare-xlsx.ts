import type { GenerateResult } from "@/lib/domain/types";
import type { CompareResult, RateCardFile } from "@/lib/pricing/compare/types";
import { QUOTE_ONLY_PROVIDERS } from "@/lib/pricing/compare/compute";
import { XS, type XlsxCell, type XlsxSheet } from "./xlsx";

// Customer-facing multi-cloud comparison workbook. Four sheets:
//   1. Comparison — line by line: AIS THB, OCI USD, then every provider in its
//                   own published currency
//   2. Summary    — apples-to-apples subtotals + excluded lines per provider
//   3. Rate Card  — every unit price used, with source URL and confidence
//   4. Assumptions— the conversion/equivalence notes, spelled out
// Nothing here computes a price — it renders what compute.ts produced.

const txt = (v: string, s?: number): XlsxCell => ({ v, s });
const num = (v: number, s?: number): XlsxCell => ({ v, s });

export function buildCompareWorkbook(cmp: CompareResult, cards: RateCardFile, result: GenerateResult): XlsxSheet[] {
  const fx = cmp.fxRate;
  const providers = cmp.providers;
  const n = providers.length;

  // ---- 1. Comparison ------------------------------------------------------
  const rows: XlsxCell[][] = [];
  rows.push([txt(`เปรียบเทียบราคา ${n + 2} ค่าย — ${result.spec.template} · ${result.spec.region.id}`, XS.title)]);
  rows.push([txt(`ราคาแสดงตามสกุลเงินที่แต่ละค่ายประกาศ · อัตราแลกเปลี่ยนใช้เฉพาะการเทียบส่วนต่าง ${fx} THB/USD · on-demand list ไม่รวมส่วนลด · เดือน = 744 ชม.`)]);
  rows.push([]);
  const headers = [
    "หมวด", "รายการ", "Env", "จำนวน (AIS)", "AIS (THB)", "OCI list (USD)",
    ...providers.flatMap((p) => [`${cards[p].label} (${cards[p].currency})`, `${cards[p].label} บริการ`]),
    "หมายเหตุการเทียบ",
  ];
  const headerRow = rows.length + 1;
  rows.push(headers.map((h) => txt(h, XS.header)));

  for (const l of cmp.lines) {
    const notes: string[] = [];
    const pair = (p: string): [XlsxCell, XlsxCell] => {
      const c = l.cells[p];
      if (c.excluded) {
        notes.push(`${cards[p].label}: ${c.reason}`);
        return [txt("ไม่เทียบ"), txt("—")];
      }
      if (c.note) notes.push(`${cards[p].label}: ${c.note}`);
      return [num(c.monthly, XS.currency), txt(c.service)];
    };
    rows.push([
      txt(l.category),
      txt(l.label.th, XS.wrap),
      txt(l.env),
      txt(`${l.aisQty.toLocaleString()} ${l.aisUnit}`),
      l.aisThb == null ? txt("—") : num(l.aisThb, XS.currency),
      l.ociUsd == null ? txt("—") : num(l.ociUsd),
      ...providers.flatMap(pair),
      txt([...new Set(notes)].join(" · "), XS.wrap),
    ]);
  }
  const lastRow = rows.length;
  rows.push([]);
  rows.push([
    txt("รวมที่เทียบได้", XS.header), null, null, null,
    num(cmp.aisTotalThb, XS.boldCurrency),
    num(cmp.ociTotalUsd),
    ...cmp.totals.flatMap((p): XlsxCell[] => [
      num(p.comparableNative, XS.boldCurrency),
      txt(`เทียบ AIS ${p.aisComparableThb.toLocaleString()} บาท บนชุดเดียวกัน (${p.mappedLines}/${cmp.lines.length} รายการ)`),
    ]),
    null,
  ]);

  const lastCol = String.fromCharCode(65 + Math.min(25, 6 + n * 2)); // clamp to Z for the filter range
  const comparison: XlsxSheet = {
    name: "Comparison",
    cols: [13, 40, 9, 16, 14, 13, ...providers.flatMap(() => [14, 28]), 60],
    rows,
    autoFilter: `A${headerRow}:${lastCol}${lastRow}`,
    freezeRow: headerRow,
  };

  // ---- 2. Summary ---------------------------------------------------------
  const s: XlsxCell[][] = [];
  s.push([txt("สรุปเปรียบเทียบแบบ apples-to-apples", XS.title)]);
  s.push([txt("ผลรวมของแต่ละค่ายเทียบกับผลรวม AIS บน 'ชุดรายการเดียวกัน' เท่านั้น — รายการที่เทียบไม่ได้ถูกตัดออกทั้งสองฝั่ง")]);
  s.push([]);
  s.push([
    txt("ค่าย", XS.header), txt("Region", XS.header), txt("ในไทย?", XS.header), txt("สกุลเงิน", XS.header),
    txt("รวม (สกุลเดิม)", XS.header), txt("รวม (THB)", XS.header), txt("AIS ชุดเดียวกัน (THB)", XS.header),
    txt("ต่าง (%)", XS.header), txt("เทียบได้", XS.header), txt("ความเชื่อมั่นต่ำสุด", XS.header),
  ]);
  s.push([
    txt("AIS Cloud (Oracle Alloy)"), txt("ap-bangkok-1"), txt("ใช่ 🇹🇭", XS.statusPass), txt("THB"),
    num(cmp.aisTotalThb, XS.boldCurrency), num(cmp.aisTotalThb, XS.currency), num(cmp.aisTotalThb, XS.currency),
    txt("— (ฐานอ้างอิง)"), txt(`${cmp.lines.length}/${cmp.lines.length}`), txt("ราคา list จริง"),
  ]);
  s.push([
    txt("OCI (global list)"), txt("ทุก region (list เดียวกัน)"), txt("—"), txt("USD"),
    num(cmp.ociTotalUsd), num(Math.round(cmp.ociTotalUsd * fx * 100) / 100, XS.currency), num(cmp.aisTotalThb, XS.currency),
    txt("AIS = OCI × 47.263095"), txt(`${cmp.lines.length}/${cmp.lines.length}`), txt("อนุพันธ์แน่นอน"),
  ]);
  for (const p of cmp.totals) {
    s.push([
      txt(p.label), txt(p.region),
      p.inCountry ? txt("ใช่ 🇹🇭", XS.statusPass) : txt("ไม่ — ข้อมูลออกนอกประเทศ", XS.statusPartial),
      txt(p.currency),
      num(p.comparableNative, XS.boldCurrency), num(p.comparableThb, XS.currency), num(p.aisComparableThb, XS.currency),
      txt(p.deltaPct == null ? "—" : `${p.deltaPct > 0 ? "+" : ""}${p.deltaPct}%`, p.deltaPct != null && p.deltaPct > 0 ? XS.statusPass : XS.statusFail),
      txt(`${p.mappedLines}/${cmp.lines.length}`, p.mappedLines / cmp.lines.length < 0.4 ? XS.statusPartial : XS.default),
      txt(p.worstConfidence),
    ]);
  }
  s.push([]);
  s.push([txt("อะไรทำให้ราคาต่างกัน (เรียงตามผลกระทบ)", XS.header)]);
  s.push([txt("ค่าย", XS.header), txt("รายการ", XS.header), txt("AIS (THB)", XS.header), txt("ค่ายนี้ (THB)", XS.header), txt("ส่วนต่าง (THB)", XS.header), txt("% ของส่วนต่าง", XS.header), txt("หมายเหตุ", XS.header)]);
  for (const p of cmp.totals) {
    for (const d of p.gapDrivers) {
      s.push([
        txt(p.label), txt(d.label.th, XS.wrap),
        num(d.aisThb, XS.currency), num(d.providerThb, XS.currency), num(d.deltaThb, XS.currency),
        txt(`${d.sharePct}%`), txt(d.note ?? "", XS.wrap),
      ]);
    }
    if (p.gapDrivers.length === 0) s.push([txt(p.label), txt("— ไม่มีรายการที่เทียบได้ —")]);
  }
  s.push([]);
  s.push([txt("รายการที่เทียบไม่ได้ (พร้อมเหตุผล)", XS.header)]);
  for (const p of cmp.totals) {
    s.push([txt(p.label, XS.header)]);
    for (const x of p.excludedLines) {
      s.push([null, txt(x.label.th), x.aisThb == null ? txt("—") : num(x.aisThb, XS.currency), txt(x.reason, XS.wrap)]);
    }
    if (p.excludedLines.length === 0) s.push([null, txt("— ไม่มี —")]);
  }
  s.push([]);
  s.push([txt("ข้อจำกัดของการเปรียบเทียบ", XS.header)]);
  for (const d of cmp.disclaimers) s.push([txt("• " + d.th, XS.wrap)]);

  const summary: XlsxSheet = { name: "Summary", cols: [30, 30, 28, 10, 18, 16, 20, 22, 12, 20, 60], rows: s };

  // ---- 3. Rate card -------------------------------------------------------
  const r: XlsxCell[][] = [];
  r.push([txt("ตารางอัตราที่ใช้ (โปร่งใส ตรวจย้อนได้ทุกตัวเลข)", XS.title)]);
  r.push([]);
  r.push([
    txt("ค่าย", XS.header), txt("Region", XS.header), txt("สกุล", XS.header), txt("บริการ", XS.header),
    txt("หน่วย", XS.header), txt("ราคา", XS.header), txt("ความเชื่อมั่น", XS.header),
    txt("ที่มา", XS.header), txt("หมายเหตุ", XS.header),
  ]);
  for (const p of providers) {
    const card = cards[p];
    for (const rate of Object.values(card.rates)) {
      r.push([
        txt(card.label), txt(card.region), txt(card.currency), txt(rate.service), txt(rate.unit),
        num(rate.price),
        txt(rate.confidence, rate.confidence === "verified" ? XS.statusPass : rate.confidence === "derived" ? XS.statusManual : XS.statusPartial),
        txt(rate.source, XS.wrap), txt(rate.notes ?? "", XS.wrap),
      ]);
    }
  }
  r.push([]);
  r.push([txt("ราคา OCI global มาจากความสัมพันธ์ AIS THB = OCI USD × 47.263095 (ตรวจกับ price API ทั้งสองฝั่ง)", XS.wrap)]);
  for (const p of providers) {
    const card = cards[p];
    if (card.summary) r.push([txt(`${card.label} (ข้อมูล ณ ${card.asOf}): ${card.summary}`, XS.wrap)]);
  }
  r.push([]);
  r.push([txt("ค่ายที่ตรวจแล้วแต่ไม่ประกาศราคาสาธารณะ (จึงไม่อยู่ในตารางเปรียบเทียบ)", XS.header)]);
  for (const q of QUOTE_ONLY_PROVIDERS) r.push([txt(`${q.label} — ${q.note.th}`, XS.wrap)]);
  const rateSheet: XlsxSheet = { name: "Rate Card", cols: [16, 30, 8, 44, 20, 12, 12, 50, 46], rows: r };

  // ---- 4. Assumptions -----------------------------------------------------
  const a: XlsxCell[][] = [];
  a.push([txt("สมมติฐานการเทียบทั้งหมด", XS.title)]);
  a.push([]);
  a.push([txt("การแปลงหน่วยหลัก", XS.header)]);
  a.push([txt("• 1 OCPU = 2 vCPU (OCI/AIS ขาย OCPU; ค่ายอื่นขาย vCPU)", XS.wrap)]);
  a.push([txt("• 1 OCPU = 4 ECPU — ฐานข้อมูล Autonomous/Base/MySQL คิดเป็น ECPU; แปลงเป็น vCPU ÷2", XS.wrap)]);
  a.push([txt("• Bandwidth 1 Mbps (คงที่) ≈ 0.45 GB/ชม. — ใช้แปลงเป็น capacity unit หรือ GB processed", XS.wrap)]);
  a.push([txt("• เดือน = 744 ชั่วโมง ตามแนวทาง OCI/AIS", XS.wrap)]);
  a.push([txt("• ราคาแสดงตามสกุลที่ผู้ให้บริการประกาศ ไม่แปลงค่าเงินในตาราง", XS.wrap)]);
  a.push([]);
  a.push([txt("หมายเหตุรายเซลล์ (ปรากฏในชีต Comparison คอลัมน์สุดท้าย)", XS.header)]);
  const seen = new Set<string>();
  for (const l of cmp.lines) {
    for (const p of providers) {
      const c = l.cells[p];
      const line = c.excluded ? c.reason : c.note;
      if (line && !seen.has(line)) {
        seen.add(line);
        a.push([txt(`• ${line}`, XS.wrap)]);
      }
    }
  }
  const assumptions: XlsxSheet = { name: "Assumptions", cols: [120], rows: a };

  return [comparison, summary, rateSheet, assumptions];
}
