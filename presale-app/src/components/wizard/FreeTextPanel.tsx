"use client";

import { useState } from "react";
import type { ParseResponse, SolutionSpec } from "@/lib/domain/types";
import { L, useLang } from "@/lib/i18n";

const EXAMPLE = `ลูกค้าธนาคารต้องการระบบเว็บแอปให้บริการลูกค้า ~2,000 คน/วัน
ต้องมี prod และ preprod, ฐานข้อมูล Oracle, ความปลอดภัยตามมาตรฐาน regulator
มี HA และต่อ VPN กลับ data center เดิม`;

export function FreeTextPanel({ onSpec }: { onSpec: (spec: SolutionSpec, note: string) => void }) {
  const { t } = useLang();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const submit = async (fullText: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: fullText }),
      });
      const data = (await res.json()) as ParseResponse;
      if (data.status === "ok") {
        setQuestions([]);
        onSpec(data.spec, t(L("AI แปลงความต้องการเป็นสเปกแล้ว — ตรวจสอบ/ปรับค่าด้านล่างก่อนสร้างผลลัพธ์", "AI mapped the requirement — review/adjust below before generating")));
      } else if (data.status === "clarify") {
        setQuestions(data.questions);
        setAnswers(data.questions.map(() => ""));
      } else if (data.status === "llm_unavailable") {
        setUnavailable(data.reason ?? "LLM not configured");
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitWithAnswers = () => {
    const qa = questions.map((q, i) => `Q: ${q}\nA: ${answers[i] || "-"}`).join("\n");
    void submit(`${text}\n\nเพิ่มเติมจากคำถาม:\n${qa}`);
  };

  if (unavailable) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">{t(L("โหมด AI ยังใช้ไม่ได้", "AI mode is not available"))}</p>
        <p className="mt-1">
          {t(L("ตั้งค่า GEMINI_API_KEY หรือ OPENAI_API_KEY ใน .env แล้วรีสตาร์ทแอป — ระหว่างนี้ใช้โหมดเลือก template ได้ตามปกติ", "Set GEMINI_API_KEY or OPENAI_API_KEY in .env and restart — the template mode works without it"))}
        </p>
        <p className="mt-1 text-xs text-amber-700">({unavailable})</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        className="h-40 w-full rounded-xl border border-neutral-300 p-3 text-sm"
        placeholder={EXAMPLE}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {questions.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">{t(L("AI ขอข้อมูลเพิ่มเพื่อความแม่นยำ:", "The AI needs a little more detail:"))}</p>
          {questions.map((q, i) => (
            <div key={i}>
              <label className="mb-0.5 block text-xs text-blue-900">{q}</label>
              <input
                className="w-full rounded-lg border border-blue-200 px-3 py-1.5 text-sm"
                value={answers[i] ?? ""}
                onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))}
              />
            </div>
          ))}
          <button
            onClick={submitWithAnswers}
            disabled={busy}
            className="rounded-lg bg-blue-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? t(L("กำลังวิเคราะห์…", "Analyzing…")) : t(L("ส่งคำตอบ", "Submit answers"))}
          </button>
        </div>
      ) : (
        <button
          onClick={() => void submit(text)}
          disabled={busy || text.trim().length < 10}
          className="rounded-lg bg-[#C74634] px-5 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
        >
          {busy ? t(L("กำลังวิเคราะห์ด้วย AI…", "Analyzing with AI…")) : t(L("วิเคราะห์ด้วย AI", "Analyze with AI"))}
        </button>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
