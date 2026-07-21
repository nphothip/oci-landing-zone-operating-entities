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

/**
 * Scale a VM / worker fleet for a non-prod environment. Returns the reduced
 * node `count` plus a `perVmScale` factor to apply to each node's OCPU/memory,
 * so the TOTAL capacity ≈ prod × scale even when the count floors at 1 — a
 * single large VM then shrinks in *size* instead of staying full (the whole
 * point: non-prod VMs get smaller, not just fewer). Feed `perVmScale` into
 * `scaled(ocpusPerVm, perVmScale, 1)` etc. Prod (scale ≥ 1) is unchanged.
 */
export function fleetScale(prodCount: number, scale: number): { count: number; perVmScale: number } {
  if (scale >= 1 || prodCount <= 0) return { count: Math.max(prodCount, 0), perVmScale: 1 };
  const count = Math.max(1, Math.round(prodCount * scale));
  const perVmScale = (prodCount * scale) / count; // remaining scale spread onto node size
  return { count, perVmScale };
}

export function envScale(spec: SolutionSpec, env: string): number {
  // A custom per-env percentage wins over the rightsize default.
  const custom = spec.envScalePct?.[env as EnvName];
  if (custom != null) return Math.min(Math.max(custom, 1), 100) / 100;
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

/**
 * Apply absolute per-env quantity overrides (spec.envOverride). The user edits
 * a workload line's human quantity for a specific env; the billing metric is
 * scaled proportionally from the line's existing quantity→metric ratio (so an
 * OCPU line stays ×744, storage ×1, VPU ×10, etc.). Off by default.
 */
export function applyEnvOverride(spec: SolutionSpec, items: BomItem[]): BomItem[] {
  const ov = spec.envOverride;
  if (!ov) return items;
  return items.map((item) => {
    if (!item.env) return item;
    const val = ov[item.env as EnvName]?.[item.catalogKey];
    if (val == null || val === item.quantity) return item;
    const metric = item.quantity > 0 ? (item.monthlyMetricQty / item.quantity) * val : val;
    return { ...item, quantity: val, monthlyMetricQty: metric };
  });
}

/** Default any still-untagged item to the shared (hub/tenancy) scope. */
export function finalizeBom(items: BomItem[]): BomItem[] {
  return items.map((item) => ({ ...item, env: item.env ?? "shared" }));
}
