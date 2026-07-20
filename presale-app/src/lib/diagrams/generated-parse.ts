import type { LacFile } from "@/lib/domain/types";

// Defensive extraction of the structures the diagram layouts need from the
// generated LZ JSON files. The generator owns these shapes; anything missing
// simply renders as absent.

export interface CompartmentNode {
  key: string;
  name: string;
  children: CompartmentNode[];
}

export interface SubnetInfo {
  key: string;
  name: string;
  cidr: string;
}

export interface VcnInfo {
  key: string;
  name: string;
  cidr: string;
  category: string;
  subnets: SubnetInfo[];
  gateways: string[]; // e.g. ["IGW", "NAT", "SGW"]
  routeRules: { dest: string; via: string }[];
}

export interface ParsedGenerated {
  compartmentRoot: CompartmentNode | null;
  groups: string[];
  policyCount: number;
  vcns: VcnInfo[];
  hasNfw: boolean;
  hasHubLb: boolean;
  drgPresent: boolean;
  alarmNames: string[];
  logGroupCount: number;
  topicCount: number;
  eventCount: number;
  serviceConnector: boolean;
  fileNames: string[];
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function json(files: LacFile[], name: string): J {
  const f = files.find((x) => x.path.endsWith(`/${name}`) || x.path === name);
  if (!f) return {};
  try {
    return obj(JSON.parse(f.content));
  } catch {
    return {};
  }
}

function firstMatching(files: LacFile[], re: RegExp): J {
  const f = files.find((x) => re.test(x.path));
  if (!f) return {};
  try {
    return obj(JSON.parse(f.content));
  } catch {
    return {};
  }
}

function parseCompartments(node: J, key: string): CompartmentNode {
  const children = obj(node.children);
  return {
    key,
    name: str(node.name) || key,
    children: Object.entries(children).map(([k, v]) => parseCompartments(obj(v), k)),
  };
}

export function parseGenerated(files: LacFile[]): ParsedGenerated {
  const iam = json(files, "iam.json");
  const network = json(files, "network.json");
  // fall back to network_pre when the hub is staged and network.json is final-only
  const net = Object.keys(network).length ? network : json(files, "network_pre.json");
  const obs = firstMatching(files, /observability_cis\d\.json$/);

  // --- IAM -----------------------------------------------------------------
  const cmps = obj(obj(iam.compartments_configuration).compartments);
  const rootEntry = Object.entries(cmps)[0];
  const compartmentRoot = rootEntry ? parseCompartments(obj(rootEntry[1]), rootEntry[0]) : null;
  const idGroups = obj(obj(iam.identity_domain_groups_configuration).groups);
  const plainGroups = obj(obj(iam.groups_configuration).groups);
  const groups = [...Object.keys(idGroups), ...Object.keys(plainGroups)].map((k) =>
    k.replace(/^GRP-/, "").replace(/-KEY$/, "").toLowerCase(),
  );
  const policyCount = Object.keys(obj(obj(iam.policies_configuration).supplied_policies)).length;

  // --- network -------------------------------------------------------------
  const cats = obj(obj(net.network_configuration).network_configuration_categories);
  const vcns: VcnInfo[] = [];
  let hasNfw = false;
  let hasHubLb = false;
  let drgPresent = false;
  for (const [catName, catVal] of Object.entries(cats)) {
    const cat = obj(catVal);
    const nonVcn = obj(cat.non_vcn_specific_gateways);
    if (Object.keys(obj(nonVcn.dynamic_routing_gateways)).length) drgPresent = true;
    if (Object.keys(obj(nonVcn.network_firewalls_configuration)).length) hasNfw = true;
    if (Object.keys(obj(nonVcn.l7_load_balancers)).length) hasHubLb = true;
    for (const [vcnKey, vcnVal] of Object.entries(obj(cat.vcns))) {
      const vcn = obj(vcnVal);
      const subnets = Object.entries(obj(vcn.subnets)).map(([sk, sv]) => ({
        key: sk,
        name: str(obj(sv).display_name) || sk,
        cidr: str(obj(sv).cidr_block),
      }));
      const gwCfg = obj(vcn.vcn_specific_gateways);
      const gateways: string[] = [];
      if (Object.keys(obj(gwCfg.internet_gateways)).length || vcn.is_create_igw === true) gateways.push("IGW");
      if (Object.keys(obj(gwCfg.nat_gateways)).length) gateways.push("NAT");
      if (Object.keys(obj(gwCfg.service_gateways)).length) gateways.push("SGW");
      const routeRules: { dest: string; via: string }[] = [];
      for (const rtVal of Object.values(obj(vcn.route_tables))) {
        for (const ruleVal of Object.values(obj(obj(rtVal).route_rules))) {
          const rule = obj(ruleVal);
          const dest = str(rule.destination) || str(rule.destination_type);
          const via = (str(rule.network_entity_key) || str(rule.network_entity_id))
            .replace(/-KEY$/, "")
            .toLowerCase();
          if (dest && routeRules.length < 4) routeRules.push({ dest, via });
        }
        break; // first route table per VCN is enough for the overview card
      }
      const cidr = Array.isArray(vcn.cidr_blocks) ? str((vcn.cidr_blocks as unknown[])[0]) : "";
      vcns.push({
        key: vcnKey,
        name: str(vcn.display_name) || vcnKey,
        cidr,
        category: catName,
        subnets,
        gateways,
        routeRules,
      });
    }
  }

  // --- observability -------------------------------------------------------
  const alarms = obj(obj(obs.alarms_configuration).alarms);
  const logGroups = obj(obj(obs.logging_configuration).log_groups);
  const topics = obj(obj(obs.notifications_configuration).topics);
  const events = obj(obj(obs.events_configuration).event_rules);

  return {
    compartmentRoot,
    groups,
    policyCount,
    vcns,
    hasNfw,
    hasHubLb,
    drgPresent,
    alarmNames: Object.keys(alarms)
      .map((k) => k.replace(/^ALARM-/, "").replace(/-KEY$/, "").toLowerCase())
      .slice(0, 8),
    logGroupCount: Object.keys(logGroups).length,
    topicCount: Object.keys(topics).length,
    eventCount: Object.keys(events).length,
    serviceConnector: Object.keys(obj(obs.service_connectors_configuration)).length > 0,
    fileNames: files.map((f) => f.path.replace(/^generated\//, "")).filter((n) => n.endsWith(".json")),
  };
}
