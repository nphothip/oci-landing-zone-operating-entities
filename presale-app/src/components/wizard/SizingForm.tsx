"use client";

import type { EnvName, HubKind, SolutionSpec } from "@/lib/domain/types";
import { TEMPLATES } from "@/lib/templates";
import { getPath, setPath } from "@/lib/domain/path";
import { L, useLang } from "@/lib/i18n";

const HUBS: { value: HubKind; label: { th: string; en: string }; cost: { th: string; en: string } }[] = [
  { value: "hub_a", label: L("Hub A — NFW คู่ (HA)", "Hub A — dual NFW (HA)"), cost: L("~$4,092/เดือน (FW)", "~$4,092/mo (FW)") },
  { value: "hub_b", label: L("Hub B — NFW เดี่ยว", "Hub B — single NFW"), cost: L("~$2,046/เดือน (FW)", "~$2,046/mo (FW)") },
  { value: "hub_c", label: L("Hub C — NLB สำหรับ FW 3rd-party", "Hub C — NLB for 3rd-party FW"), cost: L("NLB ฟรี + ค่า FW เอง", "free NLB + own FW cost") },
  { value: "hub_e", label: L("Hub E — ไม่มี firewall", "Hub E — no firewall"), cost: L("ฟรี (เหมาะ PoC)", "free (PoC-friendly)") },
];

const ENVS: EnvName[] = ["prod", "preprod", "uat", "dev"];

export function SizingForm({ spec, onChange }: { spec: SolutionSpec; onChange: (s: SolutionSpec) => void }) {
  const { t } = useLang();
  const template = TEMPLATES[spec.template];

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
                <option value="fastconnect_1g">FastConnect 1 Gbps</option>
                <option value="fastconnect_10g">FastConnect 10 Gbps</option>
              </select>
            </div>
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
    </div>
  );
}
