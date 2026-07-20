"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { LocalizedText } from "@/lib/domain/types";

type Lang = "th" | "en";

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "th",
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("th");
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const { lang, setLang } = useContext(LangContext);
  const t = (text: LocalizedText | string): string =>
    typeof text === "string" ? text : text[lang] ?? text.en;
  return { lang, setLang, t };
}

/** Shorthand for inline bilingual literals. */
export function L(th: string, en: string): LocalizedText {
  return { th, en };
}
