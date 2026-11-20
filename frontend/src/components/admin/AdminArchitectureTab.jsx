import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  Eye,
  EyeOff,
  FileScan,
  HardDrive,
  KeyRound,
  Layout,
  Loader2,
  PlugZap,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  fetchAiConfigApi,
  fetchHealth,
  testAiConfigApi,
  updateAiConfigApi,
} from "../../lib/api";

const AI_PRESETS = [
  {
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    chatModel: "gemini-2.5-flash",
    embeddingModel: "gemini-embedding-001",
  },
  {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
  },
  {
    name: "Typhoon (SCB 10X)",
    baseUrl: "https://api.opentyphoon.ai/v1",
    chatModel: "typhoon-v2.1-12b-instruct",
    embeddingModel: "text-embedding-004",
  },
];

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

export default function AdminArchitectureTab({ token, user }) {
  const isSuperAdmin = user?.role === "super_admin";

  const [selectedId, setSelectedId] = useState("frontend");
  const [health, setHealth] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  // Cloud AI API Config state (Super Admin)
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyMasked, setApiKeyMasked] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [chatModel, setChatModel] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [minScore, setMinScore] = useState(0.42);
  const [savingAi, setSavingAi] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiNotice, setAiNotice] = useState(null);

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

  const loadAiConfig = useCallback(async () => {
    if (!token || !isSuperAdmin) return;
    try {
      const cfg = await fetchAiConfigApi(token);
      setApiBaseUrl(cfg.ai_api_base_url || "");
      setApiKeyMasked(cfg.ai_api_key_masked || "");
      setApiKeyConfigured(Boolean(cfg.ai_api_key_configured));
      setChatModel(cfg.ai_chat_model || "");
      setEmbeddingModel(cfg.ai_embedding_model || "");
      setMinScore(cfg.rag_min_relevance_score ?? 0.42);
    } catch {
      // ignore if non-super-admin
    }
  }, [token, isSuperAdmin]);

  useEffect(() => {
    loadHealth();
    loadAiConfig();
  }, [loadHealth, loadAiConfig]);

  const handleSaveAiConfig = async (e) => {
    e.preventDefault();
    setSavingAi(true);
    setAiNotice(null);
    try {
      const updated = await updateAiConfigApi(token, {
        ai_api_base_url: apiBaseUrl.trim(),
        ai_api_key: apiKeyInput.trim() || undefined,
        ai_chat_model: chatModel.trim(),
        ai_embedding_model: embeddingModel.trim(),
        rag_min_relevance_score: Number(minScore),
      });
      setApiKeyInput("");
      setApiKeyMasked(updated.ai_api_key_masked || "");
      setApiKeyConfigured(Boolean(updated.ai_api_key_configured));
      setAiNotice({
        type: "success",
        text: "บันทึกการตั้งค่า Cloud AI API ลงไฟล์ .env เรียบร้อยแล้ว และมีผลใช้งานทันทีทุก Worker!",
      });
      await loadHealth();
    } catch (err) {
      setAiNotice({ type: "error", text: err.message });
    } finally {
      setSavingAi(false);
    }
  };

  const handleTestAiConfig = async () => {
    setTestingAi(true);
    setAiNotice(null);
    try {
      const res = await testAiConfigApi(token);
      setAiNotice({ type: "success", text: res.message });
    } catch (err) {
      setAiNotice({ type: "error", text: err.message });
    } finally {
      setTestingAi(false);
    }
  };

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
            <div className="mt-1">
              {health?.ai_api_key_configured ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" /> ตั้งค่า API Key แล้ว
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                  <AlertTriangle className="w-3 h-3" /> ยังไม่ได้ตั้งค่า API Key
                </span>
              )}
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

      {/* Cloud AI API Key & Model Configuration (Super Admin Only) */}
      {isSuperAdmin && (
        <div className="rounded-2xl bg-white border-2 border-amber-300/80 shadow-card overflow-hidden">
          <div className="ovec-header-gradient px-5 py-3.5 text-white flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-300" />
              <h3 className="text-sm sm:text-base font-bold">
                ตั้งค่า Cloud AI API Key (OpenAI-Compatible: Gemini / OpenAI / Typhoon)
              </h3>
            </div>
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                apiKeyConfigured
                  ? "bg-emerald-500/20 border-emerald-300/50 text-emerald-100"
                  : "bg-amber-400/20 border-amber-300/50 text-amber-100"
              }`}
            >
              {apiKeyConfigured
                ? `พร้อมใช้งาน (${apiKeyMasked})`
                : "ยังไม่ได้ตั้งค่า AI_API_KEY"}
            </span>
          </div>

          <form onSubmit={handleSaveAiConfig} className="p-5 space-y-4">
            {aiNotice && (
              <div
                className={`rounded-xl px-4 py-2.5 text-xs sm:text-sm flex items-center gap-2 border ${
                  aiNotice.type === "error"
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : "bg-emerald-50 border-emerald-200 text-emerald-900"
                }`}
              >
                {aiNotice.type === "error" ? (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span>{aiNotice.text}</span>
              </div>
            )}

            {/* Quick Provider Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-stone-600">เลือกค่าเริ่มต้นผู้ให้บริการ:</span>
              {AI_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setApiBaseUrl(preset.baseUrl);
                    setChatModel(preset.chatModel);
                    setEmbeddingModel(preset.embeddingModel);
                  }}
                  className="rounded-full border border-stone-300 bg-ovec-cream hover:border-ovec-maroon hover:text-ovec-maroon px-3 py-1 text-xs font-semibold text-stone-700 transition"
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  AI API Base URL *
                </label>
                <input
                  type="url"
                  required
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="https://generativelanguage.googleapis.com/v1beta/openai/"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs sm:text-sm font-mono focus:border-ovec-maroon focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  AI API Key {apiKeyConfigured ? "(เว้นว่างหากใช้คีย์เดิม)" : "*"}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    required={!apiKeyConfigured}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      apiKeyConfigured
                        ? `คีย์ปัจจุบัน: ${apiKeyMasked} (กรอกใหม่เพื่อเปลี่ยน)`
                        : "วาง API Key ของ Gemini / OpenAI / Typhoon ที่นี่..."
                    }
                    className="w-full rounded-xl border border-stone-300 pl-3.5 pr-10 py-2 text-xs sm:text-sm font-mono focus:border-ovec-maroon focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2.5 top-2 text-stone-400 hover:text-stone-700"
                    title={showKey ? "ซ่อนคีย์" : "แสดงคีย์"}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Chat LLM Model *
                </label>
                <input
                  type="text"
                  required
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  placeholder="gemini-2.5-flash"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs sm:text-sm font-mono focus:border-ovec-maroon focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Embedding Model *
                </label>
                <input
                  type="text"
                  required
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  placeholder="text-embedding-004"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs sm:text-sm font-mono focus:border-ovec-maroon focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={savingAi}
                className="inline-flex items-center gap-2 rounded-xl bg-ovec-maroon hover:bg-ovec-dark text-white px-4 py-2 text-xs sm:text-sm font-semibold shadow-sm transition disabled:opacity-60"
              >
                {savingAi ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 text-amber-300" />
                )}
                บันทึกการตั้งค่าลง .env (มีผลทันที)
              </button>

              <button
                type="button"
                onClick={handleTestAiConfig}
                disabled={testingAi || !apiKeyConfigured}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 px-4 py-2 text-xs sm:text-sm font-semibold transition disabled:opacity-50"
              >
                {testingAi ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlugZap className="w-4 h-4 text-emerald-700" />
                )}
                ทดสอบการเชื่อมต่อ API
              </button>
            </div>
          </form>
        </div>
      )}

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
