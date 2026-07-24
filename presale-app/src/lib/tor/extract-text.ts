import JSZip from "jszip";

// Text extraction for uploaded TOR documents. .docx is unzipped and read
// directly (JSZip is already bundled for the LaC/BOM exports) so no new
// dependency and no upload of the file to a third party. PDF text is pulled
// from the raw stream when it is uncompressed; scanned/compressed PDFs are
// reported honestly instead of returning garbage — a wrong requirement is far
// worse than telling the user to supply the .docx.

export interface ExtractedDoc {
  text: string;
  /** 1-based page markers so requirements can cite a page. */
  pageBreaks: number[];
  source: "docx" | "pdf" | "text";
  warnings: string[];
}

const OOXML_PARA = /<w:p[ >][\s\S]*?<\/w:p>/g;
const OOXML_TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const OOXML_BREAK = /<w:br[^>]*w:type="page"|<w:lastRenderedPageBreak/;

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Word .docx — paragraphs in document order, page breaks tracked. */
export async function extractDocx(buf: ArrayBuffer): Promise<ExtractedDoc> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    // JSZip's own message ("Corrupted zip?") means nothing to a presale.
    throw new Error("เปิดไฟล์ .docx ไม่ได้ — ไฟล์อาจเสียหายหรือไม่ใช่ .docx จริง กรุณาเปิดด้วย Word แล้ว Save As .docx ใหม่");
  }
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("ไฟล์ .docx ไม่สมบูรณ์ (ไม่พบ word/document.xml)");
  const xml = await entry.async("string");

  const lines: string[] = [];
  const pageBreaks: number[] = [];
  let page = 1;
  for (const para of xml.match(OOXML_PARA) ?? []) {
    if (OOXML_BREAK.test(para)) {
      page += 1;
      pageBreaks.push(lines.length);
    }
    let text = "";
    for (const m of para.matchAll(OOXML_TEXT)) text += unescapeXml(m[1]);
    // tabs between table cells keep column structure readable for the model
    text = text.replace(/\s+/g, " ").trim();
    if (text) lines.push(text);
  }
  const warnings: string[] = [];
  if (lines.length === 0) warnings.push("ไม่พบข้อความในไฟล์ .docx (อาจเป็นเอกสารรูปภาพ)");
  return { text: lines.join("\n"), pageBreaks, source: "docx", warnings };
}

/**
 * PDF — best-effort text from uncompressed content streams. Most Thai
 * government PDFs are exported from Word with compressed streams (FlateDecode)
 * or are scans; in those cases we return what we can and warn clearly rather
 * than pretend. The UI tells the user to upload the .docx for best accuracy.
 */
export function extractPdf(buf: ArrayBuffer): ExtractedDoc {
  const bytes = new Uint8Array(buf);
  const raw = new TextDecoder("latin1").decode(bytes);
  const warnings: string[] = [];

  const chunks: string[] = [];
  // Text-showing operators inside uncompressed streams: (…) Tj  /  [(…)…] TJ
  for (const m of raw.matchAll(/\(((?:\\.|[^\\()])*)\)\s*T[jJ*]/g)) {
    const s = m[1].replace(/\\([()\\])/g, "$1").replace(/\\[rn]/g, " ");
    if (s.trim()) chunks.push(s);
  }
  const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (/FlateDecode/.test(raw) && chunks.length < 40) {
    warnings.push(
      "PDF นี้บีบอัดข้อความ (FlateDecode) หรือเป็นไฟล์สแกน — สกัดข้อความได้ไม่ครบ กรุณาอัปโหลดไฟล์ .docx ต้นฉบับเพื่อความแม่นยำ",
    );
  }
  if (chunks.length === 0) {
    warnings.push("อ่านข้อความจาก PDF ไม่ได้เลย — ต้องใช้ไฟล์ .docx หรือแปลง PDF เป็นข้อความก่อน");
  }
  return {
    text: chunks.join(" ").replace(/\s{2,}/g, " "),
    pageBreaks: [],
    source: "pdf",
    warnings: warnings.concat(pageCount ? [`ตรวจพบ ~${pageCount} หน้า`] : []),
  };
}

/** Dispatch on file name/type; plain text passes through. */
export async function extractDocument(name: string, buf: ArrayBuffer): Promise<ExtractedDoc> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return extractDocx(buf);
  if (lower.endsWith(".pdf")) return extractPdf(buf);
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return { text: new TextDecoder("utf-8").decode(buf), pageBreaks: [], source: "text", warnings: [] };
  }
  if (lower.endsWith(".doc")) {
    throw new Error("ไฟล์ .doc (Word รุ่นเก่า) ยังไม่รองรับ — กรุณาบันทึกเป็น .docx แล้วอัปโหลดใหม่");
  }
  throw new Error("รองรับเฉพาะไฟล์ .docx, .pdf, .txt");
}

/** Rough page for a character offset, using the paragraph-index breaks. */
export function pageForLine(doc: ExtractedDoc, lineIndex: number): number | null {
  if (doc.pageBreaks.length === 0) return null;
  let page = 1;
  for (const brk of doc.pageBreaks) {
    if (lineIndex >= brk) page += 1;
    else break;
  }
  return page;
}
