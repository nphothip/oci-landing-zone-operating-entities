import { describe, expect, it } from "vitest";
import { envBlocks, findOverlap, hubMgmtSubnet } from "@/lib/domain/cidr";

describe("cidr allocator", () => {
  it("mirrors the repo's canonical lanes", () => {
    expect(envBlocks("prod")).toEqual({ spoke: "10.0.64.0/21", platform: "10.0.96.0/20" });
    expect(envBlocks("preprod")).toEqual({ spoke: "10.0.128.0/21", platform: "10.0.160.0/20" });
    expect(envBlocks("dev").spoke).toBe("10.1.64.0/21");
  });

  it("computes the hub mgmt subnet per hub kind", () => {
    expect(hubMgmtSubnet("hub_e")).toBe("10.0.1.0/24");
    expect(hubMgmtSubnet("hub_b")).toBe("10.0.2.0/24");
    expect(hubMgmtSubnet("hub_a")).toBe("10.0.3.0/24");
  });

  it("detects overlapping CIDRs", () => {
    expect(
      findOverlap([
        { name: "hub", cidr: "10.0.0.0/21" },
        { name: "spoke", cidr: "10.0.4.0/24" },
      ]),
    ).toContain("overlaps");
    expect(
      findOverlap([
        { name: "hub", cidr: "10.0.0.0/21" },
        { name: "spoke", cidr: "10.0.64.0/21" },
      ]),
    ).toBeNull();
  });
});
