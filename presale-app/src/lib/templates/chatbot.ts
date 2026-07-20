import type { BomItem, ChatbotSizing, SolutionSpec, TemplateDefinition } from "@/lib/domain/types";
import { hours, tokensTo10k } from "@/lib/bom/formulas";
import { OKE_SERVICES_CIDR, envBlocks, hubMgmtSubnet, orderEnvs } from "@/lib/domain/cidr";
import { lzBaselineAssumptions, lzBaselineBom } from "./lz-baseline";
import { baseFactoryConfig } from "./common";
import { perEnv } from "@/lib/bom/env";

// AI chatbot: app tier (VMs or an OKE platform via the oke_simple extension)
// + OCI Generative AI on-demand + optional RAG (vector ADB + doc storage).

// Kubernetes version aligned with the repo's blueprint-factory example
// (addons/oci-lz-blueprint-factory/examples/03-prod-oke.json).
const OKE_K8S_VERSION = "v1.35.2";

function sizing(spec: SolutionSpec): ChatbotSizing {
  if (spec.sizing.kind !== "chatbot") throw new Error("sizing/template mismatch");
  return spec.sizing;
}

export const chatbotTemplate: TemplateDefinition = {
  id: "chatbot",
  name: { th: "Chatbot (Generative AI)", en: "Chatbot (Generative AI)" },
  description: {
    th: "แชทบอทด้วย OCI Generative AI + RAG บน landing zone (รันบน VM หรือ OKE)",
    en: "Chatbot on OCI Generative AI + RAG on a landing zone (VM or OKE runtime)",
  },
  icon: "🤖",
  defaultHub: "hub_b",
  defaultCis: 1,
  defaults(): SolutionSpec {
    return {
      template: "chatbot",
      region: { id: "ap-singapore-1", shortName: "sin" },
      cisLevel: 1,
      hub: { kind: "hub_b", connectivity: "none" },
      environments: ["prod"],
      sizing: {
        kind: "chatbot",
        runtime: "vm",
        chatsPerMonth: 50_000,
        avgTokensPerChat: 4_000,
        modelClass: "small",
        rag: true,
        vectorDbEcpus: 4,
        docStorageGb: 20,
        appVmCount: 2,
        ocpusPerVm: 2,
        memGbPerVm: 16,
        okeWorkerCount: 3,
        okeWorkerOcpus: 2,
        okeWorkerMemGb: 16,
      },
      assumptionNotes: [],
    };
  },
  knobs: [
    {
      path: "sizing.runtime",
      label: { th: "Runtime ของแอปแชทบอท", en: "Chatbot app runtime" },
      input: {
        type: "select",
        options: [
          { value: "vm", label: { th: "Compute VMs", en: "Compute VMs" } },
          { value: "oke", label: { th: "OKE (Kubernetes)", en: "OKE (Kubernetes)" } },
        ],
      },
    },
    { path: "sizing.chatsPerMonth", label: { th: "บทสนทนาต่อเดือน", en: "Chats per month" }, input: { type: "number", min: 1000, max: 10_000_000, step: 1000, unit: "chats" } },
    { path: "sizing.avgTokensPerChat", label: { th: "Tokens เฉลี่ยต่อบทสนทนา", en: "Avg tokens per chat" }, input: { type: "number", min: 500, max: 50_000, step: 500, unit: "tokens" } },
    {
      path: "sizing.modelClass",
      label: { th: "ขนาดโมเดล", en: "Model class" },
      input: {
        type: "select",
        options: [
          { value: "small", label: { th: "Small (Llama 4 Scout)", en: "Small (Llama 4 Scout)" } },
          { value: "large", label: { th: "Large (Llama 3.1 405B)", en: "Large (Llama 3.1 405B)" } },
        ],
      },
    },
    { path: "sizing.rag", label: { th: "RAG (ค้นเอกสารประกอบคำตอบ)", en: "RAG (retrieval-augmented answers)" }, input: { type: "boolean" } },
    { path: "sizing.vectorDbEcpus", label: { th: "Vector DB (ADB) ECPU", en: "Vector DB (ADB) ECPUs" }, input: { type: "number", min: 2, max: 32, step: 2, unit: "ECPU" }, visibleIf: (s) => sizing(s).rag },
    { path: "sizing.docStorageGb", label: { th: "เอกสารสำหรับ RAG (GB)", en: "RAG document corpus (GB)" }, input: { type: "number", min: 1, max: 5000, unit: "GB" }, visibleIf: (s) => sizing(s).rag },
    { path: "sizing.appVmCount", label: { th: "จำนวน App VM", en: "App VMs" }, input: { type: "number", min: 1, max: 20, unit: "VM" }, visibleIf: (s) => sizing(s).runtime === "vm" },
    { path: "sizing.ocpusPerVm", label: { th: "OCPU ต่อ VM", en: "OCPUs per VM" }, input: { type: "number", min: 1, max: 32, unit: "OCPU" }, visibleIf: (s) => sizing(s).runtime === "vm" },
    { path: "sizing.memGbPerVm", label: { th: "Memory ต่อ VM (GB)", en: "Memory per VM (GB)" }, input: { type: "number", min: 4, max: 256, step: 4, unit: "GB" }, visibleIf: (s) => sizing(s).runtime === "vm" },
    { path: "sizing.okeWorkerCount", label: { th: "OKE worker nodes", en: "OKE worker nodes" }, input: { type: "number", min: 1, max: 50, unit: "nodes" }, visibleIf: (s) => sizing(s).runtime === "oke" },
    { path: "sizing.okeWorkerOcpus", label: { th: "OCPU ต่อ worker", en: "OCPUs per worker" }, input: { type: "number", min: 1, max: 32, unit: "OCPU" }, visibleIf: (s) => sizing(s).runtime === "oke" },
    { path: "sizing.okeWorkerMemGb", label: { th: "Memory ต่อ worker (GB)", en: "Memory per worker (GB)" }, input: { type: "number", min: 4, max: 256, step: 4, unit: "GB" }, visibleIf: (s) => sizing(s).runtime === "oke" },
  ],
  buildFactoryConfig(spec) {
    const s = sizing(spec);
    const config = baseFactoryConfig(spec, "chatbot");
    if (s.runtime === "oke") {
      for (const env of orderEnvs(spec.environments)) {
        config.environments[env].platforms = {
          oke: {
            network: { vcn: envBlocks(env).platform },
            extension: {
              type: "oke_simple",
              params: {
                kubernetes_version: OKE_K8S_VERSION,
                services_cidr: OKE_SERVICES_CIDR,
                api_endpoint_allowed_cidrs: [hubMgmtSubnet(spec.hub.kind)],
              },
            },
          },
        };
      }
    }
    return config;
  },
  buildBom(spec): BomItem[] {
    const s = sizing(spec);
    const items = lzBaselineBom(spec);

    // --- Generative AI usage (production traffic only) ---------------------
    const monthlyTokens = s.chatsPerMonth * s.avgTokensPerChat;
    items.push({
      catalogKey: s.modelClass === "small" ? "genai_small_10k" : "genai_large_10k",
      label: {
        th: `Generative AI on-demand (~${(monthlyTokens / 1e6).toFixed(1)}M tokens/เดือน)`,
        en: `Generative AI on-demand (~${(monthlyTokens / 1e6).toFixed(1)}M tokens/month)`,
      },
      category: "ai",
      quantity: Math.round(monthlyTokens / 1e6),
      unit: "M tokens",
      monthlyMetricQty: tokensTo10k(monthlyTokens),
      deployedByLz: false,
      notes: { th: "1 transaction ≈ 1 token (นับ 10,000 transactions ต่อหน่วยราคา)", en: "1 transaction ≈ 1 token (priced per 10,000 transactions)" },
    });
    if (s.rag) {
      const embedTokens = s.docStorageGb * 5e6; // ~5M tokens embedded per GB of docs (one-time, amortized monthly)
      items.push(
        {
          catalogKey: "genai_embed_10k",
          label: { th: "Embedding สำหรับ RAG (เฉลี่ยรายเดือน)", en: "RAG embeddings (monthly average)" },
          category: "ai",
          quantity: Math.round(embedTokens / 1e6),
          unit: "M tokens",
          monthlyMetricQty: tokensTo10k(embedTokens),
          deployedByLz: false,
        },
        {
          catalogKey: "adb_ecpu",
          label: { th: "Vector store — Autonomous DB ECPU", en: "Vector store — Autonomous DB ECPUs" },
          category: "database",
          quantity: s.vectorDbEcpus,
          unit: "ECPU",
          monthlyMetricQty: hours(s.vectorDbEcpus),
          deployedByLz: false,
        },
        {
          catalogKey: "adb_storage_gb",
          label: { th: "Vector store — storage", en: "Vector store — storage" },
          category: "database",
          quantity: Math.max(s.docStorageGb * 2, 20),
          unit: "GB",
          monthlyMetricQty: Math.max(s.docStorageGb * 2, 20),
          deployedByLz: false,
        },
        {
          catalogKey: "os_standard_gb",
          label: { th: "Object Storage — คลังเอกสาร", en: "Object Storage — document corpus" },
          category: "storage",
          quantity: s.docStorageGb,
          unit: "GB",
          monthlyMetricQty: s.docStorageGb,
          deployedByLz: false,
        },
      );
    }

    // --- runtime (per environment) -----------------------------------------
    const BOOT_GB = 100; // planning assumption per VM/worker node
    const runtime = perEnv(spec, () => {
      if (s.runtime === "vm") {
        return [
          {
            catalogKey: "compute_e5_ocpu",
            label: { th: `App VM ×${s.appVmCount} — OCPU`, en: `App VMs ×${s.appVmCount} — OCPU` },
            category: "compute",
            quantity: s.appVmCount * s.ocpusPerVm,
            unit: "OCPU",
            monthlyMetricQty: hours(s.appVmCount * s.ocpusPerVm),
            deployedByLz: false,
          },
          {
            catalogKey: "compute_e5_mem",
            label: { th: "App VM — memory", en: "App VMs — memory" },
            category: "compute",
            quantity: s.appVmCount * s.memGbPerVm,
            unit: "GB",
            monthlyMetricQty: hours(s.appVmCount * s.memGbPerVm),
            deployedByLz: false,
          },
          {
            catalogKey: "block_storage_gb",
            label: { th: `Boot volumes (${BOOT_GB}GB/VM)`, en: `Boot volumes (${BOOT_GB}GB/VM)` },
            category: "storage",
            quantity: s.appVmCount * BOOT_GB,
            unit: "GB",
            monthlyMetricQty: s.appVmCount * BOOT_GB,
            deployedByLz: false,
          },
          {
            catalogKey: "block_vpu",
            label: { th: "Boot volume performance (Balanced)", en: "Boot volume performance (Balanced)" },
            category: "storage",
            quantity: s.appVmCount * BOOT_GB,
            unit: "GB",
            monthlyMetricQty: s.appVmCount * BOOT_GB * 10,
            deployedByLz: false,
          },
        ];
      }
      return [
        {
          catalogKey: "oke_cluster",
          label: { th: "OKE Enhanced Cluster", en: "OKE Enhanced Cluster" },
          category: "compute",
          quantity: 1,
          unit: "cluster",
          monthlyMetricQty: hours(1),
          deployedByLz: true,
          notes: { th: "สร้างโดย LZ ผ่าน oke_simple extension", en: "Created by the LZ via the oke_simple extension" },
        },
        {
          catalogKey: "compute_e5_ocpu",
          label: { th: `OKE workers ×${s.okeWorkerCount} (E5.Flex) — OCPU`, en: `OKE workers ×${s.okeWorkerCount} (E5.Flex) — OCPU` },
          category: "compute",
          quantity: s.okeWorkerCount * s.okeWorkerOcpus,
          unit: "OCPU",
          monthlyMetricQty: hours(s.okeWorkerCount * s.okeWorkerOcpus),
          deployedByLz: true,
          notes: {
            th: "LaC สร้าง node pool เริ่มต้น 1 node (1 OCPU/8GB) — ปรับ size/shape เป็นตาม BOM หลัง deploy",
            en: "LaC ships a 1-node starter pool (1 OCPU/8GB) — scale size/shape to this BOM after deployment",
          },
        },
        {
          catalogKey: "compute_e5_mem",
          label: { th: "OKE workers — memory", en: "OKE workers — memory" },
          category: "compute",
          quantity: s.okeWorkerCount * s.okeWorkerMemGb,
          unit: "GB",
          monthlyMetricQty: hours(s.okeWorkerCount * s.okeWorkerMemGb),
          deployedByLz: true,
        },
        {
          catalogKey: "block_storage_gb",
          label: { th: `OKE worker boot volumes (${BOOT_GB}GB/node)`, en: `OKE worker boot volumes (${BOOT_GB}GB/node)` },
          category: "storage",
          quantity: s.okeWorkerCount * BOOT_GB,
          unit: "GB",
          monthlyMetricQty: s.okeWorkerCount * BOOT_GB,
          deployedByLz: true,
        },
        {
          catalogKey: "block_vpu",
          label: { th: "OKE worker boot performance (Balanced)", en: "OKE worker boot performance (Balanced)" },
          category: "storage",
          quantity: s.okeWorkerCount * BOOT_GB,
          unit: "GB",
          monthlyMetricQty: s.okeWorkerCount * BOOT_GB * 10,
          deployedByLz: true,
        },
      ];
    });
    return [...items, ...runtime];
  },
  assumptions(spec) {
    const s = sizing(spec);
    const list = lzBaselineAssumptions(spec);
    list.push({
      th: `ประมาณการ token: ${s.chatsPerMonth.toLocaleString()} บทสนทนา × ${s.avgTokensPerChat.toLocaleString()} tokens — ปรับได้ตาม log จริงของลูกค้า`,
      en: `Token estimate: ${s.chatsPerMonth.toLocaleString()} chats × ${s.avgTokensPerChat.toLocaleString()} tokens — refine with real customer logs`,
    });
    if (s.runtime === "oke")
      list.push({
        th: `OKE cluster สร้างจริงโดย LZ (oke_simple, ${OKE_K8S_VERSION}, private endpoint จำกัดที่ hub mgmt subnet) — node pool เริ่มต้น 1 node แล้วขยายเป็น ${s.okeWorkerCount} nodes ตาม BOM หลัง deploy`,
        en: `The OKE cluster is created by the LZ (oke_simple, ${OKE_K8S_VERSION}, private endpoint restricted to the hub mgmt subnet) — the node pool starts at 1 node and is scaled to the ${s.okeWorkerCount} nodes in this BOM after deployment`,
      });
    if (s.rag)
      list.push({
        th: "RAG ใช้ ADB เป็น vector store + Object Storage เก็บเอกสาร; ปริมาณ embedding เฉลี่ยจากขนาดคลังเอกสาร",
        en: "RAG uses ADB as the vector store + Object Storage for documents; embedding volume is averaged from corpus size",
      });
    return list;
  },
};
