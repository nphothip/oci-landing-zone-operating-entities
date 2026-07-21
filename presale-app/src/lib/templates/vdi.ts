import type { BomItem, SolutionSpec, TemplateDefinition, VdiSizing } from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// Virtual desktops (VDI): OCI Secure Desktops billed per desktop/month, with
// FSS for roaming profiles and optional shared broker/app servers. Accessed
// privately from the office.

function sizing(spec: SolutionSpec): VdiSizing {
  if (spec.sizing.kind !== "vdi") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const vdiTemplate: TemplateDefinition = {
  id: "vdi",
  name: { th: "Virtual Desktops (VDI)", en: "Virtual Desktops (VDI)" },
  description: {
    th: "เดสก์ท็อปเสมือนผ่าน OCI Secure Desktops (คิดต่อ desktop) + profile บน File Storage เข้าถึงแบบ private",
    en: "Virtual desktops via OCI Secure Desktops (per-desktop) + profiles on File Storage, private access",
  },
  icon: "🖥️",
  defaultHub: "hub_b",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "vdi",
      region: { id: "ap-bangkok-1", shortName: "bkk" },
      cisLevel: 1,
      hub: { kind: "hub_b", connectivity: "vpn" },
      environments: ["prod"],
      sizing: {
        kind: "vdi",
        desktopCount: 50,
        profileStorageGb: 500,
        appVmCount: 1,
        appOcpus: 4,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.desktopCount", label: { th: "จำนวน virtual desktop", en: "Virtual desktops" }, input: { type: "number", min: 1, max: 2000, unit: "desktops" } },
    { path: "sizing.profileStorageGb", label: { th: "Profile/home storage (FSS, GB)", en: "Profile/home storage (FSS, GB)" }, input: { type: "number", min: 0, max: 500000, step: 50, unit: "GB" } },
    { path: "sizing.appVmCount", label: { th: "Broker/app server VM", en: "Broker/app server VMs" }, input: { type: "number", min: 0, max: 20, unit: "VM" } },
    { path: "sizing.appOcpus", label: { th: "OCPU ต่อ app server", en: "OCPUs per app server" }, input: { type: "number", min: 1, max: 32, unit: "OCPU" }, visibleIf: (s) => sizing(s).appVmCount > 0 },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "desktops");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const items = lzBaselineBom(spec);

    items.push({
      catalogKey: "vdi_desktop",
      label: { th: `OCI Secure Desktops ×${s.desktopCount}`, en: `OCI Secure Desktops ×${s.desktopCount}` },
      category: "compute",
      quantity: s.desktopCount,
      unit: "desktops",
      monthlyMetricQty: s.desktopCount,
      deployedByLz: false,
      notes: { th: "คิดต่อ desktop/เดือน — รวม compute ของเดสก์ท็อป", en: "billed per desktop/month — includes the desktop compute" },
    });
    if (s.profileStorageGb > 0) {
      items.push({
        catalogKey: "fss_gb",
        label: { th: "File Storage — roaming profiles/home", en: "File Storage — roaming profiles/home" },
        category: "storage",
        quantity: s.profileStorageGb,
        unit: "GB",
        monthlyMetricQty: s.profileStorageGb,
        deployedByLz: false,
      });
    }
    if (s.appVmCount > 0) {
      items.push(
        {
          catalogKey: "compute_e5_ocpu",
          label: { th: `Broker/app server ×${s.appVmCount} — OCPU`, en: `Broker/app servers ×${s.appVmCount} — OCPU` },
          category: "compute",
          quantity: s.appVmCount * s.appOcpus,
          unit: "OCPU",
          monthlyMetricQty: hours(s.appVmCount * s.appOcpus),
          deployedByLz: false,
          notes: { th: "โฮสต์แอปที่แชร์/connection broker/AD", en: "hosts shared apps / connection broker / AD" },
        },
        {
          catalogKey: "compute_e5_mem",
          label: { th: "Broker/app server — memory", en: "Broker/app servers — memory" },
          category: "compute",
          quantity: s.appVmCount * s.appOcpus * 8,
          unit: "GB",
          monthlyMetricQty: hours(s.appVmCount * s.appOcpus * 8),
          deployedByLz: false,
        },
      );
    }
    return items;
  },
  assumptions(spec) {
    const s = sizing(spec);
    const list = lzBaselineAssumptions(spec);
    list.push(
      {
        th: `${s.desktopCount} เดสก์ท็อปเข้าถึงแบบ private จากออฟฟิศ (VPN/FastConnect); OCI Secure Desktops คิดต่อ desktop/เดือนแบบคงที่ ไม่ต้องบริหาร image เอง`,
        en: `${s.desktopCount} desktops accessed privately from the office (VPN/FastConnect); OCI Secure Desktops is a flat per-desktop/month charge with managed images.`,
      },
      {
        th: "OS/แอป license ของเดสก์ท็อป (Windows/แอปธุรกิจ) เป็นของลูกค้า ไม่รวมในราคานี้",
        en: "Desktop OS/app licenses (Windows/business apps) are customer-provided, not included here.",
      },
    );
    return list;
  },
};
