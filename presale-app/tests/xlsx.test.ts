import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { GenerateResult } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { priceBom } from "@/lib/pricing/resolve";
import { buildBomWorkbook } from "@/lib/export/bom-xlsx";
import { workbookToXlsx } from "@/lib/export/xlsx";

const enT = (x: unknown) => (typeof x === "string" ? x : (x as { en: string }).en);

function fakeResult(): GenerateResult {
  const spec = TEMPLATES.erp.defaults();
  const bom = priceBom(TEMPLATES.erp.buildBom(spec));
  return {
    spec,
    factoryConfig: {} as never,
    bom,
    diagrams: [],
    lac: { files: [] },
    assumptions: TEMPLATES.erp.assumptions(spec),
    warnings: [],
  };
}

describe("BOM Excel export", () => {
  it("produces a well-formed .xlsx package the BOM can round-trip through", async () => {
    const result = fakeResult();
    const sheets = buildBomWorkbook(result, enT);
    expect(sheets.map((s) => s.name)).toEqual(["BOM", "Summary"]);

    const blob = await workbookToXlsx(sheets);
    const buf = Buffer.from(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);

    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]) {
      expect(zip.file(part), part).toBeTruthy();
    }

    const wb = await zip.file("xl/workbook.xml")!.async("string");
    expect(wb).toContain('name="BOM"');
    expect(wb).toContain('name="Summary"');

    const sheet1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheet1).toContain("OCI Presale BOM");
    // the grand total appears as a numeric cell value
    expect(sheet1).toContain(`<v>${result.bom.totals.monthlyUsd}</v>`);
    // Windows license line (erp default is Windows) is present
    expect(sheet1).toContain("Windows Server license");
    // every part is well-formed XML (no raw unescaped ampersands)
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith(".xml")) continue;
      const xml = await zip.file(name)!.async("string");
      expect(xml.match(/&(?!amp;|lt;|gt;|quot;|#\d+;|apos;)/), `${name} has a raw &`).toBeNull();
    }
  });
});
