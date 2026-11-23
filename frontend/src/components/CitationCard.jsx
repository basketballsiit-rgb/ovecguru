import { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Layers,
  Search,
  Share2,
} from "lucide-react";
import { buildLineShareText, formatThaiDate } from "../lib/format";

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

  // Adaptive grid: 2 cols for 1-2 docs, 3 cols for 3+ docs so everything fits neatly in 1 screen
  const gridColsClass =
    citations.length >= 3
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      : "grid-cols-1 sm:grid-cols-2";

  const isScrollable = citations.length > 6;

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
    <div className="space-y-2">
      {/* Slim Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 tabular-nums">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" strokeWidth={1.75} />
            แหล่งอ้างอิง ({citations.length} ฉบับ)
          </span>

          {citations.length > 1 && selectedDocId !== null && (
            <button
              type="button"
              onClick={() => onSelectDocAnswer?.(null)}
              className="inline-flex items-center gap-1 rounded-lg bg-ovec-cream border border-ovec-maroon/25 hover:bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-ovec-maroon transition-colors"
            >
              <Layers className="w-3 h-3" strokeWidth={1.75} />
              ดูสรุปรวม
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {citations.length > 6 && (
            <div className="relative">
              <Search className="w-3 h-3 text-stone-400 absolute left-2.5 top-1.5" strokeWidth={1.75} />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="กรองเอกสาร..."
                className="w-36 sm:w-44 rounded-lg border border-stone-200 bg-white pl-7 pr-2 py-0.5 text-xs focus:border-ovec-maroon focus:outline-none"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => handleCopy(displayedAnswer || "", setCopiedAnswer)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-700 transition-colors"
          >
            {copiedAnswer ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" strokeWidth={1.75} />
                คัดลอกแล้ว
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-stone-500" strokeWidth={1.75} />
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
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70 px-2.5 py-1 text-[11px] font-medium text-emerald-800 transition-colors"
          >
            {copiedLine ? (
              <>
                <Check className="w-3 h-3 text-emerald-700" strokeWidth={1.75} />
                คัดลอก LINE
              </>
            ) : (
              <>
                <Share2 className="w-3 h-3" strokeWidth={1.75} />
                ส่ง LINE
              </>
            )}
          </button>
        </div>
      </div>

      {/* Adaptive Compact Grid (fits cleanly within a single screen) */}
      <div
        className={`grid ${gridColsClass} gap-2.5 ${
          isScrollable ? "max-h-56 overflow-y-auto pr-1" : ""
        }`}
      >
        {filteredCitations.map((cit) => {
          const isFocused = selectedDocId === cit.document_id;

          return (
            <div
              key={cit.document_id}
              onClick={() => onSelectDocAnswer?.(cit)}
              role="button"
              tabIndex={0}
              title="คลิกเพื่อแสดงคำตอบเฉพาะจากเอกสารฉบับนี้"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDocAnswer?.(cit);
                }
              }}
              className={`group rounded-xl border px-3 py-2.5 flex flex-col justify-between gap-2 cursor-pointer transition-colors ${
                isFocused
                  ? "bg-amber-50/60 border-ovec-maroon ring-1 ring-ovec-maroon/20"
                  : "bg-white border-stone-200 hover:border-ovec-maroon/45 hover:bg-ovec-paper"
              }`}
            >
              {/* Row 1: Icon + Compact Title + Mini Source Button */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <FileText
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      isFocused ? "text-ovec-maroon" : "text-stone-400 group-hover:text-ovec-maroon"
                    }`}
                    strokeWidth={1.75}
                  />
                  <h4 className="text-xs font-semibold text-stone-900 leading-snug line-clamp-2">
                    {cit.title}
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSource?.(cit);
                  }}
                  title="เปิดดูต้นฉบับและไฮไลต์จุดอ้างอิง"
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-ovec-maroon hover:bg-ovec-dark px-2 py-1 text-[11px] font-medium text-white transition-colors"
                >
                  <BookOpen className="w-3 h-3 text-amber-300" strokeWidth={1.75} />
                  ต้นฉบับ
                </button>
              </div>

              {/* Row 2: Slim Inline Meta (Date • Category • Clauses) */}
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-tight tabular-nums">
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                  {formatThaiDate(cit.effective_date)}
                </span>
                <span className="text-stone-300">·</span>
                <span className="text-stone-600 font-medium truncate max-w-[120px]">
                  {cit.category_name}
                </span>

                {cit.cited_clauses?.length > 0 && (
                  <>
                    <span className="text-stone-300">·</span>
                    <span className="rounded bg-amber-50 border border-amber-200/80 px-1.5 py-0 text-amber-900 font-medium truncate max-w-[125px]">
                      {cit.cited_clauses[0]}
                      {cit.cited_clauses.length > 1
                        ? ` (+${cit.cited_clauses.length - 1})`
                        : ""}
                    </span>
                  </>
                )}

                {isFocused && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-ovec-maroon">
                    <span className="w-1.5 h-1.5 rounded-full bg-ovec-maroon" />
                    กำลังดู
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
