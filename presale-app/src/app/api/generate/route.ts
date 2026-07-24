import { NextResponse } from "next/server";
import type { GenerateResult, LacFile } from "@/lib/domain/types";
import { parseSolutionSpec } from "@/lib/domain/spec-schema";
import { buildFactoryConfig } from "@/lib/factory/config-builder";
import { runGenerator } from "@/lib/factory/run-generator";
import { buildLacReadme } from "@/lib/factory/readme-template";
import { buildDeployBundle } from "@/lib/factory/deploy-bundle";
import { TEMPLATES } from "@/lib/templates";
import { finalizeBom, applyEnvOverride } from "@/lib/bom/env";
import { applyBurst, burstAssumptions } from "@/lib/bom/burst";
import { applyTraffic } from "@/lib/bom/traffic";
import { applyAddOns, addOnAssumptions } from "@/lib/bom/addons";
import { priceBom } from "@/lib/pricing/resolve";
import { buildDiagrams } from "@/lib/diagrams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = parseSolutionSpec(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: `invalid spec: ${parsed.message}` }, { status: 400 });
  }
  const spec = parsed.spec;

  const cfg = buildFactoryConfig(spec);
  if (!cfg.ok) {
    return NextResponse.json({ error: cfg.message, stage: "config" }, { status: 422 });
  }

  const gen = await runGenerator(cfg.config);
  if (!gen.ok) {
    const status = gen.stage === "environment" ? 500 : 422;
    return NextResponse.json({ error: gen.message, stage: gen.stage }, { status });
  }

  const template = TEMPLATES[spec.template];
  const warnings: string[] = [];
  const assumptions = [...template.assumptions(spec), ...burstAssumptions(spec), ...addOnAssumptions(spec)];
  // Add-ons land after applyEnvOverride on purpose: the presale typed those
  // quantities for a specific environment, so nothing may re-scale them.
  const bom = priceBom(
    finalizeBom(applyAddOns(spec, applyEnvOverride(spec, applyTraffic(spec, applyBurst(spec, template.buildBom(spec)))))),
  );
  if (bom.totals.unpricedCount > 0) {
    warnings.push(`${bom.totals.unpricedCount} BOM item(s) could not be priced — totals are partial`);
  }

  const diagrams = buildDiagrams(spec, gen.files);

  const files: LacFile[] = [
    { path: "config.json", content: JSON.stringify(cfg.config, null, 2) + "\n" },
    ...gen.files,
  ];
  files.push({ path: "README.md", content: buildLacReadme(spec, gen.files, assumptions) });
  // Deploy-ready bundle (orchestrator scripts + runbook) — names stripped of generated/ prefix
  const genNames = gen.files.map((f) => f.path.replace(/^generated\//, ""));
  files.push(...buildDeployBundle(spec, genNames));

  const result: GenerateResult = {
    spec,
    factoryConfig: cfg.config,
    bom,
    diagrams,
    lac: { files },
    assumptions,
    warnings,
  };
  return NextResponse.json(result);
}
