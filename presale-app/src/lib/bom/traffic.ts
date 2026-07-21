import type { BomItem, LocalizedText, SolutionSpec } from "@/lib/domain/types";

// Optional traffic / data-transfer overrides (runs after applyBurst, before
// finalizeBom). Off by default — a spec without `traffic` returns the items
// unchanged. Each set field overrides the matching BOM line's quantity, or adds
// the line when the template does not already have one:
//   - lbBandwidthMbps  → lb_bandwidth  (added only if the template has an LB)
//   - nfwDataGbPerMonth→ nfw_data_gb   (hub firewall; only if a firewall exists)
//   - egressGbPerMonth → egress_apac_gb (added anywhere — internet egress)
//   - wafRequestsM     → waf_requests_m (only meaningful when WAF is on)

const HOURS = 744;

export function applyTraffic(spec: SolutionSpec, items: BomItem[]): BomItem[] {
  const t = spec.traffic;
  if (!t || (t.lbBandwidthMbps == null && t.nfwDataGbPerMonth == null && t.egressGbPerMonth == null && t.wafRequestsM == null)) {
    return items;
  }
  const out = items.map((i) => ({ ...i }));
  const find = (key: string) => out.find((i) => i.catalogKey === key);

  // Hub Network Firewall data processed (GB/month) — override only.
  if (t.nfwDataGbPerMonth != null) {
    const nfw = find("nfw_data_gb");
    if (nfw) {
      nfw.quantity = t.nfwDataGbPerMonth;
      nfw.monthlyMetricQty = t.nfwDataGbPerMonth;
      nfw.label = label(`NFW data processing ${fmtGb(t.nfwDataGbPerMonth)}`);
    }
  }

  // Load Balancer bandwidth (Mbps) — override, or add if the template has an LB.
  if (t.lbBandwidthMbps != null) {
    const mbps = t.lbBandwidthMbps;
    const lb = find("lb_bandwidth");
    if (lb) {
      lb.quantity = mbps;
      lb.monthlyMetricQty = mbps * HOURS;
      lb.label = label(`LB bandwidth ${mbps} Mbps`);
    } else if (find("lb_base")) {
      out.push({
        catalogKey: "lb_bandwidth",
        label: label(`LB bandwidth ${mbps} Mbps`),
        category: "network",
        quantity: mbps,
        unit: "Mbps",
        monthlyMetricQty: mbps * HOURS,
        deployedByLz: true,
      });
    }
  }

  // Outbound data transfer / internet egress (GB/month) — override or add.
  if (t.egressGbPerMonth != null) {
    const gb = t.egressGbPerMonth;
    const eg = find("egress_apac_gb");
    if (eg) {
      eg.quantity = gb;
      eg.monthlyMetricQty = gb;
      eg.label = label(`Outbound data transfer ${fmtGb(gb)}`);
    } else {
      out.push({
        catalogKey: "egress_apac_gb",
        label: label(`Outbound data transfer ${fmtGb(gb)}`),
        category: "network",
        quantity: gb,
        unit: "GB",
        monthlyMetricQty: gb,
        deployedByLz: false,
        notes: { th: "10TB แรก/เดือนฟรี (APAC)", en: "first 10TB/month free (APAC)" },
      });
    }
  }

  // WAF incoming requests (millions/month) — override only.
  if (t.wafRequestsM != null) {
    const waf = find("waf_requests_m");
    if (waf) {
      waf.quantity = t.wafRequestsM;
      waf.monthlyMetricQty = t.wafRequestsM;
      waf.label = label(`WAF — requests ${t.wafRequestsM}M/month`);
    }
  }

  return out;
}

function label(s: string): LocalizedText {
  return { th: s, en: s };
}
function fmtGb(gb: number): string {
  return gb >= 1024 ? `~${(gb / 1024).toFixed(gb % 1024 === 0 ? 0 : 1)}TB/month` : `${gb}GB/month`;
}
