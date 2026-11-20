import { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Layers,
  Search,
  Share2,
} from "lucide-react";
import { buildLineShareText, formatThaiDate } from "../lib/format";

const DEFAULT_VISIBLE_COUNT = 6; // 3 rows x 2 columns

export default function CitationsSection({
  citations = [],
  question,
  displayedAnswer,
  selectedDocId = null,
  onSelectDocAnswer,
  onOpenSource,
}) {
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedLine, setCopiedLine] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filterText, setFilterText] = useState("");

  if (!citations || citations.length === 0) return null;

  const activeCitation =
    citations.find((c) => c.document_id === selectedDocId) || citations[0];

  const filteredCitations = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return citations;
    return citations.filter(
      (c) =>
        (c.title || "").toLowerCase().includes(q) ||
        (c.category_name || "").toLowerCase().includes(q) ||
        (c.cited_clauses || []).some((cl) => cl.toLowerCase().includes(q))
    );
  }, [citations, filterText]);

  const visibleCitations = expanded
    ? filteredCitations
    : filteredCitations.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(0, citations.length - DEFAULT_VISIBLE_COUNT);

  const handleCopy = async (text, setter) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
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

  return (
    <div className="space-y-2.5">
      {/* Slim Top Toolbar: Count + Switch to All + Copy / LINE */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            แหล่งอ้างอิงที่ตรวจสอบแล้ว ({citations.length} ฉบับ)
          </span>

          {citations.length > 1 && selectedDocId !== null && (
            <button
              type="button"
              onClick={() => onSelectDocAnswer?.(null)}
              className="inline-flex items-center gap-1 rounded-full bg-ovec-cream border border-ovec-maroon/30 hover:bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-ovec-maroon transition"
            >
              <Layers className="w-3 h-3" />
              ดูสรุปรวมทุกเอกสาร
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleCopy(displayedAnswer || "", setCopiedAnswer)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 shadow-sm transition"
          >
            {copiedAnswer ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                คัดลอกแล้ว
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
                buildLineShareText({
                  question,
                  answer: displayedAnswer || "",
                  citation: activeCitation,
                }),
                setCopiedLine
              )
            }
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 shadow-sm transition"
          >
            {copiedLine ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                คัดลอก LINE แล้ว
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                ส่ง LINE
              </>
            )}
          </button>
        </div>
      </div>

      {/* Optional Search when many citations (> 6) */}
      {expanded && citations.length > 6 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="ค้นหาชื่อเอกสาร หมวดหมู่ หรือข้อที่อ้างอิง..."
            className="w-full rounded-xl border border-stone-300 bg-white pl-8 pr-3 py-1.5 text-xs focus:border-ovec-maroon focus:outline-none"
          />
        </div>
      )}

      {/* Uniform Compact 2-Column Grid (2 documents per row) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {visibleCitations.map((cit) => {
          const isFocused = selectedDocId === cit.document_id;

          return (
            <div
              key={cit.document_id}
              onClick={() => onSelectDocAnswer?.(cit)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDocAnswer?.(cit);
                }
              }}
              className={`group rounded-2xl border p-3.5 flex flex-col justify-between gap-2.5 cursor-pointer transition-all shadow-sm ${
                isFocused
                  ? "bg-amber-50/70 border-ovec-maroon ring-2 ring-ovec-maroon/20"
                  : "bg-white border-stone-200/90 hover:border-ovec-maroon/50 hover:shadow-card"
              }`}
            >
              {/* Card Top: Uniform Badges + Title + Clauses */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    {formatThaiDate(cit.effective_date)} • บังคับใช้ล่าสุด
                  </span>
                  <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200/80 px-2 py-0.5 text-[11px] font-medium text-ovec-maroon">
                    {cit.category_name}
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <div
                    className={`mt-0.5 p-1 rounded-lg border shrink-0 transition ${
                      isFocused
                        ? "bg-ovec-maroon border-ovec-maroon text-amber-200"
                        : "bg-ovec-cream border-stone-200 text-ovec-maroon"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-sm font-bold text-stone-900 leading-snug line-clamp-2">
                    {cit.title}
                  </h4>
                </div>

                {cit.cited_clauses?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {cit.cited_clauses.slice(0, 3).map((clause, cIdx) => (
                      <span
                        key={cIdx}
                        className="rounded bg-amber-50 border border-amber-200/90 px-1.5 py-0.5 text-[11px] font-medium text-amber-900"
                      >
                        {clause}
                      </span>
                    ))}
                    {cit.cited_clauses.length > 3 && (
                      <span className="text-[11px] font-semibold text-stone-500">
                        +{cit.cited_clauses.length - 3} ข้อ
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Card Bottom: Select Focused Answer + Open Original Source */}
              <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] font-semibold ${
                    isFocused
                      ? "text-ovec-maroon"
                      : "text-stone-500 group-hover:text-ovec-maroon"
                  }`}
                >
                  {isFocused ? "● กำลังแสดงคำตอบจากฉบับนี้" : "คลิกเพื่อดูคำตอบเฉพาะฉบับนี้"}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSource?.(cit);
                  }}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-ovec-maroon hover:bg-ovec-dark px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition"
                >
                  <BookOpen className="w-3 h-3 text-amber-300" />
                  ต้นฉบับ &amp; ไฮไลต์
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand / Collapse for > 6 citations */}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full py-2 px-4 rounded-xl bg-white hover:bg-ovec-cream border border-stone-200 text-xs font-semibold text-ovec-maroon flex items-center justify-center gap-1.5 transition"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              ย่อรายการแหล่งอ้างอิง
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              ดูแหล่งอ้างอิงเพิ่มเติมอีก {hiddenCount} ฉบับ
            </>
          )}
        </button>
      )}
    </div>
  );
}
