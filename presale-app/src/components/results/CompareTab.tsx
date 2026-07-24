"use client";

import { useMemo, useState } from "react";
import type { BomCategory, GenerateResult } from "@/lib/domain/types";
import { L, useLang } from "@/lib/i18n";
import { buildComparison, getRateCards, QUOTE_ONLY_PROVIDERS } from "@/lib/pricing/compare/compute";
import type { CompareCell, CompareProvider, CompareResult, Currency } from "@/lib/pricing/compare/types";
import { buildCompareWorkbook } from "@/lib/export/compare-xlsx";
import { workbookToXlsx } from "@/lib/export/xlsx";
import { downloadBlob } from "@/lib/diagrams/export";

// Multi-cloud price comparison tab: the generated BOM priced side-by-side on
// AIS Cloud, OCI global list, and every provider in the rate card — with
// apples-to-apples subtotals, native currencies, and every assumption visible.

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

const thb = (n: number, digits = 0) =>
  n.toLocaleString("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: digits });
const usd = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits });
const money = (n: number, c: Currency, digits = 0) => (c === "THB" ? thb(n, digits) : usd(n, digits));

const CONF_BADGE: Record<string, { label: { th: string; en: string }; cls: string }> = {
  verified: { label: L("ราคาตรวจแล้ว", "prices verified"), cls: "bg-green-100 text-green-800" },
  derived: { label: L("บางราคาคำนวณจากราคาที่ตรวจแล้ว", "some prices derived"), cls: "bg-blue-100 text-blue-800" },
  estimate: { label: L("บางราคาเป็นค่าประมาณ", "some prices estimated"), cls: "bg-amber-100 text-amber-800" },
};

export function CompareTab({ result }: { result: GenerateResult }) {
  const { t, lang } = useLang();
  const [fxText, setFxText] = useState("36.00");
  const fx = Number(fxText) > 0 ? Number(fxText) : 36;
  const cmp = useMemo(() => buildComparison(result, fx), [result, fx]);
  const cards = getRateCards();
  const providers = cmp.providers;

  const categories = useMemo(() => [...new Set(cmp.lines.map((l) => l.category))], [cmp.lines]);
  const footnotes = useMemo(() => {
    const notes = new Map<string, number>();
    for (const line of cmp.lines) {
      for (const p of providers) {
        const c = line.cells[p];
        if (!c.excluded && c.note && !notes.has(c.note)) notes.set(c.note, notes.size + 1);
      }
    }
    return notes;
  }, [cmp.lines, providers]);

  const download = async () => {
    const blob = await workbookToXlsx(buildCompareWorkbook(cmp, cards, result));
    downloadBlob(blob, `oci-${result.spec.template}-multicloud-compare.xlsx`);
  };

  const renderCell = (c: CompareCell, currency: Currency) => {
    if (c.excluded) {
      return (
        <span className="cursor-help text-[11px] text-neutral-400" title={c.reason}>
          {t(L("ไม่เทียบ", "n/a"))}*
        </span>
      );
    }
    const note = c.note ? footnotes.get(c.note) : undefined;
    return (
      <span
        className="cursor-help"
        title={`${c.service} — ${c.qty.toLocaleString()} ${c.unit} × ${money(c.unitPrice, currency, 6)}${c.note ? `\n${c.note}` : ""}`}
      >
        <span>{money(c.monthly, currency)}</span>
        {note ? <sup className="text-[9px] text-[#C74634]"> {note}</sup> : null}
        <span className="block max-w-[9rem] truncate text-[10px] text-neutral-400">{c.service}</span>
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* summary cards — apples-to-apples */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <div className="rounded-xl border-2 border-[#C74634] bg-white p-3">
          <div className="text-xs font-semibold text-[#C74634]">AIS Cloud</div>
          <div className="mt-1 text-lg font-bold">{thb(cmp.aisTotalThb)}</div>
          <div className="text-[11px] text-neutral-500">{t(L("รวมทุกรายการ · ap-bangkok-1", "all lines · ap-bangkok-1"))}</div>
          <div className="mt-1 text-[11px] text-green-700">🇹🇭 {t(L("ศูนย์ข้อมูลในไทย — ไทย→ไทย", "in-Thailand — Thai→Thai"))}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <div className="text-xs font-semibold text-neutral-700">OCI (global list)</div>
          <div className="mt-1 text-lg font-bold">{usd(cmp.ociTotalUsd)}</div>
          <div className="text-[11px] text-neutral-500">
            ≈ {thb(cmp.ociTotalUsd * cmp.fxRate)} @ {cmp.fxRate}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">{t(L("list เดียวกับ AIS", "same list as AIS"))}</div>
        </div>
        {cmp.totals.map((p) => (
          <div key={p.provider} className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="text-xs font-semibold text-neutral-700">{p.label}</div>
            <div className="mt-1 text-lg font-bold">{money(p.comparableNative, p.currency)}</div>
            {p.currency === "USD" ? (
              <div className="text-[11px] text-neutral-500">≈ {thb(p.comparableThb)}</div>
            ) : null}
            {/* The paired AIS figure is the only number this total may be read
                against; when coverage is partial it must not be a whisper. */}
            <div className={`text-[11px] ${p.mappedLines / cmp.lines.length < 0.6 ? "font-semibold text-amber-800" : "text-neutral-500"}`}>
              {t(L(`เทียบกับ AIS ชุดเดียวกัน ${thb(p.aisComparableThb)}`, `vs AIS same subset ${thb(p.aisComparableThb)}`))}
            </div>
            {p.deltaPct != null ? (
              <div className={`mt-0.5 text-xs font-semibold ${p.deltaPct > 0 ? "text-green-700" : "text-red-700"}`}>
                {p.deltaPct > 0
                  ? t(L(`แพงกว่า AIS +${p.deltaPct}%`, `+${p.deltaPct}% vs AIS`))
                  : t(L(`ถูกกว่า AIS ${p.deltaPct}%`, `${p.deltaPct}% vs AIS`))}
              </div>
            ) : null}
            <div className={`mt-1 text-[11px] ${p.inCountry ? "text-green-700" : "text-amber-700"}`}>
              {p.inCountry ? "🇹🇭 " : "🌏 "}
              {p.region}
              {!p.inCountry ? t(L(" — ข้อมูลออกนอกประเทศ", " — data leaves Thailand")) : ""}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${CONF_BADGE[p.worstConfidence].cls}`}>
                {t(CONF_BADGE[p.worstConfidence].label)}
              </span>
              {/* Below ~60% coverage the headline number covers so little of
                  the BOM that reading it against the AIS total is meaningless —
                  flag it rather than let the big figure speak for itself. */}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  p.mappedLines / cmp.lines.length < 0.6 ? "bg-amber-100 font-semibold text-amber-800" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {t(L(`เทียบได้ ${p.mappedLines}/${cmp.lines.length}`, `${p.mappedLines}/${cmp.lines.length} mapped`))}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-3">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          {t(L("อัตราแลกเปลี่ยน (THB/USD)", "FX rate (THB/USD)"))}
          <input
            type="number"
            min={20}
            max={60}
            step={0.25}
            value={fxText}
            onChange={(e) => setFxText(e.target.value)}
            className="w-24 rounded-lg border border-neutral-300 px-2 py-1 text-right"
          />
          <span className="text-[11px] text-neutral-400">
            {t(L("ใช้เฉพาะตอนเทียบส่วนต่าง — ราคาในตารางเป็นสกุลที่แต่ละค่ายประกาศ", "used only for the delta — table prices stay in each provider's own currency"))}
          </span>
        </label>
        <button onClick={download} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50">
          {t(L(`ดาวน์โหลด Excel (${providers.length + 2} ค่าย)`, `Download Excel (${providers.length + 2} providers)`))}
        </button>
      </div>

      {/* what actually drives each gap — the presale's answer to "why?" */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-700">
          {t(L("อะไรทำให้ราคาต่างกัน (เรียงตามผลกระทบ)", "What drives each gap (largest first)"))}
        </h3>
        <p className="mt-1 text-[11px] text-neutral-500">
          {t(
            L(
              "ส่วนต่างส่วนใหญ่มักมาจากไม่กี่บรรทัด — และหลายบรรทัดเป็นการเทียบข้ามชนิดบริการ อ่านหมายเหตุก่อนนำตัวเลขไปใช้",
              "Most of a gap usually comes from a handful of lines, several of which compare different classes of service — read the caveat before quoting the number.",
            ),
          )}
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {cmp.totals.map((p) => (
            <div key={p.provider} className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-2.5">
              <div className="text-xs font-semibold text-neutral-800">{p.label}</div>
              <ul className="mt-1.5 space-y-1.5">
                {p.gapDrivers.length === 0 ? <li className="text-xs text-neutral-400">—</li> : null}
                {p.gapDrivers.map((d) => (
                  <li key={d.catalogKey} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-neutral-700">{lang === "th" ? d.label.th : d.label.en}</span>
                      <span className={`shrink-0 font-semibold ${d.deltaThb > 0 ? "text-red-700" : "text-green-700"}`}>
                        {d.deltaThb > 0 ? "+" : "−"}
                        {thb(Math.abs(d.deltaThb))}
                      </span>
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      AIS {thb(d.aisThb)} → {thb(d.providerThb)} · {t(L(`คิดเป็น ${d.sharePct}% ของส่วนต่าง`, `${d.sharePct}% of the gap`))}
                    </div>
                    {d.note && d.note.includes("⚠") ? (
                      <div className="mt-0.5 rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800">{d.note}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* line-by-line table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm" style={{ minWidth: `${640 + providers.length * 130}px` }}>
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-3 py-2">{t(L("รายการ", "Item"))}</th>
              <th className="px-3 py-2 text-right">{t(L("จำนวน", "Qty"))}</th>
              <th className="px-3 py-2 text-right text-[#C74634]">AIS (THB)</th>
              <th className="px-3 py-2 text-right">OCI (USD)</th>
              {cmp.totals.map((p) => (
                <th key={p.provider} className="px-3 py-2 text-right">
                  {p.label}
                  <span className="block text-[9px] font-normal normal-case text-neutral-400">{p.currency}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {categories.map((cat) => (
              <CategoryRows key={cat} cat={cat} cmp={cmp} renderCell={renderCell} lang={lang} t={t} />
            ))}
          </tbody>
          <tfoot className="border-t-2 border-neutral-300 bg-neutral-50 text-sm font-bold">
            <tr>
              <td className="px-3 py-2">{t(L("รวมที่เทียบได้", "Comparable total"))}</td>
              <td />
              <td className="px-3 py-2 text-right text-[#C74634]">{thb(cmp.aisTotalThb)}</td>
              <td className="px-3 py-2 text-right">{usd(cmp.ociTotalUsd)}</td>
              {cmp.totals.map((p) => (
                <td key={p.provider} className="px-3 py-2 text-right">
                  {money(p.comparableNative, p.currency)}
                  <span className="block text-[10px] font-normal text-neutral-500">
                    {t(L(`เทียบ AIS ${thb(p.aisComparableThb)}`, `vs AIS ${thb(p.aisComparableThb)}`))}
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* excluded lines per provider */}
      <details className="rounded-xl border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-700">
          {t(L("รายการที่เทียบไม่ได้ (แยกออกจากผลรวมทั้งสองฝั่ง)", "Non-comparable lines (excluded from both sides of subtotals)"))}
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {cmp.totals.map((p) => (
            <div key={p.provider}>
              <div className="text-xs font-semibold text-neutral-600">
                {p.label} <span className="font-normal text-neutral-400">({p.excludedLines.length})</span>
              </div>
              <ul className="mt-1 space-y-1 text-xs text-neutral-600">
                {p.excludedLines.length === 0 ? <li className="text-neutral-400">—</li> : null}
                {p.excludedLines.map((x, i) => (
                  <li key={i}>
                    <span className="font-medium">{lang === "th" ? x.label.th : x.label.en}</span>
                    {x.aisThb != null ? <span className="text-neutral-400"> ({thb(x.aisThb)})</span> : null} — {x.reason}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

      {/* rate-card provenance */}
      <details className="rounded-xl border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-700">
          {t(L("ที่มาของราคาแต่ละค่าย", "Where each provider's prices come from"))}
        </summary>
        <div className="mt-2 space-y-2 text-xs text-neutral-600">
          {providers.map((p) => (
            <div key={p}>
              <span className="font-semibold text-neutral-800">{cards[p].label}</span>{" "}
              <span className="text-neutral-400">
                · {cards[p].region} · {cards[p].currency} · {t(L("ข้อมูล ณ", "as of"))} {cards[p].asOf} ·{" "}
                {Object.keys(cards[p].rates).length} {t(L("อัตรา", "rates"))}
              </span>
              {cards[p].summary ? <p className="mt-0.5">{cards[p].summary}</p> : null}
            </div>
          ))}
          <div className="border-t border-neutral-100 pt-2">
            <div className="font-semibold text-neutral-800">{t(L("ค่ายที่ตรวจแล้วแต่ไม่ประกาศราคาสาธารณะ", "Checked, but publish no public prices"))}</div>
            {QUOTE_ONLY_PROVIDERS.map((q) => (
              <p key={q.label} className="mt-0.5">
                <span className="font-medium">{q.label}</span> — {t(q.note)}
              </p>
            ))}
          </div>
        </div>
      </details>

      {/* footnotes: mapping assumptions */}
      {footnotes.size > 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-neutral-700">
            {t(L("สมมติฐานการเทียบ (ตามหมายเลขในตาราง)", "Mapping assumptions (numbered in the table)"))}
          </h3>
          <ol className="mt-2 space-y-1 text-xs text-neutral-600">
            {[...footnotes.entries()].map(([note, n]) => (
              <li key={n}>
                <span className="font-semibold text-[#C74634]">{n}.</span> {note}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* disclaimers */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
        <ul className="list-disc space-y-1 pl-4">
          {cmp.disclaimers.map((d, i) => (
            <li key={i}>{t(d)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CategoryRows({
  cat,
  cmp,
  renderCell,
  lang,
  t,
}: {
  cat: BomCategory;
  cmp: CompareResult;
  renderCell: (c: CompareCell, currency: Currency) => React.ReactNode;
  lang: string;
  t: (x: { th: string; en: string }) => string;
}) {
  const lines = cmp.lines.filter((l) => l.category === cat);
  if (lines.length === 0) return null;
  return (
    <>
      <tr className="bg-neutral-50/60">
        <td colSpan={4 + cmp.totals.length} className="px-3 py-1.5 text-xs font-semibold text-neutral-500">
          {t(CATEGORY_LABEL[cat])}
        </td>
      </tr>
      {lines.map((l, i) => (
        <tr key={`${l.catalogKey}-${l.env}-${i}`}>
          <td className="max-w-[18rem] px-3 py-1.5">
            <span className="block truncate text-neutral-800">{lang === "th" ? l.label.th : l.label.en}</span>
            <span className="text-[10px] text-neutral-400">{l.env}</span>
          </td>
          <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs text-neutral-500">
            {l.aisQty.toLocaleString()} {l.aisUnit}
          </td>
          <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-[#C74634]">
            {l.aisThb == null ? "—" : thb(l.aisThb)}
          </td>
          <td className="whitespace-nowrap px-3 py-1.5 text-right text-neutral-600">{l.ociUsd == null ? "—" : usd(l.ociUsd)}</td>
          {cmp.totals.map((p) => (
            <td key={p.provider} className="whitespace-nowrap px-3 py-1.5 text-right">
              {renderCell(l.cells[p.provider], p.currency)}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
