import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/domain/types";

// Small builder used by all layout functions: collects nodes/edges and
// computes the final canvas size from the content bounding box.

export class Doc {
  nodes: DiagramNode[] = [];
  edges: DiagramEdge[] = [];
  private seq = 0;

  add(n: Omit<DiagramNode, "id"> & { id?: string }): DiagramNode {
    const node: DiagramNode = { id: n.id ?? `n${++this.seq}`, ...n } as DiagramNode;
    this.nodes.push(node);
    return node;
  }

  edge(e: Omit<DiagramEdge, "id"> & { id?: string }): DiagramEdge {
    const edge: DiagramEdge = { id: e.id ?? `e${++this.seq}`, ...e } as DiagramEdge;
    this.edges.push(edge);
    return edge;
  }

  finish(doc: Omit<DiagramDoc, "nodes" | "edges" | "width" | "height">, pad = 24): DiagramDoc {
    const maxX = Math.max(...this.nodes.map((n) => n.x + n.w), 400);
    const maxY = Math.max(...this.nodes.map((n) => n.y + n.h), 300);
    return { ...doc, width: maxX + pad, height: maxY + pad, nodes: this.nodes, edges: this.edges };
  }
}

/** Center of a node (edge anchor). */
export function center(n: DiagramNode): { x: number; y: number } {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

/** Rough text width used to size boxes (Latin-ish average at 12px ≈ 6.6px/char). */
export function textWidth(text: string, fontSize = 12): number {
  return text.length * fontSize * 0.56;
}

/** Distribute `count` boxes of width w in a row starting at x with gap. */
export function rowX(x: number, index: number, w: number, gap = 16): number {
  return x + index * (w + gap);
}

/** Standard legend block (right column of every view, like the originals). */
export function addLegend(
  d: Doc,
  x: number,
  y: number,
  rows: { left: string; swatch: string }[],
): DiagramNode {
  return d.add({
    kind: "legend",
    label: "Legend:",
    x,
    y,
    w: 210,
    h: 30 + rows.length * 24,
    style: "legendTitle",
    rows,
  });
}
