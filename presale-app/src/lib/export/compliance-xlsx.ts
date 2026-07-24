import type { GenerateResult } from "@/lib/domain/types";
import type { ComplianceStatus, TorAnalysis } from "@/lib/tor/types";
import { XS, type XlsxCell, type XlsxSheet } from "./xlsx";

// The compliance matrix a presale hands to a procurement committee: one row per
// TOR clause with our answer, the evidence, and a colour-coded verdict. Rows the
// engine could not prove stay "ต้องตรวจสอบ" so nobody signs off on a claim the
// tool invented.

const STATUS_LABEL: Record<ComplianceStatus, string> = {
  pass: "ผ่าน",
  partial: "ผ่านบางส่วน",
  fail: "ไม่ผ่าน",
  manual: "ต้องตรวจสอบ",
};

const STATUS_STYLE: Record<ComplianceStatus, number> = {
  pass: XS.statusPass,
  partial: XS.statusPartial,
  fail: XS.statusFail,
  manual: XS.statusManual,
};

const CATEGORY_TH: Record<string, string> = {
  compute: "ประมวลผล",
  storage: "จัดเก็บข้อมูล",
  network: "เครือข่าย",
  security: "ความปลอดภัย",
  database: "ฐานข้อมูล",
  availability: "ความพร้อมใช้งาน",
  backup_dr: "สำรอง/กู้คืน",
  operations: "ปฏิบัติการ",
  compliance: "มาตรฐาน/กฎระเบียบ",
  commercial: "เชิงพาณิชย์",
  other: "อื่น ๆ",
};

const OBLIGATION_TH: Record<string, string> = {
  mandatory: "บังคับ",
  quantitative: "เชิงตัวเลข",
  optional: "ไม่บังคับ",
  informational: "ข้อมูลประกอบ",
};

const txt = (v: string, s?: number): XlsxCell => ({ v, s });

export function buildComplianceWorkbook(analysis: TorAnalysis, result: GenerateResult): XlsxSheet[] {
  const { spec, bom } = result;

  // ---- Matrix sheet -------------------------------------------------------
  const rows: XlsxCell[][] = [];
  rows.push([txt(`ตารางเปรียบเทียบข้อกำหนด (Compliance Matrix) — ${analysis.fileName}`, XS.title)]);
  rows.push([
    txt(
      `ผู้เสนอ: AIS Cloud (Oracle Alloy) · region ${spec.region.id} · ${spec.environments.join(", ")} · CIS Level ${spec.cisLevel} · ราคารวม ${bom.totals.monthlyThb.toLocaleString("th-TH", { maximumFractionDigits: 2 })} THB/เดือน`,
    ),
  ]);
  rows.push([
    txt(
      `สรุป: ผ่าน ${analysis.summary.pass} · ผ่านบางส่วน ${analysis.summary.partial} · ไม่ผ่าน ${analysis.summary.fail} · ต้องตรวจสอบ ${analysis.summary.manual} (จากข้อกำหนดด้าน infrastructure ${analysis.infraRequirements} ข้อ · ทั้งเอกสาร ${analysis.totalRequirements} ข้อ)`,
    ),
  ]);
  rows.push([]);

  const headers = ["ลำดับ", "ข้อ (TOR)", "หน้า", "หมวด", "ระดับ", "ข้อกำหนดตาม TOR", "ผล", "สิ่งที่เสนอ", "หลักฐานอ้างอิง", "หมายเหตุ / สิ่งที่ต้องทำ"];
  const headerRow = rows.length + 1;
  rows.push(headers.map((h) => txt(h, XS.header)));

  const order: Record<ComplianceStatus, number> = { fail: 0, partial: 1, manual: 2, pass: 3 };
  const sorted = [...analysis.rows].sort((a, b) => order[a.status] - order[b.status]);
  for (const r of sorted) {
    rows.push([
      txt(r.id),
      txt(r.clause),
      r.page == null ? txt("") : { v: r.page },
      txt(CATEGORY_TH[r.category] ?? r.category),
      txt(OBLIGATION_TH[r.obligation] ?? r.obligation),
      txt(r.text, XS.wrap),
      txt(STATUS_LABEL[r.status], STATUS_STYLE[r.status]),
      txt(r.offered, XS.wrap),
      txt(r.evidence, XS.wrap),
      txt(r.note, XS.wrap),
    ]);
  }
  const lastRow = rows.length;
  rows.push([]);
  rows.push([txt("หมายเหตุ: ช่อง “ผล” คำนวณจากแบบและ BOM ที่เสนอจริง — แถวที่เป็น “ต้องตรวจสอบ” ต้องให้ผู้เชี่ยวชาญยืนยันก่อนยื่นเอกสาร", XS.wrap)]);

  const matrix: XlsxSheet = {
    name: "Compliance Matrix",
    cols: [8, 12, 6, 16, 12, 62, 14, 56, 34, 44],
    rows,
    autoFilter: `A${headerRow}:J${Math.max(lastRow, headerRow)}`,
    freezeRow: headerRow,
  };

  // ---- Summary sheet ------------------------------------------------------
  const s: XlsxCell[][] = [];
  s.push([txt("สรุปผลการตรวจสอบข้อกำหนด", XS.title)]);
  s.push([]);
  const pair = (k: string, v: string | number) => s.push([txt(k, XS.header), typeof v === "number" ? { v } : txt(v)]);
  pair("ไฟล์ TOR", analysis.fileName);
  pair("ข้อกำหนดทั้งหมดที่พบ", analysis.totalRequirements);
  pair("เกี่ยวข้องกับ infrastructure", analysis.infraRequirements);
  s.push([txt("ผ่าน", XS.header), { v: analysis.summary.pass, s: XS.statusPass }]);
  s.push([txt("ผ่านบางส่วน", XS.header), { v: analysis.summary.partial, s: XS.statusPartial }]);
  s.push([txt("ไม่ผ่าน", XS.header), { v: analysis.summary.fail, s: XS.statusFail }]);
  s.push([txt("ต้องตรวจสอบโดยผู้เชี่ยวชาญ", XS.header), { v: analysis.summary.manual, s: XS.statusManual }]);
  s.push([]);

  const byCat = new Map<string, { pass: number; partial: number; fail: number; manual: number }>();
  for (const r of analysis.rows) {
    const k = CATEGORY_TH[r.category] ?? r.category;
    const cur = byCat.get(k) ?? { pass: 0, partial: 0, fail: 0, manual: 0 };
    cur[r.status] += 1;
    byCat.set(k, cur);
  }
  s.push([txt("แยกตามหมวด", XS.header), txt("ผ่าน", XS.header), txt("ผ่านบางส่วน", XS.header), txt("ไม่ผ่าน", XS.header), txt("ต้องตรวจสอบ", XS.header)]);
  for (const [cat, c] of byCat) s.push([txt(cat), { v: c.pass }, { v: c.partial }, { v: c.fail }, { v: c.manual }]);

  if (analysis.warnings.length) {
    s.push([]);
    s.push([txt("ข้อควรระวังจากการอ่านเอกสาร", XS.header)]);
    for (const w of analysis.warnings) s.push([txt("• " + w, XS.wrap)]);
  }

  s.push([]);
  s.push([txt("ที่มาของคำตอบ", XS.header)]);
  s.push([txt("• ช่อง “สิ่งที่เสนอ” มาจาก SolutionSpec + BOM ที่ระบบสร้าง ไม่ได้มาจากการคาดเดาของ AI", XS.wrap)]);
  s.push([txt("• AI ทำหน้าที่เพียงแยกข้อกำหนดออกจากเอกสาร TOR เท่านั้น", XS.wrap)]);
  s.push([txt(`• ราคาอ้างอิง ${bom.priceSource === "live" ? "ดึงสดจาก AIS Cloud" : "snapshot"} เมื่อ ${bom.priceFetchedAt.slice(0, 10)}`, XS.wrap)]);

  const summary: XlsxSheet = { name: "Summary", cols: [34, 16, 16, 14, 16], rows: s };

  // ---- Non-infra clauses routed to the bid team ---------------------------
  const n: XlsxCell[][] = [];
  n.push([txt("ข้อกำหนดที่ไม่ใช่ขอบเขต infrastructure (ส่งทีมประมูล/นิติกรรม)", XS.title)]);
  n.push([]);
  n.push([txt("ข้อ (TOR)", XS.header), txt("หน้า", XS.header), txt("หมวด", XS.header), txt("ข้อความ", XS.header)]);
  for (const r of analysis.nonInfra) {
    n.push([txt(r.clause), r.page == null ? txt("") : { v: r.page }, txt(CATEGORY_TH[r.category] ?? r.category), txt(r.text, XS.wrap)]);
  }
  if (analysis.nonInfra.length === 0) n.push([txt("— ไม่พบ —")]);
  const nonInfra: XlsxSheet = { name: "Non-Infra", cols: [14, 6, 18, 100], rows: n };

  return [matrix, summary, nonInfra];
}
