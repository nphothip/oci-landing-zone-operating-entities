import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { deriveSpecFromTor } from "@/lib/tor/derive-spec";
import { matchRequirements } from "@/lib/tor/match";
import { buildComplianceWorkbook } from "@/lib/export/compliance-xlsx";
import { workbookToXlsx } from "@/lib/export/xlsx";
import type { GenerateResult } from "@/lib/domain/types";
import type { TorRequirement } from "@/lib/tor/types";

const BASE = "https://presale-app-750158050943.asia-southeast3.run.app";

const TOR = [
  "ข้อกำหนดขอบเขตงาน (TOR) โครงการจัดหาระบบสารสนเทศเพื่อการบริการประชาชนบนระบบคลาวด์",
  "ข้อ 1.1 ผู้รับจ้างต้องจัดหาระบบสารสนเทศสำหรับให้บริการประชาชนผ่านเว็บไซต์",
  "ข้อ 1.3 ศูนย์ข้อมูลที่ให้บริการต้องตั้งอยู่ในราชอาณาจักรไทย และข้อมูลต้องไม่ถูกส่งออกนอกประเทศ",
  "ข้อ 2.1 ต้องจัดหาเครื่องแม่ข่ายเสมือนไม่น้อยกว่า 4 เครื่อง",
  "ข้อ 2.2 หน่วยประมวลผลรวมทั้งระบบต้องไม่น้อยกว่า 32 vCPU",
  "ข้อ 2.3 หน่วยความจำรวมทั้งระบบต้องไม่น้อยกว่า 256 GB",
  "ข้อ 2.4 พื้นที่จัดเก็บข้อมูลต้องไม่น้อยกว่า 4000 GB",
  "ข้อ 3.1 ต้องมีระบบ Firewall ตรวจสอบทราฟฟิกทั้งขาเข้าและขาออก และแยกโซน DMZ ออกจากโซนภายใน",
  "ข้อ 3.2 ต้องมี Web Application Firewall ป้องกันการโจมตีตาม OWASP Top 10",
  "ข้อ 3.3 ต้องมีการยืนยันตัวตนแบบหลายปัจจัย (Multi-Factor Authentication) สำหรับผู้ดูแลระบบทุกคน",
  "ข้อ 3.4 ต้องเข้ารหัสข้อมูลทั้งขณะจัดเก็บ (at-rest) และขณะรับส่ง (in-transit)",
  "ข้อ 4.1 ต้องใช้ระบบจัดการฐานข้อมูลแบบ open source เช่น PostgreSQL หรือเทียบเท่า",
  "ข้อ 5.1 ต้องเชื่อมต่อกับสำนักงานใหญ่ผ่านวงจรเช่า (leased line) พร้อมเส้นทางสำรอง",
  "ข้อ 6.1 ระบบต้องมีความพร้อมใช้งาน (Availability) ไม่น้อยกว่าร้อยละ 99.5 ต่อเดือน",
  "ข้อ 6.2 ต้องสำรองข้อมูลอย่างน้อยวันละ 1 ครั้ง และเก็บข้อมูลสำรองย้อนหลังไม่น้อยกว่า 30 วัน",
  "ข้อ 6.3 ต้องมีการรวมศูนย์การจัดเก็บ log และสามารถตรวจสอบย้อนหลังได้ไม่น้อยกว่า 90 วัน",
  "ข้อ 7.1 ระบบต้องเป็นไปตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)",
  "ข้อ 8.1 ต้องจัดให้มีสภาพแวดล้อมสำหรับพัฒนาและทดสอบแยกออกจากระบบที่ใช้งานจริง",
  "ข้อ 8.2 เวลาตอบสนองของระบบต้องไม่เกิน 2 วินาที ในสภาวะการใช้งานปกติ",
  "ข้อ 9.1 ผู้เสนอราคาต้องวางหลักประกันซองร้อยละ 5 ของราคากลาง",
  "ข้อ 9.2 ผู้รับจ้างต้องจัดอบรมเจ้าหน้าที่ผู้ดูแลระบบไม่น้อยกว่า 5 วันทำการ",
];

describe("TOR-first mode, deployed", () => {
  it("delivers design + BOM + compliance matrix from one upload", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${TOR.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
    const fd = new FormData();
    fd.append("file", new Blob([await zip.generateAsync({ type: "arraybuffer" })]), "TOR.docx");

    const tor = (await (await fetch(`${BASE}/api/tor`, { method: "POST", body: fd })).json()) as {
      status: string; message?: string; requirements?: TorRequirement[];
    };
    expect(tor.status, tor.message).toBe("ok");
    const reqs = tor.requirements!;

    const derived = deriveSpecFromTor(reqs, "กรมทดสอบ");
    const result = (await (await fetch(`${BASE}/api/generate`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(derived.spec),
    })).json()) as GenerateResult & { error?: string };
    expect(result.error).toBeUndefined();

    const rows = matchRequirements(reqs.filter((r) => r.infraRelevant), result);
    const summary = { pass: 0, partial: 0, fail: 0, manual: 0 };
    for (const r of rows) summary[r.status] += 1;
    const sheets = buildComplianceWorkbook(
      { fileName: "TOR.docx", totalRequirements: reqs.length, infraRequirements: rows.length, rows, summary, nonInfra: reqs.filter((r) => !r.infraRelevant), warnings: [] },
      result,
    );
    const xlsx = await (await workbookToXlsx(sheets)).arrayBuffer();

    console.log(`
อ่านข้อกำหนด           ${reqs.length} ข้อ (infra ${rows.length} · non-infra ${reqs.length - rows.length})
แบบที่ได้              ${derived.spec.template} · ${derived.spec.hub.kind} · CIS L${derived.spec.cisLevel} · ${derived.spec.hub.connectivity} · ${derived.spec.environments.join("+")}
เหตุผลที่บันทึก         ${derived.decisions.length} ข้อ (จาก TOR ${derived.decisions.filter((d) => d.source === "tor").length} · best practice ${derived.decisions.filter((d) => d.source === "best_practice").length})
BOM                    ฿${result.bom.totals.monthlyThb.toLocaleString("th-TH")}/เดือน · ${result.bom.items.length} บรรทัด · ไม่มีราคา ${result.bom.totals.unpricedCount}
ส่งมอบ                 LaC ${result.lac.files.length} ไฟล์ · diagram ${result.diagrams.length} views
ตารางเทียบเกณฑ์         ผ่าน ${summary.pass} · บางส่วน ${summary.partial} · ไม่ผ่าน ${summary.fail} · ต้องตรวจ ${summary.manual}
Excel                  ${sheets.length} ชีต · ${Math.round(xlsx.byteLength / 1024)} KB`);

    expect(summary.pass).toBeGreaterThan(15);
    expect(summary.fail).toBe(0);
    expect(result.bom.totals.unpricedCount).toBe(0);
    expect(result.diagrams.length).toBe(13);
    expect(reqs.some((r) => !r.infraRelevant)).toBe(true);
    for (const r of rows) if (r.status === "manual") expect(r.offered).toBe("");
  }, 300_000);
});
