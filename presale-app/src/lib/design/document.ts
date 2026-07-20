import type { GenerateResult, LocalizedText, ViewId } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { buildDesignFacts, type DesignFacts } from "./facts";

// The design-document model: an ordered list of sections, each with a heading,
// optional embedded diagram view, deterministic bilingual prose, and an
// optional special renderer (BOM table / assumptions list). AI narrative, when
// available, overlays the prose at render time (see DesignDocTab).

export type SectionKind = "prose" | "bom" | "assumptions" | "deployment";

export interface DesignSection {
  id: string;
  heading: LocalizedText;
  view?: ViewId;
  paragraphs: LocalizedText[];
  kind: SectionKind;
}

export interface DesignDocument {
  title: LocalizedText;
  subtitle: LocalizedText;
  meta: { label: LocalizedText; value: string }[];
  sections: DesignSection[];
  facts: DesignFacts;
}

const L = (th: string, en: string): LocalizedText => ({ th, en });

/** Section ids the AI narrative may return prose for. */
export const NARRATIVE_SECTIONS = [
  "executive",
  "overview",
  "functional",
  "security",
  "network",
  "operations",
  "runtime",
  "deployment",
] as const;

export function buildDesignDocument(result: GenerateResult): DesignDocument {
  const facts = buildDesignFacts(result);
  const { spec } = result;
  const t = TEMPLATES[spec.template];
  const envList = spec.environments.join(", ");
  const fwText = facts.hub.firewall
    ? L(
        `north-south traffic ถูกตรวจโดย OCI Network Firewall ${facts.hub.firewallCount} ชุดใน hub`,
        `north-south traffic is inspected by ${facts.hub.firewallCount} OCI Network Firewall instance(s) in the hub`,
      )
    : L("hub นี้ไม่มี firewall (เหมาะกับ PoC/งบจำกัด)", "this hub has no firewall (suited to PoC/budget-constrained cases)");

  const sections: DesignSection[] = [
    {
      id: "executive",
      heading: L("1. บทสรุปผู้บริหาร", "1. Executive Summary"),
      kind: "prose",
      paragraphs: [
        L(
          `เอกสารนี้อธิบายการออกแบบ ${t.name.th} บน Oracle Cloud Infrastructure (OCI) ที่ region ${facts.region} โดยวางอยู่บน landing zone มาตรฐานตามแนวทาง OCI Open LZ (Operating Entities) ครอบคลุม ${spec.environments.length} environment (${envList})`,
          `This document describes the design of a ${t.name.en} on Oracle Cloud Infrastructure (OCI) in region ${facts.region}, built on a standard landing zone following the OCI Open LZ (Operating Entities) blueprint across ${spec.environments.length} environment(s) (${envList}).`,
        ),
        L(
          `ค่าใช้จ่ายโดยประมาณอยู่ที่ ${money(facts.cost.monthlyUsd)} ต่อเดือน (OCI list price, USD) — โครงสร้าง landing zone (เครือข่าย/IAM/ความปลอดภัย/observability/governance) deploy ได้จริงจากไฟล์ Infrastructure-as-Code ที่แนบ ส่วนทรัพยากร workload คิดราคาไว้และ provision หลังวาง landing zone`,
          `The estimated cost is ${money(facts.cost.monthlyUsd)} per month (OCI list price, USD). The landing zone (network/IAM/security/observability/governance) is deployable directly from the attached Infrastructure-as-Code; workload resources are priced here and provisioned after the landing zone.`,
        ),
      ],
    },
    {
      id: "overview",
      heading: L("2. ภาพรวมโซลูชัน", "2. Solution Overview"),
      kind: "prose",
      paragraphs: [
        L(
          `โซลูชันแบ่งความรับผิดชอบตามแนวคิด Operating Entities: shared services (เครือข่าย/ความปลอดภัย/แพลตฟอร์ม) แยกจาก workload environment แต่ละตัว โดยแต่ละส่วนมี compartment และสิทธิ์ของตัวเอง`,
          `The solution separates responsibilities using the Operating Entities model: shared services (network/security/platform) are isolated from each workload environment, each with its own compartments and permissions.`,
        ),
        L(
          `บล็อกฟังก์ชันหลักของ landing zone ได้แก่ IAM & compartments, hub network, security posture, observability และ governance — วางรองรับ workload ${t.name.th}`,
          `The landing zone's core functional blocks are IAM & compartments, the hub network, security posture, observability, and governance — hosting the ${t.name.en} workload.`,
        ),
      ],
    },
    {
      id: "functional",
      heading: L("3. สถาปัตยกรรมเชิงฟังก์ชัน (Functional View)", "3. Functional Architecture (Functional View)"),
      kind: "prose",
      view: "functional",
      paragraphs: [
        L(
          `ผู้เกี่ยวข้อง (personas) ประกอบด้วยทีม IAM, เครือข่าย, ความปลอดภัย, ต้นทุน, ผู้ตรวจสอบ และทีมโปรเจกต์ — แต่ละทีมมีขอบเขตสิทธิ์แยกกันตามหลัก segregation of duties`,
          `The personas include IAM, network, security, cost, auditor, and project teams — each with a distinct permission scope following segregation-of-duties principles.`,
        ),
        workloadParagraph(facts),
      ],
    },
    {
      id: "security",
      heading: L("4. การออกแบบความปลอดภัยและ Identity (Security View)", "4. Security & Identity Design (Security View)"),
      kind: "prose",
      view: "security",
      paragraphs: [
        L(
          `โครงสร้าง compartment มี ${facts.compartments.length} compartment ภายใต้ cmp-landingzone แยก shared (network/security/platform) และ workload environment (${envList}) พร้อม project compartment ย่อย`,
          `The compartment structure has ${facts.compartments.length} compartments under cmp-landingzone, separating shared services (network/security/platform) from workload environments (${envList}) with nested project compartments.`,
        ),
        L(
          `IAM ใช้ Identity Domain เดียวกับ ${facts.groups.length} กลุ่ม (${facts.groups.slice(0, 6).join(", ")}${facts.groups.length > 6 ? "…" : ""}) และ ${facts.policyCount} ชุด policy แบบ least-privilege แยกตามหน้าที่/environment/project`,
          `IAM uses an Identity Domain with ${facts.groups.length} groups (${facts.groups.slice(0, 6).join(", ")}${facts.groups.length > 6 ? "…" : ""}) and ${facts.policyCount} least-privilege policy sets scoped by function/environment/project.`,
        ),
        L(
          `Security posture ที่ landing zone เปิดให้: ${facts.posture.join(", ")}`,
          `Security posture enabled by the landing zone: ${facts.posture.join(", ")}.`,
        ),
      ],
    },
    {
      id: "network",
      heading: L("5. การออกแบบเครือข่าย (Network View)", "5. Network Design (Network View)"),
      kind: "prose",
      view: "network",
      paragraphs: [
        L(
          `เครือข่ายเป็นแบบ hub-and-spoke ผ่าน DRG กลาง โดยใช้ ${facts.hub.model}; ${fwText.th}`,
          `The network is hub-and-spoke via a central DRG using ${facts.hub.model}; ${fwText.en}.`,
        ),
        networkParagraph(facts),
        L(
          `การเชื่อมต่อภายนอก: ${connectivityText(facts.connectivity).th}`,
          `External connectivity: ${connectivityText(facts.connectivity).en}.`,
        ),
      ],
    },
    {
      id: "operations",
      heading: L("6. การดำเนินงานและ Monitoring (Operations View)", "6. Operations & Monitoring (Operations View)"),
      kind: "prose",
      view: "operations",
      paragraphs: [
        L(
          `Observability รวม log จาก VCN flow logs, audit และ Cloud Guard เข้า Logging (${facts.observability.logGroups || "ชุดมาตรฐาน"} log group) แล้วส่งต่อผ่าน Service Connector และ Notifications (${facts.observability.topics || 1} topic) ไปยังทีม ops/security`,
          `Observability consolidates VCN flow logs, audit, and Cloud Guard into Logging (${facts.observability.logGroups || "standard"} log groups), routed via the Service Connector and Notifications (${facts.observability.topics || 1} topic) to the ops/security teams.`,
        ),
        L(
          `Day-2 operations เป็นแบบ GitOps: แก้ config.json → generate → review เป็น PR → apply ผ่าน orchestrator ทำให้เปลี่ยนแปลงตรวจสอบได้และทำซ้ำได้`,
          `Day-2 operations follow a GitOps model: edit config.json → generate → review as a PR → apply via the orchestrator, keeping changes auditable and repeatable.`,
        ),
      ],
    },
    {
      id: "runtime",
      heading: L("7. Runtime และการ Deploy (Runtime View)", "7. Runtime & Deployment (Runtime View)"),
      kind: "prose",
      view: "runtime",
      paragraphs: [
        L(
          `Landing zone ประกอบจากไฟล์ ${facts.lacFileNames.length} ไฟล์ apply ผ่าน OCI Landing Zones Orchestrator (Terraform/Resource Manager)${facts.staged ? " แบบ staged สองขั้น (ไฟล์ *_pre ก่อน แล้วตามด้วยไฟล์จบ)" : ""}`,
          `The landing zone is composed of ${facts.lacFileNames.length} files applied via the OCI Landing Zones Orchestrator (Terraform/Resource Manager)${facts.staged ? ", using a two-step staged deployment (*_pre files first, then the final files)" : ""}.`,
        ),
        L(
          `เส้นทาง runtime ของ workload วิ่งจากผู้ใช้เข้าสู่ระบบผ่าน hub แล้วลงสู่ subnet ตามบทบาท (web/app/db) ภายใน spoke ของ environment ที่เกี่ยวข้อง`,
          `The workload's runtime path flows from users through the hub down to role-based subnets (web/app/db) within the relevant environment's spoke.`,
        ),
      ],
    },
    {
      id: "bom",
      heading: L("8. รายการทรัพยากรและค่าใช้จ่าย (BOM & Cost)", "8. Bill of Materials & Cost"),
      kind: "bom",
      paragraphs: [
        L(
          `ค่าใช้จ่ายรวมประมาณ ${money(facts.cost.monthlyUsd)}/เดือน (${facts.cost.priceSource === "live" ? "ราคา live" : "ราคา snapshot"} ${facts.cost.fetchedAt.slice(0, 10)}) ตัวขับต้นทุนหลัก: ${facts.cost.topDrivers.map((d) => `${stripEnv(d.label)} (${money(d.monthlyUsd)})`).slice(0, 4).join(", ")}`,
          `Total cost is approximately ${money(facts.cost.monthlyUsd)}/month (${facts.cost.priceSource === "live" ? "live prices" : "snapshot"} ${facts.cost.fetchedAt.slice(0, 10)}). Top cost drivers: ${facts.cost.topDrivers.map((d) => `${stripEnv(d.label)} (${money(d.monthlyUsd)})`).slice(0, 4).join(", ")}.`,
        ),
      ],
    },
    {
      id: "assumptions",
      heading: L("9. สมมติฐานและขอบเขต", "9. Assumptions & Scope"),
      kind: "assumptions",
      paragraphs: [],
    },
    {
      id: "deployment",
      heading: L("10. แนวทางการ Deploy", "10. Deployment Approach"),
      kind: "deployment",
      paragraphs: [
        L(
          "ใช้ไฟล์ Infrastructure-as-Code ที่อยู่ในแท็บ LaC (config.json + generated/*.json + README) กับ OCI Landing Zones Orchestrator ผ่าน Terraform CLI หรือ OCI Resource Manager",
          "Use the Infrastructure-as-Code from the LaC tab (config.json + generated/*.json + README) with the OCI Landing Zones Orchestrator via Terraform CLI or OCI Resource Manager.",
        ),
      ],
    },
  ];

  return {
    title: L(`เอกสารออกแบบสถาปัตยกรรม — ${t.name.th}`, `Architecture Design Document — ${t.name.en}`),
    subtitle: L("OCI Landing Zone + Cloud Design", "OCI Landing Zone + Cloud Design"),
    meta: [
      { label: L("ลูกค้า", "Customer"), value: spec.customerName || "—" },
      { label: L("Region", "Region"), value: facts.region },
      { label: L("Hub model", "Hub model"), value: facts.hub.model },
      { label: L("CIS profile", "CIS profile"), value: `Level ${spec.cisLevel}` },
      { label: L("Environments", "Environments"), value: envList },
      { label: L("ค่าใช้จ่าย/เดือน", "Monthly cost"), value: money(facts.cost.monthlyUsd) },
    ],
    sections,
    facts,
  };
}

function workloadParagraph(facts: DesignFacts): LocalizedText {
  const comps = facts.workload.components.map((c) => `${c.label} (${c.detail})`).slice(0, 6).join(", ");
  return L(
    `องค์ประกอบ workload หลัก: ${comps || "—"} — รายการที่ไม่ได้ deploy โดย landing zone จะ provision เพิ่มหลังวาง LZ`,
    `Key workload components: ${comps || "—"} — items not deployed by the landing zone are provisioned after the LZ.`,
  );
}

function networkParagraph(facts: DesignFacts): LocalizedText {
  const hub = facts.vcns.find((v) => v.role === "hub");
  const spokes = facts.vcns.filter((v) => v.role !== "hub");
  const hubText = hub ? `${hub.name} (${hub.cidr}) มี ${hub.subnets.length} subnet และ gateway: ${hub.gateways.join(", ")}` : "hub VCN";
  const spokeText = spokes.map((s) => `${s.name} (${s.cidr})`).join(", ");
  return L(
    `VCN ของ hub: ${hubText}. Spoke/platform VCN: ${spokeText || "—"} — แต่ละ spoke แยก subnet ตามบทบาท (web/app/db/infra)`,
    `Hub VCN: ${hub ? `${hub.name} (${hub.cidr}) with ${hub.subnets.length} subnets and gateways: ${hub.gateways.join(", ")}` : "hub VCN"}. Spoke/platform VCNs: ${spokeText || "—"} — each spoke separates subnets by role (web/app/db/infra).`,
  );
}

function connectivityText(c: string): LocalizedText {
  switch (c) {
    case "vpn":
      return L("Site-to-Site VPN (IPSec) เข้าที่ hub DRG", "Site-to-Site VPN (IPSec) terminating at the hub DRG");
    case "fastconnect_1g":
      return L("FastConnect 1 Gbps เข้าที่ hub DRG", "FastConnect 1 Gbps terminating at the hub DRG");
    case "fastconnect_10g":
      return L("FastConnect 10 Gbps เข้าที่ hub DRG", "FastConnect 10 Gbps terminating at the hub DRG");
    default:
      return L("ไม่มีการเชื่อมต่อ on-premises (เข้าถึงผ่านอินเทอร์เน็ต/บริการสาธารณะ)", "no on-premises connectivity (access via internet/public services)");
  }
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const stripEnv = (label: string) => label.replace(/\s*\[[a-z]+\]\s*$/, "");
