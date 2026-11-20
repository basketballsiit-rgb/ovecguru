import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ExternalLink,
  Eye,
  FilePlus2,
  FileText,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  apiUrl,
  chunkPreviewApi,
  commitDocumentApi,
  createCategoryApi,
  deleteDocumentApi,
  extractPreviewApi,
  fetchDocumentDetailApi,
  fetchDocumentsApi,
  fetchKnowledgeGapsApi,
  reembedDocumentApi,
  updateDocumentApi,
  updateDocumentStatusApi,
  updateKnowledgeGapApi,
} from "../../lib/api";
import { formatThaiDate } from "../../lib/format";

export default function AdminDocumentsTab({
  token,
  user,
  policy,
  groups,
  categories,
  onTaxonomyChanged,
}) {
  // Quick Add Category state
  const [quickGroupId, setQuickGroupId] = useState("");
  const [quickCatName, setQuickCatName] = useState("");
  const [quickCatLoading, setQuickCatLoading] = useState(false);

  // Ingestion / OCR / Chunking state (3 steps)
  const [step, setStep] = useState(1); // 1=Upload, 2=Review OCR & Chunks, 3=Committed
  const [forceOcr, setForceOcr] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [chunking, setChunking] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [title, setTitle] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");
  const [replaceDocId, setReplaceDocId] = useState("");
  const [ingestionType, setIngestionType] = useState("manual");
  const [filePath, setFilePath] = useState("manual://draft");
  const [uploadedInfo, setUploadedInfo] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [chunksPreview, setChunksPreview] = useState([]);
  const [activeGapId, setActiveGapId] = useState(null);

  // Right column: Document repository + Knowledge Gaps
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [filterCatId, setFilterCatId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [gaps, setGaps] = useState([]);
  const [gapsLoading, setGapsLoading] = useState(true);

  // Document CRUD Modals (View Chunks / Edit Metadata / Re-embed)
  const [viewingDoc, setViewingDoc] = useState(null);
  const [viewingLoading, setViewingLoading] = useState(false);
  const [reembeddingId, setReembeddingId] = useState(null);

  const [editingDoc, setEditingDoc] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editEffectiveDate, setEditEffectiveDate] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [notice, setNotice] = useState(null); // { type: 'success'|'error'|'warning', text }
  const fileInputRef = useRef(null);
  const formTopRef = useRef(null);

  const canManageCategories =
    user.role === "super_admin" ||
    (user.role === "knowledge_admin" && policy?.allow_knowledge_admin_manage_categories);

  const canArchiveDocs =
    user.role === "super_admin" ||
    (user.role === "knowledge_admin" && policy?.allow_knowledge_admin_archive_docs);

  const canViewGaps = user.role === "super_admin" || user.role === "knowledge_admin";

  useEffect(() => {
    if (!quickGroupId && groups.length > 0) {
      setQuickGroupId(String(groups[0].id));
    }
  }, [groups, quickGroupId]);

  useEffect(() => {
    if (!categoryId && categories.length > 0) {
      const def = categories.find((c) => c.is_default) || categories[0];
      setCategoryId(String(def.id));
    }
  }, [categories, categoryId]);

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const list = await fetchDocumentsApi({
        q: searchQ || undefined,
        categoryId: filterCatId ? Number(filterCatId) : undefined,
        status: filterStatus || undefined,
      });
      setDocuments(list);
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setDocsLoading(false);
    }
  }, [searchQ, filterCatId, filterStatus]);

  const loadGaps = useCallback(async () => {
    if (!canViewGaps) {
      setGapsLoading(false);
      return;
    }
    setGapsLoading(true);
    try {
      const list = await fetchKnowledgeGapsApi(token);
      setGaps(list);
    } catch {
      setGaps([]);
    } finally {
      setGapsLoading(false);
    }
  }, [token, canViewGaps]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  // Real-time debounced Structure-Aware Chunk preview when OCR text is edited
  useEffect(() => {
    if (!extractedText.trim()) {
      setChunksPreview([]);
      return;
    }
    const timer = setTimeout(async () => {
      setChunking(true);
      try {
        const res = await chunkPreviewApi(token, extractedText);
        setChunksPreview(res.chunks || []);
      } catch {
        // keep last preview
      } finally {
        setChunking(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [extractedText, token]);

  const activeDocuments = useMemo(
    () => documents.filter((d) => d.status === "active"),
    [documents]
  );

  const handleQuickAddCategory = async (e) => {
    e.preventDefault();
    if (!quickCatName.trim() || !quickGroupId) return;
    setQuickCatLoading(true);
    setNotice(null);
    try {
      const created = await createCategoryApi(token, {
        name: quickCatName.trim(),
        group_id: Number(quickGroupId),
        is_default: false,
      });
      setQuickCatName("");
      setCategoryId(String(created.id));
      await onTaxonomyChanged();
      setNotice({
        type: "success",
        text: `เพิ่มหมวดหมู่ "${created.name}" และซิงก์กับหน้าแชตบอทเรียบร้อยแล้ว`,
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setQuickCatLoading(false);
    }
  };

  const handleFileProcess = async (file) => {
    if (!file) return;
    setExtracting(true);
    setNotice(null);
    setStep(1);
    try {
      const res = await extractPreviewApi(token, file, forceOcr);
      setUploadedInfo(res);
      setIngestionType(res.ingestion_type);
      setFilePath(res.file_path);
      setExtractedText(res.extracted_text || "");
      setChunksPreview(res.chunks_preview || []);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.[^.]+$/, ""));
      }
      setStep(2);
      setNotice({
        type: "success",
        text: res.used_ocr
          ? `สกัดข้อความด้วย Thai OCR (tha+eng) สำเร็จ (${res.page_count} หน้า) กรุณาตรวจแก้ข้อความก่อนนำเข้า`
          : `สกัดข้อความจากเอกสารสำเร็จ (${res.page_count} หน้า) พร้อมแสดงตัวอย่างการหั่น Chunk`,
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setExtracting(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileProcess(file);
  };

  const handleCommit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !categoryId || !extractedText.trim()) {
      setNotice({
        type: "error",
        text: "กรุณากรอกชื่อเอกสาร เลือกหมวดหมู่ และระบุเนื้อหาเอกสารให้ครบถ้วน",
      });
      return;
    }

    setCommitting(true);
    setNotice(null);
    const isDirectGroup = String(categoryId).startsWith("group:");
    const parsedGroupId = isDirectGroup ? Number(String(categoryId).slice(6)) : null;
    const parsedCategoryId = isDirectGroup ? null : Number(categoryId);

    try {
      const res = await commitDocumentApi(token, {
        title: title.trim(),
        category_id: parsedCategoryId,
        group_id: parsedGroupId,
        effective_date: effectiveDate || null,
        ingestion_type: ingestionType,
        file_path: filePath || "manual://draft",
        chunks:
          chunksPreview.length > 0
            ? chunksPreview.map((c) => ({
                clause_heading: c.clause_heading,
                content_text: c.content_text,
                chunk_index: c.chunk_index,
              }))
            : undefined,
        content_text: extractedText,
        replace_document_id: replaceDocId ? Number(replaceDocId) : null,
      });

      if (activeGapId && canViewGaps) {
        await updateKnowledgeGapApi(token, activeGapId, { status: "resolved" }).catch(() => {});
        setActiveGapId(null);
      }

      setStep(3);
      const extraMsg = res.archived_previous_document_id
        ? ` และปรับสถานะประกาศฉบับเดิม (#${res.archived_previous_document_id}) เป็นยกเลิกแล้ว`
        : "";
      const warnMsg = res.embedding_warning ? ` (${res.embedding_warning})` : "";
      setNotice({
        type: res.embedding_warning ? "warning" : "success",
        text: `นำเข้าเอกสาร "${res.document.title}" สำเร็จ (${res.document.chunk_count} Chunks)${extraMsg}${warnMsg}`,
      });

      // Reset draft fields for next ingestion
      setTitle("");
      setReplaceDocId("");
      setUploadedInfo(null);
      setIngestionType("manual");
      setFilePath("manual://draft");
      setExtractedText("");
      setChunksPreview([]);

      await Promise.all([loadDocuments(), loadGaps(), onTaxonomyChanged()]);
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setCommitting(false);
    }
  };

  const handleToggleDocStatus = async (doc) => {
    const nextStatus = doc.status === "active" ? "archived" : "active";
    setNotice(null);
    try {
      await updateDocumentStatusApi(token, doc.id, nextStatus);
      await loadDocuments();
      setNotice({
        type: "success",
        text: `เปลี่ยนสถานะเอกสาร "${doc.title}" เป็น ${
          nextStatus === "active" ? "บังคับใช้ล่าสุด" : "ยกเลิกแล้ว (Archived)"
        } เรียบร้อยแล้ว`,
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    }
  };

  const handleOpenViewDoc = async (doc) => {
    setViewingLoading(true);
    setViewingDoc({ ...doc, chunks: [] });
    try {
      const detail = await fetchDocumentDetailApi(doc.id);
      setViewingDoc(detail);
    } catch (err) {
      setNotice({ type: "error", text: err.message });
      setViewingDoc(null);
    } finally {
      setViewingLoading(false);
    }
  };

  const handleOpenEditDoc = (doc) => {
    setEditingDoc(doc);
    setEditTitle(doc.title || "");
    setEditCategoryId(String(doc.category_id || ""));
    setEditEffectiveDate(doc.effective_date || "");
  };

  const handleSaveEditDoc = async (e) => {
    e.preventDefault();
    if (!editingDoc || !editTitle.trim() || !editCategoryId) return;
    setSavingEdit(true);
    setNotice(null);
    const isDirectGroup = String(editCategoryId).startsWith("group:");
    const parsedGroupId = isDirectGroup ? Number(String(editCategoryId).slice(6)) : null;
    const parsedCategoryId = isDirectGroup ? null : Number(editCategoryId);

    try {
      const updated = await updateDocumentApi(token, editingDoc.id, {
        title: editTitle.trim(),
        category_id: parsedCategoryId,
        group_id: parsedGroupId,
        effective_date: editEffectiveDate || null,
      });
      setEditingDoc(null);
      await Promise.all([loadDocuments(), onTaxonomyChanged()]);
      setNotice({
        type: "success",
        text: `บันทึกการแก้ไขเอกสาร "${updated.title}" เรียบร้อยแล้ว`,
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleReembedDoc = async (doc) => {
    setReembeddingId(doc.id);
    setNotice(null);
    try {
      const updated = await reembedDocumentApi(token, doc.id);
      await loadDocuments();
      if (viewingDoc?.id === doc.id) {
        setViewingDoc((prev) =>
          prev
            ? { ...prev, embedded_chunk_count: updated.embedded_chunk_count }
            : prev
        );
      }
      setNotice({
        type: "success",
        text: `สร้างเวกเตอร์ใหม่ให้ "${updated.title}" สำเร็จ (${updated.embedded_chunk_count}/${updated.chunk_count} Chunks)`,
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setReembeddingId(null);
    }
  };

  const handleDeleteDoc = async (doc) => {
    if (
      !window.confirm(
        `ยืนยันการลบเอกสารถาวร "${doc.title}" ?\n(จะลบทั้งข้อมูลเอกสาร, เวกเตอร์ ${doc.chunk_count} Chunks และไฟล์ต้นฉบับออกจากเซิร์ฟเวอร์)`
      )
    ) {
      return;
    }
    setNotice(null);
    try {
      await deleteDocumentApi(token, doc.id);
      if (viewingDoc?.id === doc.id) setViewingDoc(null);
      await Promise.all([loadDocuments(), onTaxonomyChanged()]);
      setNotice({
        type: "success",
        text: `ลบเอกสาร "${doc.title}" และเวกเตอร์ที่เกี่ยวข้องเรียบร้อยแล้ว`,
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    }
  };

  const handleDraftFromGap = (gap) => {
    setActiveGapId(gap.id);
    setTitle(`แนวปฏิบัติ/ประกาศ สอศ. เรื่อง ${gap.question_text.slice(0, 120)}`);
    setIngestionType("manual");
    setFilePath(`manual://knowledge-gap-${gap.id}`);
    setUploadedInfo(null);
    setStep(2);
    setExtractedText(
      `ประกาศสำนักงานคณะกรรมการการอาชีวศึกษา\nเรื่อง ${gap.question_text}\n\nหมวด 1 บททั่วไป\nข้อ 1 [กรอกรายละเอียดระเบียบหรือแนวปฏิบัติเพื่อตอบคำถามนี้]\n\nข้อ 2 [กรอกเงื่อนไขและขั้นตอนการดำเนินการ]`
    );

    if (gap.suggested_category) {
      const matchedCat = categories.find(
        (c) => c.name.toLowerCase() === gap.suggested_category.toLowerCase()
      );
      if (matchedCat) setCategoryId(String(matchedCat.id));
    }

    setNotice({
      type: "success",
      text: `ดึงคำถาม Knowledge Gap (#${gap.id}) มาร่างเอกสารใหม่แล้ว กรุณาเติมเนื้อหาและกดยืนยันนำเข้า`,
    });
    formTopRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs sm:text-sm flex items-start gap-2.5 border ${
            notice.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : notice.type === "warning"
              ? "bg-amber-50 border-amber-300 text-amber-950"
              : "bg-emerald-50 border-emerald-200 text-emerald-900"
          }`}
        >
          {notice.type === "error" || notice.type === "warning" ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{notice.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Quick Category + Drag & Drop OCR + Structure-Aware Chunking + Commit Form */}
        <div className="xl:col-span-6 space-y-5" ref={formTopRef}>
          {/* Quick Add Category Box */}
          <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-card">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-ovec-maroon" />
                เพิ่มหมวดหมู่เอกสารด่วน
              </h3>
              {!canManageCategories && (
                <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  จำกัดสิทธิ์ตามนโยบาย Governance
                </span>
              )}
            </div>
            <form onSubmit={handleQuickAddCategory} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <select
                value={quickGroupId}
                onChange={(e) => setQuickGroupId(e.target.value)}
                disabled={!canManageCategories}
                className="sm:col-span-5 rounded-xl border border-stone-300 px-3 py-2 text-xs bg-white focus:border-ovec-maroon focus:outline-none disabled:bg-stone-100"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={quickCatName}
                onChange={(e) => setQuickCatName(e.target.value)}
                disabled={!canManageCategories}
                placeholder="ชื่อหมวดหมู่ย่อยใหม่..."
                className="sm:col-span-5 rounded-xl border border-stone-300 px-3 py-2 text-xs focus:border-ovec-maroon focus:outline-none disabled:bg-stone-100"
              />
              <button
                type="submit"
                disabled={!canManageCategories || quickCatLoading || !quickCatName.trim()}
                className="sm:col-span-2 rounded-xl bg-ovec-maroon hover:bg-ovec-dark disabled:bg-stone-300 text-white text-xs font-semibold px-3 py-2 transition"
              >
                {quickCatLoading ? "..." : "เพิ่ม"}
              </button>
            </form>
          </div>

          {/* 3-Step RAG Ingestion Studio */}
          <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-ovec-maroon" />
                นำเข้าเอกสาร &amp; Thai OCR (Human-in-the-Loop)
              </h3>
              <span className="text-[11px] font-medium text-stone-500">
                Incremental Vector Update
              </span>
            </div>

            {/* 3-Step Status Bar */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { num: 1, label: "1. อัปโหลด & OCR" },
                { num: 2, label: "2. ตรวจแก้ & ดู Chunk" },
                { num: 3, label: "3. นำเข้า Vector DB" },
              ].map((s) => (
                <div
                  key={s.num}
                  className={`rounded-xl px-2.5 py-2 text-center text-xs font-semibold border transition ${
                    step === s.num
                      ? "bg-ovec-maroon text-white border-ovec-maroon shadow-sm"
                      : step > s.num
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-stone-50 text-stone-500 border-stone-200"
                  }`}
                >
                  {s.label}
                </div>
              ))}
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition ${
                isDragging
                  ? "border-ovec-maroon bg-rose-50/60"
                  : "border-stone-300 bg-ovec-cream/60 hover:border-ovec-maroon/60"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.png,.jpg,.jpeg,.tif,.tiff,.webp"
                className="hidden"
                onChange={(e) => handleFileProcess(e.target.files?.[0])}
              />
              {extracting ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <Loader2 className="w-7 h-7 text-ovec-maroon animate-spin" />
                  <div className="text-xs font-semibold text-ovec-dark">
                    กำลังสกัดข้อความ (pypdf / Poppler + Tesseract Thai OCR)...
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <UploadCloud className="w-7 h-7 mx-auto text-ovec-maroon" />
                  <div className="text-xs sm:text-sm font-semibold text-stone-800">
                    ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์ต้นฉบับ
                  </div>
                  <div className="text-[11px] text-stone-500">
                    รองรับ PDF, Word (.docx), และรูปภาพสแกน (PNG/JPG/TIFF) • บันทึกลง UPLOAD_DIR
                  </div>
                  {uploadedInfo && (
                    <div className="pt-1.5 text-xs font-medium text-emerald-700">
                      ไฟล์ปัจจุบัน: {uploadedInfo.original_filename} ({uploadedInfo.ingestion_type})
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Force Thai OCR toggle for legacy Thai government PDFs */}
            <label className="flex items-center gap-2 text-xs text-stone-700 bg-ovec-cream/70 border border-stone-200 rounded-xl px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={forceOcr}
                onChange={(e) => setForceOcr(e.target.checked)}
                className="rounded border-stone-300 text-ovec-maroon focus:ring-ovec-maroon"
              />
              <span>
                <strong>บังคับใช้ Thai OCR (Poppler + Tesseract tha+eng)</strong> — แนะนำสำหรับไฟล์ PDF ราชการภาษาไทยที่ฟอนต์เพี้ยน/สแกน (ระบบจะสลับอัตโนมัติให้ด้วยหากตรวจพบภาษาต่างดาว)
              </span>
            </label>

            {/* Human-in-the-Loop Editable OCR Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-stone-700">
                  ข้อความที่สกัดได้ (Human-in-the-Loop: ตรวจแก้คำผิดจาก OCR ได้ทันที)
                </label>
                <span className="text-[11px] text-stone-500">
                  {extractedText.length.toLocaleString()} ตัวอักษร
                </span>
              </div>
              <textarea
                rows={7}
                value={extractedText}
                onChange={(e) => {
                  setExtractedText(e.target.value);
                  if (step === 1 && e.target.value.trim()) setStep(2);
                }}
                placeholder="อัปโหลดไฟล์ด้านบน หรือพิมพ์/วางเนื้อหาประกาศราชการไทย (รองรับ หมวด / ข้อ / ส่วนที่ / บทเฉพาะกาล)..."
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed focus:border-ovec-maroon focus:ring-2 focus:ring-ovec-maroon/15 focus:outline-none"
              />
            </div>

            {/* Real-Time Structure-Aware Chunk Preview */}
            <div className="rounded-xl bg-ovec-cream/80 border border-stone-200 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-ovec-dark flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-ovec-maroon" />
                  ตัวอย่างการหั่น Structure-Aware Chunk ({chunksPreview.length} ก้อน)
                </div>
                {chunking && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    กำลังคำนวณ...
                  </span>
                )}
              </div>

              {chunksPreview.length === 0 ? (
                <p className="text-xs text-stone-500">
                  เมื่อมีข้อความ ระบบจะตรวจจับหัวข้อ หมวด / ข้อ / ส่วนที่ / บทเฉพาะกาล และแสดงตัวอย่าง Chunk แบบเรียลไทม์ที่นี่
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {chunksPreview.map((ch) => (
                    <div
                      key={ch.chunk_index}
                      className="rounded-xl bg-white border border-stone-200 p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-ovec-maroon">
                          #{ch.chunk_index + 1} • {ch.clause_heading || "เนื้อหาทั่วไป"}
                        </span>
                        <span className="text-[11px] text-stone-400">
                          {ch.char_count} อักษร
                        </span>
                      </div>
                      <p className="text-stone-700 whitespace-pre-wrap line-clamp-3">
                        {ch.content_text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Document Metadata & Commit Form */}
            <form onSubmit={handleCommit} className="space-y-3 pt-2 border-t border-stone-200">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  ชื่อประกาศ / ชื่อเอกสาร *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น ประกาศ สอศ. เรื่อง แนวทางการจัดการอาชีวศึกษาระบบทวิภาคี พ.ศ. 2569"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm focus:border-ovec-maroon focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    วันที่บังคับใช้
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-ovec-maroon focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    หมวดหมู่เอกสาร (จัดกลุ่มตามประเภทหลัก) *
                  </label>
                  <select
                    required
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm bg-white focus:border-ovec-maroon focus:outline-none"
                  >
                    <option value="">-- เลือกหมวดหมู่ --</option>
                    {groups.map((grp) => (
                      <optgroup key={grp.id} label={grp.name}>
                        {(grp.categories || []).length > 0 ? (
                          grp.categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))
                        ) : (
                          <option value={`group:${grp.id}`}>
                            {grp.name} (ใช้กลุ่มหลักนี้โดยตรง)
                          </option>
                        )}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  แทนที่ประกาศฉบับเดิม (เลือกหากต้องการ Archive ฉบับเก่าอัตโนมัติ)
                </label>
                <select
                  value={replaceDocId}
                  onChange={(e) => setReplaceDocId(e.target.value)}
                  disabled={!canArchiveDocs}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm bg-white focus:border-ovec-maroon focus:outline-none disabled:bg-stone-100"
                >
                  <option value="">-- ไม่แทนที่ (เพิ่มเป็นประกาศใหม่) --</option>
                  {activeDocuments.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      #{doc.id} — {doc.title} ({formatThaiDate(doc.effective_date)})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={committing || !extractedText.trim()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ovec-maroon hover:bg-ovec-dark disabled:bg-stone-300 text-white py-2.5 px-4 text-sm font-semibold shadow-sm transition"
              >
                {committing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังแปลงเวกเตอร์และบันทึกเข้า Vector DB...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    ยืนยันนำเข้าคลัง Vector DB ({chunksPreview.length} Chunks)
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Document Repository Table + Knowledge Gaps */}
        <div className="xl:col-span-6 space-y-5">
          {/* Document Repository */}
          <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-ovec-maroon" />
                คลังเอกสารทั้งหมด ({documents.length} ฉบับ)
              </h3>
              <button
                type="button"
                onClick={loadDocuments}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                รีเฟรช
              </button>
            </div>

            {/* Search & Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-5 relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="ค้นหาชื่อเอกสาร..."
                  className="w-full rounded-xl border border-stone-300 pl-8 pr-3 py-1.5 text-xs focus:border-ovec-maroon focus:outline-none"
                />
              </div>

              <select
                value={filterCatId}
                onChange={(e) => setFilterCatId(e.target.value)}
                className="sm:col-span-4 rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs bg-white focus:border-ovec-maroon focus:outline-none"
              >
                <option value="">ทุกหมวดหมู่</option>
                {groups.map((grp) => (
                  <optgroup key={grp.id} label={grp.name}>
                    {(grp.categories || []).map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="sm:col-span-3 rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs bg-white focus:border-ovec-maroon focus:outline-none"
              >
                <option value="">ทุกสถานะ</option>
                <option value="active">บังคับใช้ล่าสุด</option>
                <option value="archived">ยกเลิกแล้ว</option>
              </select>
            </div>

            {/* Documents List */}
            {docsLoading ? (
              <div className="py-8 text-center text-xs text-stone-500">กำลังโหลดรายการเอกสาร...</div>
            ) : documents.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-500 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                ยังไม่มีเอกสารในคลังความรู้ตามเงื่อนไขที่เลือก
              </div>
            ) : (
              <div className="divide-y divide-stone-100 max-h-[420px] overflow-y-auto pr-1">
                {documents.map((doc) => (
                  <div key={doc.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            doc.status === "active"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-stone-100 text-stone-600 border border-stone-200"
                          }`}
                        >
                          {doc.status === "active" ? "บังคับใช้ล่าสุด" : "ยกเลิกแล้ว"}
                        </span>
                        <span className="text-[11px] bg-rose-50 text-ovec-maroon px-2 py-0.5 rounded-full">
                          {doc.category_name}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            doc.embedded_chunk_count >= doc.chunk_count && doc.chunk_count > 0
                              ? "bg-blue-50 text-blue-800 border border-blue-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                          title="จำนวน Chunk ที่สร้างเวกเตอร์แล้ว"
                        >
                          {doc.embedded_chunk_count ?? 0}/{doc.chunk_count} Vector
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm font-semibold text-stone-900 truncate">
                        {doc.title}
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5">
                        บังคับใช้: {formatThaiDate(doc.effective_date)} • ประเภท: {doc.ingestion_type}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenViewDoc(doc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                        title="ดูเนื้อหา Chunks และสร้างเวกเตอร์ใหม่"
                      >
                        <Eye className="w-3.5 h-3.5 text-ovec-maroon" />
                        <span className="hidden sm:inline">ดู</span>
                      </button>

                      {canViewGaps && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditDoc(doc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                          title="แก้ไขชื่อ หมวดหมู่ หรือวันที่บังคับใช้"
                        >
                          <Pencil className="w-3.5 h-3.5 text-stone-600" />
                          <span className="hidden sm:inline">แก้ไข</span>
                        </button>
                      )}

                      {!doc.file_path.startsWith("manual://") && (
                        <a
                          href={apiUrl(doc.file_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                          title="เปิดไฟล์ต้นฉบับ"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <button
                        type="button"
                        disabled={!canArchiveDocs}
                        onClick={() => handleToggleDocStatus(doc)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition disabled:opacity-40 ${
                          doc.status === "active"
                            ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                            : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        }`}
                      >
                        <Archive className="w-3 h-3" />
                        {doc.status === "active" ? "ยกเลิกใช้" : "เปิดใช้งาน"}
                      </button>

                      <button
                        type="button"
                        disabled={!canArchiveDocs}
                        onClick={() => handleDeleteDoc(doc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700 transition disabled:opacity-40"
                        title="ลบเอกสารถาวร"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Knowledge Gaps Panel */}
          <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                คำถามที่ยังไม่มีเอกสารตอบ (Knowledge Gaps)
              </h3>
              <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                {gaps.filter((g) => g.status === "open").length} รอเติมข้อมูล
              </span>
            </div>

            {!canViewGaps ? (
              <p className="text-xs text-stone-500">
                สิทธิ์ของคุณไม่รองรับการดูรายการ Knowledge Gaps (เฉพาะ Super Admin / Knowledge Admin)
              </p>
            ) : gapsLoading ? (
              <div className="py-6 text-center text-xs text-stone-500">กำลังโหลด Knowledge Gaps...</div>
            ) : gaps.length === 0 ? (
              <div className="py-6 text-center text-xs text-stone-500 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                ยังไม่มีคำถามตกหล่นในระบบ
              </div>
            ) : (
              <div className="divide-y divide-stone-100 max-h-72 overflow-y-auto pr-1">
                {gaps.map((gap) => (
                  <div key={gap.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-bold text-ovec-maroon">
                          ถามซ้ำ {gap.asked_count} ครั้ง
                        </span>
                        {gap.suggested_category && (
                          <span className="text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full">
                            หมวดแนะนำ: {gap.suggested_category}
                          </span>
                        )}
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            gap.status === "resolved"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {gap.status}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm font-medium text-stone-800">
                        {gap.question_text}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDraftFromGap(gap)}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-ovec-maroon hover:bg-ovec-dark text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition"
                    >
                      <FilePlus2 className="w-3.5 h-3.5 text-amber-300" />
                      ร่างเอกสารใหม่
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Edit Document Metadata */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-stone-200 shadow-2xl overflow-hidden">
            <div className="ovec-header-gradient px-5 py-3.5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Pencil className="w-4 h-4 text-amber-300" />
                แก้ไขข้อมูลเอกสาร #{editingDoc.id}
              </div>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="p-1 rounded-lg hover:bg-white/15"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditDoc} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  ชื่อประกาศ / ชื่อเอกสาร *
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm focus:border-ovec-maroon focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    วันที่บังคับใช้
                  </label>
                  <input
                    type="date"
                    value={editEffectiveDate}
                    onChange={(e) => setEditEffectiveDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-ovec-maroon focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    หมวดหมู่เอกสาร *
                  </label>
                  <select
                    required
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-ovec-maroon focus:outline-none"
                  >
                    {groups.map((grp) => (
                      <optgroup key={grp.id} label={grp.name}>
                        {(grp.categories || []).length > 0 ? (
                          grp.categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))
                        ) : (
                          <option value={`group:${grp.id}`}>
                            {grp.name} (ใช้กลุ่มหลักนี้โดยตรง)
                          </option>
                        )}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ovec-maroon hover:bg-ovec-dark text-white px-4 py-2 text-xs font-semibold shadow-sm transition disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5 text-amber-300" />
                  {savingEdit ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Document Chunks & Re-embed */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl bg-white border border-stone-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="ovec-header-gradient px-5 py-3.5 text-white flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{viewingDoc.title}</div>
                <div className="text-[11px] text-rose-100">
                  {viewingDoc.category_name} • บังคับใช้ {formatThaiDate(viewingDoc.effective_date)} • เวกเตอร์ {viewingDoc.embedded_chunk_count ?? 0}/{viewingDoc.chunk_count} Chunks
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                className="p-1.5 rounded-lg hover:bg-white/15 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 bg-ovec-cream border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-stone-600">
                แสดงเนื้อหาทั้งหมดที่ถูกหั่นเก็บไว้ในฐานข้อมูล Vector DB
              </span>
              {canViewGaps && (
                <button
                  type="button"
                  disabled={reembeddingId === viewingDoc.id}
                  onClick={() => handleReembedDoc(viewingDoc)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ovec-maroon hover:bg-ovec-dark text-white px-3.5 py-1.5 text-xs font-semibold shadow-sm transition disabled:opacity-60"
                >
                  {reembeddingId === viewingDoc.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  )}
                  สร้างเวกเตอร์ใหม่ (Re-embed)
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {viewingLoading ? (
                <div className="py-10 text-center text-xs text-stone-500">กำลังโหลดเนื้อหา Chunks...</div>
              ) : (
                (viewingDoc.chunks || []).map((ch) => (
                  <div
                    key={ch.id}
                    className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 text-sm"
                  >
                    <div className="text-xs font-bold text-ovec-maroon mb-1">
                      #{ch.chunk_index + 1} • {ch.clause_heading || "เนื้อหาเอกสาร"}
                    </div>
                    <p className="whitespace-pre-wrap text-stone-800 leading-relaxed">
                      {ch.content_text}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
