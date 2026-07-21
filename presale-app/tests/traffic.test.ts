import { describe, expect, it } from "vitest";
import type { BomItem, SolutionSpec } from "@/lib/domain/types";
import { applyTraffic } from "@/lib/bom/traffic";
import { TEMPLATES } from "@/lib/templates";

const base = (): BomItem[] => [
  { catalogKey: "lb_base", label: { th: "LB", en: "LB" }, category: "network", quantity: 1, unit: "LB", monthlyMetricQty: 744, deployedByLz: true },
  { catalogKey: "lb_bandwidth", label: { th: "bw", en: "bw" }, category: "network", quantity: 100, unit: "Mbps", monthlyMetricQty: 100 * 744, deployedByLz: true },
  { catalogKey: "nfw_data_gb", label: { th: "nfw", en: "nfw" }, category: "landing_zone", quantity: 2048, unit: "GB", monthlyMetricQty: 2048, deployedByLz: true },
  { catalogKey: "waf_requests_m", label: { th: "waf", en: "waf" }, category: "security", quantity: 30, unit: "M requests", monthlyMetricQty: 30, deployedByLz: false },
];

const spec = (traffic: SolutionSpec["traffic"]): SolutionSpec => ({ ...TEMPLATES.web_app.defaults(), traffic });

describe("applyTraffic", () => {
  it("is a no-op when traffic is undefined or empty", () => {
    const b = base();
    expect(applyTraffic(spec(undefined), b)).toBe(b);
    expect(applyTraffic(spec({}), b)).toBe(b);
  });

  it("overrides LB bandwidth / NFW data / WAF request quantities", () => {
    const out = applyTraffic(spec({ lbBandwidthMbps: 500, nfwDataGbPerMonth: 5000, wafRequestsM: 100 }), base());
    expect(out.find((i) => i.catalogKey === "lb_bandwidth")!.monthlyMetricQty).toBe(500 * 744);
    expect(out.find((i) => i.catalogKey === "nfw_data_gb")!.monthlyMetricQty).toBe(5000);
    expect(out.find((i) => i.catalogKey === "waf_requests_m")!.monthlyMetricQty).toBe(100);
  });

  it("adds an lb_bandwidth line when the template has an LB but no bandwidth line", () => {
    const noBw = base().filter((i) => i.catalogKey !== "lb_bandwidth");
    const out = applyTraffic(spec({ lbBandwidthMbps: 200 }), noBw);
    expect(out.find((i) => i.catalogKey === "lb_bandwidth")!.monthlyMetricQty).toBe(200 * 744);
  });

  it("does NOT add an lb_bandwidth line when there is no load balancer at all", () => {
    const out = applyTraffic(spec({ lbBandwidthMbps: 200 }), [base()[2]]); // only nfw
    expect(out.some((i) => i.catalogKey === "lb_bandwidth")).toBe(false);
  });

  it("adds an egress line when the template has none", () => {
    const out = applyTraffic(spec({ egressGbPerMonth: 20000 }), base());
    expect(out.find((i) => i.catalogKey === "egress_apac_gb")!.monthlyMetricQty).toBe(20000);
  });

  it("does not mutate the input array", () => {
    const b = base();
    applyTraffic(spec({ nfwDataGbPerMonth: 9999 }), b);
    expect(b.find((i) => i.catalogKey === "nfw_data_gb")!.monthlyMetricQty).toBe(2048);
  });

  it("adds an object-storage requests line only when object storage exists", () => {
    const withOs: BomItem[] = [...base(), { catalogKey: "os_standard_gb", label: { th: "os", en: "os" }, category: "storage", quantity: 1000, unit: "GB", monthlyMetricQty: 1000, deployedByLz: false }];
    const out = applyTraffic(spec({ objectRequestsMPerMonth: 5 }), withOs);
    expect(out.find((i) => i.catalogKey === "os_requests_10k")!.monthlyMetricQty).toBe(5 * 100); // 5M / 10k = 500
    // no object storage → no request line
    expect(applyTraffic(spec({ objectRequestsMPerMonth: 5 }), base()).some((i) => i.catalogKey === "os_requests_10k")).toBe(false);
  });

  it("overrides streaming throughput when a streaming line exists", () => {
    const withStream: BomItem[] = [...base(), { catalogKey: "streaming_gb", label: { th: "s", en: "s" }, category: "network", quantity: 5000, unit: "GB", monthlyMetricQty: 5000, deployedByLz: false }];
    const out = applyTraffic(spec({ streamingGbPerMonth: 12000 }), withStream);
    expect(out.find((i) => i.catalogKey === "streaming_gb")!.monthlyMetricQty).toBe(12000);
  });
});
