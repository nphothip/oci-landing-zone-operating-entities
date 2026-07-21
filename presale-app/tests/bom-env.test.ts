import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { finalizeBom, envScale } from "@/lib/bom/env";
import { priceBom } from "@/lib/pricing/resolve";
import type { EnvName } from "@/lib/domain/types";

// Per-environment BOM splitting must (a) tag every line with an env, and
// (b) preserve the grand total exactly vs the pre-split aggregate.

describe("per-environment BOM tagging", () => {
  it("every finalized item has an env; shared infra is 'shared'", () => {
    for (const tpl of Object.values(TEMPLATES)) {
      const items = finalizeBom(tpl.buildBom(tpl.defaults()));
      expect(items.every((i) => typeof i.env === "string" && i.env.length > 0), tpl.id).toBe(true);
      // landing-zone baseline (e.g. Identity Domain) is always shared
      const idDomain = items.find((i) => i.catalogKey === "identity_domain");
      expect(idDomain?.env, tpl.id).toBe("shared");
    }
  });

  it("splits web_app workload per environment and right-sizes non-prod", () => {
    const spec = TEMPLATES.web_app.defaults();
    spec.environments = ["prod", "preprod"] as EnvName[];
    const items = finalizeBom(TEMPLATES.web_app.buildBom(spec));

    const computeEnvs = new Set(items.filter((i) => i.catalogKey === "compute_e5_ocpu").map((i) => i.env));
    expect(computeEnvs).toEqual(new Set(["prod", "preprod"]));

    // adding preprod raises the total but by less than 2x (non-prod is scaled down)
    const oneEnv = { ...spec, environments: ["prod"] as EnvName[] };
    const totalOne = priceBom(finalizeBom(TEMPLATES.web_app.buildBom(oneEnv))).totals.monthlyThb;
    const totalTwo = priceBom(finalizeBom(items)).totals.monthlyThb;
    expect(totalTwo).toBeGreaterThan(totalOne);
    expect(totalTwo).toBeLessThan(totalOne * 2);

    // preprod compute is right-sized below prod (~50%)
    const prodOcpu = items.find((i) => i.catalogKey === "compute_e5_ocpu" && i.env === "prod")!;
    const preprodOcpu = items.find((i) => i.catalogKey === "compute_e5_ocpu" && i.env === "preprod")!;
    expect(preprodOcpu.quantity).toBeLessThan(prodOcpu.quantity);

    // with right-sizing disabled the envs match
    const noRightsize = finalizeBom(TEMPLATES.web_app.buildBom({ ...spec, rightsizeNonProd: false }));
    const p1 = noRightsize.find((i) => i.catalogKey === "compute_e5_ocpu" && i.env === "prod")!;
    const p2 = noRightsize.find((i) => i.catalogKey === "compute_e5_ocpu" && i.env === "preprod")!;
    expect(p1.quantity).toBe(p2.quantity);
  });

  it("honors a custom per-env scale percentage over the rightsize default", () => {
    const spec = { ...TEMPLATES.web_app.defaults(), environments: ["prod", "dev"] as EnvName[], envScalePct: { dev: 20 } };
    expect(envScale(spec, "dev")).toBeCloseTo(0.2, 5); // custom 20% wins
    expect(envScale(spec, "prod")).toBe(1); // prod is always the 100% base
    // no custom → dev falls back to the 30% rightsize ratio
    expect(envScale({ ...spec, envScalePct: undefined }, "dev")).toBeCloseTo(0.3, 5);
    // rightsize off → 100% unless a custom pct is set (custom still wins)
    expect(envScale({ ...spec, envScalePct: undefined, rightsizeNonProd: false }, "dev")).toBe(1);
    expect(envScale({ ...spec, rightsizeNonProd: false }, "dev")).toBeCloseTo(0.2, 5);
    // BOM: dev workload is scaled below prod
    const items = finalizeBom(TEMPLATES.web_app.buildBom(spec));
    const prodMem = items.find((i) => i.catalogKey === "compute_e5_mem" && i.env === "prod")!;
    const devMem = items.find((i) => i.catalogKey === "compute_e5_mem" && i.env === "dev")!;
    expect(devMem.quantity).toBeLessThan(prodMem.quantity);
  });

  it("does not split single-site templates (migration stays shared)", () => {
    const items = finalizeBom(TEMPLATES.migration.buildBom(TEMPLATES.migration.defaults()));
    const compute = items.filter((i) => i.catalogKey === "compute_e5_ocpu");
    expect(compute).toHaveLength(1);
    expect(compute[0].env).toBe("shared");
  });
});
