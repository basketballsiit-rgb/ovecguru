import { useEffect, useRef } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  FolderTree,
  Sparkles,
  X,
} from "lucide-react";
import { formatThaiDate } from "../lib/format";

export default function SourceViewer({ citation, onClose }) {
  const firstMatchRef = useRef(null);

  useEffect(() => {
    if (citation && firstMatchRef.current) {
      firstMatchRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [citation]);

  if (!citation) return null;

  let firstMatchAssigned = false;

  return (
    <>
      {/* Mobile / Tablet Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/45 backdrop-blur-[1px] z-40 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        aria-label="ตัวแสดงเอกสารต้นฉบับและไฮไลต์จุดอ้างอิง"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] lg:static lg:z-auto lg:w-[440px] xl:w-[490px] shrink-0 bg-white border-l border-stone-200 shadow-2xl lg:shadow-none flex flex-col h-full lg:h-[calc(100vh-76px)] lg:sticky lg:top-[76px]"
      >
        {/* Top Bar */}
        <div className="px-4 py-3.5 bg-ovec-dark text-white border-b-2 border-ovec-gold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="text-sm font-semibold truncate">
              ต้นฉบับเอกสาร &amp; จุดอ้างอิง
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดแผงต้นฉบับ"
            className="p-1.5 rounded-lg text-rose-100 hover:bg-white/15 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Metadata Header */}
        <div className="p-4 bg-ovec-cream/80 border-b border-stone-200 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              บังคับใช้ล่าสุด
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white border border-stone-200 px-2.5 py-0.5 text-[11px] font-medium text-stone-700">
              <CalendarDays className="w-3 h-3 text-ovec-maroon" />
              {formatThaiDate(citation.effective_date)}
            </span>
          </div>

          <h3 className="text-sm font-bold text-stone-900 leading-snug">
            {citation.title}
          </h3>

          <div className="flex items-center gap-1.5 text-xs text-stone-600">
            <FolderTree className="w-3.5 h-3.5 text-ovec-maroon shrink-0" />
            <span className="truncate">
              {citation.group_name} /{" "}
              <strong className="font-semibold text-stone-800">
                {citation.category_name}
              </strong>
            </span>
          </div>

          <div className="pt-1">
            <a
              href={citation.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ovec-maroon hover:bg-ovec-dark text-white px-4 py-2 text-xs font-semibold shadow-sm transition"
            >
              <Download className="w-4 h-4 text-amber-300" />
              เปิด / ดาวน์โหลดไฟล์ต้นฉบับจริง (PDF)
            </a>
          </div>
        </div>

        {/* Chunks Content with Golden-Yellow Highlight on Matched Clauses */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
          <div className="flex items-center justify-between text-xs text-stone-500 pb-1">
            <span>เนื้อหาเอกสารตามโครงสร้าง ({citation.chunks?.length || 0} ส่วน)</span>
            <span className="inline-flex items-center gap-1 text-amber-800 font-medium">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-300 border border-amber-500" />
              แถบสีเหลืองทอง = จุดอ้างอิง
            </span>
          </div>

          {citation.chunks?.map((chunk) => {
            const isMatched = Boolean(chunk.is_matched);
            let refProp = null;
            if (isMatched && !firstMatchAssigned) {
              firstMatchAssigned = true;
              refProp = firstMatchRef;
            }

            return (
              <div
                key={chunk.chunk_id}
                ref={refProp}
                className={`rounded-xl p-3.5 text-sm leading-relaxed transition-all ${
                  isMatched
                    ? "bg-amber-50/95 border-l-4 border-amber-400 ring-1 ring-amber-200 shadow-sm"
                    : "bg-stone-50/70 border border-stone-200/70 text-stone-600"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                  <span
                    className={`text-xs font-semibold ${
                      isMatched ? "text-amber-950" : "text-stone-700"
                    }`}
                  >
                    {chunk.clause_heading || `ส่วนที่ ${chunk.chunk_index + 1}`}
                  </span>

                  {isMatched && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/30 border border-amber-400/70 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                      <Sparkles className="w-3 h-3 text-amber-700" />
                      จุดอ้างอิงที่ระบบดึงมาตอบ
                      {chunk.score > 0 && ` (${Math.round(chunk.score * 100)}%)`}
                    </span>
                  )}
                </div>

                <p className="whitespace-pre-wrap text-base text-stone-800 leading-relaxed">
                  {chunk.content_text}
                </p>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
