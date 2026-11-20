import { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Search,
  Share2,
} from "lucide-react";
import { buildLineShareText, formatThaiDate } from "../lib/format";

const DEFAULT_VISIBLE_COUNT = 3;

export default function CitationsSection({
  citations = [],
  question,
  answer,
  activeSourceId,
  onOpenSource,
}) {
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [copiedLine, setCopiedLine] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filterText, setFilterText] = useState("");

  if (!citations || citations.length === 0) return null;

  const primary = citations[0];

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
    <div className="rounded-2xl border border-stone-200/90 bg-white shadow-card overflow-hidden">
      {/* Slim Unified Header Bar */}
      <div className="px-4 py-2.5 bg-ovec-cream/80 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>แหล่งอ้างอิง ({citations.length} ฉบับ • บังคับใช้ล่าสุด)</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleCopy(answer, setCopiedAnswer)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 transition"
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
                buildLineShareText({ question, answer, citation: primary }),
                setCopiedLine
              )
            }
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 transition"
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

      {/* Optional Filter Input when expanded & many citations */}
      {expanded && citations.length > 4 && (
        <div className="px-4 py-2 bg-stone-50 border-b border-stone-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="ค้นหาชื่อประกาศ หมวดหมู่ หรือข้อที่อ้างอิง..."
              className="w-full rounded-lg border border-stone-300 bg-white pl-8 pr-3 py-1 text-xs focus:border-ovec-maroon focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Single Compact Scannable List */}
      <div
        className={`divide-y divide-stone-100 ${
          expanded ? "max-h-72 overflow-y-auto" : ""
        }`}
      >
        {visibleCitations.map((cit, idx) => {
          const isPrimary = idx === 0 && !filterText.trim();
          const isSelected = activeSourceId === cit.document_id;

          return (
            <div
              key={cit.document_id}
              onClick={() => onOpenSource(cit)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenSource(cit);
                }
              }}
              className={`px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition ${
                isSelected
                  ? "bg-amber-50/90 border-l-4 border-ovec-gold"
                  : isPrimary
                  ? "bg-white hover:bg-ovec-cream/50"
                  : "bg-white/80 hover:bg-ovec-cream/50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      isPrimary
                        ? "bg-ovec-maroon text-amber-200"
                        : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {isPrimary ? "อ้างอิงหลัก" : `#${idx + 1}`}
                  </span>
                  <span className="text-sm font-bold text-stone-900 truncate">
                    {cit.title}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                  <span className="text-emerald-700 font-semibold">
                    อัปเดต {formatThaiDate(cit.effective_date)}
                  </span>
                  <span>•</span>
                  <span className="text-ovec-maroon font-medium">
                    {cit.category_name}
                  </span>
                  {cit.cited_clauses?.length > 0 && (
                    <>
                      <span>•</span>
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {cit.cited_clauses.slice(0, 2).map((cl, cIdx) => (
                          <span
                            key={cIdx}
                            className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0 text-[11px] font-medium text-amber-900"
                          >
                            {cl}
                          </span>
                        ))}
                        {cit.cited_clauses.length > 2 && (
                          <span className="text-[11px] font-semibold text-stone-500">
                            +{cit.cited_clauses.length - 2} ข้อ
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <span
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  isPrimary
                    ? "bg-ovec-maroon text-white hover:bg-ovec-dark shadow-sm"
                    : "border border-stone-200 bg-white text-ovec-maroon hover:border-ovec-maroon"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {isPrimary ? "ดูต้นฉบับ & ไฮไลต์" : "เปิดดู"}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Expand / Collapse Footer */}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full py-2 px-4 bg-stone-50 hover:bg-ovec-cream border-t border-stone-200/80 text-xs font-semibold text-ovec-maroon flex items-center justify-center gap-1.5 transition"
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
