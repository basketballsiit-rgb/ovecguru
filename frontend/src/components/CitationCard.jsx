import { useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Share2,
} from "lucide-react";
import { buildLineShareText, formatThaiDate } from "../lib/format";

export default function CitationCard({
  citation,
  question,
  answer,
  onOpenSource,
  isSelected,
}) {
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedLine, setCopiedLine] = useState(false);

  const handleCopy = async (text, setter) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setter(true);
      setTimeout(() => setter(false), 2000);
    }
  };

  const formattedDate = formatThaiDate(citation.effective_date);

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-card transition-all ${
        isSelected
          ? "border-ovec-gold ring-2 ring-amber-200"
          : "border-stone-200/90 hover:border-amber-300"
      }`}
    >
      {/* Top Verified Green Date & Status Badge + Category Pill */}
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ข้อมูลอัปเดตเมื่อ {formattedDate} • สถานะ: บังคับใช้ล่าสุด
        </span>

        <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200/80 px-2.5 py-0.5 text-xs font-medium text-ovec-maroon">
          {citation.category_name}
        </span>

        {citation.group_name && (
          <span className="text-[11px] text-stone-500">
            ({citation.group_name})
          </span>
        )}
      </div>

      {/* Document Title */}
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 p-1.5 rounded-lg bg-ovec-cream border border-stone-200 text-ovec-maroon shrink-0">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-bold text-stone-900 leading-snug">
            {citation.title}
          </h4>

          {citation.cited_clauses?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-stone-500">
                อ้างอิง:
              </span>
              {citation.cited_clauses.map((clause, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200/90 px-2 py-0.5 text-xs font-medium text-amber-900"
                >
                  {clause}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-3.5 pt-3 border-t border-stone-100 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleCopy(answer, setCopiedAnswer)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 transition"
        >
          {copiedAnswer ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              คัดลอกคำตอบแล้ว
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              คัดลอกคำตอบ
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() =>
            handleCopy(
              buildLineShareText({ question, answer, citation }),
              setCopiedLine
            )
          }
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 px-3 py-1.5 text-xs font-medium text-emerald-800 transition"
        >
          {copiedLine ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-700" />
              คัดลอกสำหรับ LINE แล้ว
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5" />
              คัดลอกสรุปส่ง LINE
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => onOpenSource(citation)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-ovec-maroon hover:bg-ovec-dark px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition"
        >
          <BookOpen className="w-3.5 h-3.5 text-amber-300" />
          เปิดดูต้นฉบับ &amp; ไฮไลต์จุดอ้างอิง
        </button>
      </div>
    </div>
  );
}
