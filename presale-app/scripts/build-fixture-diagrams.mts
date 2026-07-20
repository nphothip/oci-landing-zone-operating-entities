// Dev utility: build the 5 DiagramDocs from the test fixtures (no server
// needed) and write them to a diagrams.json for render-views.mts.
// Usage: npx tsx --tsconfig scripts/tsconfig.render.json scripts/build-fixture-diagrams.mts <out.json> [template] [envsCsv]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATES } from "../src/lib/templates";
import { buildDiagrams } from "../src/lib/diagrams";
import type { EnvName, TemplateId } from "../src/lib/domain/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const [out, templateId = "web_app", envsCsv = "prod,preprod", fixturesDir] = process.argv.slice(2);
if (!out) {
  console.error("usage: build-fixture-diagrams.mts <out.json> [template] [envsCsv] [fixturesDir]");
  process.exit(1);
}
const dir = fixturesDir ?? path.join(here, "..", "tests", "fixtures");
const names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
const fixtures = names.map((n) => ({
  path: `generated/${n}`,
  content: fs.readFileSync(path.join(dir, n), "utf8"),
}));
const spec = TEMPLATES[templateId as TemplateId].defaults();
spec.environments = envsCsv.split(",") as EnvName[];
const docs = buildDiagrams(spec, fixtures);
fs.writeFileSync(out, JSON.stringify(docs));
console.log("wrote", out, "—", docs.map((d) => `${d.view} ${d.width}x${d.height}`).join(", "));
