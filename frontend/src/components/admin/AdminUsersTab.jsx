import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  Pencil,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  createUserApi,
  deleteUserApi,
  fetchUsersApi,
  transferPrimarySuperApi,
  updateGovernancePolicyApi,
  updateUserApi,
} from "../../lib/api";

const ROLE_OPTIONS = [
  { value: "super_admin", label: "ผู้ดูแลระบบสูงสุด (Super Admin)" },
  { value: "knowledge_admin", label: "ผู้ดูแลคลังความรู้ (Knowledge Admin)" },
  { value: "ocr_reviewer", label: "ผู้ตรวจสอบเอกสาร OCR (OCR Reviewer)" },
  { value: "college_staff", label: "เจ้าหน้าที่สถานศึกษา (College Staff)" },
];

const ROLE_BADGE_MAP = {
  super_admin: "bg-rose-100 text-ovec-dark border-rose-300",
  knowledge_admin: "bg-blue-50 text-blue-800 border-blue-200",
  ocr_reviewer: "bg-amber-50 text-amber-900 border-amber-200",
  college_staff: "bg-stone-100 text-stone-700 border-stone-200",
};

export default function AdminUsersTab({
  token,
  user,
  policy,
  onSessionRefresh,
}) {
  const isSuperAdmin = user.role === "super_admin";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Add/Edit user form state
  const [editingId, setEditingId] = useState(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("college_staff");
  const [status, setStatus] = useState("active");
  const [savingUser, setSavingUser] = useState(false);

  // Governance policy state
  const [polCategories, setPolCategories] = useState(
    Boolean(policy?.allow_knowledge_admin_manage_categories)
  );
  const [polArchive, setPolArchive] = useState(
    Boolean(policy?.allow_knowledge_admin_archive_docs)
  );
  const [polOcrApprove, setPolOcrApprove] = useState(
    Boolean(policy?.require_super_approve_for_ocr)
  );
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Transfer Primary Super Admin state
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferring, setTransferring] = useState(false);

  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (policy) {
      setPolCategories(Boolean(policy.allow_knowledge_admin_manage_categories));
      setPolArchive(Boolean(policy.allow_knowledge_admin_archive_docs));
      setPolOcrApprove(Boolean(policy.require_super_approve_for_ocr));
    }
  }, [policy]);

  const loadUsers = useCallback(async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchUsersApi(token, {
        q: searchQ || undefined,
        role: filterRole || undefined,
        status: filterStatus || undefined,
      });
      setUsers(data.items || []);
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }, [token, isSuperAdmin, searchQ, filterRole, filterStatus]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const primarySuperUser = useMemo(
    () => users.find((u) => u.is_primary_super),
    [users]
  );

  const transferCandidates = useMemo(
    () =>
      users.filter(
        (u) => u.role === "super_admin" && u.status === "active" && !u.is_primary_super
      ),
    [users]
  );

  const resetUserForm = () => {
    setEditingId(null);
    setFullName("");
    setEmail("");
    setDepartment("");
    setPassword("");
    setRole("college_staff");
    setStatus("active");
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setSavingUser(true);
    setNotice(null);
    try {
      if (editingId) {
        const payload = {
          full_name: fullName.trim(),
          email: email.trim(),
          department: department.trim(),
          role,
          status,
        };
        if (password.trim()) payload.password = password.trim();
        await updateUserApi(token, editingId, payload);
        setNotice({ type: "success", text: "บันทึกการแก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว" });
      } else {
        await createUserApi(token, {
          full_name: fullName.trim(),
          email: email.trim(),
          department: department.trim(),
          password: password.trim(),
          role,
          status,
        });
        setNotice({ type: "success", text: "เพิ่มบัญชีผู้ใช้งานใหม่เรียบร้อยแล้ว" });
      }
      resetUserForm();
      await loadUsers();
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (target) => {
    if (!window.confirm(`ยืนยันการลบบัญชีผู้ใช้งาน "${target.full_name}" (${target.email}) ?`)) {
      return;
    }
    setNotice(null);
    try {
      await deleteUserApi(token, target.id);
      if (editingId === target.id) resetUserForm();
      await loadUsers();
      setNotice({ type: "success", text: `ลบผู้ใช้งาน "${target.full_name}" เรียบร้อยแล้ว` });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    }
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    setSavingPolicy(true);
    setNotice(null);
    try {
      await updateGovernancePolicyApi(token, {
        allow_knowledge_admin_manage_categories: polCategories,
        allow_knowledge_admin_archive_docs: polArchive,
        require_super_approve_for_ocr: polOcrApprove,
      });
      await onSessionRefresh();
      setNotice({
        type: "success",
        text: "บันทึกนโยบาย Super Admin Governance ลงฐานข้อมูลและบังคับใช้ทันทีแล้ว",
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleTransferPrimary = async (e) => {
    e.preventDefault();
    if (!transferTargetId) return;
    const target = transferCandidates.find((u) => String(u.id) === String(transferTargetId));
    if (
      !window.confirm(
        `ยืนยันการโอนย้ายตำแหน่ง Primary Super Admin ให้กับ "${target?.full_name}" (${target?.email}) ?`
      )
    ) {
      return;
    }
    setTransferring(true);
    setNotice(null);
    try {
      await transferPrimarySuperApi(token, Number(transferTargetId));
      setTransferTargetId("");
      await Promise.all([loadUsers(), onSessionRefresh()]);
      setNotice({
        type: "success",
        text: `โอนย้ายตำแหน่ง Primary Super Admin ให้ "${target?.full_name}" เรียบร้อยแล้ว`,
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setTransferring(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-300 p-6 text-sm text-amber-950 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold">จำกัดสิทธิ์เฉพาะผู้ดูแลระบบสูงสุด (Super Admin)</div>
          <p className="text-xs sm:text-sm mt-1">
            เฉพาะบัญชีระดับ Super Admin เท่านั้นที่สามารถจัดการรายชื่อผู้ใช้งาน โอนย้าย Primary Super Admin และตั้งค่านโยบาย Governance ได้
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs sm:text-sm flex items-center gap-2 border ${
            notice.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : "bg-emerald-50 border-emerald-200 text-emerald-900"
          }`}
        >
          {notice.type === "error" ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Super Admin Governance Card */}
      <div className="rounded-2xl bg-white border border-stone-200 border-t-[3px] border-t-ovec-gold shadow-card overflow-hidden">
        <div className="px-5 py-3.5 bg-ovec-paper border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-ovec-maroon" strokeWidth={1.75} />
            <h3 className="text-sm sm:text-base font-semibold text-stone-900">
              กำหนดสิทธิ์ของผู้ดูแลระบบสูงสุด (Super Admin Governance)
            </h3>
          </div>
          {primarySuperUser && (
            <span className="text-xs bg-amber-50 border border-amber-300/80 px-2.5 py-1 rounded-md text-amber-950">
              Primary Super Admin ปัจจุบัน: <strong className="font-semibold">{primarySuperUser.full_name}</strong>
            </span>
          )}
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* 3 Governance Policy Toggles */}
          <form onSubmit={handleSavePolicy} className="lg:col-span-7 space-y-3">
            <div className="text-xs font-semibold text-stone-700">
              นโยบายการมอบหมายสิทธิ์ให้บทบาทอื่น (บังคับใช้จริงทุก API)
            </div>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-ovec-cream/70 border border-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={polCategories}
                onChange={(e) => setPolCategories(e.target.checked)}
                className="mt-0.5 rounded border-stone-300 text-ovec-maroon focus:ring-ovec-maroon"
              />
              <div className="text-xs sm:text-sm">
                <div className="font-semibold text-stone-900">
                  อนุญาต Knowledge Admin จัดการกลุ่มประเภทและหมวดหมู่เอกสาร
                </div>
                <div className="text-xs text-stone-500">
                  allow_knowledge_admin_manage_categories
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-ovec-cream/70 border border-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={polArchive}
                onChange={(e) => setPolArchive(e.target.checked)}
                className="mt-0.5 rounded border-stone-300 text-ovec-maroon focus:ring-ovec-maroon"
              />
              <div className="text-xs sm:text-sm">
                <div className="font-semibold text-stone-900">
                  อนุญาต Knowledge Admin ยกเลิก/จัดเก็บเอกสารเก่า (Archive) และแทนที่ประกาศเดิม
                </div>
                <div className="text-xs text-stone-500">
                  allow_knowledge_admin_archive_docs
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl bg-ovec-cream/70 border border-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={polOcrApprove}
                onChange={(e) => setPolOcrApprove(e.target.checked)}
                className="mt-0.5 rounded border-stone-300 text-ovec-maroon focus:ring-ovec-maroon"
              />
              <div className="text-xs sm:text-sm">
                <div className="font-semibold text-stone-900">
                  บังคับให้เอกสารที่สกัดด้วย Thai OCR ต้องได้รับอนุมัติและนำเข้าโดย Super Admin
                </div>
                <div className="text-xs text-stone-500">
                  require_super_approve_for_ocr
                </div>
              </div>
            </label>

            <button
              type="submit"
              disabled={savingPolicy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ovec-maroon hover:bg-ovec-dark text-white px-4 py-2 text-xs sm:text-sm font-semibold shadow-sm transition disabled:opacity-60"
            >
              <Save className="w-4 h-4 text-amber-300" />
              {savingPolicy ? "กำลังบันทึกนโยบาย..." : "บันทึกนโยบายลงฐานข้อมูล"}
            </button>
          </form>

          {/* Transfer Primary Super Admin */}
          <form
            onSubmit={handleTransferPrimary}
            className="lg:col-span-5 rounded-xl bg-amber-50/70 border border-amber-200 p-4 flex flex-col justify-between space-y-3"
          >
            <div className="space-y-2">
              <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                โอนย้ายตำแหน่ง Primary Super Admin
              </div>
              <p className="text-xs text-amber-900/90 leading-relaxed">
                เฉพาะผู้ถือตำแหน่ง Primary Super Admin คนปัจจุบันเท่านั้นที่สามารถโอนย้ายตำแหน่งให้ Super Admin ที่มีสถานะ Active ท่านอื่นได้ ระบบบังคับกฎเหล็กห้ามลบหรือระงับ Super Admin คนสุดท้ายเด็ดขาด
              </p>

              <select
                value={transferTargetId}
                onChange={(e) => setTransferTargetId(e.target.value)}
                disabled={!user.is_primary_super || transferCandidates.length === 0}
                className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs sm:text-sm focus:border-ovec-maroon focus:outline-none disabled:bg-stone-100"
              >
                <option value="">
                  {transferCandidates.length === 0
                    ? "-- ยังไม่มี Super Admin ท่านอื่นที่พร้อมรับโอน --"
                    : "-- เลือกผู้ดูแลระบบสูงสุดที่จะรับตำแหน่ง --"}
                </option>
                {transferCandidates.map((cand) => (
                  <option key={cand.id} value={cand.id}>
                    {cand.full_name} ({cand.email})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={!user.is_primary_super || !transferTargetId || transferring}
              className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 text-white py-2 px-4 text-xs font-semibold shadow-sm transition"
            >
              {transferring ? "กำลังโอนย้ายตำแหน่ง..." : "ยืนยันโอนย้าย Primary Super Admin"}
            </button>
          </form>
        </div>
      </div>

      {/* Add/Edit User Form + Users Table */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Form */}
        <form
          onSubmit={handleSaveUser}
          className="xl:col-span-4 rounded-2xl bg-white border border-stone-200 p-5 shadow-card space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-ovec-maroon" />
              {editingId ? "แก้ไขบัญชีผู้ใช้งาน" : "เพิ่มผู้ใช้งานใหม่"}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={resetUserForm}
                className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-0.5"
              >
                <X className="w-3.5 h-3.5" /> ยกเลิก
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">ชื่อ-นามสกุล *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="เช่น นายสมชาย รักอาชีวะ"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-ovec-maroon focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">อีเมล *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@ovec.go.th"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-ovec-maroon focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">หน่วยงาน / สถานศึกษา</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="เช่น วิทยาลัยเทคนิค... / สำนักนโยบาย สอศ."
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-ovec-maroon focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              รหัสผ่าน {editingId ? "(เว้นว่างหากไม่เปลี่ยน)" : "*"}
            </label>
            <input
              type="password"
              required={!editingId}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={editingId ? "กรอกเฉพาะเมื่อต้องการตั้งรหัสใหม่" : "อย่างน้อย 6 ตัวอักษร"}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-ovec-maroon focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">ระดับสิทธิ์</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-xs focus:border-ovec-maroon focus:outline-none"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">สถานะบัญชี</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-xs focus:border-ovec-maroon focus:outline-none"
              >
                <option value="active">เปิดใช้งาน (Active)</option>
                <option value="suspended">ระงับสิทธิ์ (Suspended)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingUser}
            className="w-full rounded-xl bg-ovec-maroon hover:bg-ovec-dark text-white py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60"
          >
            {savingUser ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "สร้างบัญชีผู้ใช้งาน"}
          </button>
        </form>

        {/* Table */}
        <div className="xl:col-span-8 rounded-2xl bg-white border border-stone-200 p-5 shadow-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-ovec-maroon" />
              รายชื่อผู้ใช้งานทั้งหมด ({users.length} บัญชี)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-5 relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="ค้นหาชื่อ อีเมล หรือหน่วยงาน..."
                className="w-full rounded-xl border border-stone-300 pl-8 pr-3 py-1.5 text-xs focus:border-ovec-maroon focus:outline-none"
              />
            </div>

            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="sm:col-span-4 rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs focus:border-ovec-maroon focus:outline-none"
            >
              <option value="">ทุกระดับสิทธิ์</option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="sm:col-span-3 rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs focus:border-ovec-maroon focus:outline-none"
            >
              <option value="">ทุกสถานะ</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-stone-500">กำลังโหลดรายชื่อผู้ใช้งาน...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs font-medium text-stone-500">
                    <th className="py-2.5 pr-3">ผู้ใช้งาน</th>
                    <th className="py-2.5 px-2">ระดับสิทธิ์</th>
                    <th className="py-2.5 px-2">สถานะ</th>
                    <th className="py-2.5 pl-2 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-ovec-paper transition-colors">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-stone-900">{u.full_name}</span>
                          {u.is_primary_super && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 border border-amber-300/80 px-1.5 py-0 text-[11px] font-medium text-amber-900">
                              <Crown className="w-3 h-3 text-amber-700" strokeWidth={1.75} />
                              Primary
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-stone-500">{u.email}</div>
                        {u.department && (
                          <div className="text-[11px] text-stone-400">{u.department}</div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                            ROLE_BADGE_MAP[u.role] || "bg-stone-100 text-stone-700"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            u.status === "active" ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.status === "active" ? "bg-emerald-600" : "bg-rose-600"
                            }`}
                          />
                          {u.status === "active" ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td className="py-3 pl-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(u.id);
                            setFullName(u.full_name);
                            setEmail(u.email);
                            setDepartment(u.department || "");
                            setPassword("");
                            setRole(u.role);
                            setStatus(u.status);
                          }}
                          className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-ovec-maroon transition-colors mr-1"
                          title="แก้ไขผู้ใช้งาน"
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                          title="ลบผู้ใช้งาน"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
