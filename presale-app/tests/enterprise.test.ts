import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { parseSolutionSpec } from "@/lib/domain/spec-schema";
import { buildFactoryConfig } from "@/lib/factory/config-builder";
import { finalizeBom } from "@/lib/bom/env";
import { priceBom } from "@/lib/pricing/resolve";
import { buildDeployBundle } from "@/lib/factory/deploy-bundle";
import type { EnvName } from "@/lib/domain/types";

const tpl = TEMPLATES.enterprise_lz;

describe("enterprise_lz template", () => {
  it("defaults pass the zod spec schema", () => {
    const parsed = parseSolutionSpec(tpl.defaults());
    expect(parsed.ok, parsed.ok ? "" : parsed.message).toBe(true);
  });

  it("builds a valid multi-project factory config with OKE + security targets", () => {
    const res = buildFactoryConfig(tpl.defaults());
    expect(res.ok, res.ok ? "" : res.message).toBe(true);
    if (!res.ok) return;
    const cfg = res.config;
    expect(cfg.region).toBe("ap-bangkok-1");
    expect(cfg.cis_level).toBe(2);
    // prod: 2 projects sharing the spoke VCN + an OKE platform VCN (/20)
    const prod = cfg.environments.prod;
    expect(Object.keys(prod.projects ?? {})).toEqual(["core", "digital"]);
    expect(prod.shared_project_network?.network.vcn).toMatch(/\/21$/);
    expect(prod.platforms?.oke?.network?.vcn).toMatch(/\/20$/);
    expect(prod.platforms?.oke?.extension?.type).toBe("oke_simple");
    // preprod/dev: single project, no platform
    expect(Object.keys(cfg.environments.preprod.projects ?? {})).toEqual(["core"]);
    expect(cfg.environments.preprod.platforms).toBeUndefined();
    // security_targets is a strict subset -> included, ordered
    expect(cfg.security_targets).toEqual(["prod", "preprod"]);
  });

  it("omits security_targets when it covers all environments", () => {
    const spec = tpl.defaults();
    if (spec.sizing.kind === "enterprise_lz") spec.sizing.securityTargetEnvs = ["prod", "preprod", "dev"];
    const res = buildFactoryConfig(spec);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.config.security_targets).toBeUndefined();
  });

  it("prices the default BOM fully with per-project lines", () => {
    const bom = priceBom(finalizeBom(tpl.buildBom(tpl.defaults())));
    expect(bom.totals.monthlyThb).toBeGreaterThan(0);
    expect(bom.totals.unpricedCount).toBe(0);
    const labels = bom.items.map((i) => i.label.en);
    expect(labels.some((l) => l.includes("«core»"))).toBe(true);
    expect(labels.some((l) => l.includes("«digital»"))).toBe(true);
    // per-env tagging: prod carries the OKE lines (deployed by the LZ)
    const okeCluster = bom.items.find((i) => i.catalogKey === "oke_cluster");
    expect(okeCluster?.env).toBe("prod");
    expect(okeCluster?.deployedByLz).toBe(true);
    // with OKE present the LZ ships no hub sample LB
    const hubLb = bom.items.find((i) => i.catalogKey === "lb_base");
    expect(hubLb?.deployedByLz).toBe(false);
  });

  it("ships the hub LB again when no environment has OKE", () => {
    const spec = tpl.defaults();
    if (spec.sizing.kind === "enterprise_lz") {
      for (const env of Object.keys(spec.sizing.plans) as EnvName[]) {
        const p = spec.sizing.plans[env];
        if (p) p.oke = false;
      }
    }
    const bom = priceBom(finalizeBom(tpl.buildBom(spec)));
    expect(bom.items.find((i) => i.catalogKey === "lb_base")?.deployedByLz).toBe(true);
    expect(bom.items.find((i) => i.catalogKey === "oke_cluster")).toBeUndefined();
  });

  it("deploy bundle covers the staged (hub_a) runbook", () => {
    const spec = tpl.defaults(); // hub_a -> staged package
    const gen = ["iam.json", "governance.json", "network.json", "network_pre.json", "security_cis2.json", "security_cis2_pre.json", "observability_cis2.json", "observability_cis2_pre.json"];
    const files = buildDeployBundle(spec, gen);
    const paths = files.map((f) => f.path);
    expect(paths).toEqual([
      "deploy/DEPLOY.md",
      "deploy/deploy.sh",
      "deploy/deploy.ps1",
      "deploy/oci-credentials.tfvars.json.template",
      "deploy/orm-stack.md",
    ]);
    const md = files[0].content;
    expect(md).toContain("stage1");
    expect(md).toContain("network_pre.json");
    expect(md).toContain("OCI NFW PRIVATE IP OCID"); // hub_a placeholder step
    expect(md).toContain("v2.1.3");
    // stage 1 must include iam/governance + _pre files, and NOT final network.json
    expect(md).toContain("**Step 1 applies:** iam.json, governance.json, network_pre.json, security_cis2_pre.json, observability_cis2_pre.json");
    // scripts reference the credentials template and the placeholder guard
    expect(files[1].content).toContain("oci-credentials.tfvars.json");
    expect(files[1].content).toContain("_pre.json");
    expect(files[2].content).toContain("Has-Pre");
    // credentials template carries the target region
    expect(files[3].content).toContain("ap-bangkok-1");
  });

  it("deploy bundle single-run when no *_pre files (hub_e style)", () => {
    const spec = tpl.defaults();
    spec.hub.kind = "hub_e";
    const files = buildDeployBundle(spec, ["iam.json", "governance.json", "network.json", "security_cis2.json", "observability_cis2.json"]);
    const md = files[0].content;
    expect(md).toContain("deploy.sh apply");
    expect(md).not.toContain("stage1      #");
  });
});
