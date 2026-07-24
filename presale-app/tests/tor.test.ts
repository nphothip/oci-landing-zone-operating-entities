import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { EnvName, GenerateResult } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { finalizeBom } from "@/lib/bom/env";
import { priceBom } from "@/lib/pricing/resolve";
import { buildDiagrams } from "@/lib/diagrams";
import { extractDocument, extractDocx, extractPdf } from "@/lib/tor/extract-text";
import { matchRequirements } from "@/lib/tor/match";
import type { TorRequirement } from "@/lib/tor/types";
import { buildComplianceWorkbook } from "@/lib/export/compliance-xlsx";
import { workbookToXlsx } from "@/lib/export/xlsx";

const fx = (n: string) => ({ path: `generated/${n}`, content: readFileSync(path.join(__dirname, "fixtures", n), "utf8") });

function fakeResult(template: keyof typeof TEMPLATES = "web_app"): GenerateResult {
  const tpl = TEMPLATES[template];
  const spec = tpl.defaults();
  spec.environments = ["prod", "preprod"] as EnvName[];
  const files = [fx("iam.json"), fx("network.json"), fx("observability_cis1.json")];
  return {
    spec,
    factoryConfig: {} as never,
    bom: priceBom(finalizeBom(tpl.buildBom(spec))),
    diagrams: buildDiagrams(spec, files),
    lac: { files },
    assumptions: tpl.assumptions(spec),
    warnings: [],
  };
}

let seq = 0;
function req(text: string, extra: Partial<TorRequirement> = {}): TorRequirement {
  seq += 1;
  return {
    id: `R${String(seq).padStart(3, "0")}`,
    clause: `ข้อ ${seq}`,
    page: 1,
    text,
    obligation: "mandatory",
    category: "other",
    infraRelevant: true,
    metric: null,
    ...extra,
  };
}

/** Minimal .docx: a zip with word/document.xml holding OOXML paragraphs. */
async function makeDocx(paragraphs: string[]): Promise<ArrayBuffer> {
  const body = paragraphs
    .map((p, i) => `<w:p>${i === 2 ? '<w:r><w:br w:type="page"/></w:r>' : ""}<w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join("");
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  const u8 = await zip.generateAsync({ type: "uint8array" });
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

describe("TOR text extraction", () => {
  it("reads paragraphs and page breaks out of a .docx", async () => {
    const buf = await makeDocx(["ข้อ 1 ขอบเขตงาน", "ข้อ 2 หน่วยประมวลผลไม่น้อยกว่า 8 vCPU", "ข้อ 3 ต้องมี firewall", "ข้อ 4 ต้องสำรองข้อมูล"]);
    const doc = await extractDocx(buf);
    expect(doc.source).toBe("docx");
    expect(doc.text.split("\n")).toHaveLength(4);
    expect(doc.text).toContain("ไม่น้อยกว่า 8 vCPU");
    expect(doc.pageBreaks).toEqual([2]); // break sits before the 3rd paragraph
    expect(doc.warnings).toEqual([]);
  });

  it("unescapes XML entities rather than leaking them into requirement text", async () => {
    const buf = await makeDocx(["ต้องรองรับ &lt;=100 ms &amp; TLS 1.2 ขึ้นไป", "x", "y", "z"]);
    const doc = await extractDocx(buf);
    expect(doc.text.split("\n")[0]).toBe("ต้องรองรับ <=100 ms & TLS 1.2 ขึ้นไป");
  });

  it("warns honestly instead of returning garbage for a compressed/scanned PDF", () => {
    const fakePdf = new TextEncoder().encode("%PDF-1.7\n/Type /Page \n<< /Filter /FlateDecode >>\nstream\n\x00\x01\x02\nendstream");
    const doc = extractPdf(fakePdf.buffer.slice(0) as ArrayBuffer);
    expect(doc.warnings.join(" ")).toMatch(/FlateDecode|สแกน/);
    expect(doc.text.length).toBeLessThan(200);
  });

  it("rejects legacy .doc and unknown extensions with an actionable message", async () => {
    await expect(extractDocument("tor.doc", new ArrayBuffer(8))).rejects.toThrow(/\.docx/);
    await expect(extractDocument("tor.xls", new ArrayBuffer(8))).rejects.toThrow(/รองรับเฉพาะ/);
  });

  it("turns a corrupt .docx into advice, not a raw zip-library error", async () => {
    const notAZip = new TextEncoder().encode("this is definitely not a docx");
    await expect(extractDocument("tor.docx", notAZip.buffer.slice(0) as ArrayBuffer)).rejects.toThrow(/Save As|เสียหาย/);
  });
});

describe("deterministic compliance matching", () => {
  const result = fakeResult();

  it("compares a quantitative clause against the real BOM quantity", () => {
    const ocpu = result.bom.items.filter((i) => i.catalogKey === "compute_e5_ocpu").reduce((a, i) => a + i.quantity, 0);
    expect(ocpu).toBeGreaterThan(0);
    const [under, over] = matchRequirements(
      [
        req("หน่วยประมวลผลรวมไม่น้อยกว่า X", { metric: { name: "vCPU", op: ">=", value: Math.max(1, ocpu - 1), unit: "OCPU" } }),
        req("หน่วยประมวลผลรวมไม่น้อยกว่า Y", { metric: { name: "vCPU", op: ">=", value: ocpu * 10, unit: "OCPU" } }),
      ],
      result,
    );
    expect(under.status).toBe("pass");
    expect(under.offered).toContain(String(ocpu));
    expect(over.status).toBe("fail");
    expect(over.note).not.toBe("");
  });

  it("answers a firewall clause from the hub kind, never from a fixed string", () => {
    const hubA = fakeResult();
    hubA.spec.hub.kind = "hub_a";
    const hubE = fakeResult();
    hubE.spec.hub.kind = "hub_e";
    const clause = "ต้องมีระบบ Firewall ตรวจสอบทราฟฟิก";
    expect(matchRequirements([req(clause)], hubA)[0].offered).toMatch(/Network Firewall 2 ชุด/);
    const none = matchRequirements([req(clause)], hubE)[0];
    expect(none.status).toBe("fail");
    expect(none.offered).toMatch(/ไม่ได้เสนอ/);
  });

  it("never silently passes a clause it cannot prove", () => {
    const row = matchRequirements([req("ผู้รับจ้างต้องจัดอบรมผู้ดูแลระบบ 5 วันทำการ ณ สถานที่ของผู้ว่าจ้าง")], result)[0];
    expect(row.status).toBe("manual");
    expect(row.offered).toBe("");
    expect(row.note).not.toBe("");
  });

  it("routes non-infrastructure clauses to a human rather than judging them", () => {
    const row = matchRequirements([req("ผู้เสนอราคาต้องวางหลักประกันซองร้อยละ 5", { infraRelevant: false, category: "commercial" })], result)[0];
    expect(row.status).toBe("manual");
    expect(row.note).toMatch(/ไม่ใช่ขอบเขต infrastructure/);
  });

  it("reflects CIS level and connectivity actually chosen in the spec", () => {
    const l2 = fakeResult();
    l2.spec.cisLevel = 2;
    l2.spec.hub.connectivity = "fastconnect_10g_ha";
    const rows = matchRequirements([req("ต้องเป็นไปตามมาตรฐาน CIS Benchmark"), req("ต้องเชื่อมต่อผ่าน leased line ความเร็วสูง")], l2);
    expect(rows[0].offered).toContain("Level 2");
    expect(rows[1].offered).toMatch(/FastConnect 10 Gbps/);

    const noLink = fakeResult();
    noLink.spec.hub.connectivity = "none";
    expect(matchRequirements([req("ต้องเชื่อมต่อผ่าน VPN")], noLink)[0].status).toBe("fail");
  });

  it("gives every answered row a verifiable evidence pointer", () => {
    const rows = matchRequirements(
      [req("ต้องเข้ารหัสข้อมูล"), req("ต้องมี MFA"), req("ต้องสำรองข้อมูลรายวัน"), req("ต้องรวมศูนย์การจัดเก็บ log")],
      result,
    );
    for (const r of rows) {
      expect(r.status, r.text).toBe("pass");
      expect(r.evidence.length, r.text).toBeGreaterThan(3);
    }
  });
});

describe("compliance workbook", () => {
  it("builds three sheets and a valid xlsx package", async () => {
    const result = fakeResult();
    const rows = matchRequirements(
      [req("ต้องมี firewall"), req("ต้องมี MFA"), req("ผู้รับจ้างต้องส่งมอบเอกสารภายใน 30 วัน", { infraRelevant: true })],
      result,
    );
    const summary = { pass: 0, partial: 0, fail: 0, manual: 0 };
    for (const r of rows) summary[r.status] += 1;
    const sheets = buildComplianceWorkbook(
      { fileName: "tor.docx", totalRequirements: 5, infraRequirements: rows.length, rows, summary, nonInfra: [], warnings: ["ทดสอบ"] },
      result,
    );
    expect(sheets.map((s) => s.name)).toEqual(["Compliance Matrix", "Summary", "Non-Infra"]);
    expect(sheets[0].freezeRow).toBeGreaterThan(0);
    expect(sheets[0].autoFilter).toMatch(/^A\d+:J\d+$/);

    const blob = await workbookToXlsx(sheets);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const styles = await zip.file("xl/styles.xml")!.async("string");
    // fills/fonts/cellXfs counts must match the declared attributes or Excel repairs the file
    expect(styles).toContain('<fills count="7">');
    expect(styles).toContain('<fonts count="6">');
    expect(styles).toContain('<cellXfs count="12">');
    expect((styles.match(/<xf /g) ?? []).length).toBe(13); // 1 cellStyleXfs + 12 cellXfs
    const sheet1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet1).toContain("<pane ySplit=");
    expect(sheet1.indexOf("<sheetViews>")).toBeLessThan(sheet1.indexOf("<cols>"));
  });
});
