/**
 * Complete API client for OVEC GURU Backend (FastAPI + SSE Streaming + RAG Console).
 * Automatically supports subpath deployments (e.g. https://service.npc.ac.th/ovec_guru/).
 */

const API_BASE = (
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.BASE_URL && import.meta.env.BASE_URL !== "/"
    ? import.meta.env.BASE_URL.replace(/\/$/, "")
    : "")
).replace(/\/$/, "");

export function apiUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE && normalized.startsWith(`${API_BASE}/`)) return normalized;
  return `${API_BASE}${normalized}`;
}

function authHeaders(token, extra = {}) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function handleJsonResponse(res, fallbackMessage) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d) => d.msg).join(", ")
      : data.detail;
    throw new Error(detail || fallbackMessage);
  }
  return data;
}

// ==============================================================================
// Public / System / Categories
// ==============================================================================

export async function fetchHealth() {
  const res = await fetch(apiUrl("/api/health"));
  return handleJsonResponse(res, "ไม่สามารถเชื่อมต่อ Backend ได้");
}

export async function fetchCategories(groupId = null) {
  const qs = groupId ? `?group_id=${encodeURIComponent(groupId)}` : "";
  const res = await fetch(apiUrl(`/api/categories${qs}`));
  return handleJsonResponse(res, "ไม่สามารถโหลดหมวดหมู่เอกสารได้");
}

export async function fetchGroups() {
  const res = await fetch(apiUrl("/api/admin/groups"));
  return handleJsonResponse(res, "ไม่สามารถโหลดกลุ่มประเภทเอกสารได้");
}

// ==============================================================================
// Authentication & Session
// ==============================================================================

export async function loginApi(email, password) {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handleJsonResponse(res, "เข้าสู่ระบบไม่สำเร็จ");
}

export async function fetchMeApi(token) {
  const res = await fetch(apiUrl("/api/auth/me"), { headers: authHeaders(token) });
  return handleJsonResponse(res, "Session หมดอายุ");
}

// ==============================================================================
// Groups & Categories CRUD
// ==============================================================================

export async function createGroupApi(token, payload) {
  const res = await fetch(apiUrl("/api/admin/groups"), {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res, "ไม่สามารถสร้างกลุ่มประเภทเอกสารได้");
}

export async function updateGroupApi(token, groupId, payload) {
  const res = await fetch(apiUrl(`/api/admin/groups/${groupId}`), {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res, "ไม่สามารถแก้ไขกลุ่มประเภทเอกสารได้");
}

export async function deleteGroupApi(token, groupId) {
  const res = await fetch(apiUrl(`/api/admin/groups/${groupId}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handleJsonResponse(res, "ไม่สามารถลบกลุ่มประเภทเอกสารได้");
}

export async function createCategoryApi(token, payload) {
  const res = await fetch(apiUrl("/api/categories"), {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res, "ไม่สามารถสร้างหมวดหมู่เอกสารได้");
}

export async function updateCategoryApi(token, categoryId, payload) {
  const res = await fetch(apiUrl(`/api/categories/${categoryId}`), {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res, "ไม่สามารถแก้ไขหมวดหมู่เอกสารได้");
}

export async function deleteCategoryApi(token, categoryId) {
  const res = await fetch(apiUrl(`/api/categories/${categoryId}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handleJsonResponse(res, "ไม่สามารถลบหมวดหมู่เอกสารได้");
}

// ==============================================================================
// Documents, OCR Preview, Structure-Aware Chunking & Knowledge Gaps
// ==============================================================================

export async function extractPreviewApi(token, file, forceOcr = false) {
  const formData = new FormData();
  formData.append("file", file);
  const qs = forceOcr ? "?force_ocr=true" : "";
  const res = await fetch(apiUrl(`/api/documents/extract-preview${qs}`), {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  return handleJsonResponse(res, "ไม่สามารถสกัดข้อความจากไฟล์ได้");
}

export async function chunkPreviewApi(token, text, maxChars = 1200) {
  const res = await fetch(apiUrl("/api/documents/chunk-preview"), {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ text, max_chars: maxChars }),
  });
  return handleJsonResponse(res, "ไม่สามารถคำนวณตัวอย่าง Chunk ได้");
}

export async function commitDocumentApi(token, payload) {
  const res = await fetch(apiUrl("/api/documents/commit"), {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res, "ไม่สามารถนำเข้าเอกสารสู่คลัง Vector DB ได้");
}

export async function fetchDocumentsApi({ status, categoryId, q } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (categoryId) params.set("category_id", String(categoryId));
  if (q && q.trim()) params.set("q", q.trim());
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(apiUrl(`/api/documents${qs}`));
  return handleJsonResponse(res, "ไม่สามารถโหลดรายการเอกสารได้");
}

export async function updateDocumentStatusApi(token, documentId, newStatus) {
  const res = await fetch(apiUrl(`/api/documents/${documentId}/status`), {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ status: newStatus }),
  });
  return handleJsonResponse(res, "ไม่สามารถเปลี่ยนสถานะเอกสารได้");
}

export async function fetchKnowledgeGapsApi(token, status = null) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(apiUrl(`/api/admin/knowledge-gaps${qs}`), {
    headers: authHeaders(token),
  });
  return handleJsonResponse(res, "ไม่สามารถโหลดรายการ Knowledge Gaps ได้");
}

export async function updateKnowledgeGapApi(token, gapId, payload) {
  const res = await fetch(apiUrl(`/api/admin/knowledge-gaps/${gapId}`), {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res, "ไม่สามารถอัปเดตรายการ Knowledge Gap ได้");
}

// ==============================================================================
// Admin Users & Super Admin Governance
// ==============================================================================

export async function fetchUsersApi(token, { q, role, status } = {}) {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set("q", q.trim());
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(apiUrl(`/api/admin/users${qs}`), {
    headers: authHeaders(token),
  });
  return handleJsonResponse(res, "ไม่สามารถโหลดรายชื่อผู้ใช้งานได้");
}

export async function createUserApi(token, payload) {
  const res = await fetch(apiUrl("/api/admin/users"), {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res, "ไม่สามารถเพิ่มผู้ใช้งานได้");
}

export async function updateUserApi(token, userId, payload) {
  const res = await fetch(apiUrl(`/api/admin/users/${userId}`), {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res, "ไม่สามารถแก้ไขผู้ใช้งานได้");
}

export async function deleteUserApi(token, userId) {
  const res = await fetch(apiUrl(`/api/admin/users/${userId}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handleJsonResponse(res, "ไม่สามารถลบผู้ใช้งานได้");
}

export async function updateGovernancePolicyApi(token, payload) {
  const res = await fetch(apiUrl("/api/admin/governance/policy"), {
    method: "PUT",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res, "ไม่สามารถบันทึกนโยบายสิทธิ์ได้");
}

export async function transferPrimarySuperApi(token, targetUserId) {
  const res = await fetch(apiUrl("/api/admin/governance/transfer-primary"), {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ target_user_id: targetUserId }),
  });
  return handleJsonResponse(res, "ไม่สามารถโอนย้ายตำแหน่ง Primary Super Admin ได้");
}

export async function fetchAiConfigApi(token) {
  const res = await fetch(apiUrl("/api/admin/ai-config"), {
    headers: authHeaders(token),
  });
  return handleJsonResponse(res, "ไม่สามารถโหลดค่าตั้งค่า Cloud AI API ได้");
}

export async function updateAiConfigApi(token, payload) {
  const res = await fetch(apiUrl("/api/admin/ai-config"), {
    method: "PUT",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handleJsonResponse(res, "ไม่สามารถบันทึกค่าตั้งค่า Cloud AI API ได้");
}

export async function testAiConfigApi(token) {
  const res = await fetch(apiUrl("/api/admin/ai-config/test"), {
    method: "POST",
    headers: authHeaders(token),
  });
  return handleJsonResponse(res, "ทดสอบเชื่อมต่อ Cloud AI API ไม่สำเร็จ");
}

// ==============================================================================
// Chatbot SSE Streaming
// ==============================================================================

export async function streamChatApi({
  question,
  categoryId = null,
  topK = 5,
  signal,
  onMetadata,
  onToken,
  onError,
  onDone,
}) {
  const res = await fetch(apiUrl("/api/chat/stream"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      category_id: categoryId,
      top_k: topK,
    }),
    signal,
  });

  if (!res.ok) {
    let message = "ไม่สามารถเชื่อมต่อระบบแชตบอทได้";
    try {
      const err = await res.json();
      if (err.detail) message = err.detail;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      let eventName = "message";
      const dataLines = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (!dataLines.length) continue;
      let payload;
      try {
        payload = JSON.parse(dataLines.join("\n"));
      } catch {
        continue;
      }

      if (eventName === "metadata") {
        onMetadata?.(payload);
      } else if (eventName === "token") {
        onToken?.(payload.text || "");
      } else if (eventName === "error") {
        onError?.(payload.message || "เกิดข้อผิดพลาดระหว่างสร้างคำตอบ");
      } else if (eventName === "done") {
        onDone?.(payload);
      }
    }
  }
}
