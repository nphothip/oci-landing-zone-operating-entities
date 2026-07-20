import type { EnvironmentConfig, EnvName, FactoryConfig, SolutionSpec } from "@/lib/domain/types";
import { HUB_VCN, envBlocks, orderEnvs } from "@/lib/domain/cidr";

/** Shared factory-config scaffold: hub + one spoke/project per environment. */
export function baseFactoryConfig(spec: SolutionSpec, projectName: string): FactoryConfig {
  const environments: Record<string, EnvironmentConfig> = {};
  for (const env of orderEnvs(spec.environments)) {
    environments[env] = {
      shared_project_network: { network: { vcn: envBlocks(env).spoke } },
      projects: { [projectName]: {} },
    };
  }
  return {
    realm: "oc1",
    region: spec.region.id,
    region_short_name: spec.region.shortName,
    cis_level: spec.cisLevel,
    hub: { kind: spec.hub.kind, network: { vcn: HUB_VCN } },
    environments,
  };
}

export function primaryEnv(spec: SolutionSpec): EnvName {
  return orderEnvs(spec.environments)[0] ?? "prod";
}
