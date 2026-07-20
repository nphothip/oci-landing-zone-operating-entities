"use client";

import { forwardRef, type ReactNode } from "react";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/domain/types";
import { C, FONT_STACK, styleOf } from "@/lib/diagrams/theme";
import { Icon, VcnFlower } from "./icons";

// SVG renderer for DiagramDoc, following Oracle's OCI Open LZ diagram
// language (see theme.ts for the palette provenance). Nodes render in array
// order (containers first), edges on top with border-to-border anchors.

const CHAR_W = 0.54; // average glyph width factor per px of font size

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const perLine = Math.max(4, Math.floor(maxWidth / (fontSize * CHAR_W)));
  const out: string[] = [];
  for (const hard of text.split("\n")) {
    if (hard.length <= perLine) {
      out.push(hard);
      continue;
    }
    let line = "";
    for (const word of hard.split(" ")) {
      if (line && (line + " " + word).length > perLine) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function anchorPoint(from: DiagramNode, to: DiagramNode): { x1: number; y1: number; x2: number; y2: number } {
  const c1 = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const c2 = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const clip = (rect: DiagramNode, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let t = 1;
    if (dx !== 0) {
      const tx = (dx > 0 ? rect.x + rect.w - a.x : rect.x - a.x) / dx;
      if (tx > 0) t = Math.min(t, tx);
    }
    if (dy !== 0) {
      const ty = (dy > 0 ? rect.y + rect.h - a.y : rect.y - a.y) / dy;
      if (ty > 0) t = Math.min(t, ty);
    }
    return { x: a.x + dx * t, y: a.y + dy * t };
  };
  const p1 = clip(from, c1, c2);
  const p2 = clip(to, c2, c1);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

function Text({
  x, y, size, color, bold, italic, anchor = "start", children,
}: {
  x: number; y: number; size: number; color: string; bold?: boolean; italic?: boolean;
  anchor?: "start" | "middle" | "end"; children: ReactNode;
}) {
  return (
    <text
      x={x} y={y} fontSize={size} fill={color} textAnchor={anchor}
      fontWeight={bold ? 700 : 400} fontStyle={italic ? "italic" : undefined}
      fontFamily={FONT_STACK}
    >
      {children}
    </text>
  );
}

function NodeShape({ node }: { node: DiagramNode }) {
  const s = styleOf(node.style);
  const fill = s.fill === "none" ? "transparent" : s.fill;

  // ---- canvas title -------------------------------------------------------
  if (node.kind === "canvasTitle") {
    return (
      <g>
        <Text x={node.x} y={node.y + s.fontSize} size={s.fontSize} color={s.textColor} bold={s.bold}>
          {node.label}
        </Text>
        {node.sublabel ? (
          <Text x={node.x} y={node.y + s.fontSize + 16} size={11} color={C.grey}>
            {node.sublabel}
          </Text>
        ) : null}
      </g>
    );
  }

  // ---- gateway: circle + glyph + caption below ---------------------------
  if (s.circle) {
    const r = Math.min(node.w, node.h) / 2;
    const cx = node.x + node.w / 2;
    const cy = node.y + r;
    const captionLines = node.label ? node.label.split("\n") : [];
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={fill} stroke={s.stroke} strokeWidth={s.strokeWidth ?? 1.4} />
        {node.icon ? (
          <Icon name={node.icon} x={cx - r * 0.62} y={cy - r * 0.62} size={r * 1.24} />
        ) : (
          <Text x={cx} y={cy + s.fontSize * 0.36} size={s.fontSize} color={s.textColor} anchor="middle" bold={s.bold}>
            {node.label}
          </Text>
        )}
        {node.icon && node.captionBelow !== false
          ? captionLines.map((l, i) => (
              <Text key={i} x={cx} y={cy + r + 11 + i * 11} size={9} color={C.slate} anchor="middle">
                {l}
              </Text>
            ))
          : null}
      </g>
    );
  }

  // ---- route-table card ---------------------------------------------------
  if (node.kind === "routeCard") {
    const headH = 20;
    const colH = node.colHeaders ? 15 : 0;
    const rowH = 16;
    return (
      <g>
        <rect x={node.x} y={node.y} width={node.w} height={node.h} fill="#ffffff" stroke={s.stroke} strokeWidth={s.strokeWidth ?? 1} />
        <rect x={node.x} y={node.y} width={node.w} height={headH} fill={s.headerFill ?? s.stroke} />
        <Text x={node.x + 8} y={node.y + 14} size={10} color={s.headerText ?? "#ffffff"} bold>
          {node.label}
        </Text>
        {node.colHeaders ? (
          <g>
            <Text x={node.x + 8} y={node.y + headH + 11} size={8.5} color={C.grey} italic>
              {node.colHeaders[0]}
            </Text>
            <Text x={node.x + node.w - 8} y={node.y + headH + 11} size={8.5} color={C.grey} italic anchor="end">
              {node.colHeaders[1]}
            </Text>
            <line x1={node.x} y1={node.y + headH + colH} x2={node.x + node.w} y2={node.y + headH + colH} stroke="#dddddd" strokeWidth={1} />
          </g>
        ) : null}
        {(node.rows ?? []).map((row, i) => {
          const ry = node.y + headH + colH + i * rowH;
          return (
            <g key={i}>
              {i > 0 ? <line x1={node.x + 4} y1={ry} x2={node.x + node.w - 4} y2={ry} stroke="#eeeeee" strokeWidth={1} /> : null}
              <Text x={node.x + 8} y={ry + 12} size={s.fontSize} color={s.textColor}>
                {row.left}
              </Text>
              {row.right ? (
                <Text x={node.x + node.w - 8} y={ry + 12} size={s.fontSize} color={C.vcnOrange} bold anchor="end">
                  {row.right}
                </Text>
              ) : null}
            </g>
          );
        })}
      </g>
    );
  }

  // ---- legend -------------------------------------------------------------
  if (node.kind === "legend") {
    const rowH = 24;
    return (
      <g>
        <Text x={node.x} y={node.y + 13} size={13} color={C.ink} bold>
          {node.label || "Legend:"}
        </Text>
        {(node.rows ?? []).map((row, i) => {
          const sw = styleOf(row.swatch ?? "service");
          const ry = node.y + 26 + i * rowH;
          return (
            <g key={i}>
              <rect
                x={node.x} y={ry} width={26} height={16}
                fill={sw.fill === "none" ? "#ffffff" : sw.fill}
                stroke={sw.stroke === "none" ? C.greyLight : sw.stroke}
                strokeWidth={sw.strokeWidth ?? 1}
                strokeDasharray={sw.dash}
              />
              <Text x={node.x + 34} y={ry + 12} size={9.5} color={C.slate} bold={row.bold}>
                {row.left}
              </Text>
            </g>
          );
        })}
      </g>
    );
  }

  // ---- generic rect nodes -------------------------------------------------
  const leftAlign =
    s.align === "left" ||
    ["compartment", "vcn", "subnet", "zone", "group", "note"].includes(node.kind);
  const pad = 9;
  const labelSize = s.fontSize;
  const labelLines = wrapText(node.label, node.w - pad * 2 - (node.icon && !node.captionBelow ? 26 : 0), labelSize);
  const subLines = node.sublabel ? wrapText(node.sublabel, node.w - pad * 2, labelSize - 1.5) : [];

  const elements: ReactNode[] = [
    <rect
      key="r"
      x={node.x} y={node.y} width={node.w} height={node.h}
      fill={fill}
      stroke={s.stroke === "none" ? "transparent" : s.stroke}
      strokeWidth={s.strokeWidth ?? 1.2}
      strokeDasharray={s.dash}
      rx={s.rounded ? 8 : 0}
    />,
  ];

  if (node.icon && node.captionBelow) {
    // icon centered above the caption (service tiles)
    const iconSize = Math.min(26, node.h - 26);
    elements.push(
      <Icon key="i" name={node.icon} x={node.x + node.w / 2 - iconSize / 2} y={node.y + 8} size={iconSize} />,
    );
    labelLines.forEach((l, i) =>
      elements.push(
        <Text key={`l${i}`} x={node.x + node.w / 2} y={node.y + 8 + iconSize + 13 + i * (labelSize + 3)} size={labelSize} color={s.textColor} bold={s.bold} anchor="middle">
          {l}
        </Text>,
      ),
    );
    subLines.forEach((l, i) =>
      elements.push(
        <Text key={`s${i}`} x={node.x + node.w / 2} y={node.y + 8 + iconSize + 13 + labelLines.length * (labelSize + 3) + i * (labelSize + 1)} size={labelSize - 1.5} color={C.grey} anchor="middle">
          {l}
        </Text>,
      ),
    );
  } else {
    const iconOffset = node.icon ? 26 : 0;
    if (node.icon) {
      elements.push(<Icon key="i" name={node.icon} x={node.x + pad} y={node.y + (leftAlign ? 6 : node.h / 2 - 10)} size={20} />);
    }
    const tx = leftAlign ? node.x + pad + iconOffset : node.x + node.w / 2;
    const anchor = leftAlign ? "start" : "middle";
    const blockH = labelLines.length * (labelSize + 3) + subLines.length * (labelSize + 1.5);
    let ty = leftAlign ? node.y + labelSize + 6 : node.y + node.h / 2 - blockH / 2 + labelSize;
    labelLines.forEach((l, i) =>
      elements.push(
        <Text key={`l${i}`} x={tx} y={ty + i * (labelSize + 3)} size={labelSize} color={s.textColor} bold={s.bold} italic={s.italic} anchor={anchor}>
          {l}
        </Text>,
      ),
    );
    ty += labelLines.length * (labelSize + 3);
    subLines.forEach((l, i) =>
      elements.push(
        <Text key={`s${i}`} x={tx} y={ty + i * (labelSize + 1.5)} size={labelSize - 1.5} color={s.subColor ?? C.grey} bold={Boolean(s.subColor)} anchor={anchor}>
          {l}
        </Text>,
      ),
    );
    // list rows (group panels)
    if (node.rows?.length && node.kind !== ("routeCard" as string)) {
      const rowSize = labelSize - 1;
      const startY = ty + subLines.length * (labelSize + 1.5) + 6;
      node.rows.forEach((row, i) =>
        elements.push(
          <g key={`row${i}`}>
            {row.swatch ? <Icon name={row.swatch} x={node.x + pad} y={startY + i * (rowSize + 7) - rowSize + 1} size={rowSize + 3} /> : null}
            <Text x={node.x + pad + (row.swatch ? 20 : 0)} y={startY + i * (rowSize + 7)} size={rowSize} color={s.textColor} bold={row.bold}>
              {row.left}
            </Text>
            {row.right ? (
              <Text x={node.x + node.w - pad} y={startY + i * (rowSize + 7)} size={rowSize} color={C.cidrBlue} anchor="end">
                {row.right}
              </Text>
            ) : null}
          </g>,
        ),
      );
    }
  }

  if (node.kind === "vcn") {
    elements.push(<VcnFlower key="f" x={node.x + node.w - 13} y={node.y + node.h - 13} size={16} />);
  }
  return <g>{elements}</g>;
}

function EdgeShape({ edge, nodes }: { edge: DiagramEdge; nodes: Map<string, DiagramNode> }) {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (!from || !to) return null;
  const styleMap = {
    drgLink: { color: C.icon, width: 1.5, dash: undefined as string | undefined, marker: undefined as string | undefined },
    flow: { color: C.icon, width: 1.4, dash: undefined, marker: "url(#arrow)" },
    assoc: { color: C.borderGrey, width: 1.1, dash: "5 4", marker: undefined },
    leader: { color: C.cardMagenta, width: 1, dash: "3 3", marker: undefined },
  } as const;
  const st = styleMap[edge.kind] ?? styleMap.flow;
  const dash = edge.dashed ? "5 4" : st.dash;

  let labelX: number;
  let labelY: number;
  let path: ReactNode;
  if (edge.points?.length) {
    // orthogonal route via explicit waypoints
    const first = edge.points[0];
    const last = edge.points[edge.points.length - 1];
    const a = anchorPoint(from, { ...from, x: first.x, y: first.y, w: 0, h: 0 });
    const b = anchorPoint(to, { ...to, x: last.x, y: last.y, w: 0, h: 0 });
    const pts = [{ x: a.x1, y: a.y1 }, ...edge.points, { x: b.x1, y: b.y1 }];
    const dAttr = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    path = <path d={dAttr} fill="none" stroke={st.color} strokeWidth={st.width} markerEnd={st.marker} strokeDasharray={dash} />;
    const mid = edge.points[Math.floor((edge.points.length - 1) / 2)];
    labelX = mid.x;
    labelY = mid.y - 6;
  } else {
    const { x1, y1, x2, y2 } = anchorPoint(from, to);
    path = <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={st.color} strokeWidth={st.width} markerEnd={st.marker} strokeDasharray={dash} />;
    labelX = (x1 + x2) / 2;
    labelY = (y1 + y2) / 2 - 5;
  }
  return (
    <g>
      {path}
      {edge.label ? (
        <Text x={labelX} y={labelY} size={9.5} color={st.color} italic anchor="middle">
          {edge.label}
        </Text>
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
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={C.icon} />
        </marker>
      </defs>
      <rect x={0} y={0} width={doc.width} height={doc.height} fill="#ffffff" />
      {doc.nodes.map((n) => (
        <NodeShape key={n.id} node={n} />
      ))}
      {doc.edges.map((e) => (
        <EdgeShape key={e.id} edge={e} nodes={nodeMap} />
      ))}
    </svg>
  );
});
