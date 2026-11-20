import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  FileScan,
  HardDrive,
  Layout,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { fetchHealth } from "../../lib/api";

const ARCH_COMPONENTS = [
  {
    id: "frontend",
    step: "01",
    title: "React Static UI & Voice UX",
    subtitle: "Vite + Tailwind CSS + Nginx Static",
    icon: Layout,
    summary:
      "คอมไพล์เป็นไฟล์ Static (~65 kB gzipped) เสิร์ฟผ่าน Nginx โดยไม่ต้องรัน Node.js ใน Production ช่วยประหยัด RAM บน CentOS Stream 9 พร้อม Web Speech API (th-TH) และ Split-Screen Source Viewer",
    specs: [
      "React 18 + Vite + Tailwind CSS (IBM Plex Sans Thai)",
      "SSE Streaming Client + Verified Citation Card",
      "Zero Node.js Runtime RAM Overhead บน Production",
    ],
  },
  {
    id: "backend",
    step: "02",
    title: "FastAPI Core & Governance Engine",
    subtitle: "Uvicorn 2 Workers + JWT + RBAC 4 ระดับ",
    icon: Server,
    summary:
      "บริการ REST & SSE API น้ำหนักเบา รันด้วย Uvicorn 2 workers จำกัด MemoryMax=768M บังคับใช้กฎเหล็กป้องกัน Super Admin คนสุดท้าย และนโยบาย Governance 3 ข้อในทุก Endpoint",
    specs: [
      "FastAPI + SQLAlchemy 2.0 + bcrypt + JWT (HS256)",
      "4 ระดับสิทธิ์: super_admin, knowledge_admin, ocr_reviewer, college_staff",
      "TMPDIR / PIP_CACHE / LOGS แยกเก็บภายใต้ /home/ovec_guru ทั้งหมด",
    ],
  },
  {
    id: "ocr",
    step: "03",
    title: "Thai OCR & Structure-Aware Chunker",
    subtitle: "pypdf → Poppler + Tesseract (tha+eng)",
    icon: FileScan,
    summary:
      "ดึงข้อความจาก PDF ด้วย pypdf ก่อน หากเป็นไฟล์ภาพสแกนจะสลับไปใช้ Poppler (pdf2image) + Tesseract ภาษาไทย-อังกฤษ ให้เจ้าหน้าที่ตรวจแก้แบบ Human-in-the-Loop และหั่น Chunk ตาม หมวด/ข้อ/ส่วนที่/บทเฉพาะกาล",
    specs: [
      "รองรับ PDF, Word (.docx) และภาพสแกน PNG/JPG/TIFF",
      "Structure-Aware Chunker ไม่ตัดขาดกลางประโยค",
      "จัดเก็บไฟล์ต้นฉบับใน /home/ovec_guru/uploads สำหรับเปิดดูอ้างอิงจริง",
    ],
  },
  {
    id: "vector",
    step: "04",
    title: "Hybrid Vector DB (PostgreSQL + pgvector)",
    subtitle: "Cosine Similarity + Keyword + Recency",
    icon: Database,
    summary:
      "ผสานการค้นหาเวกเตอร์ (pgvector HNSW cosine distance) เข้ากับการค้นหาคำสำคัญตรงตัวและน้ำหนักวันที่บังคับใช้ล่าสุด (effective_date) กรองเฉพาะเอกสารสถานะ active เท่านั้น และอัปเดตแบบ Incremental",
    specs: [
      "รองรับทั้ง Supabase Cloud และ PostgreSQL Docker (/home/ovec_guru/pgdata)",
      "Auto-Archive ประกาศฉบับเดิมเมื่อนำเข้าฉบับแทนที่",
      "บันทึกคำถามที่ไม่มีคำตอบลงตาราง knowledge_gaps อัตโนมัติ",
    ],
  },
  {
    id: "cloudai",
    step: "05",
    title: "OpenAI-Compatible Cloud AI Gateway",
    subtitle: "Zero AVX / Zero PyTorch (Gemini / OpenAI / Typhoon)",
    icon: Cloud,
    summary:
      "ออกแบบมาเพื่อซีพียู Intel Xeon X3440 ที่ไม่มีชุดคำสั่ง AVX/AVX2 โดยไม่ติดตั้ง PyTorch หรือ sentence-transformers เชื่อมต่อทั้ง Embedding และ Streaming LLM ผ่าน httpx ตามค่าใน .env",
    specs: [
      "สลับผู้ให้บริการ Gemini, OpenAI หรือ Typhoon ได้ทันทีผ่าน .env",
      "Strict Grounding System Prompt ห้ามแต่งคำตอบนอกเหนือเอกสาร",
      "ส่งคำตอบแบบ Server-Sent Events (SSE) ลดเวลารอของผู้ใช้",
    ],
  },
];

const BEST_PRACTICES = [
  {
    icon: Cpu,
    title: "1. Zero-AVX & Low-RAM Architecture",
    desc: "หลีกเลี่ยงไลบรารีหนักอย่าง PyTorch/sentence-transformers 100% เพื่อรันเสถียรบน Xeon X3440 และ RAM ว่าง 3.6 GB",
  },
  {
    icon: HardDrive,
    title: "2. Storage Isolation ใต้ /home/ovec_guru",
    desc: "ย้ายไฟล์อัปโหลด, แคช pip/npm, ไฟล์ชั่วคราว Nginx/Poppler, log และ pgdata ไปพาร์ทิชัน /home (384 GB) ป้องกันพาร์ทิชัน / (4.7 GB) เต็ม",
  },
  {
    icon: FileScan,
    title: "3. Human-in-the-Loop Thai OCR",
    desc: "ตรวจทานข้อความภาษาไทยที่สกัดจากเอกสารราชการสแกน พร้อมดูตัวอย่างการหั่น Chunk ตามหมวด/ข้อก่อนนำเข้าคลังจริง",
  },
  {
    icon: Database,
    title: "4. Incremental Update & Auto-Archive",
    desc: "แปลงเวกเตอร์เฉพาะเอกสารใหม่ไม่ต้อง Re-index ทั้งฐานข้อมูล และปรับสถานะประกาศเก่าเป็น archived อัตโนมัติเมื่อแทนที่",
  },
  {
    icon: ShieldCheck,
    title: "5. Strict Grounding & Knowledge Gap Loop",
    desc: "ตอบเฉพาะจากเอกสาร active ที่คะแนนถึงเกณฑ์ หากไม่พบให้บันทึกเข้า Knowledge Gaps เพื่อนำมาร่างเอกสารเติมคลังความรู้",
  },
  {
    icon: Server,
    title: "6. Primary Super Admin Governance",
    desc: "บังคับกฎเหล็กห้ามลบ/ระงับ Super Admin คนสุดท้าย และควบคุมสิทธิ์ของ Knowledge Admin / OCR Reviewer แบบรวมศูนย์จากฐานข้อมูล",
  },
];

export default function AdminArchitectureTab() {
  const [selectedId, setSelectedId] = useState("frontend");
  const [health, setHealth] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch {
      setHealth({ status: "offline", database_connected: false, pgvector_enabled: false });
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const selectedComp =
    ARCH_COMPONENTS.find((c) => c.id === selectedId) || ARCH_COMPONENTS[0];
  const SelectedIcon = selectedComp.icon;

  return (
    <div className="space-y-6">
      {/* Live Vector DB & Cloud AI Connection Status */}
      <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <Server className="w-5 h-5 text-ovec-maroon" />
            สถานะการเชื่อมต่อฐานข้อมูล Vector และ Cloud AI API ปัจจุบัน
          </h3>
          <button
            type="button"
            onClick={loadHealth}
            disabled={loadingHealth}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? "animate-spin" : ""}`} />
            ตรวจสอบล่าสุด
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-stone-200 bg-ovec-cream/60 p-3.5">
            <div className="text-[11px] font-semibold text-stone-500">Backend API</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-sm font-bold">
              {health?.status === "ok" ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-800">ออนไลน์ ({health.environment})</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span className="text-rose-800">{health?.status || "ออฟไลน์"}</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-ovec-cream/60 p-3.5">
            <div className="text-[11px] font-semibold text-stone-500">ฐานข้อมูล &amp; pgvector</div>
            <div className="mt-1.5 text-sm font-bold text-stone-900">
              {health?.database_connected
                ? health.database_dialect === "postgresql"
                  ? health.pgvector_enabled
                    ? "PostgreSQL + pgvector พร้อมใช้"
                    : "PostgreSQL (ยังไม่เปิด pgvector)"
                  : `${health.database_dialect} (โหมดพัฒนาในเครื่อง)`
                : "ไม่ได้เชื่อมต่อ"}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-ovec-cream/60 p-3.5">
            <div className="text-[11px] font-semibold text-stone-500">Cloud LLM / Embedding</div>
            <div className="mt-1.5 text-xs font-bold text-ovec-dark truncate">
              Chat: {health?.ai_chat_model || "-"}
            </div>
            <div className="text-[11px] text-stone-600 truncate">
              Embed: {health?.ai_embedding_model || "-"}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-ovec-cream/60 p-3.5">
            <div className="text-[11px] font-semibold text-stone-500">พาธจัดเก็บไฟล์ (UPLOAD_DIR)</div>
            <div className="mt-1.5 text-xs font-mono font-semibold text-stone-800 break-all">
              {health?.upload_dir || "/home/ovec_guru/uploads"}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive 5-Component RAG Architecture Diagram */}
      <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-card space-y-4">
        <div>
          <h3 className="text-base font-bold text-stone-900">
            แผนผังโต้ตอบโครงสร้างระบบ RAG 5 ส่วนประกอบของ OVEC GURU
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            คลิกที่แต่ละส่วนประกอบเพื่อดูรายละเอียดการทำงานและข้อกำหนดด้านโครงสร้างพื้นฐาน
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {ARCH_COMPONENTS.map((comp) => {
            const Icon = comp.icon;
            const active = comp.id === selectedId;
            return (
              <button
                key={comp.id}
                type="button"
                onClick={() => setSelectedId(comp.id)}
                className={`text-left rounded-2xl p-4 border transition-all flex flex-col justify-between gap-3 ${
                  active
                    ? "ovec-header-gradient text-white border-ovec-gold ring-2 ring-amber-300 shadow-md"
                    : "bg-ovec-cream/60 hover:bg-white border-stone-200 hover:border-ovec-maroon/40 text-stone-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      active ? "bg-amber-400/25 text-amber-200" : "bg-rose-100 text-ovec-maroon"
                    }`}
                  >
                    ส่วนที่ {comp.step}
                  </span>
                  <Icon
                    className={`w-5 h-5 ${active ? "text-amber-300" : "text-ovec-maroon"}`}
                  />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold leading-snug">{comp.title}</div>
                  <div
                    className={`text-[11px] mt-1 ${
                      active ? "text-rose-100" : "text-stone-500"
                    }`}
                  >
                    {comp.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Component Detail Box */}
        <div className="rounded-2xl bg-ovec-paper border border-amber-200 p-5 flex flex-col md:flex-row gap-4 items-start">
          <div className="w-12 h-12 rounded-2xl bg-ovec-maroon text-amber-300 flex items-center justify-center shrink-0">
            <SelectedIcon className="w-6 h-6" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-ovec-maroon bg-rose-50 px-2.5 py-0.5 rounded-full">
                ส่วนที่ {selectedComp.step}
              </span>
              <h4 className="text-base font-bold text-stone-900">{selectedComp.title}</h4>
            </div>
            <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
              {selectedComp.summary}
            </p>
            <ul className="pt-1 space-y-1">
              {selectedComp.specs.map((sp, i) => (
                <li key={i} className="text-xs text-stone-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{sp}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 6 Best Practice Cards */}
      <div>
        <h3 className="text-base font-bold text-stone-900 mb-3">
          แนวปฏิบัติสำคัญ 6 ข้อของสถาปัตยกรรม OVEC GURU
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BEST_PRACTICES.map((bp, idx) => {
            const Icon = bp.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-white border border-stone-200 p-4 shadow-card space-y-2"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-ovec-maroon flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-stone-900">{bp.title}</h4>
                <p className="text-xs text-stone-600 leading-relaxed">{bp.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
