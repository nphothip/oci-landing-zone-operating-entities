# OCI Presale Studio

Web app ภายในสำหรับทีม presale — ใส่ requirement แล้วได้ครบชุดใน ~2 วินาที:

| Output | รายละเอียด |
|---|---|
| **BOM** | รายการ OCI services + SKU (part number) จัดกลุ่มตามหมวด — มีคอลัมน์ **Env** (shared = โครงสร้างกลาง, ชื่อ env = workload แยกต่อ environment) และ **Scope** (Landing Zone / หลัง LZ) กรองบนจอได้ทั้งสองคอลัมน์ · **ดาวน์โหลดเป็น Excel (.xlsx)** — ตารางแบนพร้อม **AutoFilter** (2 sheet: BOM, Summary+สมมติฐาน; money cell มี currency format) |
| **ราคาต่อเดือน (USD)** | OCI list price (Pay-As-You-Go) จาก OCI Price List API สาธารณะ — ราคา USD เท่ากันทั่วโลก ใช้กับ `ap-singapore-1` ได้ตรง ๆ (คิด 744 ชม./เดือน แบบ tiered ตามจริง เช่น 10TB egress แรกฟรี) |
| **Diagram 5 views** | Functional / Security / Network / Operations / Runtime — วาดจากไฟล์ LZ ที่ generate จริง (ไม่ใช่ภาพนิ่ง) ดาวน์โหลดเป็น SVG / PNG / **draw.io** (แก้ต่อได้ ไฟล์เดียว 5 หน้า) |
| **เอกสารออกแบบ (Design Doc)** | เอกสารสถาปัตยกรรม (Landing Zone + Cloud Design) ครบ 10 หัวข้อ **ฝัง diagram จริงทั้ง 5 views** + ตาราง BOM + สมมติฐาน — มีเนื้อหาบรรยายอัตโนมัติ (ใช้ได้ทันทีไม่ต้องมี key) และปุ่ม **✨ ปรับปรุงด้วย AI** (LLM เขียนเนื้อหาอ้างอิง facts จริง) · ดาวน์โหลดเป็น **HTML แบบ self-contained** (พิมพ์เป็น PDF ได้ผ่าน print) |
| **LaC code** | แพ็กเกจ ZIP: `config.json` + `generated/*.json` + `README.md` คู่มือ deploy — ได้จากการรัน **Blueprint Factory ของ repo นี้จริง ๆ** (`gen/` config mode) พร้อมใช้กับ [OCI Landing Zones Orchestrator](https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator) |

## หลักการสำคัญ

แอปนี้**ไม่ให้ AI เขียน infrastructure code เอง** — โครงสร้าง landing zone ทั้งหมดมาจาก
jsonnet generator ของ repo (`gen/generate.sh` config mode = [Blueprint Factory](../addons/oci-lz-blueprint-factory/README.md))
ตามแนวคิดของ [OCI LZ AI Agent addon](../addons/oci-lz-ai-agent/README.md):
AI (ถ้าเปิดใช้) ทำหน้าที่เดียวคือแปลง free text → config สั้น ๆ ที่ schema คุมไว้
ผลลัพธ์จึงตรงตาม best practice ของ OCI Open LZ เสมอ และ reproducible 100%

```
เลือก template / พิมพ์อธิบาย (AI)
        │
        ▼
  SolutionSpec (zod-validated)
        │
        ├──► Blueprint Factory config ──► jsonnet (gen/landing_zone_multi.jsonnet) ──► LaC package
        ├──► BOM builder ──► OCI Price List API (cache + snapshot สำรอง) ──► ราคา/เดือน
        └──► Diagram layouts (อ่านจาก iam.json / network.json จริง) ──► SVG + draw.io + PNG
```

## เริ่มใช้งาน

### แบบ Docker (แนะนำสำหรับทีม)

```bash
# จากโฟลเดอร์ presale-app/
cp .env.example .env        # ใส่ GEMINI_API_KEY หรือ OPENAI_API_KEY ถ้าจะใช้โหมด AI (ไม่ใส่ก็ใช้โหมด template ได้)
docker compose up --build
# เปิด http://localhost:3000
```

Image รวมทุกอย่างแล้ว: Node + go-jsonnet v0.21.0 + python3 + `gen/` ของ repo

### แบบ dev บน Windows (ไม่ต้องมี Docker)

ต้องมี: Node 20+, Python 3, Go (สำหรับติดตั้ง jsonnet ครั้งเดียว)

```powershell
go install github.com/google/go-jsonnet/cmd/jsonnet@v0.21.0   # ครั้งเดียว (แอปหา ~/go/bin ให้เอง)
cd presale-app
npm install
npm run dev        # http://localhost:3000
```

หมายเหตุ: แอปเรียก `jsonnet` + `python` ตรง ๆ (ตาม logic ใน `gen/generate.sh` บรรทัด 101–107)
จึงรันบน Windows ได้โดยไม่ต้องใช้ bash/WSL

## โหมดการใช้งาน

1. **เลือกจาก Template** (9 แบบ เรียงตามดีล SME ที่เจอบ่อย) แล้วปรับ knob — ใช้ได้โดยไม่ต้องมี API key ใด ๆ

   | Template | ใช้กับดีลแบบไหน |
   |---|---|
   | 🌐 Web Application (3-tier) | เว็บ/ระบบบริการลูกค้า: LB → App VMs → DB |
   | 🏢 ERP / Business Application | SAP B1, Dynamics, บัญชี/payroll, ERP custom (เลือก Windows ได้ — คิด license ต่อ OCPU) |
   | 🚚 Server Migration (Lift & Shift) | ย้าย VM จาก on-prem/VMware — คละ Windows/Linux + right-size note |
   | 🤖 Chatbot (Generative AI) | GenAI on-demand + RAG (vector ADB) รันบน VM หรือ OKE |
   | 📊 Data Warehouse & BI | ADW + Oracle Analytics Cloud รายผู้ใช้ + data lake + Data Integration |
   | ☸️ Container Platform (OKE) | Kubernetes ที่ **LaC deploy cluster ให้จริง** (oke_simple extension) |
   | 🧪 Dev/Test Environments | non-prod บน hub ฟรี คิด compute ตามชั่วโมงเปิดเครื่อง (~ประหยัด 65%) |
   | 🛟 DR Solution | pilot light / warm standby + Full Stack DR |
   | 💾 Backup Solution | Object Storage 3 tiers + retention |

2. **พิมพ์อธิบาย (AI)** — พิมพ์ requirement ภาษาไทย/อังกฤษ → LLM (Gemini หรือ OpenAI, เลือกผ่าน env)
   แปลงเป็นสเปก → ตรวจ/แก้ในฟอร์มเดียวกันก่อนกด generate; ถ้าข้อมูลไม่พอ AI จะถามกลับ ≤3 ข้อ

## Environment variables

ดู [.env.example](.env.example) — สรุป: `LLM_PROVIDER` (`gemini`/`openai`/ว่าง=auto),
`GEMINI_API_KEY`, `OPENAI_API_KEY`, `PRICE_TTL_HOURS` และ (เฉพาะ non-Docker) `REPO_ROOT`, `JSONNET_BIN`, `PYTHON_BIN`

## ราคา

- ดึงจาก `https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/` (backend เดียวกับ OCI cost estimator)
- cache ในหน่วยความจำ 24 ชม. + มี [fallback snapshot](src/lib/pricing/fallback-prices.json) commit ไว้ → ใช้งาน offline ได้ (UI มี badge บอกว่า live หรือ snapshot)
- อัปเดต snapshot: `npm run prices:snapshot` แล้ว commit
- part number ทั้งหมด verify กับ API จริงแล้ว (2026-07-20) — ดู [src/lib/pricing/catalog.ts](src/lib/pricing/catalog.ts)

## ทดสอบ

```bash
npm test          # unit: config builder, CIDR, tiered pricing, diagram overlap, draw.io XML
npm run smoke     # e2e: 7 เคส (4 templates × hub variants) ยิงใส่เซิร์ฟเวอร์ที่รันอยู่
```

## ขอบเขตที่ต้องสื่อกับลูกค้า (กัน oversell)

- ไฟล์ LaC deploy ได้จริง: **network / IAM / governance / security / observability**
  (+ OKE cluster & workers เมื่อเลือก runtime OKE)
- ทรัพยากร workload (App VMs, Database, GenAI, Object Storage ฯลฯ) **คิดราคาใน BOM
  แต่ provision หลังวาง LZ** ใน project compartment ที่ LZ สร้างให้ — มีป้าย "หลัง LZ" กำกับใน BOM ทุกรายการ
- ตัวเลขเป็น list price ไม่รวมส่วนลดสัญญา — ไม่ใช่ใบเสนอราคาอย่างเป็นทางการ

## โครงสร้างโค้ด

```
src/lib/domain/      SolutionSpec + zod schema + CIDR allocator (lane ตาม gen/defaults.libsonnet)
src/lib/templates/   นิยาม 4 template: factory config + BOM formulas + assumptions
src/lib/factory/     เรียก jsonnet/python จริง (config mode), ประกอบ LaC package + README
src/lib/pricing/     SKU catalog (verified) + price client (tiered) + cache + snapshot
src/lib/llm/         Gemini/OpenAI adapters (fetch ตรง, ไม่มี SDK) + wire schema + normalizer
src/lib/diagrams/    layout 5 views จากไฟล์ generate จริง + SVG renderer + draw.io serializer
src/app/api/         /generate /parse /prices /health
```

> โฟลเดอร์นี้ self-contained — ไม่แก้ไฟล์ใด ๆ ใน `gen/`, `blueprints/`, `addons/` (อ่านอย่างเดียว)
> จึง rebase/sync กับ upstream Oracle ได้สะอาด
