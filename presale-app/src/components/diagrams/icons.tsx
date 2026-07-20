import type { ReactNode } from "react";
import { C } from "@/lib/diagrams/theme";

// Minimal line-art glyphs in Oracle's icon language (stroke #2d5967, no fill).
// All are drawn in a 24x24 viewBox and scaled by the renderer.

const S = C.icon;
const sw = 1.6;
const line = { stroke: S, strokeWidth: sw, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function arrow(x1: number, y1: number, x2: number, y2: number, key?: string): ReactNode {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a1x = x2 - 3 * Math.cos(ang - 0.5);
  const a1y = y2 - 3 * Math.sin(ang - 0.5);
  const a2x = x2 - 3 * Math.cos(ang + 0.5);
  const a2y = y2 - 3 * Math.sin(ang + 0.5);
  return (
    <g key={key}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} {...line} />
      <polyline points={`${a1x},${a1y} ${x2},${y2} ${a2x},${a2y}`} {...line} />
    </g>
  );
}

export const ICONS: Record<string, ReactNode> = {
  // routers / gateways — circle with crossing arrows (Oracle's DRG/GW motif)
  drg: (
    <g>
      {arrow(12, 21, 12, 3, "a")}
      {arrow(3, 12, 21, 12, "b")}
      {arrow(5.5, 18.5, 18.5, 5.5, "c")}
    </g>
  ),
  igw: (
    <g>
      <circle cx={12} cy={12} r={8.5} {...line} />
      <ellipse cx={12} cy={12} rx={4} ry={8.5} {...line} />
      <line x1={3.5} y1={12} x2={20.5} y2={12} {...line} />
    </g>
  ),
  natgw: (
    <g>
      {arrow(4, 9, 20, 9, "a")}
      {arrow(20, 15, 4, 15, "b")}
    </g>
  ),
  sgw: (
    <g>
      <path d="M5 15 a4.5 4.5 0 1 1 1.5 -8.5 a5.5 5.5 0 0 1 10.5 1 a4 4 0 0 1 1 7.5 z" {...line} />
      {arrow(12, 21, 12, 12, "a")}
    </g>
  ),
  fw: (
    <g>
      <rect x={3} y={9} width={18} height={12} {...line} />
      <line x1={3} y1={13} x2={21} y2={13} {...line} />
      <line x1={3} y1={17} x2={21} y2={17} {...line} />
      <line x1={9} y1={9} x2={9} y2={13} {...line} />
      <line x1={15} y1={9} x2={15} y2={13} {...line} />
      <line x1={6} y1={13} x2={6} y2={17} {...line} />
      <line x1={12} y1={13} x2={12} y2={17} {...line} />
      <line x1={18} y1={13} x2={18} y2={17} {...line} />
      <path d="M12 1.5 c2.5 2 3.5 3.6 2.2 5.6 c1.4 -0.3 2 -1 2.3 -2 c1 1.8 0.6 4 -1.4 5.4 h-6.2 c-1.8 -1.6 -2 -3.8 -0.6 -5.6 c0.2 1 0.8 1.6 1.8 1.8 c-1 -2.2 0 -3.8 1.9 -5.2 z" {...line} />
    </g>
  ),
  lb: (
    <g>
      <circle cx={6} cy={12} r={3.5} {...line} />
      {arrow(9.5, 12, 20, 12, "a")}
      {arrow(8.5, 9.5, 19, 4.5, "b")}
      {arrow(8.5, 14.5, 19, 19.5, "c")}
    </g>
  ),
  rt: (
    <g>
      <rect x={4} y={3} width={16} height={18} {...line} />
      <line x1={7} y1={8} x2={17} y2={8} {...line} />
      <line x1={7} y1={12} x2={17} y2={12} {...line} />
      <line x1={7} y1={16} x2={13} y2={16} {...line} />
    </g>
  ),
  people: (
    <g>
      <circle cx={8.5} cy={8} r={3.2} {...line} />
      <path d="M3 20 c0 -4 2.5 -6 5.5 -6 c3 0 5.5 2 5.5 6" {...line} />
      <circle cx={16.5} cy={7} r={2.6} {...line} />
      <path d="M15.5 13.6 c3 -0.4 5.5 1.6 5.5 5.4" {...line} />
    </g>
  ),
  shield: (
    <g>
      <path d="M12 2.5 L20 5.5 v6 c0 5 -3.5 8.5 -8 10 c-4.5 -1.5 -8 -5 -8 -10 v-6 z" {...line} />
      <path d="M8.5 12 l2.5 2.5 l4.5 -5" {...line} />
    </g>
  ),
  scan: (
    <g>
      <circle cx={11} cy={11} r={6.5} {...line} />
      <line x1={15.8} y1={15.8} x2={21} y2={21} {...line} />
      <line x1={8} y1={11} x2={14} y2={11} {...line} />
      <line x1={11} y1={8} x2={11} y2={14} {...line} />
    </g>
  ),
  key: (
    <g>
      <circle cx={8} cy={8} r={4.5} {...line} />
      <line x1={11.2} y1={11.2} x2={20} y2={20} {...line} />
      <line x1={16.5} y1={16.5} x2={19} y2={14} {...line} />
      <line x1={19} y1={19} x2={21} y2={17} {...line} />
    </g>
  ),
  bell: (
    <g>
      <path d="M6 17 v-6 a6 6 0 0 1 12 0 v6 l1.5 2.5 h-15 z" {...line} />
      <path d="M10.5 21.5 a1.8 1.8 0 0 0 3 0" {...line} />
    </g>
  ),
  logs: (
    <g>
      <path d="M6 2.5 h9 l4 4 v15 h-13 z" {...line} />
      <path d="M15 2.5 v4 h4" {...line} />
      <line x1={9} y1={11} x2={17} y2={11} {...line} />
      <line x1={9} y1={14.5} x2={17} y2={14.5} {...line} />
      <line x1={9} y1={18} x2={14} y2={18} {...line} />
    </g>
  ),
  events: (
    <g>
      <circle cx={7} cy={7} r={3} {...line} />
      <circle cx={17} cy={7} r={3} {...line} />
      <circle cx={12} cy={17} r={3} {...line} />
      <line x1={8.5} y1={9.5} x2={10.5} y2={14.5} {...line} />
      <line x1={15.5} y1={9.5} x2={13.5} y2={14.5} {...line} />
    </g>
  ),
  cloud: (
    <g>
      <path d="M6 17.5 a4.5 4.5 0 1 1 1 -8.9 a6 6 0 0 1 11.5 1.6 a4 4 0 0 1 -0.6 7.3 z" {...line} />
    </g>
  ),
  onprem: (
    <g>
      <rect x={4} y={3} width={16} height={18} {...line} />
      <line x1={8} y1={7} x2={10.5} y2={7} {...line} />
      <line x1={13.5} y1={7} x2={16} y2={7} {...line} />
      <line x1={8} y1={11} x2={10.5} y2={11} {...line} />
      <line x1={13.5} y1={11} x2={16} y2={11} {...line} />
      <rect x={10} y={16} width={4} height={5} {...line} />
    </g>
  ),
  k8s: (
    <g>
      <circle cx={12} cy={12} r={8.5} {...line} />
      <circle cx={12} cy={12} r={2.2} {...line} />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return <line key={deg} x1={12 + 3.2 * Math.cos(rad)} y1={12 + 3.2 * Math.sin(rad)} x2={12 + 7.6 * Math.cos(rad)} y2={12 + 7.6 * Math.sin(rad)} {...line} />;
      })}
    </g>
  ),
  db: (
    <g>
      <ellipse cx={12} cy={5.5} rx={8} ry={3} {...line} />
      <path d="M4 5.5 v13 c0 1.7 3.6 3 8 3 c4.4 0 8 -1.3 8 -3 v-13" {...line} />
      <path d="M4 12 c0 1.7 3.6 3 8 3 c4.4 0 8 -1.3 8 -3" {...line} />
    </g>
  ),
  ai: (
    <g>
      <path d="M12 3 l1.8 5.2 L19 10 l-5.2 1.8 L12 17 l-1.8 -5.2 L5 10 l5.2 -1.8 z" {...line} />
      <path d="M18.5 15.5 l0.9 2.6 l2.6 0.9 l-2.6 0.9 l-0.9 2.6 l-0.9 -2.6 l-2.6 -0.9 l2.6 -0.9 z" {...line} />
    </g>
  ),
  archive: (
    <g>
      <rect x={3} y={4} width={18} height={5} {...line} />
      <path d="M4.5 9 v10.5 h15 V9" {...line} />
      <line x1={9.5} y1={13} x2={14.5} y2={13} {...line} />
    </g>
  ),
  chat: (
    <g>
      <path d="M3.5 4.5 h17 v11 h-10 l-4.5 4 v-4 h-2.5 z" {...line} />
      <line x1={7.5} y1={9} x2={16.5} y2={9} {...line} />
      <line x1={7.5} y1={12} x2={13.5} y2={12} {...line} />
    </g>
  ),
  compute: (
    <g>
      <rect x={5} y={5} width={14} height={14} {...line} />
      <rect x={9} y={9} width={6} height={6} {...line} />
      {[8, 12, 16].map((p) => (
        <g key={p}>
          <line x1={p} y1={2} x2={p} y2={5} {...line} />
          <line x1={p} y1={19} x2={p} y2={22} {...line} />
          <line x1={2} y1={p} x2={5} y2={p} {...line} />
          <line x1={19} y1={p} x2={22} y2={p} {...line} />
        </g>
      ))}
    </g>
  ),
  user: (
    <g>
      <circle cx={12} cy={7.5} r={4} {...line} />
      <path d="M4.5 21 c0 -5 3.3 -7.5 7.5 -7.5 c4.2 0 7.5 2.5 7.5 7.5" {...line} />
    </g>
  ),
  gear: (
    <g>
      <circle cx={12} cy={12} r={3.5} {...line} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return <line key={deg} x1={12 + 5.5 * Math.cos(rad)} y1={12 + 5.5 * Math.sin(rad)} x2={12 + 8.5 * Math.cos(rad)} y2={12 + 8.5 * Math.sin(rad)} {...line} />;
      })}
    </g>
  ),
  git: (
    <g>
      <circle cx={6} cy={6} r={2.8} {...line} />
      <circle cx={6} cy={18} r={2.8} {...line} />
      <circle cx={18} cy={12} r={2.8} {...line} />
      <path d="M6 8.8 v6.4 M8.4 7.2 c4 1 6.8 2 6.8 4.8" {...line} />
    </g>
  ),
};

/** VCN corner "flower" marker (drawn in the VCN's orange). */
export function VcnFlower({ x, y, size = 14 }: { x: number; y: number; size?: number }): ReactNode {
  const r = size / 2;
  const petals = [0, 60, 120, 180, 240, 300].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return (
      <ellipse
        key={deg}
        cx={x + r * 0.55 * Math.cos(rad)}
        cy={y + r * 0.55 * Math.sin(rad)}
        rx={r * 0.34}
        ry={r * 0.2}
        transform={`rotate(${deg} ${x + r * 0.55 * Math.cos(rad)} ${y + r * 0.55 * Math.sin(rad)})`}
        fill="none"
        stroke={C.vcnOrange}
        strokeWidth={1.1}
      />
    );
  });
  return (
    <g>
      {petals}
      <circle cx={x} cy={y} r={r * 0.18} fill={C.vcnOrange} />
    </g>
  );
}

export function Icon({ name, x, y, size = 20 }: { name: string; x: number; y: number; size?: number }): ReactNode {
  const glyph = ICONS[name];
  if (!glyph) return null;
  const s = size / 24;
  return <g transform={`translate(${x}, ${y}) scale(${s})`}>{glyph}</g>;
}
