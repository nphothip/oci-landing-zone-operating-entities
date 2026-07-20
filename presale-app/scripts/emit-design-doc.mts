// Dev utility: build a design-document HTML from the test fixtures using the
// real DiagramCanvas SVG renderer + deterministic prose, and write it to disk
// for visual/print review. Usage:
//   npx tsx --tsconfig scripts/tsconfig.render.json scripts/emit-design-doc.mts <template> <out.html> [envsCsv]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TEMPLATES } from "../src/lib/templates";
import { finalizeBom } from "../src/lib/bom/env";
import { priceBom } from "../src/lib/pricing/resolve";
import { buildDiagrams } from "../src/lib/diagrams";
import { buildDesignDocument } from "../src/lib/design/document";
import { renderDesignHtml, type DocBomRow } from "../src/lib/design/html";
import { DiagramCanvas } from "../src/components/diagrams/DiagramCanvas";
import type { EnvName, GenerateResult, TemplateId, ViewId } from "../src/lib/domain/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const [templateId = "web_app", out = "design.html", envsCsv = "prod,preprod"] = process.argv.slice(2);
const tpl = TEMPLATES[templateId as TemplateId];
const spec = tpl.defaults();
spec.environments = envsCsv.split(",") as EnvName[];
const files = ["iam.json", "network.json", "observability_cis1.json"].map((n) => ({
  path: `generated/${n}`,
  content: fs.readFileSync(path.join(here, "..", "tests", "fixtures", n), "utf8"),
}));
const result: GenerateResult = {
  spec,
  factoryConfig: {} as never,
  bom: priceBom(finalizeBom(tpl.buildBom(spec))),
  diagrams: buildDiagrams(spec, files),
  lac: { files },
  assumptions: tpl.assumptions(spec),
  warnings: [],
};

const en = (x: { en: string }) => x.en;
const doc = buildDesignDocument(result);
const svgByView: Partial<Record<ViewId, string>> = {};
for (const d of result.diagrams) svgByView[d.view] = renderToStaticMarkup(React.createElement(DiagramCanvas, { doc: d }));

const money = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));
const CAT: Record<string, string> = { landing_zone: "Landing Zone", compute: "Compute", database: "Database", network: "Network", storage: "Storage", ai: "AI Services", security: "Security", observability: "Observability" };
const rows: DocBomRow[] = result.bom.items.map((i) => ({
  category: CAT[i.category] ?? i.category,
  label: en(i.label),
  env: i.env ?? "shared",
  scope: i.deployedByLz ? "Landing Zone" : "post-LZ",
  qty: `${i.quantity.toLocaleString()} ${i.unit}`,
  monthly: money(i.monthlyUsd),
}));

const html = renderDesignHtml({
  title: en(doc.title),
  subtitle: en(doc.subtitle),
  meta: doc.meta.map((m) => ({ label: en(m.label), value: m.value })),
  sections: doc.sections.map((s) => ({
    id: s.id,
    heading: en(s.heading),
    paragraphs: s.paragraphs.map(en),
    svg: s.view ? svgByView[s.view] : undefined,
    kind: s.kind,
  })),
  bom: { rows, total: money(result.bom.totals.monthlyUsd)!, source: result.bom.priceSource },
  assumptions: result.assumptions.map(en),
  deploymentFiles: doc.facts.lacFileNames,
  footer: "Internal presale tool — list prices, not an official quote",
  generatedAt: "2026-07-21",
});
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes, ${result.diagrams.length} diagrams)`);
