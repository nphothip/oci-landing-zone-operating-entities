import { llmJson } from "@/lib/llm/complete";
import type { SolutionSpec } from "@/lib/domain/types";
import { NARRATIVE_SECTIONS } from "./document";

// AI-written prose for the design document. The LLM receives the structured
// design facts and returns 2-3 short paragraphs per section, in the requested
// language. Deterministic prose is always the fallback (see document.ts).

export type NarrativeSections = Record<string, string[]>;

const props = Object.fromEntries(
  NARRATIVE_SECTIONS.map((k) => [k, { type: "array", items: { type: "string" } }]),
);

export const NARRATIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: props,
  required: [...NARRATIVE_SECTIONS],
} as const;

const SECTION_BRIEF: Record<string, string> = {
  executive: "Executive summary: what is being built, on which landing zone, and the headline monthly cost.",
  overview: "Solution overview: the Operating Entities separation of shared services vs workload environments.",
  functional: "Functional architecture: personas/teams and the landing zone building blocks + the workload's functional blocks.",
  security: "Security & identity: compartment structure, IAM groups/policies (least-privilege), and the security posture services.",
  network: "Network design: the hub-and-spoke model, hub firewall/LB, DRG, spoke VCNs and subnets, and connectivity.",
  operations: "Operations & monitoring: the observability chain (logs/events/alarms/notifications) and the GitOps day-2 model.",
  runtime: "Runtime & deployment: how the landing zone JSON files apply via the orchestrator and the workload's request flow.",
  deployment: "Deployment approach: using the generated IaC with the OCI Landing Zones Orchestrator (Terraform / Resource Manager).",
};

export async function generateAiNarrative(
  facts: unknown,
  spec: SolutionSpec,
  lang: "th" | "en",
): Promise<{ status: "ok"; narrative: NarrativeSections } | { status: "unavailable"; reason?: string } | { status: "error"; message: string }> {
  const langName = lang === "th" ? "Thai (ภาษาไทย)" : "English";
  const system = `You are a senior OCI cloud architect writing a customer-facing architecture design document for a solution built on the "OCI Open LZ / Operating Entities" landing zone.
Write clear, professional prose in ${langName}. For each section produce 2-3 short paragraphs (each a plain string, no markdown, no bullet characters). Be specific and use the provided facts (compartments, hub model, VCNs/CIDRs, IAM, posture, cost) — do not invent resources that are not in the facts. Return ONLY JSON matching the schema; every section key is required.`;

  const briefs = NARRATIVE_SECTIONS.map((k) => `- ${k}: ${SECTION_BRIEF[k]}`).join("\n");
  const user = `Solution template: ${spec.template}
Target language: ${langName}

Sections to write (JSON keys):
${briefs}

Design facts (JSON):
${JSON.stringify(facts).slice(0, 12000)}

Return a JSON object whose keys are exactly: ${NARRATIVE_SECTIONS.join(", ")}. Each value is an array of 2-3 paragraph strings in ${langName}.`;

  const outcome = await llmJson(system, user, NARRATIVE_SCHEMA);
  if (outcome.status === "unavailable") return { status: "unavailable", reason: outcome.reason };
  if (outcome.status === "error") return { status: "error", message: outcome.message };

  const data = outcome.data as Record<string, unknown>;
  const narrative: NarrativeSections = {};
  for (const k of NARRATIVE_SECTIONS) {
    const v = data[k];
    if (Array.isArray(v)) {
      const paras = v.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.slice(0, 1500));
      if (paras.length) narrative[k] = paras;
    }
  }
  if (Object.keys(narrative).length === 0) return { status: "error", message: "narrative was empty" };
  return { status: "ok", narrative };
}
