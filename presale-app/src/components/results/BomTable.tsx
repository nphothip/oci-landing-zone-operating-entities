"use client";

import { useMemo, useState } from "react";
import type { BomCategory, GenerateResult, PricedBomItem } from "@/lib/domain/types";
import { L, useLang } from "@/lib/i18n";
import { buildBomWorkbook } from "@/lib/export/bom-xlsx";
import { workbookToXlsx } from "@/lib/export/xlsx";
import { downloadBlob } from "@/lib/diagrams/export";

const CATEGORY_LABEL: Record<BomCategory, { th: string; en: string }> = {
  landing_zone: L("Landing Zone", "Landing Zone"),
  compute: L("Compute", "Compute"),
  database: L("Database", "Database"),
  network: L("Network", "Network"),
  storage: L("Storage", "Storage"),
  ai: L("AI Services", "AI Services"),
  security: L("Security", "Security"),
  observability: L("Observability", "Observability"),
};

const usd = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type ScopeFilter = "all" | "lz" | "post";

export function BomTable({ result }: { result: GenerateResult }) {
  const { t } = useLang();
  const bom = result.bom;

  const envOptions = useMemo(() => [...new Set(bom.items.map((i) => i.env ?? "shared"))], [bom.items]);
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  const items = useMemo(
    () =>
      bom.items.filter((i) => {
        if (envFilter !== "all" && (i.env ?? "shared") !== envFilter) return false;
        if (scopeFilter === "lz" && !i.deployedByLz) return false;
        if (scopeFilter === "post" && i.deployedByLz) return false;
        return true;
      }),
    [bom.items, envFilter, scopeFilter],
  );
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const filteredTotal = useMemo(() => Math.round(items.reduce((a, i) => a + (i.monthlyUsd ?? 0), 0) * 100) / 100, [items]);
  const isFiltered = envFilter !== "all" || scopeFilter !== "all";

  const downloadExcel = async () => {
    const blob = await workbookToXlsx(buildBomWorkbook(result, t));
    downloadBlob(blob, `oci-${result.spec.template}-${result.spec.region.shortName}-bom.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-neutral-600">
          {t(L("ราคา OCI list price (USD) — region ap-singapore-1", "OCI list prices (USD) — region ap-singapore-1"))}{" "}
          <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${bom.priceSource === "live" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {bom.priceSource === "live"
              ? t(L("ราคา live", "live prices"))
              : t(L(`snapshot ${bom.priceFetchedAt.slice(0, 10)}`, `snapshot ${bom.priceFetchedAt.slice(0, 10)}`))}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void downloadExcel()}
            className="rounded-lg border border-green-700 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-50"
            title={t(L("ดาวน์โหลด BOM เป็นไฟล์ Excel (.xlsx) — มี AutoFilter คอลัมน์ Env/Scope", "Download the BOM as Excel (.xlsx) — AutoFilter on Env/Scope columns"))}
          >
            ⬇ Excel
          </button>
          <div className="text-lg font-bold">
            {t(L("รวมต่อเดือน:", "Monthly total:"))}{" "}
            <span className="text-[#C74634]">{usd(isFiltered ? filteredTotal : bom.totals.monthlyUsd)}</span>
          </div>
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-neutral-500">Env:</span>
          <select className="rounded-lg border border-neutral-300 px-2 py-1" value={envFilter} onChange={(e) => setEnvFilter(e.target.value)}>
            <option value="all">{t(L("ทั้งหมด", "all"))}</option>
            {envOptions.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-neutral-500">{t(L("ขอบเขต", "Scope"))}:</span>
          <select className="rounded-lg border border-neutral-300 px-2 py-1" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}>
            <option value="all">{t(L("ทั้งหมด", "all"))}</option>
            <option value="lz">Landing Zone</option>
            <option value="post">{t(L("หลัง LZ", "post-LZ"))}</option>
          </select>
        </label>
        {isFiltered ? (
          <button className="text-xs text-[#C74634] underline" onClick={() => { setEnvFilter("all"); setScopeFilter("all"); }}>
            {t(L("ล้างตัวกรอง", "clear filters"))}
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-medium">{t(L("รายการ", "Item"))}</th>
              <th className="px-3 py-2 font-medium">Env</th>
              <th className="px-3 py-2 font-medium">{t(L("ขอบเขต", "Scope"))}</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 text-right font-medium">{t(L("จำนวน", "Qty"))}</th>
              <th className="px-3 py-2 text-right font-medium">{t(L("ราคาต่อหน่วย", "Unit price"))}</th>
              <th className="px-3 py-2 text-right font-medium">{t(L("ต่อเดือน (USD)", "Monthly (USD)"))}</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-neutral-400" colSpan={7}>
                  {t(L("ไม่มีรายการตามตัวกรอง", "no items match the filter"))}
                </td>
              </tr>
            ) : (
              categories.map((cat) => <CategoryRows key={cat} cat={cat} items={items.filter((i) => i.category === cat)} />)
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-300 bg-neutral-50 font-bold">
              <td className="px-3 py-2" colSpan={6}>
                {isFiltered ? t(L("รวม (ตามตัวกรอง)", "Total (filtered)")) : t(L("รวมทั้งหมดต่อเดือน", "Total per month"))}
              </td>
              <td className="px-3 py-2 text-right text-[#C74634]">{usd(isFiltered ? filteredTotal : bom.totals.monthlyUsd)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        {t(
          L(
            "คอลัมน์ Env: “shared” = โครงสร้างกลาง (hub/tenancy), ชื่อ env = workload แยกต่อ environment · คอลัมน์ Scope: “หลัง LZ” คิดราคาไว้แต่ provision หลังวาง landing zone (ไม่อยู่ในไฟล์ LaC)",
            "Env column: “shared” = hub/tenancy infra, an env name = per-environment workload · Scope column: “post-LZ” items are priced but provisioned after the landing zone (not in the LaC files)",
          ),
        )}
      </p>
    </div>
  );
}

function CategoryRows({ cat, items }: { cat: BomCategory; items: PricedBomItem[] }) {
  const { t } = useLang();
  const subtotal = Math.round(items.reduce((acc, i) => acc + (i.monthlyUsd ?? 0), 0) * 100) / 100;
  return (
    <>
      <tr className="border-b border-neutral-100 bg-neutral-50/60">
        <td className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500" colSpan={6}>
          {t(CATEGORY_LABEL[cat])}
        </td>
        <td className="px-3 py-1.5 text-right text-xs font-semibold text-neutral-500">{usd(subtotal)}</td>
      </tr>
      {items.map((item, idx) => (
        <tr key={`${item.catalogKey}-${item.env ?? ""}-${idx}`} className="border-b border-neutral-100 last:border-0">
          <td className="px-3 py-2">
            <span>{t(item.label)}</span>
            {item.notes ? <div className="text-[11px] text-neutral-500">{t(item.notes)}</div> : null}
          </td>
          <td className="px-3 py-2">
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">{item.env ?? "shared"}</span>
          </td>
          <td className="px-3 py-2">
            {item.deployedByLz ? (
              <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] text-green-800">Landing Zone</span>
            ) : (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">{t(L("หลัง LZ", "post-LZ"))}</span>
            )}
          </td>
          <td className="px-3 py-2 font-mono text-xs text-neutral-500">{item.sku ?? "-"}</td>
          <td className="px-3 py-2 text-right tabular-nums">
            {item.quantity.toLocaleString()} <span className="text-xs text-neutral-500">{item.unit}</span>
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-600">
            {item.unitPriceUsd === null ? "—" : `$${item.unitPriceUsd}`}
            {item.metric ? <div className="text-[10px] text-neutral-400">{item.metric.toLowerCase()}</div> : null}
          </td>
          <td className="px-3 py-2 text-right font-medium tabular-nums">{usd(item.monthlyUsd)}</td>
        </tr>
      ))}
    </>
  );
}
