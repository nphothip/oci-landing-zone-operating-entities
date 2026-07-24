import { describe, expect, it } from "vitest";
import { deriveSpecFromTor } from "@/lib/tor/derive-spec";
import { parseSolutionSpec } from "@/lib/domain/spec-schema";
import { buildFactoryConfig } from "@/lib/factory/config-builder";
import { finalizeBom } from "@/lib/bom/env";
import { applyAddOns } from "@/lib/bom/addons";
import { priceBom } from "@/lib/pricing/resolve";
import { TEMPLATES } from "@/lib/templates";
import type { TorRequirement } from "@/lib/tor/types";

let seq = 0;
function req(text: string, extra: Partial<TorRequirement> = {}): TorRequirement {
  seq += 1;
  return {
    id: `R${String(seq).padStart(3, "0")}`,
    clause: `ข้อ ${seq}`,
    page: 1,
    text,
    obligation: "mandatory",
    category: "other",
    infraRelevant: true,
    metric: null,
    ...extra,
  };
}

const decisionFor = (d: ReturnType<typeof deriveSpecFromTor>["decisions"], field: string) => d.find((x) => x.field === field);

describe("deriving a design from TOR requirements", () => {
  it("is deterministic — the same TOR always yields the same proposal", () => {
    const reqs = [req("ต้องมีระบบเว็บไซต์ให้บริการประชาชน"), req("ต้องมี firewall ตรวจสอบทราฟฟิก")];
    const a = deriveSpecFromTor(reqs);
    const b = deriveSpecFromTor(reqs);
    expect(JSON.stringify(a.spec)).toBe(JSON.stringify(b.spec));
    expect(a.decisions.map((d) => `${d.field}=${d.value}`)).toEqual(b.decisions.map((d) => `${d.field}=${d.value}`));
  });

  it("never proposes an uninspected hub, even when the TOR says nothing about firewalls", () => {
    const out = deriveSpecFromTor([req("ต้องมีระบบจัดเก็บเอกสารอิเล็กทรอนิกส์")]);
    expect(out.spec.hub.kind).not.toBe("hub_e");
    const d = decisionFor(out.decisions, "hub.kind")!;
    expect(d.source).toBe("best_practice");
    expect(d.clauses).toEqual([]);
    expect(d.reason.th).toContain("Hub E");
  });

  it("escalates the hub when the TOR asks for both directions, and cites the clause", () => {
    const out = deriveSpecFromTor([req("ต้องมี firewall ตรวจสอบทราฟฟิกทั้งขาเข้าและขาออก", { clause: "ข้อ 3.1" })]);
    expect(out.spec.hub.kind).toBe("hub_a");
    const d = decisionFor(out.decisions, "hub.kind")!;
    expect(d.source).toBe("tor");
    expect(d.clauses).toContain("ข้อ 3.1");
  });

  it("switches to hub_c when the TOR names a firewall vendor", () => {
    const out = deriveSpecFromTor([req("ต้องใช้ Next-Generation Firewall ยี่ห้อ Palo Alto หรือเทียบเท่า", { clause: "ข้อ 3.5" })]);
    expect(out.spec.hub.kind).toBe("hub_c");
    expect(decisionFor(out.decisions, "hub.kind")!.reason.th).toMatch(/license/i);
  });

  it("raises CIS to Level 2 only when a standard or key management is cited", () => {
    expect(deriveSpecFromTor([req("ต้องมีเว็บไซต์")]).spec.cisLevel).toBe(1);
    const strict = deriveSpecFromTor([req("ต้องเป็นไปตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)", { clause: "ข้อ 7.1" })]);
    expect(strict.spec.cisLevel).toBe(2);
    expect(decisionFor(strict.decisions, "cisLevel")!.clauses).toContain("ข้อ 7.1");
  });

  it("reads vCPU as half the OCPUs — and says so in the reasoning", () => {
    const out = deriveSpecFromTor([
      req("ต้องมีเครื่องแม่ข่ายไม่น้อยกว่า 4 เครื่อง", { metric: { name: "servers", op: ">=", value: 4, unit: "servers" } }),
      req("หน่วยประมวลผลรวมไม่น้อยกว่า 32 vCPU", { metric: { name: "vCPU", op: ">=", value: 32, unit: "vCPU" } }),
    ]);
    const sizing = out.spec.sizing as { appVmCount: number; ocpusPerVm: number };
    expect(sizing.appVmCount).toBe(4);
    expect(sizing.ocpusPerVm).toBe(4); // 32 vCPU = 16 OCPU over 4 VMs
    const d = decisionFor(out.decisions, "sizing.ocpusPerVm")!;
    expect(d.reason.th).toContain("1 OCPU = 2 vCPU");
    expect(d.reason.en).toContain("16 OCPU");
  });

  it("treats a TOR quantity as a floor and never shrinks the template default", () => {
    const base = TEMPLATES.web_app.defaults().sizing as { memGbPerVm: number };
    const out = deriveSpecFromTor([req("หน่วยความจำไม่น้อยกว่า 1 GB", { metric: { name: "memory", op: ">=", value: 1, unit: "GB" } })]);
    expect((out.spec.sizing as { memGbPerVm: number }).memGbPerVm).toBeGreaterThanOrEqual(base.memGbPerVm);
  });

  it("forces HA on and reports whether the TOR or best practice drove it", () => {
    const silent = deriveSpecFromTor([req("ต้องมีเว็บไซต์ให้บริการ")]);
    expect((silent.spec.sizing as { ha: boolean }).ha).toBe(true);
    expect(decisionFor(silent.decisions, "sizing.ha")!.source).toBe("best_practice");

    const asked = deriveSpecFromTor([req("ระบบต้องมีความพร้อมใช้งานสูง (High Availability)", { clause: "ข้อ 6.1" })]);
    expect(decisionFor(asked.decisions, "sizing.ha")!.source).toBe("tor");
  });

  it("adds the services the TOR names, priced from the real AIS catalog", () => {
    const out = deriveSpecFromTor([
      req("ต้องใช้ระบบจัดการฐานข้อมูลแบบ open source เช่น PostgreSQL", { clause: "ข้อ 4.1" }),
      req("ต้องมีระบบค้นหาเอกสารแบบ full-text search (OpenSearch)", { clause: "ข้อ 4.2" }),
    ]);
    expect(out.spec.addOns?.map((a) => a.id).sort()).toEqual(["opensearch", "postgresql"]);
    const priced = priceBom(finalizeBom(applyAddOns(out.spec, [])));
    expect(priced.totals.unpricedCount).toBe(0);
    expect(priced.totals.monthlyThb).toBeGreaterThan(0);
    expect(decisionFor(out.decisions, "addOns.postgresql")!.clauses).toContain("ข้อ 4.1");
  });

  it("does not double-quote an add-on the chosen template already covers", () => {
    const out = deriveSpecFromTor([req("ต้องจัดหาระบบเดสก์ท็อปเสมือน (VDI) สำหรับผู้ใช้ 100 คน")]);
    expect(out.spec.template).toBe("vdi");
    expect(out.spec.addOns?.some((a) => a.id === "vdi")).not.toBe(true);
  });

  it("reports quantified clauses it could not turn into a knob instead of ignoring them", () => {
    const out = deriveSpecFromTor([
      req("เวลาตอบสนองต้องไม่เกิน 2 วินาที", { metric: { name: "response time", op: "<=", value: 2, unit: "seconds" } }),
      req("RTO ไม่เกิน 4 ชั่วโมง", { metric: { name: "RTO", op: "<=", value: 4, unit: "hours" } }),
    ]);
    expect(out.unmapped.map((r) => r.metric?.name)).toEqual(["response time", "RTO"]);
  });

  it("ignores non-infrastructure clauses when choosing the design", () => {
    const out = deriveSpecFromTor([
      req("ผู้เสนอราคาต้องเคยติดตั้งระบบ VMware มาก่อน", { infraRelevant: false, category: "commercial" }),
      req("ต้องมีเว็บไซต์ให้บริการประชาชน"),
    ]);
    expect(out.spec.addOns?.some((a) => a.id === "ocvs_3yr")).not.toBe(true);
  });

  it("produces a spec that passes the schema, builds a config, and prices end-to-end", () => {
    const out = deriveSpecFromTor(
      [
        req("จัดหาระบบสารสนเทศสำหรับให้บริการประชาชนผ่านเว็บไซต์", { clause: "ข้อ 1.1" }),
        req("ต้องมีเครื่องแม่ข่ายไม่น้อยกว่า 4 เครื่อง", { clause: "ข้อ 2.1", metric: { name: "servers", op: ">=", value: 4, unit: "servers" } }),
        req("หน่วยประมวลผลรวมไม่น้อยกว่า 32 vCPU", { clause: "ข้อ 2.2", metric: { name: "vCPU", op: ">=", value: 32, unit: "vCPU" } }),
        req("หน่วยความจำรวมไม่น้อยกว่า 256 GB", { clause: "ข้อ 2.3", metric: { name: "memory", op: ">=", value: 256, unit: "GB" } }),
        req("ต้องมี firewall ตรวจสอบทราฟฟิกทั้งขาเข้าและขาออก", { clause: "ข้อ 3.1" }),
        req("ต้องมี WAF ป้องกันการโจมตีตาม OWASP Top 10", { clause: "ข้อ 3.2" }),
        req("ต้องเป็นไปตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล", { clause: "ข้อ 7.1" }),
        req("ต้องเชื่อมต่อกับสำนักงานผ่านวงจรเช่าพร้อมเส้นทางสำรอง", { clause: "ข้อ 5.1" }),
        req("ต้องมีสภาพแวดล้อมสำหรับพัฒนาแยกจากระบบจริง", { clause: "ข้อ 8.1" }),
      ],
      "กรมทดสอบ",
    );

    const parsed = parseSolutionSpec(out.spec);
    expect(parsed.ok, parsed.ok ? "" : parsed.message).toBe(true);

    expect(out.spec.customerName).toBe("กรมทดสอบ");
    expect(out.spec.hub.kind).toBe("hub_a");
    expect(out.spec.cisLevel).toBe(2);
    expect(out.spec.hub.connectivity).toBe("fastconnect_1g_ha");
    expect(out.spec.environments).toContain("dev");
    expect((out.spec.sizing as { waf: boolean }).waf).toBe(true);

    const cfg = buildFactoryConfig(out.spec);
    expect(cfg.ok, cfg.ok ? "" : cfg.message).toBe(true);

    const bom = priceBom(finalizeBom(applyAddOns(out.spec, TEMPLATES[out.spec.template].buildBom(out.spec))));
    expect(bom.totals.unpricedCount).toBe(0);
    expect(bom.totals.monthlyThb).toBeGreaterThan(0);

    // Every decision must be defensible: a reason in both languages, and a
    // clause reference whenever we claim the TOR asked for it.
    for (const d of out.decisions) {
      expect(d.reason.th.length, d.field).toBeGreaterThan(10);
      expect(d.reason.en.length, d.field).toBeGreaterThan(10);
      if (d.source === "tor") expect(d.clauses.length, d.field).toBeGreaterThan(0);
    }
  });

  it("derives a working spec for every template signal it can pick", () => {
    const probes: string[] = [
      "ต้องจัดหาระบบ ERP สำหรับงานบัญชีแยกประเภท",
      "ต้องจัดทำศูนย์คอมพิวเตอร์สำรอง (DR Site)",
      "ต้องมีคลังข้อมูลและ dashboard ผู้บริหาร (Business Intelligence)",
      "ต้องรองรับการทำงานแบบคอนเทนเนอร์ด้วย Kubernetes",
      "ต้องมีระบบแฟ้มข้อมูลกลางให้หน่วยงานใช้ร่วมกัน",
      "ต้องพัฒนาแชตบอตตอบคำถามประชาชน",
      "ต้องย้ายระบบงานเดิมขึ้นคลาวด์",
    ];
    for (const text of probes) {
      const out = deriveSpecFromTor([req(text)]);
      const parsed = parseSolutionSpec(out.spec);
      expect(parsed.ok, `${text}: ${parsed.ok ? "" : parsed.message}`).toBe(true);
      const bom = priceBom(finalizeBom(applyAddOns(out.spec, TEMPLATES[out.spec.template].buildBom(out.spec))));
      expect(bom.totals.monthlyThb, text).toBeGreaterThan(0);
      expect(bom.totals.unpricedCount, text).toBe(0);
    }
  });
});
