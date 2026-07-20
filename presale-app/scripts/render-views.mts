// Dev utility: rasterize the 5 DiagramDocs of a saved diagrams.json to PNG
// using the real SVG renderer (DiagramCanvas) — lets humans/agents review the
// actual visual output. Usage:
//   npx tsx scripts/render-views.mts <diagrams.json> <outDir>
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { DiagramCanvas } from "../src/components/diagrams/DiagramCanvas";

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) {
  console.error("usage: npx tsx scripts/render-views.mts <diagrams.json> <outDir>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const docs = JSON.parse(fs.readFileSync(input, "utf8"));

for (const doc of docs) {
  const svg = renderToStaticMarkup(React.createElement(DiagramCanvas, { doc }));
  const svgFile = path.join(outDir, `${doc.view}.svg`);
  fs.writeFileSync(svgFile, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`);
  const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  fs.writeFileSync(path.join(outDir, `${doc.view}.png`), png);
  console.log(`${doc.view}: ${doc.width}x${doc.height} -> ${path.join(outDir, doc.view + ".png")} (${png.length} bytes)`);
}
