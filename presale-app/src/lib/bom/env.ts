import type { BomItem, EnvName, SolutionSpec } from "@/lib/domain/types";
import { orderEnvs } from "@/lib/domain/cidr";

// Environment tagging for the BOM. Workload that scales per environment is
// emitted once per env via perEnv(); single-env workload is pinned with
// pinEnv(); everything else (hub/tenancy-level infra) defaults to "shared"
// through finalizeBom(). This drives the Env column and Excel autofilter.

/**
 * Expand a per-environment item factory across the spec's environments,
 * tagging each line with its env. Quantities returned by `make` are per a
 * single environment (do NOT multiply by env count). When there is more than
 * one environment a `[env]` suffix is appended to the label so the split is
 * readable.
 */
export function perEnv(spec: SolutionSpec, make: (env: EnvName) => BomItem[]): BomItem[] {
  const envs = orderEnvs(spec.environments);
  const multi = envs.length > 1;
  return envs.flatMap((env) =>
    make(env).map((item) => ({
      ...item,
      env,
      label: multi ? { th: `${item.label.th} [${env}]`, en: `${item.label.en} [${env}]` } : item.label,
    })),
  );
}

/** Tag every item with one environment (workload living in a single env). */
export function pinEnv(items: BomItem[], env: string): BomItem[] {
  return items.map((item) => ({ ...item, env }));
}

/** Default any still-untagged item to the shared (hub/tenancy) scope. */
export function finalizeBom(items: BomItem[]): BomItem[] {
  return items.map((item) => ({ ...item, env: item.env ?? "shared" }));
}
