import type { DiagramDoc, DiagramNode } from "@/lib/domain/types";
import { styleOf } from "./theme";

// Serializes DiagramDocs into a single uncompressed draw.io file (mxfile with
// one <diagram> page per view). Compartment/VCN/zone nodes become containers
// so presales can drag whole groups in app.diagrams.net; child geometry is
// converted from absolute to parent-relative coordinates.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mxStyle(node: DiagramNode): string {
  const t = styleOf(node.style);
  const parts: string[] = [];
  if (t.circle) parts.push("ellipse");
  parts.push("html=1", "whiteSpace=wrap");
  parts.push(`fillColor=${t.fill === "none" ? "none" : t.fill}`);
  parts.push(`strokeColor=${t.stroke === "none" ? "none" : t.stroke}`);
  parts.push(`fontColor=${t.textColor}`);
  parts.push(`fontSize=${t.fontSize}`);
  if (t.bold) parts.push("fontStyle=1");
  if (t.dashed) parts.push("dashed=1", "dashPattern=8 4");
  if (t.rounded) parts.push("rounded=1", "arcSize=12");
  const isContainer =
    node.kind === "compartment" || node.kind === "vcn" || node.kind === "zone" || node.kind === "subnet";
  if (isContainer) {
    parts.push("container=1", "collapsible=0", "verticalAlign=top", "align=left", "spacingLeft=6", "spacingTop=2");
  } else if (t.align === "left") {
    parts.push("verticalAlign=top", "align=left", "spacingLeft=6", "spacingTop=2");
  } else {
    parts.push("verticalAlign=middle", "align=center");
  }
  return parts.join(";") + ";";
}

function nodeLabel(node: DiagramNode): string {
  let label = node.label;
  if (node.sublabel) label += `\n${node.sublabel}`;
  if (node.rows?.length) {
    label += "\n" + node.rows.map((r) => (r.right ? `${r.left} → ${r.right}` : r.left)).join("\n");
  }
  return label;
}

function pageXml(doc: DiagramDoc, index: number): string {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const cells: string[] = [];

  // Parents must be declared before children in mxGraph.
  const ordered: DiagramNode[] = [];
  const visit = (n: DiagramNode) => {
    if (ordered.includes(n)) return;
    if (n.parent) {
      const p = byId.get(n.parent);
      if (p) visit(p);
    }
    ordered.push(n);
  };
  doc.nodes.forEach(visit);

  for (const n of ordered) {
    const parent = n.parent && byId.has(n.parent) ? n.parent : "1";
    const p = byId.get(n.parent ?? "");
    const rx = p ? n.x - p.x : n.x;
    const ry = p ? n.y - p.y : n.y;
    cells.push(
      `<mxCell id="${esc(n.id)}" value="${esc(nodeLabel(n))}" style="${esc(mxStyle(n))}" vertex="1" parent="${esc(parent)}">` +
        `<mxGeometry x="${rx}" y="${ry}" width="${n.w}" height="${n.h}" as="geometry"/>` +
        `</mxCell>`,
    );
  }
  for (const e of doc.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    const style =
      e.kind === "flow"
        ? "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#5b6472;endArrow=block;endFill=1;"
        : e.kind === "drgLink"
          ? "edgeStyle=orthogonalEdgeStyle;html=1;strokeColor=#7f1d1d;endArrow=none;"
          : "edgeStyle=orthogonalEdgeStyle;html=1;strokeColor=#868e96;endArrow=none;dashed=1;";
    cells.push(
      `<mxCell id="${esc(e.id)}-${index}" value="${esc(e.label ?? "")}" style="${esc(style)}" edge="1" parent="1" source="${esc(e.from)}" target="${esc(e.to)}">` +
        `<mxGeometry relative="1" as="geometry"/>` +
        `</mxCell>`,
    );
  }

  return (
    `<diagram id="view-${doc.view}" name="${esc(doc.title.en)}">` +
    `<mxGraphModel dx="800" dy="600" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.max(doc.width, 850)}" pageHeight="${Math.max(doc.height, 1100)}" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>` +
    cells.join("") +
    `</root></mxGraphModel></diagram>`
  );
}

export function toDrawio(docs: DiagramDoc[]): string {
  const pages = docs.map((d, i) => pageXml(d, i)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="presale-app" modified="1970-01-01T00:00:00.000Z" agent="oci-presale-app" version="24.0.0" type="device">${pages}</mxfile>\n`;
}
