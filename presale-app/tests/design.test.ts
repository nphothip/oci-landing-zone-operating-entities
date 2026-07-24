import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GenerateResult, EnvName, LocalizedText } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { finalizeBom } from "@/lib/bom/env";
import { priceBom } from "@/lib/pricing/resolve";
import { buildDiagrams } from "@/lib/diagrams";
import { buildDesignFacts } from "@/lib/design/facts";
import { buildDesignDocument } from "@/lib/design/document";
import { renderDesignHtml } from "@/lib/design/html";

const enT = (x: LocalizedText) => x.en;
const fx = (n: string) => ({ path: `generated/${n}`, content: readFileSync(path.join(__dirname, "fixtures", n), "utf8") });

function fakeResult(): GenerateResult {
  const spec = TEMPLATES.web_app.defaults();
  spec.environments = ["prod", "preprod"] as EnvName[];
  const files = [fx("iam.json"), fx("network.json"), fx("observability_cis1.json")];
  return {
    spec,
    factoryConfig: {} as never,
    bom: priceBom(finalizeBom(TEMPLATES.web_app.buildBom(spec))),
    diagrams: buildDiagrams(spec, files),
    lac: { files },
    assumptions: TEMPLATES.web_app.assumptions(spec),
    warnings: [],
  };
}

describe("design document", () => {
  const result = fakeResult();

  it("derives design facts from the generated LZ", () => {
    const facts = buildDesignFacts(result);
    expect(facts.compartments).toContain("cmp-landingzone");
    expect(facts.vcns.some((v) => v.role === "hub")).toBe(true);
    expect(facts.vcns.filter((v) => v.role === "spoke").length).toBeGreaterThanOrEqual(2);
    expect(facts.groups.length).toBeGreaterThan(3);
    expect(facts.cost.monthlyThb).toBeGreaterThan(0);
    expect(facts.cost.byEnv.some((e) => e.env === "prod")).toBe(true);
  });

  it("builds all document sections", () => {
    const doc = buildDesignDocument(result);
    const ids = doc.sections.map((s) => s.id);
    expect(ids).toEqual([
      "executive", "overview", "functional", "security", "network", "operations", "runtime",
      "compartment-posture", "identity-groups", "password-policy", "mfa", "traffic-flow", "logging-central", "backup",
      "resilience", "ipplan", "iam-matrix",
      "bom", "assumptions", "deployment", "references",
    ]);
    expect(doc.sections.find((s) => s.id === "network")?.view).toBe("network");
    expect(doc.sections.find((s) => s.id === "traffic-flow")?.view).toBe("traffic");
    expect(doc.sections.find((s) => s.id === "compartment-posture")?.view).toBe("governance");
    expect(doc.sections.find((s) => s.id === "logging-central")?.view).toBe("logging");
    expect(doc.sections.every((s) => s.paragraphs.length > 0 || s.kind !== "prose")).toBe(true);
  });

  it("renders self-contained printable HTML with embedded diagrams", () => {
    const doc = buildDesignDocument(result);
    const html = renderDesignHtml({
      title: enT(doc.title),
      subtitle: enT(doc.subtitle),
      meta: doc.meta.map((m) => ({ label: enT(m.label), value: m.value })),
      sections: doc.sections.map((s) => ({
        id: s.id,
        heading: enT(s.heading),
        paragraphs: s.paragraphs.map(enT),
        svg: s.view ? '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>' : undefined,
        kind: s.kind,
      })),
      bom: { rows: [{ category: "Compute", label: "App VM", env: "prod", scope: "post-LZ", qty: "4 OCPU", monthly: "฿89.28" }], total: "฿3,238.10", source: "fallback" },
      assumptions: ["prices are list prices"],
      deploymentFiles: ["network.json", "iam.json"],
      footer: "internal tool",
      generatedAt: "2026-07-21",
    });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Network Design");
    expect(html).toContain("<svg"); // an embedded diagram
    expect(html).toContain("Total per month");
    expect(html).toContain("@page"); // print stylesheet
    // no raw unescaped ampersands in the body text
    expect(html.replace(/<style>[\s\S]*?<\/style>/, "").match(/&(?!amp;|lt;|gt;|quot;|#\d+;)/)).toBeNull();
  });
});
