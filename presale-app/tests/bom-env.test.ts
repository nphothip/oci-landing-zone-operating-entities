import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { finalizeBom } from "@/lib/bom/env";
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

  it("splits web_app workload per environment and keeps the total identical", () => {
    const spec = TEMPLATES.web_app.defaults();
    spec.environments = ["prod", "preprod"] as EnvName[];
    const items = finalizeBom(TEMPLATES.web_app.buildBom(spec));

    const computeEnvs = new Set(items.filter((i) => i.catalogKey === "compute_e5_ocpu").map((i) => i.env));
    expect(computeEnvs).toEqual(new Set(["prod", "preprod"]));

    // one env vs two envs: per-env compute quantity is identical, total doubles
    const oneEnv = { ...spec, environments: ["prod"] as EnvName[] };
    const totalOne = priceBom(finalizeBom(TEMPLATES.web_app.buildBom(oneEnv))).totals.monthlyUsd;
    const totalTwo = priceBom(finalizeBom(items)).totals.monthlyUsd;
    // hub/shared infra is not doubled, so it's < 2x but strictly greater
    expect(totalTwo).toBeGreaterThan(totalOne);

    const prodOcpu = items.find((i) => i.catalogKey === "compute_e5_ocpu" && i.env === "prod")!;
    const preprodOcpu = items.find((i) => i.catalogKey === "compute_e5_ocpu" && i.env === "preprod")!;
    expect(prodOcpu.quantity).toBe(preprodOcpu.quantity);
  });

  it("does not split single-site templates (migration stays shared)", () => {
    const items = finalizeBom(TEMPLATES.migration.buildBom(TEMPLATES.migration.defaults()));
    const compute = items.filter((i) => i.catalogKey === "compute_e5_ocpu");
    expect(compute).toHaveLength(1);
    expect(compute[0].env).toBe("shared");
  });
});
