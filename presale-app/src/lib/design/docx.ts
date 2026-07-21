import JSZip from "jszip";

// Minimal, dependency-light Microsoft Word (.docx) writer built on the JSZip
// we already bundle. Supports a title, headings, paragraphs, a bordered table
// and embedded PNG images (the rasterized diagrams). Opens in Word / Google
// Docs / LibreOffice.

export interface DocxImage {
  png: Uint8Array;
  /** natural pixel dimensions (for aspect-correct sizing) */
  width: number;
  height: number;
}

export interface DocxSection {
  heading: string;
  paragraphs: string[];
  imageView?: string;
  kind: "prose" | "bom" | "assumptions" | "deployment";
}

export interface DocxInput {
  title: string;
  subtitle: string;
  meta: { label: string; value: string }[];
  sections: DocxSection[];
  bom: { headers: string[]; rows: string[][]; total: string };
  assumptions: string[];
  deploymentFiles: string[];
  images: Record<string, DocxImage>;
  footer: string;
}

const EMU_PER_PX = 9525;
const MAX_W_EMU = 5940000; // ~6.5in content width on A4/Letter

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function emuDims(wpx: number, hpx: number): { cx: number; cy: number } {
  const wEmu = Math.max(1, Math.round(wpx * EMU_PER_PX));
  const hEmu = Math.max(1, Math.round(hpx * EMU_PER_PX));
  if (wEmu <= MAX_W_EMU) return { cx: wEmu, cy: hEmu };
  return { cx: MAX_W_EMU, cy: Math.round((hEmu * MAX_W_EMU) / wEmu) };
}

function para(text: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function imagePara(rId: string, id: number, img: DocxImage): string {
  const { cx, cy } = emuDims(img.width, img.height);
  return (
    `<w:p><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${id}" name="Diagram ${id}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="img${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline>` +
    `</w:drawing></w:r></w:p>`
  );
}

function cell(text: string, bold: boolean, wTwips: number): string {
  const rPr = bold ? "<w:rPr><w:b/></w:rPr>" : "";
  const shd = bold ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : "";
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${wTwips}" w:type="dxa"/>${shd}</w:tcPr>` +
    `<w:p><w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`
  );
}

function table(headers: string[], rows: string[][], totalLabel: string, totalValue: string): string {
  const cols = headers.length;
  const widths = headers.map((_, i) => (i === 0 ? 1400 : i === 1 ? 3200 : Math.round(4600 / (cols - 2))));
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const borders =
    `<w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D6DFE6"/>`)
      .join("") +
    `</w:tblBorders>`;
  const headerRow = `<w:tr>${headers.map((h, i) => cell(h, true, widths[i])).join("")}</w:tr>`;
  const bodyRows = rows.map((r) => `<w:tr>${r.map((c, i) => cell(c, false, widths[i])).join("")}</w:tr>`).join("");
  const totalCells =
    cell(totalLabel, true, widths.slice(0, cols - 1).reduce((a, b) => a + b, 0)) + cell(totalValue, true, widths[cols - 1]);
  // merge first N-1 cells for the total label via a wide single cell + value
  const totalRow = `<w:tr><w:tc><w:tcPr><w:tcW w:w="${widths.slice(0, cols - 1).reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:gridSpan w:val="${cols - 1}"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(totalLabel)}</w:t></w:r></w:p></w:tc>${cell(totalValue, true, widths[cols - 1])}</w:tr>`;
  void totalCells;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${headerRow}${bodyRows}${totalRow}</w:tbl>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="1A1A1A"/><w:sz w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:color w:val="666666"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="120"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="2" w:color="C74634"/></w:pBdr></w:pPr><w:rPr><w:b/><w:color w:val="C74634"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:rPr><w:i/><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr></w:style>
</w:styles>`;

function contentTypes(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

export function buildDocx(input: DocxInput): Promise<Blob> {
  const zip = new JSZip();
  const imageRels: string[] = [];
  const imageFiles: { name: string; data: Uint8Array }[] = [];
  const relIdByView: Record<string, string> = {};
  let imgN = 0;
  for (const [view, img] of Object.entries(input.images)) {
    imgN += 1;
    const rId = `rIdImg${imgN}`;
    relIdByView[view] = rId;
    imageRels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${imgN}.png"/>`);
    imageFiles.push({ name: `word/media/image${imgN}.png`, data: img.png });
  }

  const body: string[] = [];
  body.push(para(input.title, "Title"));
  body.push(para(input.subtitle, "Subtitle"));
  for (const m of input.meta) body.push(para(`${m.label}: ${m.value}`));

  let docPrId = 100;
  for (const s of input.sections) {
    body.push(para(s.heading, "Heading1"));
    for (const p of s.paragraphs) body.push(para(p));
    if (s.imageView && input.images[s.imageView]) {
      docPrId += 1;
      body.push(imagePara(relIdByView[s.imageView], docPrId, input.images[s.imageView]));
      body.push(para(s.heading, "Caption"));
    }
    if (s.kind === "bom") body.push(table(input.bom.headers, input.bom.rows, `Total per month`, input.bom.total));
    if (s.kind === "assumptions") for (const a of input.assumptions) body.push(para(`•  ${a}`));
    if (s.kind === "deployment") body.push(para(input.deploymentFiles.join("  ·  ")));
  }
  body.push(para(""));
  body.push(para(input.footer, "Caption"));

  const sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<w:body>${body.join("")}${sectPr}</w:body></w:document>`;

  const documentRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imageRels.join("")}</Relationships>`;

  zip.file("[Content_Types].xml", contentTypes());
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("word/document.xml", documentXml);
  zip.file("word/styles.xml", STYLES_XML);
  zip.file("word/_rels/document.xml.rels", documentRels);
  for (const f of imageFiles) zip.file(f.name, f.data);

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
