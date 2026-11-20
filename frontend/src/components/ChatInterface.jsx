import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Briefcase,
  Building2,
  GraduationCap,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  SearchCheck,
  SendHorizontal,
  Sparkles,
  Square,
  UserCheck,
} from "lucide-react";
import { streamChatApi } from "../lib/api";
import CitationCard from "./CitationCard";
import SourceViewer from "./SourceViewer";

const SAMPLE_QUESTIONS = [
  {
    group: "ผู้บริหารสถานศึกษา",
    icon: Building2,
    question: "แนวทางการจัดการอาชีวศึกษาระบบทวิภาคีและการทำ MOU กับสถานประกอบการมีเกณฑ์อย่างไร?",
  },
  {
    group: "ครูและบุคลากรอาชีวศึกษา",
    icon: UserCheck,
    question: "หลักเกณฑ์และวิธีการประเมินเพื่อขอมีหรือเลื่อนวิทยฐานะข้าราชการครู สอศ. กำหนดไว้อย่างไร?",
  },
  {
    group: "เจ้าหน้าที่การเงินและพัสดุ",
    icon: Briefcase,
    question: "ระเบียบการใช้จ่ายเงินรายได้สถานศึกษาและการเบิกจ่ายค่าฝึกอบรมมีเงื่อนไขอะไรบ้าง?",
  },
  {
    group: "นักเรียน นักศึกษา และผู้ปกครอง",
    icon: GraduationCap,
    question: "เงื่อนไขการวัดและประเมินผลการเรียนระดับ ปวช. ปวส. และการขอทุน กยศ. เป็นอย่างไร?",
  },
];

export default function ChatInterface({ categories = [], categoriesLoading = false }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeSource, setActiveSource] = useState(null);

  // Web Speech API (th-TH)
  const [isListening, setIsListening] = useState(false);
  const [speechHint, setSpeechHint] = useState("");
  const recognitionRef = useRef(null);

  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      recognitionRef.current?.stop?.();
    };
  }, []);

  const handleNewChat = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setMessages([]);
    setActiveSource(null);
    setSpeechHint("");
    textareaRef.current?.focus();
  };

  const toggleVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechHint("เบราว์เซอร์นี้ยังไม่รองรับการพูดถามด้วยเสียง (แนะนำใช้ Chrome หรือ Edge)");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    setSpeechHint("");
    const recognition = new SpeechRecognition();
    recognition.lang = "th-TH";
    recognition.interimResults = true;
    recognition.continuous = false;

    const baseText = input.trim();

    recognition.onstart = () => {
      setIsListening(true);
      setSpeechHint("กำลังรับฟังเสียงภาษาไทย (th-TH)...");
    };

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setInput(baseText ? `${baseText} ${transcript}` : transcript);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error === "not-allowed") {
        setSpeechHint("กรุณาอนุญาตสิทธิ์การใช้ไมโครโฟนในเบราว์เซอร์ก่อนพูดถาม");
      } else {
        setSpeechHint("ไม่ได้ยินเสียงหรือเกิดข้อผิดพลาด กรุณาลองกดพูดถามใหม่อีกครั้ง");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setSpeechHint("");
      textareaRef.current?.focus();
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const sendQuestion = async (rawQuestion) => {
    const trimmed = (rawQuestion ?? input).trim();
    if (!trimmed || isStreaming) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const userMsgId = `u-${Date.now()}`;
    const botMsgId = `b-${Date.now() + 1}`;
    const selectedCategoryObj = categories.find((c) => c.id === selectedCategoryId);

    setInput("");
    setSpeechHint("");
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: trimmed,
        categoryLabel: selectedCategoryObj ? selectedCategoryObj.name : "ทั้งหมด",
      },
      {
        id: botMsgId,
        role: "assistant",
        question: trimmed,
        content: "",
        streaming: true,
        traceStage: "กำลังสืบค้น Hybrid Search (Vector + Keyword + เอกสารบังคับใช้ล่าสุด)...",
        metadata: null,
        error: null,
      },
    ]);

    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamChatApi({
        question: trimmed,
        categoryId: selectedCategoryId,
        signal: controller.signal,
        onMetadata: (meta) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== botMsgId) return m;
              const scorePct = Math.round((meta.top_score || 0) * 100);
              const traceStage = meta.grounded
                ? `พบเอกสารบังคับใช้ล่าสุด ${meta.citations?.length || 0} ฉบับ (คะแนนความเกี่ยวข้อง ${scorePct}%) • กำลังสรุปคำตอบตามหลัก Strict Grounding`
                : `ไม่พบเอกสารที่มีคะแนนถึงเกณฑ์ (สูงสุด ${scorePct}%) • บันทึกเข้า Knowledge Gap แล้ว`;
              return {
                ...m,
                metadata: meta,
                traceStage,
              };
            })
          );
        },
        onToken: (deltaText) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId ? { ...m, content: m.content + deltaText } : m
            )
          );
        },
        onError: (errMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId ? { ...m, error: errMsg } : m
            )
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId ? { ...m, streaming: false } : m
            )
          );
        },
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId
              ? {
                  ...m,
                  streaming: false,
                  error: err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ",
                }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId ? { ...m, streaming: false } : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  };

  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div className="flex flex-1 min-h-[calc(100vh-76px)] max-w-[1440px] w-full mx-auto">
      {/* Left / Main Chat Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Quick Filter Chips Bar + New Chat Button */}
        <div className="bg-ovec-paper/95 backdrop-blur-sm border-b border-stone-200/90 px-3 sm:px-6 py-2.5 sticky top-[68px] sm:top-[73px] z-20">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategoryId(null)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all border ${
                  selectedCategoryId === null
                    ? "bg-ovec-maroon text-white border-ovec-maroon shadow-sm"
                    : "bg-white text-stone-700 border-stone-200 hover:border-ovec-maroon/40 hover:text-ovec-maroon"
                }`}
              >
                ทั้งหมด
              </button>

              {categoriesLoading ? (
                <span className="text-sm text-stone-400 px-2">กำลังโหลดหมวดหมู่...</span>
              ) : (
                categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all border ${
                      selectedCategoryId === cat.id
                        ? "bg-ovec-maroon text-white border-ovec-maroon shadow-sm"
                        : "bg-white text-stone-700 border-stone-200 hover:border-ovec-maroon/40 hover:text-ovec-maroon"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={handleNewChat}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition"
              title="เริ่มบทสนทนาใหม่"
            >
              <RotateCcw className="w-3.5 h-3.5 text-ovec-maroon" />
              <span className="hidden sm:inline">เริ่มบทสนทนาใหม่</span>
            </button>
          </div>
        </div>

        {/* Scrollable Chat Body */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-5 sm:py-6">
          <div className="max-w-4xl mx-auto space-y-5">
            {messages.length === 0 ? (
              /* Welcome Card + 4 User-Group Sample Questions */
              <div className="space-y-6 py-2 sm:py-4">
                <div className="rounded-3xl bg-white border border-stone-200/90 shadow-soft overflow-hidden">
                  <div className="ovec-header-gradient px-6 py-6 sm:px-8 sm:py-7 text-white relative">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-amber-300/40 px-3 py-1 text-xs font-medium text-amber-200 mb-3">
                      <Sparkles className="w-3.5 h-3.5" />
                      ผู้ช่วยค้นหาระเบียบและคลังความรู้ สอศ. แบบอ้างอิงเอกสารจริง
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                      ยินดีต้อนรับสู่ OVEC GURU
                    </h2>
                    <p className="mt-2 text-lg sm:text-xl font-semibold text-amber-300">
                      “ค้นหาข้อมูลได้ไว ตอบได้ครบ จบในที่เดียว”
                    </p>
                    <p className="mt-2.5 text-sm sm:text-base text-rose-100/95 max-w-2xl leading-relaxed">
                      สอบถามระเบียบ ประกาศ หลักสูตร งานบุคคล การเงินพัสดุ และกิจการนักเรียนนักศึกษาของ สอศ.
                      ระบบจะสืบค้นเฉพาะเอกสารที่บังคับใช้ล่าสุด พร้อมแนบการ์ดอ้างอิงและไฮไลต์จุดที่ใช้อ้างอิงให้ตรวจสอบได้ทันที
                    </p>
                  </div>

                  {/* 4 User Group Sample Prompts */}
                  <div className="p-5 sm:p-7 bg-ovec-paper">
                    <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
                      ตัวอย่างคำถามยอดนิยมสำหรับ 4 กลุ่มผู้ใช้งาน
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {SAMPLE_QUESTIONS.map((item, idx) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => sendQuestion(item.question)}
                            className="group text-left rounded-2xl border border-stone-200 bg-white hover:border-ovec-maroon/50 hover:shadow-card p-4 transition-all flex items-start gap-3"
                          >
                            <div className="p-2 rounded-xl bg-rose-50 text-ovec-maroon group-hover:bg-ovec-maroon group-hover:text-amber-300 transition shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-ovec-maroon mb-1">
                                {item.group}
                              </div>
                              <div className="text-sm text-stone-700 leading-relaxed line-clamp-2">
                                {item.question}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Conversation Messages */
              messages.map((msg) => {
                if (msg.role === "user") {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-sm bg-ovec-maroon text-white px-4 py-3 shadow-sm">
                        {msg.categoryLabel && msg.categoryLabel !== "ทั้งหมด" && (
                          <div className="text-[11px] text-amber-200 mb-1 font-medium">
                            หมวดหมู่ที่กรอง: {msg.categoryLabel}
                          </div>
                        )}
                        <p className="text-base leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  );
                }

                const meta = msg.metadata;
                const isGap = meta && meta.grounded === false;

                return (
                  <div key={msg.id} className="flex items-start gap-3">
                    <div className="shrink-0 w-9 h-9 rounded-full bg-ovec-dark text-amber-300 border-2 border-ovec-gold flex items-center justify-center shadow-sm mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-3">
                      {/* RAG Trace Pill */}
                      {msg.traceStage && (
                        <div className="inline-flex items-center gap-2 rounded-xl bg-white border border-stone-200 px-3 py-1.5 text-xs text-stone-600 shadow-sm">
                          {msg.streaming ? (
                            <Loader2 className="w-3.5 h-3.5 text-ovec-maroon animate-spin shrink-0" />
                          ) : (
                            <SearchCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          )}
                          <span>{msg.traceStage}</span>
                        </div>
                      )}

                      {/* Knowledge Gap Alert */}
                      {isGap && (
                        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm text-amber-950">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-semibold">
                              บันทึกเข้าสู่รายการ Knowledge Gap แล้ว (ถามซ้ำ {meta.asked_count || 1} ครั้ง)
                            </div>
                            <p className="text-xs text-amber-900/90 mt-0.5">
                              ระบบยึดหลัก Strict Grounding จึงไม่แต่งคำตอบเอง และแจ้งผู้ดูแลคลังความรู้เพื่อนำเข้าเอกสารที่เกี่ยวข้องเพิ่มเติมแล้ว
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Assistant Answer Bubble */}
                      <div className="rounded-2xl rounded-tl-sm bg-white border border-stone-200/90 px-4 sm:px-5 py-4 shadow-card">
                        {msg.content ? (
                          <div className="text-base text-stone-800 leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                            {msg.streaming && (
                              <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-ovec-maroon animate-pulse rounded-sm" />
                            )}
                          </div>
                        ) : msg.streaming ? (
                          <div className="flex items-center gap-2 text-sm text-stone-500">
                            <Loader2 className="w-4 h-4 animate-spin text-ovec-maroon" />
                            กำลังประมวลผลและเรียบเรียงคำตอบ...
                          </div>
                        ) : null}

                        {msg.error && (
                          <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                            {msg.error}
                          </div>
                        )}
                      </div>

                      {/* Verified Citation & Date Cards */}
                      {meta?.citations?.length > 0 && (
                        <div className="space-y-2.5">
                          <div className="text-xs font-semibold text-stone-500 px-1">
                            แหล่งอ้างอิงที่ตรวจสอบแล้ว ({meta.citations.length} ฉบับ)
                          </div>
                          {meta.citations.map((citation) => (
                            <CitationCard
                              key={citation.document_id}
                              citation={citation}
                              question={msg.question}
                              answer={msg.content}
                              isSelected={
                                activeSource?.document_id === citation.document_id
                              }
                              onOpenSource={(cit) => setActiveSource(cit)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Bottom Sticky Chat Input Composer */}
        <div className="bg-ovec-paper/95 backdrop-blur-sm border-t border-stone-200 px-3 sm:px-6 py-3 sticky bottom-0 z-20">
          <div className="max-w-4xl mx-auto">
            {speechHint && (
              <div className="mb-2 text-xs font-medium text-ovec-maroon flex items-center gap-1.5 px-1">
                {isListening && (
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                )}
                {speechHint}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-2xl bg-white border border-stone-300 focus-within:border-ovec-maroon focus-within:ring-2 focus-within:ring-ovec-maroon/15 p-2 shadow-sm transition">
              <button
                type="button"
                onClick={toggleVoiceInput}
                disabled={isStreaming}
                title="พูดถามด้วยเสียงภาษาไทย (th-TH)"
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  isListening
                    ? "bg-red-600 text-white animate-pulse shadow-sm"
                    : "bg-stone-100 hover:bg-rose-50 text-stone-700 hover:text-ovec-maroon"
                } disabled:opacity-50`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span className="hidden sm:inline">หยุดฟัง</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span className="hidden sm:inline">พูดถาม</span>
                  </>
                )}
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="พิมพ์คำถามเกี่ยวกับระเบียบ หลักสูตร หรือแนวปฏิบัติ สอศ. (กด Enter เพื่อส่ง)..."
                className="flex-1 resize-none bg-transparent border-0 focus:outline-none focus:ring-0 text-base text-stone-800 placeholder:text-stone-400 py-2 px-1.5 max-h-36"
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStopStreaming}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-stone-800 hover:bg-stone-900 text-white px-3.5 py-2 text-xs font-semibold transition"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>หยุด</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => sendQuestion()}
                  disabled={!input.trim()}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-ovec-maroon hover:bg-ovec-dark disabled:bg-stone-300 text-white px-4 py-2 text-xs sm:text-sm font-semibold shadow-sm transition"
                >
                  <span>ส่งคำถาม</span>
                  <SendHorizontal className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="mt-1.5 text-[11px] text-stone-400 text-center">
              OVEC GURU ตอบคำถามจากเอกสารที่บังคับใช้ล่าสุดเท่านั้น • กด Shift+Enter เพื่อขึ้นบรรทัดใหม่
            </div>
          </div>
        </div>
      </div>

      {/* Right Split-Screen Source Viewer */}
      {activeSource && (
        <SourceViewer
          citation={activeSource}
          onClose={() => setActiveSource(null)}
        />
      )}
    </div>
  );
}
