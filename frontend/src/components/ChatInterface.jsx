import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  GraduationCap,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  SearchCheck,
  SendHorizontal,
  Square,
  UserCheck,
} from "lucide-react";
import { streamChatApi } from "../lib/api";
import CitationsSection from "./CitationCard";
import FormattedAnswer from "./FormattedAnswer";
import SourceViewer from "./SourceViewer";

const SAMPLE_QUESTIONS = [
  {
    group: "ผู้บริหารสถานศึกษา",
    icon: Building2,
    question: "แนวทางการจัดการอาชีวศึกษาระบบทวิภาคีและการทำ MOU กับสถานประกอบการมีเกณฑ์อย่างไร",
  },
  {
    group: "ครูและบุคลากรอาชีวศึกษา",
    icon: UserCheck,
    question: "หลักเกณฑ์และวิธีการประเมินเพื่อขอมีหรือเลื่อนวิทยฐานะข้าราชการครู สอศ. กำหนดไว้อย่างไร",
  },
  {
    group: "เจ้าหน้าที่การเงินและพัสดุ",
    icon: Briefcase,
    question: "ระเบียบการใช้จ่ายเงินรายได้สถานศึกษาและการเบิกจ่ายค่าฝึกอบรมมีเงื่อนไขอะไรบ้าง",
  },
  {
    group: "นักเรียน นักศึกษา และผู้ปกครอง",
    icon: GraduationCap,
    question: "เงื่อนไขการวัดและประเมินผลการเรียนระดับ ปวช. ปวส. และการขอทุน กยศ. เป็นอย่างไร",
  },
];

export default function ChatInterface({ categories = [], categoriesLoading = false }) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const [avatarSrc, setAvatarSrc] = useState(`${baseUrl}assets/ovec-logo.png`);
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
        selectedCitationDocId: null,
        perDocAnswers: {},
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
                ? `พบเอกสารบังคับใช้ล่าสุด ${meta.citations?.length || 0} ฉบับ (คะแนนความเกี่ยวข้อง ${scorePct}%)`
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

  const handleSelectCitationAnswer = async (msg, citation) => {
    if (!citation) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, selectedCitationDocId: null } : m
        )
      );
      return;
    }

    const docId = citation.document_id;
    const existing = msg.perDocAnswers?.[docId];

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, selectedCitationDocId: docId } : m
      )
    );

    if (existing && (existing.content || existing.streaming)) {
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              perDocAnswers: {
                ...(m.perDocAnswers || {}),
                [docId]: { content: "", streaming: true, error: null },
              },
            }
          : m
      )
    );

    try {
      await streamChatApi({
        question: msg.question,
        documentId: docId,
        onToken: (deltaText) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msg.id) return m;
              const current = m.perDocAnswers?.[docId] || { content: "", streaming: true, error: null };
              return {
                ...m,
                perDocAnswers: {
                  ...(m.perDocAnswers || {}),
                  [docId]: { ...current, content: current.content + deltaText },
                },
              };
            })
          );
        },
        onError: (errMsg) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msg.id) return m;
              const current = m.perDocAnswers?.[docId] || { content: "", streaming: false, error: null };
              return {
                ...m,
                perDocAnswers: {
                  ...(m.perDocAnswers || {}),
                  [docId]: { ...current, streaming: false, error: errMsg },
                },
              };
            })
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msg.id) return m;
              const current = m.perDocAnswers?.[docId] || { content: "", streaming: false, error: null };
              return {
                ...m,
                perDocAnswers: {
                  ...(m.perDocAnswers || {}),
                  [docId]: { ...current, streaming: false },
                },
              };
            })
          );
        },
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msg.id) return m;
          const current = m.perDocAnswers?.[docId] || { content: "", streaming: false, error: null };
          return {
            ...m,
            perDocAnswers: {
              ...(m.perDocAnswers || {}),
              [docId]: {
                ...current,
                streaming: false,
                error: err.message || "ไม่สามารถดึงคำตอบจากเอกสารฉบับนี้ได้",
              },
            },
          };
        })
      );
    }
  };

  return (
    <div className="flex flex-1 min-h-[calc(100vh-76px)] max-w-[1440px] w-full mx-auto">
      {/* Left / Main Chat Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Quick Filter Chips Bar + New Chat Button */}
        <div className="bg-ovec-paper/95 backdrop-blur-sm border-b border-stone-200 px-4 sm:px-6 py-2.5 sticky top-[72px] z-20">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategoryId(null)}
                className={`shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors border ${
                  selectedCategoryId === null
                    ? "bg-ovec-maroon text-white border-ovec-maroon"
                    : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:text-ovec-maroon"
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
                    className={`shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors border ${
                      selectedCategoryId === cat.id
                        ? "bg-ovec-maroon text-white border-ovec-maroon"
                        : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:text-ovec-maroon"
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
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors"
              title="เริ่มบทสนทนาใหม่"
            >
              <RotateCcw className="w-4 h-4 text-stone-500" strokeWidth={1.75} />
              <span className="hidden sm:inline">เริ่มบทสนทนาใหม่</span>
            </button>
          </div>
        </div>

        {/* Scrollable Chat Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.length === 0 ? (
              /* Calm Archival Reference Desk Empty State */
              <div className="py-2 sm:py-6 space-y-6">
                <div className="rounded-2xl bg-white border border-stone-200 border-t-[3px] border-t-ovec-gold shadow-card p-6 sm:p-8">
                  <div className="max-w-2xl">
                    <div className="text-xs font-medium text-ovec-maroon mb-2">
                      คลังระเบียบและแนวปฏิบัติ สำนักงานคณะกรรมการการอาชีวศึกษา
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-semibold text-stone-900 leading-snug">
                      ค้นหาข้อมูลได้ไว ตอบได้ครบ จบในที่เดียว
                    </h2>
                    <p className="mt-3 text-sm sm:text-base text-stone-600 leading-relaxed">
                      สอบถามระเบียบ ประกาศ หลักสูตร งานบุคคล การเงินพัสดุ และกิจการนักเรียนนักศึกษาของ สอศ.
                      ระบบสืบค้นเฉพาะเอกสารที่บังคับใช้ล่าสุด พร้อมระบุหมวด ข้อ และไฮไลต์ต้นฉบับให้ตรวจสอบได้ทันที
                    </p>
                  </div>

                  {/* 4 User Group Sample Prompts */}
                  <div className="mt-6 pt-6 border-t border-stone-200/80">
                    <div className="text-xs font-medium text-stone-500 mb-3">
                      คำถามตัวอย่างสำหรับ 4 กลุ่มผู้ใช้งาน
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {SAMPLE_QUESTIONS.map((item, idx) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => sendQuestion(item.question)}
                            className="group text-left rounded-xl border border-stone-200 bg-ovec-paper hover:bg-white hover:border-ovec-maroon/40 p-4 transition-colors flex items-start gap-3"
                          >
                            <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-600 group-hover:border-ovec-maroon/30 group-hover:text-ovec-maroon transition-colors flex items-center justify-center shrink-0 mt-0.5">
                              <Icon className="w-4 h-4" strokeWidth={1.75} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-stone-900 group-hover:text-ovec-maroon transition-colors">
                                {item.group}
                              </div>
                              <div className="mt-1 text-sm text-stone-600 leading-relaxed line-clamp-2">
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
                      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-md bg-ovec-maroon text-white px-4 py-3 shadow-sm">
                        {msg.categoryLabel && msg.categoryLabel !== "ทั้งหมด" && (
                          <div className="text-xs text-amber-200/90 mb-1 font-medium">
                            หมวดหมู่: {msg.categoryLabel}
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
                const selectedDocId = msg.selectedCitationDocId ?? null;
                const selectedCitationObj =
                  selectedDocId !== null
                    ? meta?.citations?.find((c) => c.document_id === selectedDocId)
                    : null;
                const activeView =
                  selectedDocId !== null && msg.perDocAnswers?.[selectedDocId]
                    ? msg.perDocAnswers[selectedDocId]
                    : { content: msg.content, streaming: msg.streaming, error: msg.error };

                return (
                  <div key={msg.id} className="flex items-start gap-3">
                    <div className="shrink-0 w-9 h-9 rounded-full bg-white border border-stone-200 p-0.5 shadow-sm mt-0.5 overflow-hidden flex items-center justify-center">
                      <img
                        src={avatarSrc}
                        onError={() => setAvatarSrc(`${baseUrl}assets/ovec-logo.svg`)}
                        alt="OVEC GURU"
                        className="w-full h-full object-cover rounded-full"
                      />
                    </div>

                    <div className="flex-1 min-w-0 space-y-3">
                      {/* Quiet RAG Trace Line */}
                      {msg.traceStage && (
                        <div className="inline-flex items-center gap-2 text-xs text-stone-500">
                          {activeView.streaming ? (
                            <Loader2 className="w-3.5 h-3.5 text-ovec-maroon animate-spin shrink-0" />
                          ) : (
                            <SearchCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
                          )}
                          <span className="tabular-nums">{msg.traceStage}</span>
                        </div>
                      )}

                      {/* Knowledge Gap Alert */}
                      {isGap && (
                        <div className="rounded-xl border border-amber-300/80 bg-amber-50/70 px-4 py-3 flex items-start gap-2.5 text-sm text-amber-950">
                          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-1" strokeWidth={1.75} />
                          <div>
                            <div className="font-semibold tabular-nums">
                              บันทึกเข้าสู่รายการ Knowledge Gap แล้ว (ถามซ้ำ {meta.asked_count || 1} ครั้ง)
                            </div>
                            <p className="text-xs text-amber-900/90 mt-0.5 leading-relaxed">
                              ระบบยึดหลัก Strict Grounding จึงไม่แต่งคำตอบเอง และแจ้งผู้ดูแลคลังความรู้เพื่อนำเข้าเอกสารที่เกี่ยวข้องเพิ่มเติมแล้ว
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Assistant Answer Card */}
                      <div className="rounded-2xl rounded-tl-md bg-white border border-stone-200 px-5 py-4 shadow-card">
                        {selectedCitationObj && (
                          <div className="mb-3 pb-2.5 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-ovec-maroon">
                              แสดงคำตอบเฉพาะจาก: <strong className="font-semibold">{selectedCitationObj.title}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSelectCitationAnswer(msg, null)}
                              className="text-xs font-medium text-stone-600 hover:text-ovec-maroon underline transition-colors"
                            >
                              กลับไปดูสรุปรวมทุกเอกสาร
                            </button>
                          </div>
                        )}

                        {activeView.content ? (
                          <FormattedAnswer
                            content={activeView.content}
                            streaming={activeView.streaming}
                          />
                        ) : activeView.streaming ? (
                          <div className="flex items-center gap-2 text-sm text-stone-500">
                            <Loader2 className="w-4 h-4 animate-spin text-ovec-maroon" />
                            {selectedCitationObj
                              ? `กำลังสรุปคำตอบเฉพาะจาก "${selectedCitationObj.title}"...`
                              : "กำลังประมวลผลและเรียบเรียงคำตอบ..."}
                          </div>
                        ) : null}

                        {activeView.error && (
                          <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-800">
                            {activeView.error}
                          </div>
                        )}
                      </div>

                      {/* Uniform Compact Adaptive Citation Grid */}
                      {meta?.citations?.length > 0 && (
                        <CitationsSection
                          citations={meta.citations}
                          question={msg.question}
                          displayedAnswer={activeView.content}
                          selectedDocId={selectedDocId}
                          onSelectDocAnswer={(cit) => handleSelectCitationAnswer(msg, cit)}
                          onOpenSource={(cit) => setActiveSource(cit)}
                        />
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
        <div className="bg-ovec-paper/95 backdrop-blur-sm border-t border-stone-200 px-4 sm:px-6 py-3 sticky bottom-0 z-20">
          <div className="max-w-4xl mx-auto">
            {speechHint && (
              <div className="mb-2 text-xs font-medium text-ovec-maroon flex items-center gap-2 px-1">
                {isListening && (
                  <span className="w-2 h-2 rounded-full bg-red-600" />
                )}
                {speechHint}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-xl bg-white border border-stone-300 focus-within:border-ovec-maroon focus-within:ring-2 focus-within:ring-ovec-maroon/15 p-2 shadow-sm transition-colors">
              <button
                type="button"
                onClick={toggleVoiceInput}
                disabled={isStreaming}
                title="พูดถามด้วยเสียงภาษาไทย (th-TH)"
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isListening
                    ? "bg-red-600 text-white"
                    : "bg-stone-100 hover:bg-stone-200/80 text-stone-700"
                } disabled:opacity-50`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-4 h-4" strokeWidth={1.75} />
                    <span className="hidden sm:inline">หยุดฟัง</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" strokeWidth={1.75} />
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
                placeholder="พิมพ์คำถามเกี่ยวกับระเบียบ หลักสูตร หรือแนวปฏิบัติ สอศ."
                className="flex-1 resize-none bg-transparent border-0 focus:outline-none focus:ring-0 text-base text-stone-800 placeholder:text-stone-400 py-2 px-1.5 max-h-36"
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStopStreaming}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-stone-800 hover:bg-stone-900 text-white px-3.5 py-2 text-xs font-medium transition-colors"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>หยุด</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => sendQuestion()}
                  disabled={!input.trim()}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-ovec-maroon hover:bg-ovec-dark disabled:bg-stone-300 text-white px-4 py-2 text-sm font-medium transition-colors"
                >
                  <span>ส่งคำถาม</span>
                  <SendHorizontal className="w-4 h-4" strokeWidth={1.75} />
                </button>
              )}
            </div>

            <div className="mt-1.5 text-xs text-stone-400 text-center">
              ตอบคำถามจากเอกสารที่บังคับใช้ล่าสุดเท่านั้น • กด Shift+Enter เพื่อขึ้นบรรทัดใหม่
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
