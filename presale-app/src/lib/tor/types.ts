// TOR (ข้อกำหนดขอบเขตงาน) compliance analysis.
//
// DESIGN RULE: the LLM only READS and STRUCTURES the customer's document — it
// never invents a requirement and never decides the numbers we offer. Every
// "offered" value and every pass/fail verdict is computed deterministically
// from the SolutionSpec + priced BOM this app already produces, so a compliance
// claim in front of a procurement committee is always traceable to our own data.

/** How binding the clause is, inferred from Thai/English obligation wording. */
export type Obligation = "mandatory" | "quantitative" | "optional" | "informational";

/** Requirement categories we can actually answer from an infrastructure design. */
export type ReqCategory =
  | "compute"
  | "storage"
  | "network"
  | "security"
  | "database"
  | "availability"
  | "backup_dr"
  | "operations"
  | "compliance"
  | "commercial"
  | "other";

export interface TorRequirement {
  /** Sequential id we assign (R001…) — stable key for the review grid. */
  id: string;
  /** Clause reference as printed in the TOR, e.g. "ข้อ 4.2.1" (never invented). */
  clause: string;
  /** Page number when the extractor could determine it. */
  page: number | null;
  /** The requirement text, quoted from the TOR. */
  text: string;
  obligation: Obligation;
  category: ReqCategory;
  /** true when the clause constrains infrastructure we can answer for. */
  infraRelevant: boolean;
  /** Parsed numeric bound when the clause states one (e.g. ">= 8 vCPU"). */
  metric: { name: string; op: ">=" | "<=" | "=" | "range"; value: number; unit: string } | null;
}

export type ComplianceStatus = "pass" | "partial" | "fail" | "manual";

export interface ComplianceRow extends TorRequirement {
  status: ComplianceStatus;
  /** What we actually offer — real values from the spec/BOM, never "ผ่าน" alone. */
  offered: string;
  /** Where a reviewer can verify it (design-doc section, diagram view, BOM line). */
  evidence: string;
  note: string;
}

export interface TorAnalysis {
  fileName: string;
  /** Requirements the extractor found, before matching. */
  totalRequirements: number;
  infraRequirements: number;
  rows: ComplianceRow[];
  summary: { pass: number; partial: number; fail: number; manual: number };
  /** Non-infra clauses routed to the bid team rather than the matrix. */
  nonInfra: TorRequirement[];
  warnings: string[];
}
