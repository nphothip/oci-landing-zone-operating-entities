import { describe, expect, it } from "vitest";
import { TEMPLATES, TEMPLATE_LIST } from "@/lib/templates";
import { buildFactoryConfig } from "@/lib/factory/config-builder";
import type { ChatbotSizing } from "@/lib/domain/types";

describe("factory config per template", () => {
  it("builds a valid config from every template's defaults", () => {
    for (const tpl of TEMPLATE_LIST) {
      const spec = tpl.defaults();
      const res = buildFactoryConfig(spec);
      expect(res.ok, tpl.id).toBe(true);
      if (!res.ok) continue;
      expect(res.config.region).toBe("ap-singapore-1");
      expect(res.config.region_short_name).toBe("sin");
      expect(res.config.realm).toBe("oc1");
      expect(res.config.hub.kind).toBe(spec.hub.kind);
      expect(Object.keys(res.config.environments).sort(), tpl.id).toEqual([...spec.environments].sort());
      for (const [env, cfg] of Object.entries(res.config.environments)) {
        const hasSpoke = Boolean(cfg.shared_project_network);
        const hasPlatform = Object.keys(cfg.platforms ?? {}).length > 0;
        expect(hasSpoke || hasPlatform, `${tpl.id}/${env} needs a spoke or platform`).toBe(true);
      }
    }
  });

  it("keeps the canonical prod spoke CIDR for spoke-based templates", () => {
    const res = buildFactoryConfig(TEMPLATES.web_app.defaults());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config.environments.prod.shared_project_network?.network.vcn).toBe("10.0.64.0/21");
    expect(Object.keys(res.config.environments.prod.projects ?? {})).toHaveLength(1);
  });

  it("builds OKE-only environments for the oke_platform template", () => {
    const spec = TEMPLATES.oke_platform.defaults();
    const res = buildFactoryConfig(spec);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const prod = res.config.environments.prod;
    expect(prod.shared_project_network).toBeUndefined();
    expect(prod.platforms?.oke.extension?.type).toBe("oke_simple");
    expect(prod.platforms?.oke.network?.vcn).toBe("10.0.96.0/20");
  });

  it("adds an oke_simple platform for the chatbot OKE runtime", () => {
    const spec = TEMPLATES.chatbot.defaults();
    (spec.sizing as ChatbotSizing).runtime = "oke";
    const res = buildFactoryConfig(spec);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const oke = res.config.environments.prod.platforms?.oke;
    expect(oke?.extension?.type).toBe("oke_simple");
    expect(oke?.network?.vcn).toBe("10.0.96.0/20");
    const params = oke?.extension?.params as Record<string, unknown>;
    expect(params.kubernetes_version).toBe("v1.35.2");
    expect(params.services_cidr).toBe("10.96.0.0/16");
    // hub_b mgmt subnet is the third /24 (lb, fw, mgmt)
    expect(params.api_endpoint_allowed_cidrs).toEqual(["10.0.2.0/24"]);
  });

  it("keeps preprod on its canonical CIDR lane", () => {
    const spec = TEMPLATES.web_app.defaults();
    spec.environments = ["prod", "preprod"];
    const res = buildFactoryConfig(spec);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.config.environments.preprod.shared_project_network?.network.vcn).toBe("10.0.128.0/21");
  });
});
