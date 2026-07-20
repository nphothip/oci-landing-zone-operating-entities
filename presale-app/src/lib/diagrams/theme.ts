// Style tokens shared by the SVG renderer and the draw.io serializer.
// Palette follows the repo's diagram conventions (One-OE design images +
// .agents/skills/landing-zone-config/references/diagram-conventions.md):
// VCN = dashed Oracle-red frame, public subnet green / private red, pastel
// compartment fills, grey structural elements.

export interface StyleToken {
  fill: string; // "none" for transparent
  stroke: string;
  dashed?: boolean;
  rounded?: boolean;
  textColor: string;
  fontSize: number;
  bold?: boolean;
  /** circle rendering (gateways) */
  circle?: boolean;
  align?: "left" | "center";
}

export const ORACLE_RED = "#C74634";
export const TEXT_DARK = "#312D2A";
export const FONT_STACK = "'Segoe UI', 'Leelawadee UI', 'Noto Sans Thai', system-ui, sans-serif";

export const THEME: Record<string, StyleToken> = {
  canvasTitle: { fill: "none", stroke: "none", textColor: TEXT_DARK, fontSize: 18, bold: true, align: "left" },

  // compartments
  compartmentRoot: { fill: "#eef2f7", stroke: "#5b6472", textColor: TEXT_DARK, fontSize: 13, bold: true, align: "left" },
  compartmentEnv: { fill: "#e6f6ec", stroke: "#5b6472", textColor: TEXT_DARK, fontSize: 12, bold: true, align: "left" },
  compartmentShared: { fill: "#ffec99", stroke: "#5b6472", textColor: TEXT_DARK, fontSize: 12, align: "left" },
  compartmentChild: { fill: "#fff9db", stroke: "#8d99ae", textColor: TEXT_DARK, fontSize: 11, align: "left" },
  compartmentPlatform: { fill: "#e2e8f0", stroke: "#8d99ae", textColor: TEXT_DARK, fontSize: 11, align: "left" },

  // network
  vcn: { fill: "none", stroke: ORACLE_RED, dashed: true, textColor: ORACLE_RED, fontSize: 12, bold: true, align: "left" },
  subnetPublic: { fill: "#ebfbee", stroke: "#2f9e44", dashed: true, textColor: "#2b8a3e", fontSize: 11, align: "left" },
  subnetPrivate: { fill: "#fff5f5", stroke: ORACLE_RED, dashed: true, textColor: "#a4262c", fontSize: 11, align: "left" },
  gateway: { fill: "#ffffff", stroke: "#5b6472", textColor: TEXT_DARK, fontSize: 9, circle: true },
  drg: { fill: "#e9ecef", stroke: "#5b6472", rounded: true, textColor: TEXT_DARK, fontSize: 12, bold: true },
  fw: { fill: "#ffe3e3", stroke: ORACLE_RED, textColor: "#a4262c", fontSize: 10, rounded: true },
  lb: { fill: "#d0ebff", stroke: "#1971c2", textColor: "#1864ab", fontSize: 10, rounded: true },

  // generic service / block styles
  service: { fill: "#ffffff", stroke: "#5b6472", rounded: true, textColor: TEXT_DARK, fontSize: 11 },
  serviceSecurity: { fill: "#fff0f6", stroke: "#a61e4d", rounded: true, textColor: "#a61e4d", fontSize: 11 },
  serviceObs: { fill: "#e7f5ff", stroke: "#1971c2", rounded: true, textColor: "#1864ab", fontSize: 11 },
  blockIam: { fill: "#d0ebff", stroke: "#1971c2", textColor: TEXT_DARK, fontSize: 11 },
  blockNetwork: { fill: "#ffe8cc", stroke: "#e8590c", textColor: TEXT_DARK, fontSize: 11 },
  blockSecurity: { fill: "#ffe3e3", stroke: ORACLE_RED, textColor: TEXT_DARK, fontSize: 11 },
  blockObs: { fill: "#d3f9d8", stroke: "#2f9e44", textColor: TEXT_DARK, fontSize: 11 },
  blockGov: { fill: "#e5dbff", stroke: "#7048e8", textColor: TEXT_DARK, fontSize: 11 },
  blockWorkload: { fill: "#fff3bf", stroke: "#f08c00", textColor: TEXT_DARK, fontSize: 11, bold: true },
  persona: { fill: "#f1f3f5", stroke: "#868e96", rounded: true, textColor: TEXT_DARK, fontSize: 11 },

  // cards / misc
  routeCardHub: { fill: "#e5dbff", stroke: "#7048e8", textColor: TEXT_DARK, fontSize: 10, align: "left" },
  routeCardSpoke: { fill: "#d3f9d8", stroke: "#2f9e44", textColor: TEXT_DARK, fontSize: 10, align: "left" },
  routeCardDrg: { fill: "#ffe3e3", stroke: ORACLE_RED, textColor: TEXT_DARK, fontSize: 10, align: "left" },
  zone: { fill: "#f8f9fa", stroke: "#adb5bd", dashed: true, textColor: "#495057", fontSize: 12, bold: true, align: "left" },
  note: { fill: "#fffbe6", stroke: "#f59f00", textColor: TEXT_DARK, fontSize: 10, align: "left" },
  stage: { fill: "#f3f0ff", stroke: "#7048e8", rounded: true, textColor: TEXT_DARK, fontSize: 11, bold: true },
  actor: { fill: "#f1f3f5", stroke: "#495057", rounded: true, textColor: TEXT_DARK, fontSize: 11, bold: true },
};

export function styleOf(token: string): StyleToken {
  return THEME[token] ?? THEME.service;
}
