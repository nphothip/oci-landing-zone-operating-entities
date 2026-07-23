import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { XMLParser } from "./xml-lite";
import { TEMPLATES } from "@/lib/templates";
import { buildDiagrams } from "@/lib/diagrams";
import { toDrawio } from "@/lib/diagrams/drawio";
import type { DiagramDoc, LacFile } from "@/lib/domain/types";

const fx = (name: string): LacFile => ({
  path: `generated/${name}`,
  content: readFileSync(path.join(__dirname, "fixtures", name), "utf8"),
});

const FILES = [fx("iam.json"), fx("network.json"), fx("observability_cis1.json")];

function specWithTwoEnvs() {
  const spec = TEMPLATES.web_app.defaults();
  spec.environments = ["prod", "preprod"];
  return spec;
}

describe("diagram pipeline", () => {
  const diagrams = buildDiagrams(specWithTwoEnvs(), FILES);

  it("produces all ten views", () => {
    expect(diagrams.map((d) => d.view)).toEqual([
      "functional", "security", "network", "operations", "runtime",
      "governance", "identity", "logging", "backup", "traffic",
    ]);
    for (const d of diagrams) {
      expect(d.nodes.length, d.view).toBeGreaterThan(3);
      expect(d.width).toBeGreaterThan(300);
    }
  });

  it("renders the real compartment tree and hub-spoke topology", () => {
    const security = diagrams.find((d) => d.view === "security")!;
    expect(security.nodes.some((n) => n.label === "cmp-landingzone")).toBe(true);
    expect(security.nodes.some((n) => n.label === "cmp-lz-prod-app1")).toBe(true);
    const network = diagrams.find((d) => d.view === "network")!;
    expect(network.nodes.some((n) => n.label === "vcn-sin-lz-hub")).toBe(true);
    expect(network.nodes.filter((n) => n.kind === "vcn")).toHaveLength(3); // hub + 2 spokes
    expect(network.nodes.some((n) => n.style === "fw")).toBe(true); // hub_b fixture has an NFW
  });

  it("keeps sibling boxes from overlapping", () => {
    for (const d of diagrams) assertNoSiblingOverlap(d);
  });

  it("serializes well-formed draw.io XML with 10 pages and escaped labels", () => {
    const xml = toDrawio(diagrams);
    expect(xml).toContain("<mxfile");
    expect((xml.match(/<diagram /g) ?? []).length).toBe(10);
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#39;|#\d+;)/); // raw ampersands
    new XMLParser().assertWellFormed(xml);
  });
});

function assertNoSiblingOverlap(doc: DiagramDoc) {
  const byParent = new Map<string, typeof doc.nodes>();
  for (const n of doc.nodes) {
    const key = n.parent ?? "__root__";
    byParent.set(key, [...(byParent.get(key) ?? []), n]);
  }
  for (const [parent, siblings] of byParent) {
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i];
        const b = siblings[j];
        if (a.kind === "canvasTitle" || b.kind === "canvasTitle") continue;
        if (a.kind === "gateway" || b.kind === "gateway") continue; // gateways sit on borders by design
        if (a.style === "adTab" || b.style === "adTab") continue; // AD tabs peek over the VCN edge by design
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${doc.view}: "${a.label}" overlaps "${b.label}" (parent ${parent})`).toBe(false);
      }
    }
  }
}
