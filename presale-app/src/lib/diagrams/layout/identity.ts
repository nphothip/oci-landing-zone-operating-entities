import type { DiagramDoc, SolutionSpec, ViewId } from "@/lib/domain/types";
import { Doc, addLegend } from "../model";
import type { ParsedGenerated } from "../generated-parse";

// Identity View — three panels in the deployment-view language:
//   1. Enterprise IdP + admin personas federated (SAML/OIDC + SCIM) into the
//      OCI IAM Identity Domain holding the LZ management groups (from gen).
//   2. Password-policy card — recommended baseline configured in the domain.
//   3. MFA / sign-on-policy card — enforcement, factors, break-glass handling.
// Same visual grammar as the other views: cream shared compartment, white
// resource tiles with teal monoline icons, route-style cards, right-rail legend.

const GROUP_CAP = 10;

/** Sensible fallback when the generated IAM JSON exposes no groups. */
const DEFAULT_GROUPS = [
  "iam-admins",
  "cred-admins",
  "network-admins",
  "security-admins",
  "ops-admins",
  "project-admins",
];

export function layoutIdentityView(spec: SolutionSpec, gen: ParsedGenerated): DiagramDoc {
  const d = new Doc();
  const top = 64;

  d.add({
    kind: "canvasTitle",
    label: "Identity View",
    sublabel: "identity domain · federation · password & MFA policy baseline",
    x: 24, y: 14, w: 720, h: 40, style: "canvasTitle",
  });

  // ---- panel 1a: enterprise side (IdP + admin personas) --------------------
  const px = 24;
  const pw = 210;
  d.add({
    id: "corp",
    kind: "compartment",
    label: "Enterprise / On-premises",
    x: px, y: top, w: pw, h: 284,
    style: "panel",
  });
  d.add({
    id: "idp",
    kind: "block",
    label: "Enterprise IdP",
    sublabel: "AD / Entra ID / Okta",
    icon: "onprem",
    x: px + 12, y: top + 34, w: pw - 24, h: 60,
    style: "actor",
    parent: "corp",
  });
  const personas = [
    { id: "per-iam", icon: "user", label: "IAM / Domain Admin", sub: "break-glass holder" },
    { id: "per-sec", icon: "user", label: "Security Admin", sub: "policy & posture" },
    { id: "per-biz", icon: "people", label: "Business users", sub: "federated sign-in" },
  ];
  personas.forEach((p, i) => {
    d.add({
      id: p.id,
      kind: "persona",
      label: p.label,
      sublabel: p.sub,
      icon: p.icon,
      x: px + 12, y: top + 108 + i * 58, w: pw - 24, h: 48,
      style: "persona",
      parent: "corp",
    });
  });

  // ---- panel 1b: OCI IAM Identity Domain with LZ groups --------------------
  const dx = 300;
  const dw = 330;
  const groupsAll = gen.groups.length ? gen.groups : DEFAULT_GROUPS;
  const shown = groupsAll.slice(0, GROUP_CAP);
  const extra = groupsAll.length - shown.length;
  const cols = 2;
  const colW = (dw - 24 - 12) / cols;
  const tileH = 36;
  const rowGap = 10;
  const rows = Math.ceil(shown.length / cols);
  const gy0 = top + 56;
  const domainH = 56 + rows * (tileH + rowGap) - rowGap + (extra > 0 ? 34 : 0) + 14;
  d.add({
    id: "domain",
    kind: "compartment",
    label: "OCI IAM Identity Domain — Default",
    sublabel: gen.policyCount
      ? `${groupsAll.length} groups · ${gen.policyCount} least-privilege policy sets`
      : `${groupsAll.length} groups · least-privilege policies`,
    x: dx, y: top, w: dw, h: domainH,
    style: "compartmentShared",
  });
  shown.forEach((g, i) => {
    d.add({
      id: `grp${i}`,
      kind: "service",
      label: `grp-${g}`,
      icon: "people",
      x: dx + 12 + (i % cols) * (colW + 12),
      y: gy0 + Math.floor(i / cols) * (tileH + rowGap),
      w: colW, h: tileH,
      style: "resourceTile",
      parent: "domain",
    });
  });
  if (extra > 0) {
    d.add({
      id: "grp-more",
      kind: "note",
      label: `+${extra} more groups (เต็มรายการอยู่ใน iam.json)`,
      x: dx + 12, y: gy0 + rows * (tileH + rowGap), w: dw - 24, h: 24,
      style: "note",
      parent: "domain",
    });
  }

  // federation + provisioning arrows into the domain
  d.edge({
    from: "idp", to: "domain", kind: "flow",
    label: "SAML 2.0 / OIDC federation",
    points: [{ x: dx - 34, y: top + 58 }],
  });
  d.edge({
    from: "idp", to: "domain", kind: "flow", dashed: true,
    label: "SCIM provisioning",
    points: [{ x: dx - 34, y: top + 108 }],
  });
  d.edge({
    from: "per-iam", to: "domain", kind: "assoc", dashed: true,
    label: "admin sign-in · MFA",
    points: [{ x: dx - 34, y: top + 190 }],
  });

  // ---- panel 2: password policy card --------------------------------------
  const cardW = 310;
  const cx1 = dx + dw + 50;
  const pwdRows = [
    { left: "Minimum length", right: "14 characters" },
    { left: "Upper + lower case", right: "required" },
    { left: "Digit + special char", right: "required" },
    { left: "Password history", right: "last 12 blocked" },
    { left: "Maximum age", right: "90 days" },
    { left: "Lockout", right: "5 attempts · 15 min" },
  ];
  const pwdH = 20 + 15 + pwdRows.length * 16 + 6;
  d.add({
    id: "pwd-card",
    kind: "routeCard",
    label: "Password policy (Identity Domain)",
    x: cx1, y: top, w: cardW, h: pwdH,
    style: "routeCardHub",
    colHeaders: ["Policy", "Recommended"],
    rows: pwdRows,
  });
  d.edge({ from: "pwd-card", to: "domain", kind: "leader" });
  d.add({
    id: "pwd-note",
    kind: "note",
    label: "Baseline แนะนำ — ตั้งค่าใน Identity Domain password policy (ปรับตามนโยบายองค์กรได้)",
    x: cx1, y: top + pwdH + 12, w: cardW, h: 46,
    style: "note",
  });

  // ---- panel 3: MFA / sign-on policy card ---------------------------------
  const cx2 = cx1 + cardW + 40;
  const mfaRows = [
    { left: "MFA enforcement", right: "all users", bold: true },
    { left: "Factors", right: "TOTP app + FIDO2" },
    { left: "Adaptive sign-on", right: "risk-based" },
    { left: "Break-glass account", right: "excluded · monitored" },
    { left: "Session duration", right: "8 hours" },
  ];
  const mfaH = 20 + 15 + mfaRows.length * 16 + 6;
  d.add({
    id: "mfa-card",
    kind: "routeCard",
    label: "MFA / Sign-on policy",
    x: cx2, y: top, w: cardW, h: mfaH,
    style: "routeCardSpoke",
    colHeaders: ["Control", "Setting"],
    rows: mfaRows,
  });
  d.add({
    id: "mfa-note",
    kind: "note",
    label: "Admin roles ต้องยืนยัน MFA ทุกครั้งที่ sign-in (no remember-device) · break-glass ใช้เฉพาะกรณีฉุกเฉินพร้อม audit alert",
    x: cx2, y: top + mfaH + 12, w: cardW, h: 46,
    style: "note",
  });

  // ---- legend (right rail) ------------------------------------------------
  addLegend(d, cx2, top + mfaH + 12 + 46 + 24, [
    { left: "IDENTITY DOMAIN", swatch: "compartmentShared" },
    { left: "GROUP (GENERATED IAM)", swatch: "resourceTile" },
    { left: "ENTERPRISE IDP / PERSONA", swatch: "persona" },
    { left: "PASSWORD POLICY", swatch: "routeCardHub" },
    { left: "MFA / SIGN-ON POLICY", swatch: "routeCardSpoke" },
  ]);

  return d.finish({
    view: "identity" as ViewId,
    title: {
      th: "มุมมองตัวตนและการยืนยันสิทธิ์ (Identity View)",
      en: "Identity View",
    },
  });
}
