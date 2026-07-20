// Style tokens shared by the SVG renderer and the draw.io serializer.
//
// Palette extracted from Oracle's own diagram sources (2026-07-21):
//  - blueprints/multi-oe/generic_v2/design/OCI_Open_LZ_Multi-OE-Blueprint.drawio
//    (uncompressed XML: fillColor/strokeColor/fontColor frequency analysis)
//  - blueprints/one-oe/design/images/*.jpg/png (visual reference)
// Canonical color coding (2_functional_view_building_blocks.jpg):
//  LZ Environment = white + red #CC0000 border · Shared Services = cream
//  #faf8d6 · Workload Environment = sage #d5e8d4 · Project = light grey
//  #eceae8 · Platform = dark grey #808080 + white text.
// VCN language: white fill, #AE562C dashed border (strokeWidth 2), name in
// #AE562C, CIDR in blue #0066CC. Icon line-art color: #2d5967.

export interface StyleToken {
  fill: string; // "none" for transparent
  stroke: string;
  strokeWidth?: number;
  /** dash pattern string, e.g. "2 2" (Oracle uses fine dots "1 2" / short dashes) */
  dash?: string;
  rounded?: boolean;
  textColor: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  /** circle rendering (gateways) */
  circle?: boolean;
  align?: "left" | "center";
  /** sublabel (2nd line) color override — CIDRs render blue like the originals */
  subColor?: string;
  /** routeCard header bar */
  headerFill?: string;
  headerText?: string;
}

export const C = {
  ink: "#1A1A1A",
  slate: "#333333",
  grey: "#666666",
  greyLight: "#999999",
  regionFill: "#f5f4f2",
  lzRed: "#CC0000",
  lzTint: "#fcfdf9",
  cream: "#faf8d6",
  sage: "#d5e8d4",
  sageDark: "#4C8A4C",
  projGrey: "#eceae8",
  projStub: "#f5f5f5",
  platform: "#808080",
  vcnOrange: "#AE562C",
  cidrBlue: "#0066CC",
  publicGreen: "#137a3f",
  icon: "#2d5967",
  cardMagenta: "#8E4585",
  cardGreen: "#5B8C3E",
  cardSalmon: "#C0504D",
  adTan: "#E3D493",
  borderGrey: "#B3B3B3",
  paleGreen: "#f5fff7",
  palePurple: "#f9f2ff",
  paleCyan: "#f0fffe",
  salmonL5: "#fbd4ca",
  yellowStrong: "#faf8a9",
} as const;

export const ORACLE_RED = C.vcnOrange;
export const TEXT_DARK = C.ink;
export const FONT_STACK = "'Oracle Sans', 'Segoe UI', 'Leelawadee UI', 'Noto Sans Thai', system-ui, sans-serif";

export const THEME: Record<string, StyleToken> = {
  canvasTitle: { fill: "none", stroke: "none", textColor: C.ink, fontSize: 17, bold: true, align: "left" },
  canvasSub: { fill: "none", stroke: "none", textColor: C.grey, fontSize: 11, align: "left" },

  // --- wrappers ------------------------------------------------------------
  region: { fill: C.regionFill, stroke: C.greyLight, strokeWidth: 1, rounded: true, textColor: C.slate, fontSize: 12, bold: true, align: "left" },
  tenancy: { fill: "#ffffff", stroke: C.slate, strokeWidth: 1.5, dash: "6 4", textColor: C.slate, fontSize: 12, bold: true, align: "left" },
  landingZone: { fill: C.lzTint, stroke: C.lzRed, strokeWidth: 1, textColor: C.slate, fontSize: 12, bold: true, align: "left" },

  // --- compartments (canonical color coding) -------------------------------
  compartmentShared: { fill: C.cream, stroke: C.grey, strokeWidth: 1, dash: "1 2", textColor: C.slate, fontSize: 11.5, bold: true, align: "left" },
  compartmentEnv: { fill: C.sage, stroke: C.grey, strokeWidth: 1, dash: "1 2", textColor: C.slate, fontSize: 11.5, bold: true, align: "left" },
  compartmentProjects: { fill: C.projGrey, stroke: C.grey, strokeWidth: 1, dash: "1 2", textColor: C.slate, fontSize: 11, bold: true, align: "left" },
  compartmentProject: { fill: "#ffffff", stroke: C.greyLight, strokeWidth: 1, dash: "4 3", textColor: C.slate, fontSize: 11, align: "left" },
  compartmentPlatform: { fill: C.platform, stroke: C.grey, strokeWidth: 1, textColor: "#ffffff", fontSize: 11, bold: true, align: "left" },
  // legacy aliases still emitted by older layouts/tests
  compartmentRoot: { fill: C.lzTint, stroke: C.lzRed, strokeWidth: 1, textColor: C.slate, fontSize: 12, bold: true, align: "left" },
  compartmentChild: { fill: C.cream, stroke: C.grey, strokeWidth: 1, dash: "1 2", textColor: C.slate, fontSize: 11, bold: true, align: "left" },
  compartmentShared2: { fill: C.yellowStrong, stroke: C.grey, strokeWidth: 1, textColor: C.slate, fontSize: 11, bold: true, align: "left" },

  // --- network -------------------------------------------------------------
  vcn: { fill: "#ffffff", stroke: C.vcnOrange, strokeWidth: 2, dash: "7 4", textColor: C.vcnOrange, fontSize: 12, bold: true, align: "left", subColor: C.cidrBlue },
  subnetPublic: { fill: "#ffffff", stroke: C.publicGreen, strokeWidth: 1.3, dash: "5 3", textColor: C.publicGreen, fontSize: 11, bold: true, align: "left", subColor: C.cidrBlue },
  subnetPrivate: { fill: "#ffffff", stroke: C.vcnOrange, strokeWidth: 1.3, dash: "5 3", textColor: C.vcnOrange, fontSize: 11, bold: true, align: "left", subColor: C.cidrBlue },
  gateway: { fill: "#ffffff", stroke: C.icon, strokeWidth: 1.5, textColor: C.slate, fontSize: 9, circle: true },
  drg: { fill: "#ffffff", stroke: C.icon, strokeWidth: 1.5, rounded: true, textColor: "#2d4049", fontSize: 11, bold: true },
  drgPill: { fill: "#ffffff", stroke: C.cidrBlue, strokeWidth: 1, rounded: true, textColor: C.cidrBlue, fontSize: 10, bold: true },
  fw: { fill: "#ffffff", stroke: C.icon, strokeWidth: 1.2, textColor: C.vcnOrange, fontSize: 9.5, bold: true },
  lb: { fill: "#ffffff", stroke: C.icon, strokeWidth: 1.2, textColor: C.publicGreen, fontSize: 9.5, bold: true },

  // --- cards / panels ------------------------------------------------------
  routeCardHub: { fill: "#ffffff", stroke: C.cardMagenta, strokeWidth: 1, textColor: C.slate, fontSize: 9.5, align: "left", headerFill: C.cardMagenta, headerText: "#ffffff" },
  routeCardSpoke: { fill: "#ffffff", stroke: C.cardGreen, strokeWidth: 1, textColor: C.slate, fontSize: 9.5, align: "left", headerFill: C.cardGreen, headerText: "#ffffff" },
  routeCardDrg: { fill: "#ffffff", stroke: C.cardSalmon, strokeWidth: 1, textColor: C.slate, fontSize: 9.5, align: "left", headerFill: C.cardSalmon, headerText: "#ffffff" },
  stackCard: { fill: "#ffffff", stroke: C.icon, strokeWidth: 1, textColor: C.slate, fontSize: 9.5, align: "left", headerFill: C.icon, headerText: "#ffffff" },
  panel: { fill: "#ffffff", stroke: C.borderGrey, strokeWidth: 1, rounded: true, textColor: "#5C5C5C", fontSize: 12.5, bold: true, align: "left" },
  panelCream: { fill: C.cream, stroke: C.grey, strokeWidth: 1, dash: "1 2", textColor: C.slate, fontSize: 12, bold: true, align: "left" },
  resourceTile: { fill: "#ffffff", stroke: C.borderGrey, strokeWidth: 1, dash: "1 2", textColor: C.slate, fontSize: 11, bold: true, align: "left" },
  iconTile: { fill: "#ffffff", stroke: C.borderGrey, strokeWidth: 1, textColor: C.slate, fontSize: 10, bold: true },
  adTab: { fill: "#E3D493", stroke: C.greyLight, strokeWidth: 1, rounded: true, textColor: C.slate, fontSize: 9, bold: true },

  // --- functional blocks (canonical legend colors) -------------------------
  blockLze: { fill: "#ffffff", stroke: C.lzRed, strokeWidth: 1.2, textColor: C.ink, fontSize: 11.5, bold: true },
  blockShared: { fill: C.cream, stroke: C.slate, strokeWidth: 1, textColor: C.ink, fontSize: 11.5, bold: true },
  blockEnv: { fill: C.sage, stroke: C.slate, strokeWidth: 1, textColor: C.ink, fontSize: 11.5, bold: true },
  blockProject: { fill: C.projGrey, stroke: C.grey, strokeWidth: 1, textColor: C.ink, fontSize: 11.5, bold: true },
  blockPlatform: { fill: C.platform, stroke: C.grey, strokeWidth: 1, textColor: "#ffffff", fontSize: 11.5, bold: true },
  persona: { fill: "#ffffff", stroke: C.icon, strokeWidth: 1.2, rounded: true, textColor: C.slate, fontSize: 10.5, bold: true },

  // --- services ------------------------------------------------------------
  service: { fill: "#ffffff", stroke: C.greyLight, strokeWidth: 1, rounded: true, textColor: C.slate, fontSize: 10.5 },
  serviceSecurity: { fill: "#ffffff", stroke: C.greyLight, strokeWidth: 1, dash: "4 3", textColor: C.slate, fontSize: 10.5 },
  serviceObs: { fill: "#ffffff", stroke: C.greyLight, strokeWidth: 1, dash: "4 3", textColor: C.slate, fontSize: 10.5 },
  stage: { fill: "#ffffff", stroke: C.icon, strokeWidth: 1.2, textColor: C.slate, fontSize: 10.5, bold: true },
  actor: { fill: C.regionFill, stroke: C.grey, strokeWidth: 1, rounded: true, textColor: C.slate, fontSize: 11, bold: true },

  // --- annotations ---------------------------------------------------------
  zone: { fill: "none", stroke: C.greyLight, strokeWidth: 1, dash: "1 2", textColor: C.grey, fontSize: 11, bold: true, align: "left" },
  note: { fill: "#fffbe6", stroke: "#e0b400", strokeWidth: 1, textColor: C.slate, fontSize: 9.5, align: "left", italic: true },
  legendTitle: { fill: "none", stroke: "none", textColor: C.ink, fontSize: 13, bold: true, align: "left" },
  legendItem: { fill: "#ffffff", stroke: C.greyLight, strokeWidth: 1, textColor: C.slate, fontSize: 9.5, align: "left" },
  badge: { fill: C.yellowStrong, stroke: C.grey, strokeWidth: 1, circle: true, textColor: C.ink, fontSize: 10.5, bold: true },
};

export function styleOf(token: string): StyleToken {
  return THEME[token] ?? THEME.service;
}
