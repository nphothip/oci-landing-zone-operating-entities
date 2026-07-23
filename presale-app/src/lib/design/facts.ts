import type { GenerateResult, PricedBomItem } from "@/lib/domain/types";
import { parseGenerated, type VcnInfo } from "@/lib/diagrams/generated-parse";

// Structured design facts derived from a GenerateResult — the raw material
// both the deterministic narrative and the AI narrative describe. Computed
// client-side from data the browser already has (no extra API round-trip).

export interface DesignFactVcn {
  name: string;
  cidr: string;
  role: "hub" | "spoke" | "platform";
  subnets: { name: string; cidr: string }[];
  gateways: string[];
}

export interface DesignFacts {
  region: string;
  regionShort: string;
  cisLevel: 1 | 2;
  environments: string[];
  connectivity: string;
  hub: {
    kind: string;
    model: string;
    firewall: boolean;
    firewallCount: number;
    publicLb: boolean;
    drg: boolean;
  };
  compartments: string[];
  groups: string[];
  policyCount: number;
  vcns: DesignFactVcn[];
  posture: string[];
  observability: { logGroups: number; topics: number; events: number; alarms: number; serviceConnector: boolean };
  workload: { title: string; components: { label: string; detail: string; deployedByLz: boolean }[] };
  cost: {
    monthlyThb: number;
    priceSource: string;
    fetchedAt: string;
    topDrivers: { label: string; monthlyThb: number; env: string }[];
    byEnv: { env: string; monthlyThb: number }[];
  };
  lacFileNames: string[];
  staged: boolean;
}

const HUB_MODEL: Record<string, string> = {
  hub_a: "Hub A — two OCI Network Firewalls (active/active, HA)",
  hub_b: "Hub B — one OCI Network Firewall",
  hub_c: "Hub C — two Network Load Balancers fronting third-party firewalls",
  hub_e: "Hub E — no firewall (cost-free hub, PoC/edge cases)",
};

function vcnRole(v: VcnInfo): "hub" | "spoke" | "platform" {
  if (v.name.includes("-hub") || v.category.startsWith("0-")) return "hub";
  if (/-oke|-platform|-exa|-ocvs/.test(v.name)) return "platform";
  return "spoke";
}

export function buildDesignFacts(result: GenerateResult): DesignFacts {
  const { spec, bom } = result;
  const gen = parseGenerated(result.lac.files);

  const flatten = (): string[] => {
    const out: string[] = [];
    const walk = (n: { name: string; children: { name: string; children: unknown[] }[] } | null) => {
      if (!n) return;
      out.push(n.name);
      n.children.forEach((c) => walk(c as never));
    };
    walk(gen.compartmentRoot as never);
    return out;
  };

  const workloadComponents = bom.items
    .filter((i) => i.category !== "landing_zone" && i.category !== "security" && i.category !== "observability")
    // Dedupe by catalogKey + label (env suffix stripped) so multi-project
    // BOMs («core» vs «digital» lines share catalog keys) keep every project.
    .filter(
      (i, idx, arr) =>
        arr.findIndex((x) => x.catalogKey === i.catalogKey && stripEnvSuffix(x.label.en) === stripEnvSuffix(i.label.en)) === idx,
    )
    .slice(0, 8)
    .map((i) => ({ label: stripEnvSuffix(i.label.en), detail: `${i.quantity.toLocaleString()} ${i.unit}`, deployedByLz: i.deployedByLz }));

  const posture: string[] = ["Cloud Guard (tenancy-wide posture)", `Security Zones — CIS Level ${spec.cisLevel} recipes`, "Vulnerability Scanning Service (VSS)"];
  if (spec.cisLevel === 2) posture.push("OCI Vault + software-protected keys");
  posture.push("Events → Notifications alerting chain", "Flow logs + audit logging", "Budgets + cost-tracking tags");

  const byEnvMap = new Map<string, number>();
  for (const i of bom.items) {
    const env = i.env ?? "shared";
    byEnvMap.set(env, (byEnvMap.get(env) ?? 0) + (i.monthlyThb ?? 0));
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    region: spec.region.id,
    regionShort: spec.region.shortName,
    cisLevel: spec.cisLevel,
    environments: spec.environments,
    connectivity: spec.hub.connectivity,
    hub: {
      kind: spec.hub.kind,
      model: HUB_MODEL[spec.hub.kind] ?? spec.hub.kind,
      firewall: gen.hasNfw,
      firewallCount: spec.hub.kind === "hub_a" ? 2 : spec.hub.kind === "hub_b" ? 1 : 0,
      publicLb: gen.hasHubLb,
      drg: gen.drgPresent,
    },
    compartments: flatten(),
    groups: gen.groups,
    policyCount: gen.policyCount,
    vcns: gen.vcns.map((v) => ({
      name: v.name,
      cidr: v.cidr,
      role: vcnRole(v),
      subnets: v.subnets.map((s) => ({ name: s.name, cidr: s.cidr })),
      gateways: v.gateways,
    })),
    posture,
    observability: {
      logGroups: gen.logGroupCount,
      topics: gen.topicCount,
      events: gen.eventCount,
      alarms: gen.alarmNames.length,
      serviceConnector: gen.serviceConnector,
    },
    workload: { title: result.spec.template, components: workloadComponents },
    cost: {
      monthlyThb: bom.totals.monthlyThb,
      priceSource: bom.priceSource,
      fetchedAt: bom.priceFetchedAt,
      topDrivers: topDrivers(bom.items),
      byEnv: [...byEnvMap.entries()].map(([env, v]) => ({ env, monthlyThb: round2(v) })).sort((a, b) => b.monthlyThb - a.monthlyThb),
    },
    lacFileNames: gen.fileNames,
    staged: gen.fileNames.some((f) => f.includes("_pre")),
  };
}

function stripEnvSuffix(label: string): string {
  return label.replace(/\s*\[[a-z]+\]\s*$/, "");
}

function topDrivers(items: PricedBomItem[]): { label: string; monthlyThb: number; env: string }[] {
  return [...items]
    .filter((i) => (i.monthlyThb ?? 0) > 0)
    .sort((a, b) => (b.monthlyThb ?? 0) - (a.monthlyThb ?? 0))
    .slice(0, 6)
    .map((i) => ({ label: i.label.en, monthlyThb: i.monthlyThb ?? 0, env: i.env ?? "shared" }));
}
