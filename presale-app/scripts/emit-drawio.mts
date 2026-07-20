// Dev utility: emit a .drawio file from a saved diagrams.json (the
// `diagrams` array of an /api/generate response) using the real serializer.
// Usage: npx tsx scripts/emit-drawio.mts <diagrams.json> <out.drawio>
import fs from "node:fs";
import { toDrawio } from "../src/lib/diagrams/drawio";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: npx tsx scripts/emit-drawio.mts <diagrams.json> <out.drawio>");
  process.exit(1);
}
const docs = JSON.parse(fs.readFileSync(input, "utf8"));
const xml = toDrawio(docs);
fs.writeFileSync(output, xml);
console.log(`wrote ${output} (${xml.length} bytes, ${(xml.match(/<diagram /g) ?? []).length} pages)`);
