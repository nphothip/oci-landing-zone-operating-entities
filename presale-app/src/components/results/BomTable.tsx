"use client";

import type { BomCategory, BomResult } from "@/lib/domain/types";
import { L, useLang } from "@/lib/i18n";

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

export function BomTable({ bom }: { bom: BomResult }) {
  const { t } = useLang();
  const categories = [...new Set(bom.items.map((i) => i.category))];

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
        <div className="text-lg font-bold">
          {t(L("รวมต่อเดือน:", "Monthly total:"))} <span className="text-[#C74634]">{usd(bom.totals.monthlyUsd)}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-medium">{t(L("รายการ", "Item"))}</th>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 text-right font-medium">{t(L("จำนวน", "Qty"))}</th>
              <th className="px-3 py-2 text-right font-medium">{t(L("ราคาต่อหน่วย", "Unit price"))}</th>
              <th className="px-3 py-2 text-right font-medium">{t(L("ต่อเดือน (USD)", "Monthly (USD)"))}</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <CategoryRows key={cat} cat={cat} bom={bom} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-300 bg-neutral-50 font-bold">
              <td className="px-3 py-2" colSpan={4}>
                {t(L("รวมทั้งหมดต่อเดือน", "Total per month"))}
              </td>
              <td className="px-3 py-2 text-right text-[#C74634]">{usd(bom.totals.monthlyUsd)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        {t(
          L(
            "รายการที่ติดป้าย “หลัง LZ” คิดราคาไว้ในใบเสนอแต่จะ provision หลังจากวาง landing zone (ไม่อยู่ในไฟล์ LaC)",
            "Items tagged “post-LZ” are priced here but provisioned after the landing zone (not part of the LaC files)",
          ),
        )}
      </p>
    </div>
  );
}

function CategoryRows({ cat, bom }: { cat: BomCategory; bom: BomResult }) {
  const { t } = useLang();
  const items = bom.items.filter((i) => i.category === cat);
  const subtotal = items.reduce((acc, i) => acc + (i.monthlyUsd ?? 0), 0);
  return (
    <>
      <tr className="border-b border-neutral-100 bg-neutral-50/60">
        <td className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500" colSpan={4}>
          {t(CATEGORY_LABEL[cat])}
        </td>
        <td className="px-3 py-1.5 text-right text-xs font-semibold text-neutral-500">{usd(Math.round(subtotal * 100) / 100)}</td>
      </tr>
      {items.map((item, idx) => (
        <tr key={`${item.catalogKey}-${idx}`} className="border-b border-neutral-100 last:border-0">
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span>{t(item.label)}</span>
              {!item.deployedByLz ? (
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{t(L("หลัง LZ", "post-LZ"))}</span>
              ) : null}
            </div>
            {item.notes ? <div className="text-[11px] text-neutral-500">{t(item.notes)}</div> : null}
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
