import type { FactoryConfig, SolutionSpec } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { findOverlap } from "@/lib/domain/cidr";

export type ConfigBuildResult =
  | { ok: true; config: FactoryConfig }
  | { ok: false; message: string };

/** SolutionSpec -> Blueprint Factory config, with a friendly CIDR pre-check. */
export function buildFactoryConfig(spec: SolutionSpec): ConfigBuildResult {
  const template = TEMPLATES[spec.template];
  if (!template) return { ok: false, message: `unknown template: ${spec.template}` };

  const config = template.buildFactoryConfig(spec);

  const cidrs: { name: string; cidr: string }[] = [{ name: "hub", cidr: config.hub.network.vcn }];
  for (const [env, envCfg] of Object.entries(config.environments)) {
    if (envCfg.shared_project_network) {
      cidrs.push({ name: `${env} spoke`, cidr: envCfg.shared_project_network.network.vcn });
    }
    for (const [pname, p] of Object.entries(envCfg.platforms ?? {})) {
      if (p.network) cidrs.push({ name: `${env}/${pname}`, cidr: p.network.vcn });
    }
  }
  const overlap = findOverlap(cidrs);
  if (overlap) return { ok: false, message: `CIDR overlap: ${overlap}` };

  return { ok: true, config };
}
