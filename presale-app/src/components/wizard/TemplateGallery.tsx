"use client";

import type { TemplateId } from "@/lib/domain/types";
import { TEMPLATE_LIST } from "@/lib/templates";
import { useLang } from "@/lib/i18n";

export function TemplateGallery({ selected, onSelect }: { selected: TemplateId | null; onSelect: (id: TemplateId) => void }) {
  const { t } = useLang();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {TEMPLATE_LIST.map((tpl) => (
        <button
          key={tpl.id}
          onClick={() => onSelect(tpl.id)}
          className={`rounded-xl border p-4 text-left transition hover:shadow-md ${
            selected === tpl.id ? "border-[#C74634] bg-red-50 ring-2 ring-[#C74634]/30" : "border-neutral-200 bg-white"
          }`}
        >
          <div className="text-2xl">{tpl.icon}</div>
          <div className="mt-2 font-semibold">{t(tpl.name)}</div>
          <div className="mt-1 text-xs leading-5 text-neutral-600">{t(tpl.description)}</div>
        </button>
      ))}
    </div>
  );
}
