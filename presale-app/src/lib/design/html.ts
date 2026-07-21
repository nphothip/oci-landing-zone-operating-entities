// Serializes a resolved design document into a single self-contained,
// print-friendly HTML file (A4, page breaks per section, diagrams inlined as
// SVG). Open in a browser and print to PDF. All text is pre-resolved to the
// viewing language and pre-escaped-free strings by the caller; SVG markup is
// embedded verbatim.

export interface DocSectionInput {
  id: string;
  heading: string;
  paragraphs: string[];
  svg?: string;
  kind: "prose" | "bom" | "assumptions" | "deployment";
}

export interface DocBomRow {
  category: string;
  label: string;
  env: string;
  scope: string;
  qty: string;
  monthly: string;
}

export interface DesignHtmlInput {
  title: string;
  subtitle: string;
  meta: { label: string; value: string }[];
  sections: DocSectionInput[];
  bom: { rows: DocBomRow[]; total: string; source: string };
  assumptions: string[];
  deploymentFiles: string[];
  footer: string;
  generatedAt: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CSS = `
:root { --red:#C74634; --ink:#1A1A1A; --grey:#666; --line:#d6dfe6; --cream:#faf8d6; }
* { box-sizing: border-box; }
html { font-family: 'Segoe UI','Leelawadee UI','Noto Sans Thai',system-ui,sans-serif; color: var(--ink); }
body { margin: 0; font-size: 13px; line-height: 1.6; }
.page { max-width: 900px; margin: 0 auto; padding: 32px 40px; }
h1 { font-size: 26px; color: var(--ink); margin: 0 0 4px; }
h2 { font-size: 17px; color: var(--red); border-bottom: 2px solid var(--red); padding-bottom: 4px; margin: 30px 0 12px; }
.sub { font-size: 14px; color: var(--grey); margin: 0 0 24px; }
p { margin: 0 0 10px; }
.cover { border:1px solid var(--line); border-radius:10px; padding:28px; margin-bottom:24px; background:#fbfbfa; }
.meta { width:100%; border-collapse:collapse; margin-top:16px; }
.meta td { padding:6px 10px; border-bottom:1px solid var(--line); }
.meta td:first-child { color:var(--grey); width:180px; font-weight:600; }
.diagram { border:1px solid var(--line); border-radius:8px; padding:12px; margin:12px 0 4px; overflow:auto; text-align:center; background:#fff; }
.diagram svg { max-width:100%; height:auto; }
.caption { font-size:11px; color:var(--grey); margin:2px 0 8px; }
table.bom { width:100%; border-collapse:collapse; font-size:11.5px; margin-top:10px; }
table.bom th { background:#f5f4f2; text-align:left; padding:6px 8px; border-bottom:2px solid var(--red); }
table.bom td { padding:5px 8px; border-bottom:1px solid var(--line); }
table.bom td.num { text-align:right; font-variant-numeric:tabular-nums; }
table.bom tr.total td { font-weight:700; border-top:2px solid #999; }
.badge { display:inline-block; padding:1px 6px; border-radius:4px; font-size:10px; }
.badge.shared { background:#eef2f7; color:#444; }
.badge.env { background:#e6f6ec; color:#2b8a3e; }
.badge.lz { background:#e6f6ec; color:#2b8a3e; }
.badge.post { background:#fff4e0; color:#a86400; }
ul { margin:6px 0 10px; padding-left:22px; }
li { margin:3px 0; }
.files { font-family:ui-monospace,monospace; font-size:11px; color:#444; }
.ai-note { font-size:11px; color:var(--grey); font-style:italic; }
footer { margin-top:36px; padding-top:12px; border-top:1px solid var(--line); font-size:11px; color:var(--grey); }
@media print {
  .page { max-width:none; padding:0 12mm; }
  h2 { break-before: page; }
  h2#h-executive { break-before: avoid; }
  .diagram, table.bom, ul { break-inside: avoid; }
  .cover { break-after: page; }
}
@page { size: A4; margin: 14mm; }
`;

export function renderDesignHtml(input: DesignHtmlInput): string {
  const meta = input.meta
    .map((m) => `<tr><td>${esc(m.label)}</td><td>${esc(m.value)}</td></tr>`)
    .join("");

  const sectionHtml = input.sections
    .map((s) => {
      const paras = s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("");
      let extra = "";
      if (s.svg) {
        extra += `<div class="diagram">${s.svg}</div><div class="caption">${esc(s.heading)}</div>`;
      }
      if (s.kind === "bom") {
        extra += bomTable(input.bom);
      } else if (s.kind === "assumptions") {
        extra += `<ul>${input.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`;
      } else if (s.kind === "deployment") {
        extra += `<div class="files">${input.deploymentFiles.map((f) => esc(f)).join("<br>")}</div>`;
      }
      return `<section><h2 id="h-${esc(s.id)}">${esc(s.heading)}</h2>${paras}${extra}</section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.title)}</title><style>${CSS}</style></head>
<body><div class="page">
<div class="cover">
  <h1>${esc(input.title)}</h1>
  <p class="sub">${esc(input.subtitle)}</p>
  <table class="meta">${meta}</table>
</div>
${sectionHtml}
<footer>${esc(input.footer)}<br>${esc(input.generatedAt)}</footer>
</div></body></html>`;
}

function bomTable(bom: { rows: DocBomRow[]; total: string; source: string }): string {
  const rows = bom.rows
    .map((r) => {
      const envCls = r.env === "shared" ? "shared" : "env";
      const scopeCls = /post|หลัง/.test(r.scope) ? "post" : "lz";
      return `<tr><td>${esc(r.category)}</td><td>${esc(r.label)}</td><td><span class="badge ${envCls}">${esc(r.env)}</span></td><td><span class="badge ${scopeCls}">${esc(r.scope)}</span></td><td class="num">${esc(r.qty)}</td><td class="num">${esc(r.monthly)}</td></tr>`;
    })
    .join("");
  return `<table class="bom"><thead><tr><th>Category</th><th>Item</th><th>Env</th><th>Scope</th><th>Qty</th><th>Monthly (THB)</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr class="total"><td colspan="5">Total per month (${esc(bom.source)})</td><td class="num">${esc(bom.total)}</td></tr></tfoot></table>`;
}
