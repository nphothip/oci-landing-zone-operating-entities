import type { BomItem, LocalizedText, SolutionSpec } from "@/lib/domain/types";

// Optional burst / autoscaling pass over a template's BOM (runs before
// finalizeBom in the generate route). Off by default — a spec without `burst`
// (or with everything disabled) returns the items untouched.
//
// - DB autoscaling: after each ADB/ADW ECPU line, add a sibling "autoscaling
//   burst" line for the ECPU capacity used above the baseline. Matches the AIS
//   calculator model: base ECPUs billed always, plus (peak − base) ECPUs billed
//   for the fraction of the month spent above baseline. peak = base × factor
//   (OCI autoscaling allows up to 3×).
// - VM burstable: matches AIS presale — selectable but billed at the full OCPU
//   rate (no baseline discount). We only tag the compute line with a note.

const ADB_ECPU_KEYS = new Set(["adb_ecpu", "adw_ecpu"]);
const VM_OCPU_KEYS = new Set(["compute_e5_ocpu"]);

const DEFAULT_PEAK_FACTOR = 3;
const DEFAULT_PCT_MONTH = 5;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const stripEnv = (s: string) => s.replace(/\s*\[[a-z]+\]\s*$/, "");

const BURSTABLE_NOTE: LocalizedText = {
  th: "burstable (คิดเต็ม OCPU ตาม AIS — burst ชั่วคราวไม่คิดเพิ่ม)",
  en: "burstable (billed at full OCPU per AIS — short bursts are free)",
};

function appendNote(existing: LocalizedText | undefined, add: LocalizedText): LocalizedText {
  if (!existing) return add;
  return { th: `${existing.th} · ${add.th}`, en: `${existing.en} · ${add.en}` };
}

export function applyBurst(spec: SolutionSpec, items: BomItem[]): BomItem[] {
  const b = spec.burst;
  if (!b || (!b.dbAutoscaling && !b.vmBurstable)) return items;

  const factor = clamp(b.dbPeakFactor ?? DEFAULT_PEAK_FACTOR, 1, 3);
  const pct = clamp(b.dbPctMonthAbove ?? DEFAULT_PCT_MONTH, 0, 100);
  const extraFrac = (factor - 1) * (pct / 100); // fraction of baseline ECPU-hours added

  const out: BomItem[] = [];
  for (const item of items) {
    // VM burstable — label only (AIS bills full OCPU).
    const tagged =
      b.vmBurstable && VM_OCPU_KEYS.has(item.catalogKey)
        ? { ...item, notes: appendNote(item.notes, BURSTABLE_NOTE) }
        : item;
    out.push(tagged);

    // DB autoscaling — add a burst line for capacity above baseline.
    if (b.dbAutoscaling && ADB_ECPU_KEYS.has(item.catalogKey) && item.monthlyMetricQty > 0 && extraFrac > 0) {
      out.push({
        catalogKey: item.catalogKey, // same SKU/rate as the baseline line
        label: {
          th: `${stripEnv(item.label.th)} — autoscaling burst`,
          en: `${stripEnv(item.label.en)} — autoscaling burst`,
        },
        category: item.category,
        env: item.env,
        quantity: round1(item.quantity * (factor - 1)), // extra ECPUs available on burst
        unit: item.unit,
        monthlyMetricQty: item.monthlyMetricQty * extraFrac,
        deployedByLz: item.deployedByLz,
        notes: {
          th: `autoscale สูงสุด ${factor}× ของ baseline, คิด ${pct}% ของเดือน (ADB คิดตามใช้จริง)`,
          en: `autoscale up to ${factor}× baseline, billed ${pct}% of the month (ADB pay-per-use)`,
        },
      });
    }
  }
  return out;
}

/** Human-facing assumption notes describing the burst settings in effect. */
export function burstAssumptions(spec: SolutionSpec): LocalizedText[] {
  const b = spec.burst;
  if (!b) return [];
  const notes: LocalizedText[] = [];
  if (b.vmBurstable) {
    notes.push({
      th: "VM ตั้งเป็น burstable — คิดราคาเต็ม OCPU ตาม AIS (ไม่ลดตาม baseline)",
      en: "VMs set to burstable — billed at full OCPU per AIS (no baseline discount)",
    });
  }
  if (b.dbAutoscaling) {
    const factor = clamp(b.dbPeakFactor ?? DEFAULT_PEAK_FACTOR, 1, 3);
    const pct = clamp(b.dbPctMonthAbove ?? DEFAULT_PCT_MONTH, 0, 100);
    notes.push({
      th: `Autonomous DB เปิด autoscaling — baseline ECPU + burst สูงสุด ${factor}× ที่ ${pct}% ของเดือน`,
      en: `Autonomous DB autoscaling enabled — baseline ECPUs + burst up to ${factor}× for ${pct}% of the month`,
    });
  }
  return notes;
}
