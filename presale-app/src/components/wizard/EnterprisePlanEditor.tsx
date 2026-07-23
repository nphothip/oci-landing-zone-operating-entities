"use client";

import type { EnterpriseEnvPlan, EnterpriseProjectPlan, EnvName, SolutionSpec } from "@/lib/domain/types";
import { defaultEnvPlan } from "@/lib/templates/enterprise-lz";
import { orderEnvs } from "@/lib/domain/cidr";
import { L, useLang } from "@/lib/i18n";

// Advanced-mode editor: per-environment plans (projects + OKE platform),
// Security Zone targets and shared services for the enterprise_lz template.
// Fully controlled — every edit rebuilds sizing.plans immutably.

const NUM = "w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm";
const LBL = "mb-0.5 block text-[11px] font-medium text-neutral-500";

export function EnterprisePlanEditor({ spec, onChange }: { spec: SolutionSpec; onChange: (s: SolutionSpec) => void }) {
  const { t } = useLang();
  if (spec.sizing.kind !== "enterprise_lz") return null;
  const s = spec.sizing;
  const envs = orderEnvs(spec.environments);

  const setSizing = (patch: Partial<typeof s>) => onChange({ ...spec, sizing: { ...s, ...patch } });
  const setPlan = (env: EnvName, plan: EnterpriseEnvPlan) => setSizing({ plans: { ...s.plans, [env]: plan } });
  const planOf = (env: EnvName): EnterpriseEnvPlan => s.plans[env] ?? defaultEnvPlan(env);
  const setProject = (env: EnvName, idx: number, patch: Partial<EnterpriseProjectPlan>) => {
    const plan = planOf(env);
    const projects = plan.projects.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    setPlan(env, { ...plan, projects });
  };
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  const safeProjectName = (raw: string, idx: number) => {
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
    return /^[a-z]/.test(cleaned) ? cleaned : `app${idx + 1}`;
  };

  return (
    <div className="space-y-4">
      {envs.map((env) => {
        const plan = planOf(env);
        return (
          <details key={env} open={env === "prod"} className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-700">
              {env}
              <span className="ml-2 text-xs font-normal text-neutral-500">
                {plan.projects.length} {t(L("project", "project(s)"))} · OKE {plan.oke ? "✓" : "—"}
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              {plan.projects.map((p, i) => (
                <div key={i} className="rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
                      {t(L("Project", "Project"))}
                      <input
                        className="w-32 rounded-lg border border-neutral-300 px-2 py-1 font-mono text-sm"
                        value={p.name}
                        onChange={(e) => setProject(env, i, { name: safeProjectName(e.target.value, i) })}
                        title={t(L("a-z, 0-9 สูงสุด 10 ตัวอักษร (ข้อจำกัด DNS label ของ generator)", "a-z, 0-9, max 10 chars (generator DNS-label limit)"))}
                      />
                    </label>
                    {plan.projects.length > 1 ? (
                      <button
                        onClick={() => setPlan(env, { ...plan, projects: plan.projects.filter((_, j) => j !== i) })}
                        className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        ✕ {t(L("ลบ", "remove"))}
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                    <div><span className={LBL}>{t(L("จำนวน VM", "VM count"))}</span><input type="number" className={NUM} min={0} max={100} value={p.vmCount} onChange={(e) => setProject(env, i, { vmCount: num(e.target.value, 0, 100) })} /></div>
                    <div><span className={LBL}>OCPU / VM</span><input type="number" className={NUM} min={1} max={64} value={p.ocpusPerVm} onChange={(e) => setProject(env, i, { ocpusPerVm: num(e.target.value, 1, 64) })} /></div>
                    <div><span className={LBL}>Memory / VM (GB)</span><input type="number" className={NUM} min={1} max={1024} value={p.memGbPerVm} onChange={(e) => setProject(env, i, { memGbPerVm: num(e.target.value, 1, 1024) })} /></div>
                    <div><span className={LBL}>Boot / VM (GB)</span><input type="number" className={NUM} min={50} max={2000} value={p.bootGbPerVm} onChange={(e) => setProject(env, i, { bootGbPerVm: num(e.target.value, 50, 2000) })} /></div>
                    <div>
                      <span className={LBL}>Database</span>
                      <select className={NUM} value={p.dbEngine} onChange={(e) => setProject(env, i, { dbEngine: e.target.value as EnterpriseProjectPlan["dbEngine"] })}>
                        <option value="adb">Autonomous DB</option>
                        <option value="base_db">Base DB (VM)</option>
                        <option value="none">{t(L("ไม่มี", "none"))}</option>
                      </select>
                    </div>
                    {p.dbEngine !== "none" ? (
                      <>
                        <div><span className={LBL}>DB ECPU</span><input type="number" className={NUM} min={2} max={512} value={p.dbEcpus} onChange={(e) => setProject(env, i, { dbEcpus: num(e.target.value, 2, 512) })} /></div>
                        <div><span className={LBL}>DB storage (GB)</span><input type="number" className={NUM} min={20} max={100000} value={p.dbStorageGb} onChange={(e) => setProject(env, i, { dbStorageGb: num(e.target.value, 20, 100000) })} /></div>
                      </>
                    ) : null}
                    <div><span className={LBL}>Object Storage (GB)</span><input type="number" className={NUM} min={0} max={10000000} value={p.objectStorageGb} onChange={(e) => setProject(env, i, { objectStorageGb: num(e.target.value, 0, 10000000) })} /></div>
                  </div>
                </div>
              ))}
              {plan.projects.length < 8 ? (
                <button
                  onClick={() =>
                    setPlan(env, {
                      ...plan,
                      projects: [...plan.projects, { ...defaultEnvPlan(env).projects[0], name: `app${plan.projects.length + 1}` }],
                    })
                  }
                  className="rounded-lg border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:border-[#C74634] hover:text-[#C74634]"
                >
                  + {t(L("เพิ่ม project", "add project"))}
                </button>
              ) : null}

              {/* OKE platform per environment */}
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" checked={plan.oke} onChange={(e) => setPlan(env, { ...plan, oke: e.target.checked })} />
                  {t(L("OKE platform (VCN /20 แยก, สร้างโดย LZ)", "OKE platform (dedicated /20 VCN, created by the LZ)"))}
                </label>
                {plan.oke ? (
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    <div><span className={LBL}>{t(L("Worker nodes", "Worker nodes"))}</span><input type="number" className={NUM} min={1} max={100} value={plan.okeWorkerCount} onChange={(e) => setPlan(env, { ...plan, okeWorkerCount: num(e.target.value, 1, 100) })} /></div>
                    <div><span className={LBL}>OCPU / worker</span><input type="number" className={NUM} min={1} max={64} value={plan.okeWorkerOcpus} onChange={(e) => setPlan(env, { ...plan, okeWorkerOcpus: num(e.target.value, 1, 64) })} /></div>
                    <div><span className={LBL}>Memory / worker (GB)</span><input type="number" className={NUM} min={4} max={1024} value={plan.okeWorkerMemGb} onChange={(e) => setPlan(env, { ...plan, okeWorkerMemGb: num(e.target.value, 4, 1024) })} /></div>
                  </div>
                ) : null}
              </div>
            </div>
          </details>
        );
      })}

      {/* security zone targets + shared services */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <div className="mb-1 text-xs font-medium text-neutral-600">{t(L("Security Zone targets (แนะนำ: prod/preprod)", "Security Zone targets (recommended: prod/preprod)"))}</div>
          <div className="flex flex-wrap gap-2">
            {envs.map((env) => {
              const on = s.securityTargetEnvs.includes(env);
              return (
                <button
                  key={env}
                  onClick={() =>
                    setSizing({ securityTargetEnvs: on ? s.securityTargetEnvs.filter((e) => e !== env) : [...s.securityTargetEnvs, env] })
                  }
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-[#C74634] bg-red-50 font-medium" : "border-neutral-300 text-neutral-600"}`}
                >
                  {env}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">{t(L("ไม่เลือกเลย = บังคับทุก environment", "none selected = enforced on ALL environments"))}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 bg-white p-3">
          <div><span className={LBL}>{t(L("Shared FSS (GB)", "Shared FSS (GB)"))}</span><input type="number" className={NUM} min={0} max={1000000} value={s.fssGb} onChange={(e) => setSizing({ fssGb: num(e.target.value, 0, 1000000) })} /></div>
          <div><span className={LBL}>LB bandwidth (Mbps)</span><input type="number" className={NUM} min={10} max={8000} value={s.lbBandwidthMbps} onChange={(e) => setSizing({ lbBandwidthMbps: num(e.target.value, 10, 8000) })} /></div>
        </div>
      </div>
    </div>
  );
}
