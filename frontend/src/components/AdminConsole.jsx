import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Cpu,
  Crown,
  FileUp,
  FolderTree,
  Lock,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react";
import { fetchMeApi, fetchUsersApi, loginApi } from "../lib/api";
import AdminArchitectureTab from "./admin/AdminArchitectureTab";
import AdminDocumentsTab from "./admin/AdminDocumentsTab";
import AdminTaxonomyTab from "./admin/AdminTaxonomyTab";
import AdminUsersTab from "./admin/AdminUsersTab";

const ROLE_LABELS = {
  super_admin: "ผู้ดูแลระบบสูงสุด (Super Admin)",
  knowledge_admin: "ผู้ดูแลคลังความรู้ (Knowledge Admin)",
  ocr_reviewer: "ผู้ตรวจสอบเอกสาร OCR (OCR Reviewer)",
  college_staff: "เจ้าหน้าที่สถานศึกษา (College Staff)",
};

const SUB_TABS = [
  { id: "documents", label: "คลังเอกสาร & นำเข้าข้อมูล RAG", icon: FileUp },
  { id: "taxonomy", label: "กลุ่มประเภท & หมวดหมู่เอกสาร", icon: FolderTree },
  { id: "users", label: "จัดการผู้ใช้งาน & สิทธิ์ผู้ดูแลสูงสุด", icon: Users },
  { id: "architecture", label: "สถาปัตยกรรมระบบ", icon: Cpu },
];

export default function AdminConsole({
  groups,
  categories,
  onTaxonomyChanged,
}) {
  const [token, setToken] = useState(() => localStorage.getItem("ovec_guru_token") || "");
  const [session, setSession] = useState(null);
  const [primarySuperName, setPrimarySuperName] = useState("");
  const [subTab, setSubTab] = useState("documents");

  // Login form
  const [email, setEmail] = useState("admin@ovec.go.th");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refreshSession = useCallback(async () => {
    if (!token) return;
    try {
      const meData = await fetchMeApi(token);
      setSession(meData);
      if (meData.user?.is_primary_super) {
        setPrimarySuperName(meData.user.full_name);
      } else if (meData.user?.role === "super_admin") {
        const usersRes = await fetchUsersApi(token, { role: "super_admin" }).catch(() => null);
        const primary = usersRes?.items?.find((u) => u.is_primary_super);
        if (primary) setPrimarySuperName(primary.full_name);
      }
    } catch {
      localStorage.removeItem("ovec_guru_token");
      setToken("");
      setSession(null);
    }
  }, [token]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await loginApi(email, password);
      localStorage.setItem("ovec_guru_token", data.access_token);
      setToken(data.access_token);
      setSession({ user: data.user, governance_policy: data.governance_policy });
      if (data.user?.is_primary_super) {
        setPrimarySuperName(data.user.full_name);
      }
      setPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("ovec_guru_token");
    setToken("");
    setSession(null);
    setPrimarySuperName("");
  };

  if (!session) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 sm:py-14 w-full">
        <div className="rounded-3xl bg-white border border-stone-200 shadow-soft overflow-hidden">
          <div className="ovec-header-gradient px-6 py-5 text-white border-b-2 border-ovec-gold">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold mb-1">
              <Lock className="w-3.5 h-3.5" />
              RAG Console Authentication
            </div>
            <h2 className="text-lg font-bold">เข้าสู่ระบบผู้ดูแล OVEC GURU</h2>
            <p className="text-xs text-rose-100/90 mt-1">
              สำหรับเจ้าหน้าที่ สอศ. (Super Admin, Knowledge Admin และ OCR Reviewer)
            </p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                อีเมลผู้ใช้งาน
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm focus:outline-none focus:border-ovec-maroon focus:ring-2 focus:ring-ovec-maroon/15"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                รหัสผ่าน
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านเจ้าหน้าที่"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm focus:outline-none focus:border-ovec-maroon focus:ring-2 focus:ring-ovec-maroon/15"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-ovec-maroon hover:bg-ovec-dark text-white py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60"
            >
              {loading ? "กำลังตรวจสอบสิทธิ์..." : "เข้าสู่ระบบผู้ดูแล (RAG Console)"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { user, governance_policy: policy } = session;

  return (
    <div className="max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-5 space-y-5">
      {/* Authenticated Admin Header Bar + Primary Super Admin Banner + 4 Sub-Tabs */}
      <div className="rounded-2xl bg-white border border-stone-200 shadow-card overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 bg-ovec-paper border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-ovec-maroon text-amber-300 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm sm:text-base font-bold text-stone-900 truncate">
                  {user.full_name}
                </span>
                {user.is_primary_super ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-bold text-amber-950">
                    <Crown className="w-3 h-3 text-amber-700" />
                    ผู้ดูแลระบบสูงสุดหลัก (Primary Super Admin)
                  </span>
                ) : primarySuperName ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 border border-stone-200 px-2.5 py-0.5 text-[11px] font-medium text-stone-700">
                    <Crown className="w-3 h-3 text-amber-600" />
                    Primary Super Admin: {primarySuperName}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-stone-500 truncate">
                {ROLE_LABELS[user.role] || user.role} • {user.email}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 transition"
          >
            <LogOut className="w-3.5 h-3.5 text-ovec-maroon" />
            ออกจากระบบ
          </button>
        </div>

        {/* 4 Sub-Tabs Navigation */}
        <div className="px-3 sm:px-5 py-2 bg-white flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all ${
                  active
                    ? "bg-ovec-maroon text-white shadow-sm"
                    : "text-stone-600 hover:bg-ovec-cream hover:text-ovec-maroon"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-amber-300" : "text-stone-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Sub-Tab Body */}
      {subTab === "documents" && (
        <AdminDocumentsTab
          token={token}
          user={user}
          policy={policy}
          groups={groups}
          categories={categories}
          onTaxonomyChanged={onTaxonomyChanged}
        />
      )}

      {subTab === "taxonomy" && (
        <AdminTaxonomyTab
          token={token}
          user={user}
          policy={policy}
          groups={groups}
          categories={categories}
          onTaxonomyChanged={onTaxonomyChanged}
        />
      )}

      {subTab === "users" && (
        <AdminUsersTab
          token={token}
          user={user}
          policy={policy}
          onSessionRefresh={refreshSession}
        />
      )}

      {subTab === "architecture" && (
        <AdminArchitectureTab token={token} user={user} />
      )}
    </div>
  );
}
