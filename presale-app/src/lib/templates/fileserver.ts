import type { BomItem, FileserverSizing, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { hours } from "@/lib/bom/formulas";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";

// Corporate file server / EFSS: shared File Storage (NFS/SMB) + Object Storage
// archive tier + optional gateway VMs, accessed privately over VPN/FastConnect.

function sizing(spec: SolutionSpec): FileserverSizing {
  if (spec.sizing.kind !== "fileserver") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const fileserverTemplate: TemplateDefinition = {
  id: "fileserver",
  name: { th: "File Server / จัดเก็บไฟล์องค์กร", en: "File Server / Corporate Storage" },
  description: {
    th: "ไฟล์เซิร์ฟเวอร์กลางองค์กร: File Storage (NFS/SMB) + Object Storage archive ต่อผ่าน VPN/FastConnect",
    en: "Central corporate file server: File Storage (NFS/SMB) + Object Storage archive over VPN/FastConnect",
  },
  icon: "🗄️",
  defaultHub: "hub_b",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "fileserver",
      region: { id: "ap-bangkok-1", shortName: "bkk" },
      cisLevel: 1,
      hub: { kind: "hub_b", connectivity: "vpn" },
      environments: ["prod"],
      sizing: {
        kind: "fileserver",
        users: 200,
        fssGb: 2000,
        archiveGb: 10000,
        gatewayVmCount: 1,
        gatewayOcpus: 2,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    { path: "sizing.users", label: { th: "จำนวนผู้ใช้", en: "Users" }, input: { type: "number", min: 5, max: 20000, step: 5, unit: "users" } },
    { path: "sizing.fssGb", label: { th: "File Storage active (GB)", en: "Active File Storage (GB)" }, input: { type: "number", min: 10, max: 500000, step: 100, unit: "GB" } },
    { path: "sizing.archiveGb", label: { th: "Archive (Object Storage, GB)", en: "Archive (Object Storage, GB)" }, input: { type: "number", min: 0, max: 5000000, step: 1000, unit: "GB" } },
    { path: "sizing.gatewayVmCount", label: { th: "Gateway/sync VM", en: "Gateway/sync VMs" }, input: { type: "number", min: 0, max: 10, unit: "VM" } },
    { path: "sizing.gatewayOcpus", label: { th: "OCPU ต่อ gateway", en: "OCPUs per gateway" }, input: { type: "number", min: 1, max: 16, unit: "OCPU" }, visibleIf: (s) => sizing(s).gatewayVmCount > 0 },
  ],
  buildFactoryConfig(spec) {
    return baseFactoryConfig(spec, "files");
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const items = lzBaselineBom(spec);

    items.push({
      catalogKey: "fss_gb",
      label: { th: "File Storage (NFS/SMB) — active", en: "File Storage (NFS/SMB) — active" },
      category: "storage",
      quantity: s.fssGb,
      unit: "GB",
      monthlyMetricQty: s.fssGb,
      deployedByLz: false,
      notes: { th: "snapshot + replication รวมในบริการ FSS", en: "snapshots + replication included in the FSS service" },
    });
    if (s.archiveGb > 0) {
      items.push({
        catalogKey: "os_archive_gb",
        label: { th: "Object Storage — Archive tier (ไฟล์เก่า)", en: "Object Storage — Archive tier (cold files)" },
        category: "storage",
        quantity: s.archiveGb,
        unit: "GB",
        monthlyMetricQty: s.archiveGb,
        deployedByLz: false,
      });
    }
    if (s.gatewayVmCount > 0) {
      items.push(
        {
          catalogKey: "compute_e5_ocpu",
          label: { th: `Gateway VM ×${s.gatewayVmCount} — OCPU`, en: `Gateway VMs ×${s.gatewayVmCount} — OCPU` },
          category: "compute",
          quantity: s.gatewayVmCount * s.gatewayOcpus,
          unit: "OCPU",
          monthlyMetricQty: hours(s.gatewayVmCount * s.gatewayOcpus),
          deployedByLz: false,
          notes: { th: "SMB/NFS gateway หรือ sync agent (DFS/rsync)", en: "SMB/NFS gateway or sync agent (DFS/rsync)" },
        },
        {
          catalogKey: "compute_e5_mem",
          label: { th: "Gateway VM — memory", en: "Gateway VMs — memory" },
          category: "compute",
          quantity: s.gatewayVmCount * s.gatewayOcpus * 8,
          unit: "GB",
          monthlyMetricQty: hours(s.gatewayVmCount * s.gatewayOcpus * 8),
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
        th: `~${s.users.toLocaleString()} ผู้ใช้เข้าถึง file share ผ่าน private (VPN/FastConnect); ไฟล์ที่ไม่ค่อยใช้ย้ายลง Archive อัตโนมัติด้วย lifecycle policy`,
        en: `~${s.users.toLocaleString()} users access the share privately (VPN/FastConnect); cold files tier down to Archive automatically via lifecycle policy.`,
      },
      {
        th: "FSS คิดตามความจุที่ใช้จริง (มี snapshot/replication ในตัว) — ตั้งได้ทั้ง NFS และ SMB",
        en: "FSS is billed on used capacity (snapshots/replication built in) — supports both NFS and SMB.",
      },
    );
    return list;
  },
};
