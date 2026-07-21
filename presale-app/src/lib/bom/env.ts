import type { BomItem, EnvName, SolutionSpec } from "@/lib/domain/types";
import { orderEnvs } from "@/lib/domain/cidr";

// Environment tagging for the BOM. Workload that scales per environment is
// emitted once per env via perEnv(); single-env workload is pinned with
// pinEnv(); everything else (hub/tenancy-level infra) defaults to "shared"
// through finalizeBom(). This drives the Env column and Excel autofilter.

// Sizing factor per environment relative to production. Non-production
// environments are right-sized down by default (they rarely need full prod
// capacity); the user can disable this with spec.rightsizeNonProd = false.
const ENV_SCALE: Record<string, number> = {
  prod: 1,
  preprod: 0.5,
  staging: 0.5,
  uat: 0.4,
  dev: 0.3,
  test: 0.3,
};

/** Right-sized quantity for a scale factor (prod = 1 → unchanged). */
export function scaled(base: number, scale: number, min = 1): number {
  if (scale >= 1) return base;
  return Math.max(min, Math.round(base * scale));
}

export function envScale(spec: SolutionSpec, env: string): number {
  if (spec.rightsizeNonProd === false) return 1;
  return ENV_SCALE[env] ?? 0.5;
}

/**
 * Expand a per-environment item factory across the spec's environments,
 * tagging each line with its env. `make(env, scale)` returns quantities for a
 * single environment (do NOT multiply by env count); `scale` is the
 * right-sizing factor for that env (1 for prod, <1 for non-prod unless
 * disabled). A `[env]` suffix is appended to labels when there is >1 env.
 */
export function perEnv(spec: SolutionSpec, make: (env: EnvName, scale: number) => BomItem[]): BomItem[] {
  const envs = orderEnvs(spec.environments);
  const multi = envs.length > 1;
  return envs.flatMap((env) =>
    make(env, envScale(spec, env)).map((item) => ({
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
