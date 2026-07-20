"use client";

import { forwardRef } from "react";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/domain/types";
import { FONT_STACK, styleOf } from "@/lib/diagrams/theme";

// Pure SVG renderer for a DiagramDoc. Nodes are drawn in array order
// (containers are emitted before their children by the layouts), then edges
// with border-to-border anchors on top.

function anchorPoint(from: DiagramNode, to: DiagramNode): { x1: number; y1: number; x2: number; y2: number } {
  const c1 = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const c2 = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const clip = (rect: DiagramNode, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let t = 1;
    if (dx !== 0) {
      const tx = (dx > 0 ? rect.x + rect.w - from.x : rect.x - from.x) / dx;
      if (tx > 0) t = Math.min(t, tx);
    }
    if (dy !== 0) {
      const ty = (dy > 0 ? rect.y + rect.h - from.y : rect.y - from.y) / dy;
      if (ty > 0) t = Math.min(t, ty);
    }
    return { x: from.x + dx * t, y: from.y + dy * t };
  };
  const p1 = clip(from, c1, c2);
  const p2 = clip(to, c2, c1);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

function NodeShape({ node }: { node: DiagramNode }) {
  const s = styleOf(node.style);
  const fill = s.fill === "none" ? "transparent" : s.fill;
  const dash = s.dashed ? "7 4" : undefined;

  if (node.kind === "canvasTitle") {
    return (
      <text x={node.x} y={node.y + 18} fontSize={s.fontSize} fontWeight={700} fill={s.textColor} fontFamily={FONT_STACK}>
        {node.label}
      </text>
    );
  }

  const labelLines: { text: string; size: number; bold?: boolean; color: string }[] = [
    { text: node.label, size: s.fontSize, bold: s.bold, color: s.textColor },
  ];
  if (node.sublabel) {
    labelLines.push({ text: node.sublabel, size: s.fontSize - 1.5, color: node.kind === "vcn" ? "#1d4ed8" : "#6b7280" });
  }

  if (s.circle) {
    const r = Math.min(node.w, node.h) / 2;
    return (
      <g>
        <circle cx={node.x + node.w / 2} cy={node.y + node.h / 2} r={r} fill={fill} stroke={s.stroke} strokeWidth={1.4} />
        <text
          x={node.x + node.w / 2}
          y={node.y + node.h / 2 + 3}
          fontSize={s.fontSize}
          textAnchor="middle"
          fill={s.textColor}
          fontFamily={FONT_STACK}
        >
          {node.label}
        </text>
      </g>
    );
  }

  const leftAlign = s.align === "left" || node.kind === "compartment" || node.kind === "vcn" || node.kind === "subnet" || node.kind === "zone" || node.kind === "group" || node.kind === "routeCard" || node.kind === "note";
  const tx = leftAlign ? node.x + 9 : node.x + node.w / 2;
  const anchor = leftAlign ? "start" : "middle";
  const centered = !leftAlign;
  const blockH = labelLines.length * (s.fontSize + 4);
  let ty = centered ? node.y + node.h / 2 - blockH / 2 + s.fontSize : node.y + s.fontSize + 5;

  return (
    <g>
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        fill={fill}
        stroke={s.stroke === "none" ? "transparent" : s.stroke}
        strokeWidth={1.4}
        strokeDasharray={dash}
        rx={s.rounded ? 10 : 2}
      />
      {labelLines.map((l, i) => {
        const y = ty + (i === 0 ? 0 : 0);
        ty += l.size + 4;
        return (
          <text key={i} x={tx} y={y} fontSize={l.size} fontWeight={l.bold ? 700 : 400} textAnchor={anchor} fill={l.color} fontFamily={FONT_STACK}>
            {l.text}
          </text>
        );
      })}
      {node.rows?.map((row, i) => (
        <g key={`r${i}`}>
          <text x={node.x + 10} y={ty + i * 18 + 4} fontSize={s.fontSize - 1} fill={s.textColor} fontFamily={FONT_STACK}>
            {row.left}
          </text>
          {row.right ? (
            <text x={node.x + node.w - 10} y={ty + i * 18 + 4} fontSize={s.fontSize - 1} textAnchor="end" fill="#1d4ed8" fontFamily={FONT_STACK}>
              {row.right}
            </text>
          ) : null}
        </g>
      ))}
    </g>
  );
}

function EdgeShape({ edge, nodes }: { edge: DiagramEdge; nodes: Map<string, DiagramNode> }) {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (!from || !to) return null;
  const { x1, y1, x2, y2 } = anchorPoint(from, to);
  const color = edge.kind === "drgLink" ? "#7f1d1d" : edge.kind === "assoc" ? "#868e96" : "#5b6472";
  const marker = edge.kind === "flow" ? "url(#arrow)" : undefined;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.5} markerEnd={marker} strokeDasharray={edge.dashed || edge.kind === "assoc" ? "5 4" : undefined} />
      {edge.label ? (
        <text x={midX} y={midY - 5} fontSize={10} textAnchor="middle" fill={color} fontFamily={FONT_STACK}>
          {edge.label}
        </text>
      ) : null}
    </g>
  );
}

export const DiagramCanvas = forwardRef<SVGSVGElement, { doc: DiagramDoc }>(function DiagramCanvas({ doc }, ref) {
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${doc.width} ${doc.height}`}
      width={doc.width}
      height={doc.height}
      style={{ maxWidth: "100%", height: "auto", background: "#ffffff", fontFamily: FONT_STACK }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5b6472" />
        </marker>
      </defs>
      {doc.nodes.map((n) => (
        <NodeShape key={n.id} node={n} />
      ))}
      {doc.edges.map((e) => (
        <EdgeShape key={e.id} edge={e} nodes={nodeMap} />
      ))}
    </svg>
  );
});
