import { llmJson } from "@/lib/llm/complete";
import type { TorRequirement } from "./types";

// LLM-side of the TOR analysis: split the document into atomic requirements
// and label each one. The model is explicitly forbidden from inventing clauses
// or judging compliance — it only structures what the document says, keeping
// the clause reference so every row stays traceable.

const REQ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["requirements"],
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["clause", "page", "text", "obligation", "category", "infraRelevant", "metric"],
        properties: {
          clause: { type: "string", description: "clause reference exactly as printed, e.g. 'ข้อ 4.2.1'; empty string if none" },
          page: { type: ["integer", "null"] },
          text: { type: "string", description: "the requirement quoted from the document (trim to <= 400 chars)" },
          obligation: { type: "string", enum: ["mandatory", "quantitative", "optional", "informational"] },
          category: {
            type: "string",
            enum: ["compute", "storage", "network", "security", "database", "availability", "backup_dr", "operations", "compliance", "commercial", "other"],
          },
          infraRelevant: { type: "boolean" },
          metric: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["name", "op", "value", "unit"],
            properties: {
              name: { type: "string" },
              op: { type: "string", enum: [">=", "<=", "=", "range"] },
              value: { type: "number" },
              unit: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You extract requirements from a Thai government / enterprise TOR (ข้อกำหนดขอบเขตงาน, terms of reference) for a CLOUD INFRASTRUCTURE procurement.

HARD RULES — a procurement committee will read the result:
1. NEVER invent a requirement. Every entry must correspond to text that exists in the document.
2. NEVER judge whether a bidder complies. You only structure what the document asks for.
3. Quote the requirement text from the document (translate nothing; keep Thai as Thai).
4. Keep the clause reference exactly as printed (ข้อ 3.1, 4.2.1, หมวด 5, Annex A…). If the clause has no number, use "".
5. Split compound clauses: one atomic, independently-verifiable requirement per entry. A table row listing a spec (e.g. "CPU ไม่น้อยกว่า 8 vCPU") is one entry.

Labelling:
- obligation: "mandatory" for ต้อง/ต้องมี/จะต้อง/shall/must; "quantitative" when it states a measurable bound (ไม่น้อยกว่า/ไม่เกิน/อย่างน้อย/at least/minimum/maximum); "optional" for ควร/หากมี/should/preferred; "informational" for background text that asks nothing.
- category: which domain answers it (compute/storage/network/security/database/availability/backup_dr/operations/compliance/commercial/other).
- infraRelevant: true only when a cloud infrastructure design can answer it (sizing, architecture, security controls, SLA, backup, DR, network, operations). Set false for purely legal/commercial/administrative clauses (bid bond, company registration, payment terms, penalties, document submission).
- metric: when the clause states a numeric bound, extract {name, op, value, unit} — e.g. "หน่วยความจำไม่น้อยกว่า 32 GB" -> {name:"memory", op:">=", value:32, unit:"GB"}. Otherwise null.

Return ONLY JSON matching the schema. Extract at most 120 requirements; if the document is longer, prioritise mandatory and quantitative infrastructure clauses.`;

export interface ExtractOutcome {
  status: "ok" | "unavailable" | "error";
  requirements: TorRequirement[];
  message?: string;
}

/** Ask the model to structure the TOR text into atomic requirements. */
export async function extractRequirements(text: string, fileName: string): Promise<ExtractOutcome> {
  // Keep well inside context while covering the spec-bearing part of a TOR.
  const clipped = text.length > 60_000 ? `${text.slice(0, 60_000)}\n…(ตัดทอน)` : text;
  const user = `TOR file: ${fileName}\n\n---- BEGIN TOR TEXT ----\n${clipped}\n---- END TOR TEXT ----`;

  const out = await llmJson(SYSTEM, user, REQ_SCHEMA);
  if (out.status === "unavailable") return { status: "unavailable", requirements: [], message: out.reason };
  if (out.status === "error") return { status: "error", requirements: [], message: out.message };

  const raw = (out.data as { requirements?: unknown[] })?.requirements;
  if (!Array.isArray(raw)) return { status: "error", requirements: [], message: "โมเดลไม่ได้คืนรายการข้อกำหนด" };

  const requirements: TorRequirement[] = [];
  for (const [i, r] of raw.entries()) {
    const o = r as Record<string, unknown>;
    const txt = typeof o.text === "string" ? o.text.trim() : "";
    if (!txt) continue; // never emit an empty requirement row
    const m = o.metric as Record<string, unknown> | null | undefined;
    requirements.push({
      id: `R${String(requirements.length + 1).padStart(3, "0")}`,
      clause: typeof o.clause === "string" ? o.clause.trim() : "",
      page: typeof o.page === "number" && Number.isFinite(o.page) ? o.page : null,
      text: txt.slice(0, 400),
      obligation: oneOf(o.obligation, ["mandatory", "quantitative", "optional", "informational"], "mandatory"),
      category: oneOf(
        o.category,
        ["compute", "storage", "network", "security", "database", "availability", "backup_dr", "operations", "compliance", "commercial", "other"],
        "other",
      ),
      infraRelevant: o.infraRelevant !== false,
      metric:
        m && typeof m.name === "string" && typeof m.value === "number" && Number.isFinite(m.value)
          ? {
              name: m.name,
              op: oneOf(m.op, [">=", "<=", "=", "range"], ">="),
              value: m.value,
              unit: typeof m.unit === "string" ? m.unit : "",
            }
          : null,
    });
    void i;
  }
  return { status: "ok", requirements };
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
