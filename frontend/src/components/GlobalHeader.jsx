import { useState } from "react";
import { MessageSquareText, ShieldCheck } from "lucide-react";

const FONT_LEVELS = [100, 108, 116, 125];

export default function GlobalHeader({
  activeTab,
  onSelectTab,
  fontScaleIndex,
  onDecreaseFont,
  onIncreaseFont,
}) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const [logoSrc, setLogoSrc] = useState(`${baseUrl}assets/ovec-logo.png`);

  const handleLogoError = () => {
    const fallback = `${baseUrl}assets/ovec-logo.svg`;
    if (logoSrc !== fallback) {
      setLogoSrc(fallback);
    }
  };

  const currentPercent = FONT_LEVELS[fontScaleIndex] ?? 108;

  return (
    <header className="ovec-header-gradient border-b-[3px] border-ovec-gold text-white sticky top-0 z-30 shadow-sm">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Official OVEC Circular Emblem + Brand Name */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0 w-12 h-12 rounded-full bg-white p-0.5 ring-2 ring-amber-400/90 shadow-sm flex items-center justify-center overflow-hidden">
              <img
                src={logoSrc}
                onError={handleLogoError}
                alt="ตราสัญลักษณ์สำนักงานคณะกรรมการการอาชีวศึกษา (สอศ.)"
                className="w-full h-full object-cover rounded-full"
              />
            </div>

            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white leading-tight truncate">
                OVEC GURU
              </h1>
              <p className="text-xs sm:text-sm text-rose-100/85 leading-snug truncate">
                ระบบสืบค้นคลังความรู้ สำนักงานคณะกรรมการการอาชีวศึกษา
              </p>
            </div>
          </div>

          {/* Right: 2 Main Navigation Tabs + Font Scale ก- / ก+ */}
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <nav
              aria-label="เมนูหลัก"
              className="flex items-center bg-black/20 p-1 rounded-xl border border-white/15 flex-1 sm:flex-initial"
            >
              <button
                type="button"
                onClick={() => onSelectTab("chat")}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "chat"
                    ? "bg-white text-ovec-dark font-semibold shadow-sm"
                    : "text-rose-100/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                <MessageSquareText className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">แชตบอทค้นหาข้อมูล</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectTab("admin")}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "admin"
                    ? "bg-white text-ovec-dark font-semibold shadow-sm"
                    : "text-rose-100/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">ผู้ดูแลระบบ (RAG Console)</span>
              </button>
            </nav>

            {/* Font Size Adjuster: ก- / ก+ (100%, 108%, 116%, 125%) */}
            <div
              className="inline-flex items-center rounded-xl bg-black/20 border border-white/15 p-0.5 shrink-0"
              title={`ขนาดตัวอักษรปัจจุบัน ${currentPercent}%`}
            >
              <button
                type="button"
                onClick={onDecreaseFont}
                disabled={fontScaleIndex <= 0}
                aria-label="ลดขนาดตัวอักษร"
                className="px-2 py-1 text-xs font-medium rounded-lg text-rose-100 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ก-
              </button>
              <span className="hidden lg:inline-block px-1.5 text-xs font-medium text-amber-200 tabular-nums">
                {currentPercent}%
              </span>
              <button
                type="button"
                onClick={onIncreaseFont}
                disabled={fontScaleIndex >= FONT_LEVELS.length - 1}
                aria-label="เพิ่มขนาดตัวอักษร"
                className="px-2 py-1 text-xs font-medium rounded-lg text-rose-100 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ก+
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export { FONT_LEVELS };
