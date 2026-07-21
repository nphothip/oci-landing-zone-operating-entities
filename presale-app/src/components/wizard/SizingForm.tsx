"use client";

import { useMemo, type ChangeEvent } from "react";
import type { EnvName, HubKind, LocalizedText, SolutionSpec } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { getPath, setPath } from "@/lib/domain/path";
import { envScale } from "@/lib/bom/env";
import { orderEnvs } from "@/lib/domain/cidr";
import { L, useLang } from "@/lib/i18n";

const PEAK_FACTORS = [1.5, 2, 3];

const HUBS: { value: HubKind; label: { th: string; en: string }; cost: { th: string; en: string } }[] = [
  { value: "hub_a", label: L("Hub A — NFW คู่ (HA)", "Hub A — dual NFW (HA)"), cost: L("~฿229,200/เดือน (FW)", "~฿229,200/mo (FW)") },
  { value: "hub_b", label: L("Hub B — NFW เดี่ยว", "Hub B — single NFW"), cost: L("~฿114,600/เดือน (FW)", "~฿114,600/mo (FW)") },
  { value: "hub_c", label: L("Hub C — NLB สำหรับ FW 3rd-party", "Hub C — NLB for 3rd-party FW"), cost: L("NLB ฟรี + ค่า FW เอง", "free NLB + own FW cost") },
  { value: "hub_e", label: L("Hub E — ไม่มี firewall", "Hub E — no firewall"), cost: L("ฟรี (เหมาะ PoC)", "free (PoC-friendly)") },
];

const ENVS: EnvName[] = ["prod", "preprod", "uat", "dev"];

export function SizingForm({ spec, onChange }: { spec: SolutionSpec; onChange: (s: SolutionSpec) => void }) {
  const { t } = useLang();
  const template = TEMPLATES[spec.template];

  // Which burst / traffic options apply to this workload (from its own BOM),
  // plus each traffic line's current default so the fields show real values.
  const caps = useMemo(() => {
    const items = template.buildBom(spec);
    const q = (key: string) => items.find((i) => i.catalogKey === key)?.quantity;
    // Per-env workload lines (env-tagged, unique catalog key) for direct editing.
    const byEnv = new Map<string, { catalogKey: string; label: LocalizedText; unit: string; quantity: number }[]>();
    for (const i of items) {
      if (!i.env) continue; // shared/hub lines are not per-env
      const arr = byEnv.get(i.env) ?? [];
      if (!arr.some((x) => x.catalogKey === i.catalogKey)) {
        arr.push({ catalogKey: i.catalogKey, label: i.label, unit: i.unit, quantity: i.quantity });
      }
      byEnv.set(i.env, arr);
    }
    return {
      envWorkload: [...byEnv.entries()].map(([env, lines]) => ({ env, lines })),
      hasVm: items.some((i) => i.catalogKey === "compute_e5_ocpu"),
      hasDb: items.some((i) => i.catalogKey === "adb_ecpu" || i.catalogKey === "adw_ecpu"),
      hasLb: items.some((i) => i.catalogKey === "lb_base" || i.catalogKey === "lb_bandwidth"),
      hasNfw: items.some((i) => i.catalogKey === "nfw_data_gb"),
      hasWaf: items.some((i) => i.catalogKey === "waf_requests_m"),
      hasObjectStorage: items.some((i) => ["os_standard_gb", "os_ia_gb", "os_archive_gb"].includes(i.catalogKey)),
      hasStreaming: items.some((i) => i.catalogKey === "streaming_gb"),
      lbMbps: q("lb_bandwidth") ?? 100,
      nfwGb: q("nfw_data_gb") ?? 2048,
      wafM: q("waf_requests_m") ?? 30,
      egressGb: q("egress_apac_gb") ?? 0,
      objReqM: q("os_requests_10k") ?? 0,
      streamGb: q("streaming_gb") ?? 5000,
    };
  }, [template, spec]);
  const burst = spec.burst ?? {};
  const traffic = spec.traffic ?? {};
  const numTraffic = (path: string, e: ChangeEvent<HTMLInputElement>) =>
    onChange(setPath(spec, path, Math.max(0, Math.round(Number(e.target.value) || 0))));
  const setEnvOverride = (env: string, key: string, val: number) =>
    onChange(setPath(spec, `envOverride.${env}.${key}`, Math.max(0, Math.round(val || 0))));
  const stripEnv = (s: string) => s.replace(/\s*\[[a-z]+\]\s*$/, "");

  const toggleEnv = (env: EnvName) => {
    const has = spec.environments.includes(env);
    let envs = has ? spec.environments.filter((e) => e !== env) : [...spec.environments, env];
    if (envs.length === 0) envs = ["prod"];
    onChange({ ...spec, environments: envs });
  };

  return (
    <div className="space-y-6">
      {/* landing zone options */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">
          {t(L("ตัวเลือก Landing Zone (ตาม OCI Open LZ)", "Landing zone options (OCI Open LZ)"))}
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("Hub model (DMZ)", "Hub model (DMZ)"))}</label>
            <div className="space-y-1.5">
              {HUBS.map((h) => (
                <label key={h.value} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-1.5 text-sm ${spec.hub.kind === h.value ? "border-[#C74634] bg-red-50" : "border-neutral-200"}`}>
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="hub"
                      checked={spec.hub.kind === h.value}
                      onChange={() => onChange({ ...spec, hub: { ...spec.hub, kind: h.value } })}
                    />
                    {t(h.label)}
                  </span>
                  <span className="text-xs text-neutral-500">{t(h.cost)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("Environments", "Environments"))}</label>
              <div className="flex flex-wrap gap-2">
                {ENVS.map((env) => (
                  <button
                    key={env}
                    onClick={() => toggleEnv(env)}
                    className={`rounded-full border px-3 py-1 text-sm ${spec.environments.includes(env) ? "border-[#C74634] bg-red-50 font-medium" : "border-neutral-300 text-neutral-600"}`}
                  >
                    {env}
                  </button>
                ))}
              </div>
            </div>
            {spec.hub.kind === "hub_a" || spec.hub.kind === "hub_b" ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("การตรวจของ Network Firewall", "Network Firewall inspection"))}</label>
                <select
                  className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                  value={spec.hub.inspection ?? "standard"}
                  onChange={(e) => onChange({ ...spec, hub: { ...spec.hub, inspection: e.target.value as NonNullable<SolutionSpec["hub"]["inspection"]> } })}
                >
                  <option value="standard">{t(L("มาตรฐาน (L3/L4 + URL/app-id)", "Standard (L3/L4 + URL/app-id)"))}</option>
                  <option value="ids_ips">{t(L("IDS/IPS (ตรวจจับ/ป้องกันภัยคุกคาม)", "IDS/IPS (threat detection/prevention)"))}</option>
                  <option value="tls">{t(L("TLS inspection (ถอดรหัสตรวจ)", "TLS inspection (decrypt & inspect)"))}</option>
                </select>
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("CIS profile", "CIS profile"))}</label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                value={spec.cisLevel}
                onChange={(e) => onChange({ ...spec, cisLevel: Number(e.target.value) === 2 ? 2 : 1 })}
              >
                <option value={1}>{t(L("CIS Level 1 (มาตรฐาน)", "CIS Level 1 (standard)"))}</option>
                <option value={2}>{t(L("CIS Level 2 (+Vault, เข้มขึ้น)", "CIS Level 2 (+Vault, stricter)"))}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("เชื่อมต่อ on-premises", "On-premises connectivity"))}</label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                value={spec.hub.connectivity}
                onChange={(e) => onChange({ ...spec, hub: { ...spec.hub, connectivity: e.target.value as SolutionSpec["hub"]["connectivity"] } })}
              >
                <option value="none">{t(L("ไม่ต้องเชื่อม", "None"))}</option>
                <option value="vpn">{t(L("Site-to-Site VPN (ฟรี)", "Site-to-Site VPN (free)"))}</option>
                <option value="vpn_ha">{t(L("Site-to-Site VPN — redundant (2 CPE, ฟรี)", "Site-to-Site VPN — redundant (2 CPE, free)"))}</option>
                <option value="fastconnect_1g">FastConnect 1 Gbps</option>
                <option value="fastconnect_1g_ha">{t(L("FastConnect 1 Gbps — dual (HA)", "FastConnect 1 Gbps — dual (HA)"))}</option>
                <option value="fastconnect_10g">FastConnect 10 Gbps</option>
                <option value="fastconnect_10g_ha">{t(L("FastConnect 10 Gbps — dual (HA)", "FastConnect 10 Gbps — dual (HA)"))}</option>
                <option value="fastconnect_vpn_backup">{t(L("FastConnect 1G + VPN สำรอง", "FastConnect 1G + VPN backup"))}</option>
              </select>
            </div>
            {spec.environments.length > 1 ? (
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-xs text-neutral-600">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={spec.rightsizeNonProd !== false}
                    onChange={(e) => onChange({ ...spec, rightsizeNonProd: e.target.checked })}
                  />
                  {t(L("ลดสเปก non-prod อัตโนมัติ (แนะนำ: preprod 50% · uat 40% · dev/test 30%)", "Auto right-size non-prod (preprod 50% · uat 40% · dev/test 30%)"))}
                </label>
                <div>
                  <div className="mb-1 text-xs font-medium text-neutral-600">{t(L("ปรับ scale ต่อ environment (% ของ prod)", "Custom scale per environment (% of prod)"))}</div>
                  <div className="flex flex-wrap gap-2">
                    {orderEnvs(spec.environments).map((env) => {
                      const isProd = env === "prod";
                      const pct = Math.round(envScale(spec, env) * 100);
                      return (
                        <label key={env} className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs">
                          <span className="text-neutral-500">{env}</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            disabled={isProd}
                            className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-right disabled:bg-neutral-100 disabled:text-neutral-400"
                            value={isProd ? 100 : pct}
                            onChange={(e) =>
                              onChange({
                                ...spec,
                                envScalePct: { ...spec.envScalePct, [env]: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 0))) },
                              })
                            }
                          />
                          <span className="text-neutral-400">%</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* template knobs */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">
          {t(L("ขนาดของ workload", "Workload sizing"))} — {t(template.name)}
        </h3>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {template.knobs
            .filter((k) => !k.visibleIf || k.visibleIf(spec))
            .map((knob) => {
              const value = getPath(spec, knob.path);
              return (
                <div key={knob.path}>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">{t(knob.label)}</label>
                  {knob.input.type === "number" ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                        min={knob.input.min}
                        max={knob.input.max}
                        step={knob.input.step ?? 1}
                        value={Number(value ?? 0)}
                        onChange={(e) => onChange(setPath(spec, knob.path, Math.round(Number(e.target.value) || 0)))}
                      />
                      {knob.input.unit ? <span className="whitespace-nowrap text-xs text-neutral-500">{knob.input.unit}</span> : null}
                    </div>
                  ) : knob.input.type === "select" ? (
                    <select
                      className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                      value={String(value ?? "")}
                      onChange={(e) => onChange(setPath(spec, knob.path, e.target.value))}
                    >
                      {knob.input.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {t(o.label)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <label className="flex items-center gap-2 py-1.5 text-sm">
                      <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(setPath(spec, knob.path, e.target.checked))} />
                      {t(L("เปิดใช้งาน", "Enabled"))}
                    </label>
                  )}
                  {knob.help ? <p className="mt-0.5 text-[11px] text-neutral-500">{t(knob.help)}</p> : null}
                </div>
              );
            })}
        </div>
      </section>

      {/* burst / autoscaling (only for workloads that have VMs or Autonomous DB) */}
      {caps.hasVm || caps.hasDb ? (
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">{t(L("Burst / Autoscaling", "Burst / Autoscaling"))}</h3>
          <div className="space-y-3">
            {caps.hasVm ? (
              <label className="flex items-start gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={Boolean(burst.vmBurstable)}
                  onChange={(e) => onChange(setPath(spec, "burst.vmBurstable", e.target.checked))}
                />
                <span>
                  {t(L("อนุญาต burstable VM", "Allow burstable VM"))}
                  <span className="block text-[11px] text-neutral-500">
                    {t(L("คิดเต็ม OCPU ตาม AIS (burst ชั่วคราวไม่คิดเพิ่ม)", "billed at full OCPU per AIS (short bursts are free)"))}
                  </span>
                </span>
              </label>
            ) : null}
            {caps.hasDb ? (
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(burst.dbAutoscaling)}
                    onChange={(e) => onChange(setPath(spec, "burst.dbAutoscaling", e.target.checked))}
                  />
                  <span>
                    {t(L("เปิด Autonomous DB autoscaling", "Enable Autonomous DB autoscaling"))}
                    <span className="block text-[11px] text-neutral-500">
                      {t(L("ลด TCO โดยลด peak ECPU ได้ถึง 67% เมื่อไม่ได้ใช้งานเต็ม", "lowers TCO by reducing peak ECPUs up to 67% when idle"))}
                    </span>
                  </span>
                </label>
                {burst.dbAutoscaling ? (
                  <div className="ml-6 space-y-2">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("Peak ECPUs (เท่าของ ECPU Count)", "Peak ECPUs (× ECPU Count)"))}</label>
                        <select
                          className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                          value={String(burst.dbPeakFactor ?? 3)}
                          onChange={(e) => onChange(setPath(spec, "burst.dbPeakFactor", Number(e.target.value)))}
                        >
                          {PEAK_FACTORS.map((f) => (
                            <option key={f} value={f}>
                              {f}×
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("% ของเดือนที่เกิน ECPU Count", "% of month above ECPU Count"))}</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                          value={Number(burst.dbPctMonthAbove ?? 5)}
                          onChange={(e) => onChange(setPath(spec, "burst.dbPctMonthAbove", Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)))))}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      {t(L(
                        "ECPU Count (baseline) = จำนวน ECPU ที่ตั้งไว้ของ DB คิด 100% ของเดือน · ส่วนที่ burst เกิน baseline คิดเฉลี่ยตามช่วงที่ใช้จริง (ตรงกับ AIS calculator)",
                        "ECPU Count (baseline) = the DB's provisioned ECPUs, billed 100% of the month · the burst above baseline is billed on an averaged ramp (matches the AIS calculator)",
                      ))}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* traffic / data-transfer quantities */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-neutral-700">{t(L("Traffic / Data transfer (ปริมาณ)", "Traffic / Data transfer"))}</h3>
        <p className="mb-3 text-[11px] text-neutral-500">{t(L("ปรับปริมาณตามจริงเพื่อคิดค่า bandwidth/data ให้ตรง", "set the real volumes so bandwidth/data charges are accurate"))}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {caps.hasLb ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("LB bandwidth (Mbps)", "LB bandwidth (Mbps)"))}</label>
              <input
                type="number"
                min={0}
                max={100000}
                className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                value={Number(traffic.lbBandwidthMbps ?? caps.lbMbps)}
                onChange={(e) => numTraffic("traffic.lbBandwidthMbps", e)}
              />
              <p className="mt-0.5 text-[11px] text-neutral-500">{t(L("10 Mbps แรกฟรี", "first 10 Mbps free"))}</p>
            </div>
          ) : null}
          {caps.hasNfw ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("NFW data processing (GB/เดือน)", "NFW data processed (GB/month)"))}</label>
              <input
                type="number"
                min={0}
                max={10000000}
                className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                value={Number(traffic.nfwDataGbPerMonth ?? caps.nfwGb)}
                onChange={(e) => numTraffic("traffic.nfwDataGbPerMonth", e)}
              />
              <p className="mt-0.5 text-[11px] text-neutral-500">{t(L("10TB แรก/เดือนฟรี", "first 10TB/month free"))}</p>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("Outbound / internet egress (GB/เดือน)", "Outbound / internet egress (GB/month)"))}</label>
            <input
              type="number"
              min={0}
              max={10000000}
              className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
              value={Number(traffic.egressGbPerMonth ?? caps.egressGb)}
              onChange={(e) => numTraffic("traffic.egressGbPerMonth", e)}
            />
            <p className="mt-0.5 text-[11px] text-neutral-500">{t(L("10TB แรก/เดือนฟรี (APAC)", "first 10TB/month free (APAC)"))}</p>
          </div>
          {caps.hasWaf ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("WAF requests (ล้าน/เดือน)", "WAF requests (M/month)"))}</label>
              <input
                type="number"
                min={0}
                max={100000}
                className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                value={Number(traffic.wafRequestsM ?? caps.wafM)}
                onChange={(e) => numTraffic("traffic.wafRequestsM", e)}
              />
              <p className="mt-0.5 text-[11px] text-neutral-500">{t(L("10M แรกฟรี", "first 10M free"))}</p>
            </div>
          ) : null}
          {caps.hasObjectStorage ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("Object Storage requests (ล้าน/เดือน)", "Object Storage requests (M/month)"))}</label>
              <input
                type="number"
                min={0}
                max={1000000}
                className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                value={Number(traffic.objectRequestsMPerMonth ?? caps.objReqM)}
                onChange={(e) => numTraffic("traffic.objectRequestsMPerMonth", e)}
              />
              <p className="mt-0.5 text-[11px] text-neutral-500">{t(L("คิดต่อ 10,000 requests", "billed per 10,000 requests"))}</p>
            </div>
          ) : null}
          {caps.hasStreaming ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">{t(L("Streaming throughput (GB/เดือน)", "Streaming throughput (GB/month)"))}</label>
              <input
                type="number"
                min={0}
                max={100000000}
                className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                value={Number(traffic.streamingGbPerMonth ?? caps.streamGb)}
                onChange={(e) => numTraffic("traffic.streamingGbPerMonth", e)}
              />
              <p className="mt-0.5 text-[11px] text-neutral-500">{t(L("PUT/GET data", "PUT/GET data"))}</p>
            </div>
          ) : null}
        </div>
      </section>

      {/* advanced: type exact per-environment values (overrides the % scale) */}
      {spec.environments.length > 1 && caps.envWorkload.length > 0 ? (
        <details className="rounded-xl border border-neutral-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-700">{t(L("ปรับตัวเลขต่อ environment เอง (ขั้นสูง)", "Custom per-environment values (advanced)"))}</summary>
          <p className="mb-3 mt-1 text-[11px] text-neutral-500">{t(L("ใส่เลขจริงต่อ env — override ค่าที่ scale ให้ (เช่น storage ที่ไม่อยากลดตาม %)", "Type exact values per env — overrides the % scale (e.g. storage you don't want scaled down)"))}</p>
          <div className="space-y-3">
            {caps.envWorkload.map(({ env, lines }) => (
              <div key={env}>
                <div className="mb-1 text-xs font-medium text-neutral-600">{env}</div>
                <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {lines.map((line) => (
                    <label key={line.catalogKey} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-neutral-500">
                        {stripEnv(t(line.label))} <span className="text-neutral-400">({line.unit})</span>
                      </span>
                      <input
                        type="number"
                        min={0}
                        className="w-20 shrink-0 rounded border border-neutral-300 px-1 py-0.5 text-right"
                        value={Number(spec.envOverride?.[env as EnvName]?.[line.catalogKey] ?? line.quantity)}
                        onChange={(e) => setEnvOverride(env, line.catalogKey, Number(e.target.value))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
