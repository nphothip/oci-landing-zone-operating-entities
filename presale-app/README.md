# OCI Presale Studio

Web app ภายในสำหรับทีม presale — ใส่ requirement แล้วได้ครบชุดใน ~2 วินาที:

| Output | รายละเอียด |
|---|---|
| **BOM** | รายการ OCI services + SKU (part number) จัดกลุ่มตามหมวด — มีคอลัมน์ **Env** (shared = โครงสร้างกลาง, ชื่อ env = workload แยกต่อ environment) และ **Scope** (Landing Zone / หลัง LZ) กรองบนจอได้ทั้งสองคอลัมน์ · **ดาวน์โหลดเป็น Excel (.xlsx)** — ตารางแบนพร้อม **AutoFilter** (2 sheet: BOM, Summary+สมมติฐาน; money cell มี currency format) |
| **ราคาต่อเดือน (THB)** | AIS Cloud list price (Pay-As-You-Go, บาท) จาก AIS Cloud calculator API — region `ap-bangkok-1` (AIS Cloud powered by Oracle Alloy) (คิด 744 ชม./เดือน แบบ tiered ตามจริง เช่น 10TB egress แรกฟรี) |
| **Diagram 13 views** | Functional / Security / Network / Operations / Runtime / Governance (compartments) / Identity / Logging / Backup / Traffic Flow / Resilience-HA / IP Address Plan / IAM Policy Matrix — วาดจากไฟล์ LZ ที่ generate จริง (ไม่ใช่ภาพนิ่ง) ดาวน์โหลดเป็น SVG / PNG / **draw.io** (แก้ต่อได้ ไฟล์เดียว 13 หน้า) |
| **เอกสารออกแบบ (Design Doc)** | เอกสารสถาปัตยกรรม (Landing Zone + Cloud Design) ครบ 21 หัวข้อ **ฝัง diagram จริงทั้ง 13 views** + ตาราง BOM + สมมติฐาน — มีเนื้อหาบรรยายอัตโนมัติ (ใช้ได้ทันทีไม่ต้องมี key) และปุ่ม **✨ ปรับปรุงด้วย AI** (LLM เขียนเนื้อหาอ้างอิง facts จริง) · ดาวน์โหลดเป็น **HTML แบบ self-contained** (พิมพ์เป็น PDF ได้ผ่าน print) |
| **TOR / Compliance** | อัปโหลด TOR ราชการ (`.docx` แม่นยำที่สุด · รองรับ `.pdf`/`.txt`) → LLM **แยกข้อกำหนดเป็นข้อ ๆ เท่านั้น** แล้วระบบจับคู่กับ spec + BOM **แบบ deterministic** ได้ผล ผ่าน / ผ่านบางส่วน / ไม่ผ่าน / ต้องตรวจสอบ พร้อมช่อง "สิ่งที่เสนอ" ที่มาจากตัวเลขจริงและ "หลักฐานอ้างอิง" ชี้ไปยังหัวข้อเอกสาร/diagram/บรรทัด BOM · แก้ไขได้ทุกแถวก่อนส่ง · ดาวน์โหลด **Excel 3 sheet** (Matrix ไล่สีเขียว/เหลือง/แดง + Summary + Non-Infra) |
| **บริการเสริมของ AIS** | เลือกเพิ่มบริการที่ AIS ขายจริงได้ 18 รายการ (MySQL HeatWave, PostgreSQL, OpenSearch, GoldenGate, OCVS/VMware, APEX, OCI Queue, DNS/GSLB, Digital Assistant, Language, Access Governance, WAF, Email Delivery, VDI ฯลฯ) — จำนวนที่กรอกไม่ถูก scale ตาม env และคิดราคาด้วย SKU จาก price list ของ AIS โดยตรง |
| **LaC code** | แพ็กเกจ ZIP: `config.json` + `generated/*.json` + `README.md` คู่มือ deploy — ได้จากการรัน **Blueprint Factory ของ repo นี้จริง ๆ** (`gen/` config mode) พร้อมใช้กับ [OCI Landing Zones Orchestrator](https://github.com/oci-landing-zones/terraform-oci-modules-orchestrator) |

## หลักการสำคัญ

แอปนี้**ไม่ให้ AI เขียน infrastructure code เอง** — โครงสร้าง landing zone ทั้งหมดมาจาก
jsonnet generator ของ repo (`gen/generate.sh` config mode = [Blueprint Factory](../addons/oci-lz-blueprint-factory/README.md))
ตามแนวคิดของ [OCI LZ AI Agent addon](../addons/oci-lz-ai-agent/README.md):
AI (ถ้าเปิดใช้) ทำหน้าที่เดียวคือแปลง free text → config สั้น ๆ ที่ schema คุมไว้
ผลลัพธ์จึงตรงตาม best practice ของ OCI Open LZ เสมอ และ reproducible 100%

หลักเดียวกันนี้ใช้กับการวิเคราะห์ TOR: **AI อ่านและจัดโครงสร้างเอกสารของลูกค้าเท่านั้น
ห้ามแต่งข้อกำหนดขึ้นเอง และไม่ใช่ผู้ตัดสินว่าเราผ่านหรือไม่ผ่าน** — ทุกคำตอบและทุกผลตัดสิน
คำนวณจาก SolutionSpec + BOM ที่ระบบสร้าง ข้อไหนพิสูจน์ไม่ได้จะขึ้นเป็น "ต้องตรวจสอบ"
ให้คนกรอก ไม่ใช่ผ่านเงียบ ๆ

```
เลือก template / พิมพ์อธิบาย (AI)
        │
        ▼
  SolutionSpec (zod-validated)
        │
        ├──► Blueprint Factory config ──► jsonnet (gen/landing_zone_multi.jsonnet) ──► LaC package
        ├──► BOM builder ──► AIS Cloud price API (cache + snapshot สำรอง) ──► ราคา/เดือน (THB)
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

มี 5 โหมด: **เลือกจาก Template** · **พิมพ์อธิบาย (AI)** · **📄 อัปโหลด TOR** · **Advanced (Enterprise)** · **🏦 Banking (จัดเต็ม)**
รวม 15 template — 14 ตัวใน gallery + `enterprise_lz` ที่ใช้ผ่านโหมด Advanced

1. **เลือกจาก Template** (14 แบบใน gallery เรียงตามดีล SME ที่เจอบ่อย) แล้วปรับ knob — ใช้ได้โดยไม่ต้องมี API key ใด ๆ

   | Template | ใช้กับดีลแบบไหน |
   |---|---|
   | 🌐 Web Application (3-tier) | เว็บ/ระบบบริการลูกค้า: LB → App VMs → DB |
   | 🛒 E-commerce / ร้านค้าออนไลน์ | web/app + ADB + Redis cache + WAF + สื่อสินค้า + email ยืนยันออเดอร์ |
   | 🏢 ERP / Business Application | SAP B1, Dynamics, บัญชี/payroll (เลือก Windows ได้ — คิด license ต่อ OCPU) |
   | 🚚 Server Migration (Lift & Shift) | ย้าย VM จาก on-prem/VMware — คละ Windows/Linux + right-size note |
   | 🤖 Chatbot (Generative AI) | GenAI on-demand + RAG (vector ADB) รันบน VM หรือ OKE |
   | 📊 Data Warehouse & BI | ADW + Oracle Analytics Cloud รายผู้ใช้ + data lake + Data Integration |
   | 🌊 Streaming / Event Platform | OCI Streaming (Kafka) + consumer + ADW sink — IoT/clickstream/logs |
   | ⚡ Serverless API / Integration | API Gateway + Oracle Functions + ADB — จ่ายตามการใช้จริง |
   | ☸️ Container Platform (OKE) | Kubernetes ที่ **LaC deploy cluster ให้จริง** (oke_simple extension) |
   | 🗄️ File Server / จัดเก็บไฟล์องค์กร | File Storage (NFS/SMB) + Object Storage archive + gateway |
   | 🖥️ Virtual Desktops (VDI) | OCI Secure Desktops (คิดต่อ desktop) + profile บน FSS |
   | 🧪 Dev/Test Environments | non-prod บน hub ฟรี คิด compute ตามชั่วโมงเปิดเครื่อง (~ประหยัด 65%) |
   | 🛟 DR Solution | pilot light / warm standby + Full Stack DR |
   | 💾 Backup Solution | Object Storage 3 tiers + retention |

   **ตัวเลือกระดับ landing zone**: ปรับ hub model, CIS level, environments, **การตรวจของ Network Firewall** (standard / IDS-IPS / TLS inspection), **การเชื่อมต่อ** (VPN, VPN redundant, FastConnect 1/10G เดี่ยว/คู่ HA, FastConnect+VPN backup) และ **ลดสเปก non-prod อัตโนมัติ** (preprod~50% · uat~40% · dev/test~30% ของ prod)

2. **พิมพ์อธิบาย (AI)** — พิมพ์ requirement ภาษาไทย/อังกฤษ → LLM (Gemini หรือ OpenAI, เลือกผ่าน env)
   แปลงเป็นสเปก → ตรวจ/แก้ในฟอร์มเดียวกันก่อนกด generate; ถ้าข้อมูลไม่พอ AI จะถามกลับ ≤3 ข้อ

3. **📄 อัปโหลด TOR** — อัปโหลด TOR (.docx แม่นยำที่สุด, รองรับ .pdf/.txt) แล้วได้ **แบบ + BOM + ตารางเปรียบเทียบข้อกำหนด** ในขั้นตอนเดียว

   ขอบเขตงานของ AI ถูกจำกัดไว้ชัดเจน: **AI อ่านและแยกข้อกำหนดออกจากเอกสารเท่านั้น** ส่วนการตัดสินใจออกแบบและการตัดสินผ่าน/ไม่ผ่านเป็นกฎ deterministic ทั้งหมด — TOR ฉบับเดิมให้ผลลัพธ์เดิมเสมอ และทุกการตัดสินใจอ้างกลับไปยังข้อของ TOR ได้

   | ขั้นตอน | ทำอะไร | ใครตัดสิน |
   |---|---|---|
   | 1. อ่านเอกสาร | แยกเป็นข้อกำหนดย่อย พร้อมเลขข้อ/หน้า/หน่วยวัด | LLM (อ่านอย่างเดียว) |
   | 2. แปลงเป็นแบบ | เลือก template, hub, CIS level, การเชื่อมต่อ, environment, sizing, บริการเสริม | กฎ deterministic ([`derive-spec.ts`](src/lib/tor/derive-spec.ts)) |
   | 3. สร้างจริง | รัน Blueprint Factory → LaC + BOM + 13 diagram + เอกสารออกแบบ | generator จริง |
   | 4. เทียบเกณฑ์ | ผ่าน/ผ่านบางส่วน/ไม่ผ่าน/ต้องตรวจสอบ + หลักฐานอ้างอิง | กฎ deterministic ([`match.ts`](src/lib/tor/match.ts)) |

   หลัก best practice ที่ฝังไว้:
   - **TOR ดันแบบขึ้นได้อย่างเดียว** — TOR เงียบไม่เคยทำให้แบบแย่ลง เช่นไม่เสนอ Hub E (ไม่ตรวจทราฟฟิก) แม้ TOR ไม่ได้บังคับ firewall, และบังคับ HA ≥ 2 เครื่องข้าม fault domain เสมอ
   - **ตัวเลขใน TOR เป็นพื้น ไม่ใช่เพดาน** — ไม่ลด default ของ template ลงมาหาเกณฑ์
   - **แปลงหน่วยให้ถูก** — TOR ไทยเขียน vCPU แต่ OCI คิดเป็น OCPU (1 OCPU = 2 vCPU) ทั้งตอนออกแบบและตอนตัดสิน
   - **ไม่มีการเดา** — ข้อที่พิสูจน์จาก BOM/แบบไม่ได้ ขึ้นเป็น "ต้องตรวจสอบ" ให้วิศวกรตอบ ไม่ตีเป็นผ่านเอง; ข้อที่ไม่ใช่ infra (หลักประกันซอง, การอบรม) แยกไปชีต Non-Infra
   - **ข้อที่มีตัวเลขแต่แปลงเป็น sizing ไม่ได้** (response time, RTO) แสดงเป็นรายการแยกให้กรอกเอง ไม่เงียบหาย

   ผลลัพธ์: ตาราง compliance แก้ไขได้ในหน้าจอ + ดาวน์โหลด Excel 3 ชีต (Compliance Matrix สีเขียว/เหลือง/แดง · Summary · Non-Infra)

4. **Advanced (Enterprise)** — template `enterprise_lz`: กำหนด project หลายตัวต่อ environment,
   แผน sizing ราย env (VM/OKE/DB), Security Zone target ราย env — สำหรับดีลองค์กรขนาดใหญ่

5. **🏦 Banking (จัดเต็ม)** — preset showcase ของ `enterprise_lz` ที่ตั้งค่าสูงสุดเท่าที่ generator รองรับ:
   Hub A + TLS inspection, CIS Level 2, FastConnect 10G คู่ (HA), 4 environment พร้อม Security Zone ครบทุกตัว
   และ project portfolio แบบธนาคาร (corebank/payment/mobile/crm/datalake) + OKE ใน prod/preprod

## Environment variables

ดู [.env.example](.env.example) — สรุป: `LLM_PROVIDER` (`gemini`/`openai`/ว่าง=auto),
`GEMINI_API_KEY`, `OPENAI_API_KEY`, `PRICE_TTL_HOURS` และ (เฉพาะ non-Docker) `REPO_ROOT`, `JSONNET_BIN`, `PYTHON_BIN`

## ราคา

- ดึงจาก `https://calculator.g-ais.co.th/api/skus` (AIS Cloud calculator — ราคา **THB**)
- cache ในหน่วยความจำ 24 ชม. + มี [fallback snapshot](src/lib/pricing/fallback-prices.json) commit ไว้ → ใช้งาน offline ได้ (UI มี badge บอกว่า live หรือ snapshot)
- อัปเดต snapshot: `npm run prices:snapshot` แล้ว commit
- SKU ทุกตัวเลือกให้ตรงกับที่ AIS presale ใช้จริง (เทียบกับ `https://calculator.g-ais.co.th/api/configurations`) — เช่น Generative AI ใช้ **Cohere** (small `B108078` / large `B108077`) ไม่ใช่ Llama, และ Base Database คิดค่า ECPU รวม (ไม่มีรายการ compute-infra แยก)
- part number ทั้ง 61 ตัว verify ว่ามีอยู่ใน AIS Cloud API แล้ว (2026-07-24) — ดู [src/lib/pricing/catalog.ts](src/lib/pricing/catalog.ts)
- tier เรียงตาม `step_start` (ไม่ใช่ `step`) เพราะ AIS เคยส่งโควตาฟรีมาหลัง tier ที่คิดเงิน ซึ่งจะทำให้ "ราคาต่อหน่วย" ใน BOM แสดงผิด

## ทดสอบ

```bash
npm test          # unit: config builder, CIDR, tiered pricing, diagram overlap, draw.io XML, design doc
npm run smoke     # e2e: 17 เคส (14 templates × hub/connectivity variants) ยิงใส่เซิร์ฟเวอร์ที่รันอยู่
                  # ตรวจ: LaC files, ราคาครบทุกบรรทัด, diagram ครบ 13 views และทุก view มี node
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
src/lib/templates/   นิยาม 15 template (14 gallery + enterprise_lz) + banking preset: factory config + BOM formulas + assumptions
src/lib/factory/     เรียก jsonnet/python จริง (config mode), ประกอบ LaC package + README
src/lib/pricing/     SKU catalog (verified) + price client (tiered) + cache + snapshot
src/lib/llm/         Gemini/OpenAI adapters (fetch ตรง, ไม่มี SDK) + wire schema + normalizer
src/lib/diagrams/    layout 13 views จากไฟล์ generate จริง + SVG renderer + draw.io serializer
src/lib/design/      design facts + เอกสารออกแบบ 21 หัวข้อ + self-contained HTML renderer
src/lib/bom/         env scaling/override, burst, traffic + บริการเสริมของ AIS (addons.ts)
src/lib/tor/         อ่าน .docx/.pdf + แยกข้อกำหนดด้วย LLM + จับคู่ compliance แบบ deterministic
src/lib/export/      ตัวเขียน .xlsx (ไม่พึ่ง SheetJS) + workbook ของ BOM และ compliance matrix
src/app/api/         /generate /parse /prices /narrative /tor /health
```

> โฟลเดอร์นี้ self-contained — ไม่แก้ไฟล์ใด ๆ ใน `gen/`, `blueprints/`, `addons/` (อ่านอย่างเดียว)
> จึง rebase/sync กับ upstream Oracle ได้สะอาด
