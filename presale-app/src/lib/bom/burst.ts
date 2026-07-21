import type { BomItem, LocalizedText, SolutionSpec } from "@/lib/domain/types";

// Optional burst / autoscaling pass over a template's BOM (runs before
// finalizeBom in the generate route). Off by default — a spec without `burst`
// (or with everything disabled) returns the items untouched.
//
// - DB autoscaling: after each ADB/ADW ECPU line, add a sibling "autoscaling"
//   line for the ECPU capacity used above the baseline. Matches the AIS
//   calculator model exactly: the baseline ECPUs (ECPU Count) are billed 100%
//   of the month, plus the burst above baseline is billed as a linear ramp —
//   averaging HALF of (peak − base) over the "% of month above baseline"
//   window. peak = base × factor (OCI autoscaling ≤ 3×; "reduce peak by up to
//   67%" ⇒ baseline ≈ peak/3).
//   Verified to the satang against the AIS calculator: base 16 ECPU, peak 48
//   (3×), 25% of month, 3000 GB ATP storage → 252,691.19 THB.
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
  // Burst above baseline averages HALF of (peak − base) over the % of month
  // spent bursting (AIS linear-ramp model). Fraction of baseline ECPU-hours:
  const extraFrac = (factor - 1) * (pct / 100) / 2;

  const out: BomItem[] = [];
  for (const item of items) {
    // VM burstable — label only (AIS bills full OCPU).
    const tagged =
      b.vmBurstable && VM_OCPU_KEYS.has(item.catalogKey)
        ? { ...item, notes: appendNote(item.notes, BURSTABLE_NOTE) }
        : item;
    out.push(tagged);

    // DB autoscaling — add a line for the ECPU used above baseline.
    if (b.dbAutoscaling && ADB_ECPU_KEYS.has(item.catalogKey) && item.monthlyMetricQty > 0 && extraFrac > 0) {
      const baseEcpu = item.quantity;
      const peakEcpu = round1(baseEcpu * factor);
      out.push({
        catalogKey: item.catalogKey, // same SKU/rate as the baseline line
        label: {
          th: `${stripEnv(item.label.th)} — autoscaling (peak ${peakEcpu} ECPU)`,
          en: `${stripEnv(item.label.en)} — autoscaling (peak ${peakEcpu} ECPU)`,
        },
        category: item.category,
        env: item.env,
        quantity: round1(peakEcpu - baseEcpu), // extra ECPUs available above baseline
        unit: item.unit,
        monthlyMetricQty: item.monthlyMetricQty * extraFrac,
        deployedByLz: item.deployedByLz,
        notes: {
          th: `baseline ${baseEcpu} ECPU (100%) + burst ถึง ${peakEcpu} ECPU (${factor}×) ${pct}% ของเดือน — คิดเฉลี่ยตาม AIS`,
          en: `baseline ${baseEcpu} ECPU (100%) + burst to ${peakEcpu} ECPU (${factor}×) for ${pct}% of month — AIS-averaged`,
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
