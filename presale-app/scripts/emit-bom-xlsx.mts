// Dev utility: build a real .xlsx from a template default and write it to disk
// so it can be validated by Excel/openpyxl. Usage:
//   npx tsx scripts/emit-bom-xlsx.mts <template> <out.xlsx>
import fs from "node:fs";
import { TEMPLATES } from "../src/lib/templates";
import { priceBom } from "../src/lib/pricing/resolve";
import { buildBomWorkbook } from "../src/lib/export/bom-xlsx";
import { workbookToXlsx } from "../src/lib/export/xlsx";
import type { GenerateResult, LocalizedText, TemplateId } from "../src/lib/domain/types";

const [templateId = "erp", out = "bom.xlsx"] = process.argv.slice(2);
const tpl = TEMPLATES[templateId as TemplateId];
const spec = tpl.defaults();
const result: GenerateResult = {
  spec,
  factoryConfig: {} as never,
  bom: priceBom(tpl.buildBom(spec)),
  diagrams: [],
  lac: { files: [] },
  assumptions: tpl.assumptions(spec),
  warnings: [],
};
const t = (x: LocalizedText | string) => (typeof x === "string" ? x : x.en);
const blob = await workbookToXlsx(buildBomWorkbook(result, t));
fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
console.log(`wrote ${out} (${fs.statSync(out).size} bytes) — total $${result.bom.totals.monthlyUsd}`);
