import { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Search,
  Share2,
} from "lucide-react";
import { buildLineShareText, formatThaiDate } from "../lib/format";

const INITIAL_COMPACT_COUNT = 2; // #1 primary + 2 compact = 3 visible by default

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
  const others = citations.slice(1);

  const filteredOthers = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return others;
    return others.filter(
      (c) =>
        (c.title || "").toLowerCase().includes(q) ||
        (c.category_name || "").toLowerCase().includes(q) ||
        (c.cited_clauses || []).some((cl) => cl.toLowerCase().includes(q))
    );
  }, [others, filterText]);

  const visibleOthers = expanded
    ? filteredOthers
    : filteredOthers.slice(0, INITIAL_COMPACT_COUNT);
  const hiddenCount = Math.max(0, others.length - INITIAL_COMPACT_COUNT);

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

  const renderClauses = (clauses = [], maxShow = 3) => {
    if (!clauses.length) return null;
    const shown = clauses.slice(0, maxShow);
    const extra = clauses.length - shown.length;
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-stone-500">อ้างอิง:</span>
        {shown.map((clause, idx) => (
          <span
            key={idx}
            className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200/90 px-2 py-0.5 text-xs font-medium text-amber-900"
          >
            {clause}
          </span>
        ))}
        {extra > 0 && (
          <span className="inline-flex items-center rounded-md bg-stone-100 border border-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-600">
            +{extra} ข้อ
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2.5">
      {/* Unified Action Bar (Copy Answer + Copy LINE Summary once per answer) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>แหล่งอ้างอิงที่ตรวจสอบแล้ว ({citations.length} ฉบับ)</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleCopy(answer, setCopiedAnswer)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm transition"
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
                buildLineShareText({ question, answer, citation: primary }),
                setCopiedLine
              )
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm transition"
          >
            {copiedLine ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                คัดลอกส่ง LINE แล้ว
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                คัดลอกสรุปส่ง LINE
              </>
            )}
          </button>
        </div>
      </div>

      {/* #1 Primary Verified Citation Card */}
      <div
        className={`rounded-2xl border bg-white p-4 shadow-card transition-all ${
          activeSourceId === primary.document_id
            ? "border-ovec-gold ring-2 ring-amber-200"
            : "border-stone-200/90 hover:border-amber-300"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="inline-flex items-center rounded-full bg-ovec-maroon text-amber-200 px-2.5 py-0.5 text-[11px] font-bold">
            #1 อ้างอิงหลัก
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            อัปเดตเมื่อ {formatThaiDate(primary.effective_date)} • บังคับใช้ล่าสุด
          </span>
          <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200/80 px-2.5 py-0.5 text-xs font-medium text-ovec-maroon">
            {primary.category_name}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="mt-0.5 p-1.5 rounded-lg bg-ovec-cream border border-stone-200 text-ovec-maroon shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-bold text-stone-900 leading-snug">
                {primary.title}
              </h4>
              {renderClauses(primary.cited_clauses, 3)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenSource(primary)}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-ovec-maroon hover:bg-ovec-dark px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-300" />
            เปิดดูต้นฉบับ &amp; ไฮไลต์
          </button>
        </div>
      </div>

      {/* Additional Citations (#2..N) in Compact Scannable List */}
      {others.length > 0 && (
        <div className="rounded-2xl border border-stone-200/90 bg-white/90 overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 bg-ovec-cream/70 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-700">
              เอกสารอ้างอิงประกอบเพิ่มเติม ({others.length} ฉบับ)
            </span>

            {expanded && others.length >= 4 && (
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="กรองชื่อเอกสารหรือข้อ..."
                  className="w-full rounded-lg border border-stone-300 bg-white pl-8 pr-2.5 py-1 text-xs focus:border-ovec-maroon focus:outline-none"
                />
              </div>
            )}
          </div>

          <div
            className={`divide-y divide-stone-100 ${
              expanded ? "max-h-72 overflow-y-auto" : ""
            }`}
          >
            {visibleOthers.map((cit, idx) => {
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
                  className={`px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition ${
                    isSelected
                      ? "bg-amber-50/90 border-l-4 border-ovec-gold"
                      : "hover:bg-ovec-cream/60"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-bold text-stone-400 shrink-0 tabular-nums">
                        #{idx + 2}
                      </span>
                      <span className="text-sm font-semibold text-stone-800 truncate">
                        {cit.title}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500 pl-6">
                      <span className="text-emerald-700 font-medium">
                        อัปเดต {formatThaiDate(cit.effective_date)}
                      </span>
                      <span>•</span>
                      <span className="text-ovec-maroon font-medium">
                        {cit.category_name}
                      </span>
                      {cit.cited_clauses?.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-800 font-medium truncate max-w-[240px]">
                            {cit.cited_clauses.slice(0, 2).join(", ")}
                            {cit.cited_clauses.length > 2
                              ? ` (+${cit.cited_clauses.length - 2})`
                              : ""}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <span className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-ovec-maroon hover:border-ovec-maroon transition">
                    <BookOpen className="w-3.5 h-3.5" />
                    เปิดดู
                  </span>
                </div>
              );
            })}
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="w-full py-2 px-4 bg-stone-50 hover:bg-ovec-cream border-t border-stone-200/80 text-xs font-semibold text-ovec-maroon flex items-center justify-center gap-1.5 transition"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  ย่อรายการเอกสารอ้างอิง
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
      )}
    </div>
  );
}
