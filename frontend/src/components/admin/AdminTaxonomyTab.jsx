import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderKanban,
  Pencil,
  Plus,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import {
  createCategoryApi,
  createGroupApi,
  deleteCategoryApi,
  deleteGroupApi,
  updateCategoryApi,
  updateGroupApi,
} from "../../lib/api";

export default function AdminTaxonomyTab({
  token,
  user,
  policy,
  groups,
  categories,
  onTaxonomyChanged,
}) {
  const canManage =
    user.role === "super_admin" ||
    (user.role === "knowledge_admin" && policy?.allow_knowledge_admin_manage_categories);

  const [notice, setNotice] = useState(null);

  // Left: Document Groups state
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupSaving, setGroupSaving] = useState(false);

  // Right: Document Categories state
  const [catName, setCatName] = useState("");
  const [catGroupId, setCatGroupId] = useState(() => (groups[0] ? String(groups[0].id) : ""));
  const [catIsDefault, setCatIsDefault] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [catSaving, setCatSaving] = useState(false);

  const resetGroupForm = () => {
    setGroupName("");
    setGroupDesc("");
    setEditingGroupId(null);
  };

  const resetCategoryForm = () => {
    setCatName("");
    setCatIsDefault(false);
    setEditingCatId(null);
    if (groups[0]) setCatGroupId(String(groups[0].id));
  };

  const handleSaveGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setGroupSaving(true);
    setNotice(null);
    try {
      if (editingGroupId) {
        await updateGroupApi(token, editingGroupId, {
          name: groupName.trim(),
          description: groupDesc.trim() || null,
        });
        setNotice({ type: "success", text: "แก้ไขกลุ่มประเภทเอกสารเรียบร้อยแล้ว" });
      } else {
        await createGroupApi(token, {
          name: groupName.trim(),
          description: groupDesc.trim() || null,
        });
        setNotice({ type: "success", text: "เพิ่มกลุ่มประเภทเอกสารใหม่เรียบร้อยแล้ว" });
      }
      resetGroupForm();
      await onTaxonomyChanged();
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setGroupSaving(false);
    }
  };

  const handleDeleteGroup = async (grp) => {
    if (!window.confirm(`ยืนยันการลบกลุ่มประเภทเอกสาร "${grp.name}" ?`)) return;
    setNotice(null);
    try {
      await deleteGroupApi(token, grp.id);
      if (editingGroupId === grp.id) resetGroupForm();
      await onTaxonomyChanged();
      setNotice({ type: "success", text: `ลบกลุ่ม "${grp.name}" เรียบร้อยแล้ว` });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    }
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    const targetGroupId = Number(catGroupId || groups[0]?.id);
    if (!catName.trim() || !targetGroupId) return;
    setCatSaving(true);
    setNotice(null);
    try {
      if (editingCatId) {
        await updateCategoryApi(token, editingCatId, {
          name: catName.trim(),
          group_id: targetGroupId,
          is_default: catIsDefault,
        });
        setNotice({
          type: "success",
          text: "แก้ไขหมวดหมู่เอกสารและซิงก์ไปยังหน้าอัปโหลด/หน้าแชตบอทแล้ว",
        });
      } else {
        await createCategoryApi(token, {
          name: catName.trim(),
          group_id: targetGroupId,
          is_default: catIsDefault,
        });
        setNotice({
          type: "success",
          text: "เพิ่มหมวดหมู่เอกสารใหม่และซิงก์ไปยังหน้าอัปโหลด/หน้าแชตบอทแล้ว",
        });
      }
      resetCategoryForm();
      await onTaxonomyChanged();
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (!window.confirm(`ยืนยันการลบหมวดหมู่ "${cat.name}" ?`)) return;
    setNotice(null);
    try {
      await deleteCategoryApi(token, cat.id);
      if (editingCatId === cat.id) resetCategoryForm();
      await onTaxonomyChanged();
      setNotice({ type: "success", text: `ลบหมวดหมู่ "${cat.name}" เรียบร้อยแล้ว` });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    }
  };

  return (
    <div className="space-y-4">
      {!canManage && (
        <div className="rounded-2xl bg-amber-50 border border-amber-300 px-4 py-3 text-xs sm:text-sm text-amber-950 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            คุณอยู่ในโหมดดูข้อมูลเท่านั้น — นโยบาย Governance ปัจจุบันอนุญาตเฉพาะ Super Admin ในการเพิ่ม/แก้ไข/ลบกลุ่มและหมวดหมู่เอกสาร
          </span>
        </div>
      )}

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* LEFT: Document Type Groups */}
        <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-card space-y-4">
          <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-ovec-maroon" />
            กลุ่มประเภทเอกสารหลัก ({groups.length} กลุ่ม)
          </h3>

          <form onSubmit={handleSaveGroup} className="space-y-2.5 bg-ovec-cream/70 p-3.5 rounded-xl border border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ovec-dark">
                {editingGroupId ? "แก้ไขกลุ่มประเภทเอกสาร" : "เพิ่มกลุ่มประเภทเอกสารใหม่"}
              </span>
              {editingGroupId && (
                <button
                  type="button"
                  onClick={resetGroupForm}
                  className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-0.5"
                >
                  <X className="w-3.5 h-3.5" /> ยกเลิก
                </button>
              )}
            </div>

            <input
              type="text"
              required
              disabled={!canManage}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="ชื่อกลุ่มประเภทเอกสารหลัก..."
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs sm:text-sm focus:border-ovec-maroon focus:outline-none disabled:bg-stone-100"
            />
            <input
              type="text"
              disabled={!canManage}
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              placeholder="คำอธิบายกลุ่ม (ไม่บังคับ)..."
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs focus:border-ovec-maroon focus:outline-none disabled:bg-stone-100"
            />
            <button
              type="submit"
              disabled={!canManage || groupSaving || !groupName.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ovec-maroon hover:bg-ovec-dark disabled:bg-stone-300 text-white px-4 py-2 text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              {editingGroupId ? "บันทึกการแก้ไขกลุ่ม" : "เพิ่มกลุ่มประเภทหลัก"}
            </button>
          </form>

          <div className="divide-y divide-stone-100">
            {groups.map((grp) => (
              <div key={grp.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-stone-900">{grp.name}</span>
                    <span className="text-[11px] text-stone-500 tabular-nums">
                      ({grp.category_count} หมวดหมู่)
                    </span>
                  </div>
                  {grp.description && (
                    <p className="text-xs text-stone-500 mt-0.5">{grp.description}</p>
                  )}
                </div>

                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGroupId(grp.id);
                        setGroupName(grp.name);
                        setGroupDesc(grp.description || "");
                      }}
                      className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-ovec-maroon transition-colors"
                      title="แก้ไขกลุ่ม"
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(grp)}
                      className="p-1.5 rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                      title="ลบกลุ่ม"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Document Categories */}
        <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-card space-y-4">
          <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <Tags className="w-5 h-5 text-ovec-maroon" />
            หมวดหมู่เอกสารย่อย ({categories.length} หมวดหมู่)
          </h3>

          <form onSubmit={handleSaveCategory} className="space-y-2.5 bg-ovec-cream/70 p-3.5 rounded-xl border border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ovec-dark">
                {editingCatId ? "แก้ไข / ย้ายสังกัดกลุ่มหมวดหมู่" : "เพิ่มหมวดหมู่เอกสารย่อยใหม่"}
              </span>
              {editingCatId && (
                <button
                  type="button"
                  onClick={resetCategoryForm}
                  className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-0.5"
                >
                  <X className="w-3.5 h-3.5" /> ยกเลิก
                </button>
              )}
            </div>

            <select
              required
              disabled={!canManage}
              value={catGroupId || (groups[0] ? String(groups[0].id) : "")}
              onChange={(e) => setCatGroupId(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs sm:text-sm focus:border-ovec-maroon focus:outline-none disabled:bg-stone-100"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  สังกัดกลุ่ม: {g.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              required
              disabled={!canManage}
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="ชื่อหมวดหมู่เอกสารย่อย..."
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs sm:text-sm focus:border-ovec-maroon focus:outline-none disabled:bg-stone-100"
            />

            <label className="inline-flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={catIsDefault}
                onChange={(e) => setCatIsDefault(e.target.checked)}
                className="rounded border-stone-300 text-ovec-maroon focus:ring-ovec-maroon"
              />
              กำหนดเป็นหมวดหมู่ตั้งต้น (Default)
            </label>

            <div>
              <button
                type="submit"
                disabled={!canManage || catSaving || !catName.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-ovec-maroon hover:bg-ovec-dark disabled:bg-stone-300 text-white px-4 py-2 text-xs font-semibold transition"
              >
                <Plus className="w-3.5 h-3.5" />
                {editingCatId ? "บันทึกการแก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่ย่อย"}
              </button>
            </div>
          </form>

          <div className="divide-y divide-stone-100 max-h-[460px] overflow-y-auto pr-1">
            {categories.map((cat) => (
              <div key={cat.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-stone-900">{cat.name}</span>
                    {cat.is_default && (
                      <span className="text-[11px] font-medium bg-amber-50 border border-amber-200 text-amber-900 px-1.5 py-0 rounded">
                        Default
                      </span>
                    )}
                    <span className="text-[11px] text-stone-500 tabular-nums">
                      ({cat.document_count} เอกสาร)
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    กลุ่มหลัก: {cat.group_name}
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatId(cat.id);
                        setCatName(cat.name);
                        setCatGroupId(String(cat.group_id));
                        setCatIsDefault(Boolean(cat.is_default));
                      }}
                      className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-ovec-maroon transition-colors"
                      title="แก้ไข / ย้ายกลุ่ม"
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat)}
                      className="p-1.5 rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                      title="ลบหมวดหมู่"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
