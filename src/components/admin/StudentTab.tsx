"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// --- 🎯 靜態設定 (抽到組件外，避免重複渲染) ---
const CATEGORIES = ["國小部", "國中部", "幼兒部 / 其他"];
const GRADES = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "無"];
const MODAL_TABS = ["必填資料", "基本資料", "聯絡人"];

export type Student = {
  id: string;
  name: string;
  grade: string;
  gender?: string | null;
  student_phone?: string | null;
  school_name?: string | null;
  referrer_name?: string | null;
  student_code?: string | null;
  balance?: number;
  dietary_restrictions?: string;
  birthday?: string | null;
  address?: string;
  student_parent_relations?: {
    relationship: string;
    parents: {
      id: string;
      phone: string;
      name: string;
    };
  }[];
};

// ==========================================
// 1️⃣ 主頁面：負責顯示列表、搜尋、切換部別
// ==========================================
export default function StudentTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [activeCategory, setActiveCategory] = useState("國小部");
  const [activeGrade, setActiveGrade] = useState("小一");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("students")
      .select(`*, student_parent_relations ( relationship, parents (id, phone, name) )`)
      .order("student_code");

    setStudents((data as any) || []);
    setLoading(false);
  };

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    if (cat === "國小部") setActiveGrade("小一");
    else if (cat === "國中部") setActiveGrade("國一");
    else setActiveGrade("大班");
  };

  const deleteStudent = async (id: string) => {
    if (!confirm("確定刪除此學生？相關點名與訂單紀錄將一併移除。")) return;
    await supabase.from("students").delete().eq("id", id);
    fetchStudents();
  };

  const topupStudent = async (studentId: string, currentBalance: number, studentName: string) => {
    const input = prompt(`請輸入給 ${studentName} 的儲值金額`);
    if (!input) return;
    const amount = parseInt(input);
    if (isNaN(amount) || amount <= 0) return;
    const newBalance = (currentBalance || 0) + amount;

    await supabase.from("students").update({ balance: newBalance }).eq("id", studentId);
    await supabase.from("transactions").insert([{ student_id: studentId, type: "topup", amount, balance_after: newBalance, description: "管理員儲值" }]);
    fetchStudents();
  };

  const filteredStudents = students.filter((s) => {
    const keyword = search.toLowerCase();
    const hasPhoneMatch = s.student_parent_relations?.some((rel) => rel.parents.phone.includes(keyword));
    return (s.name || "").toLowerCase().includes(keyword) || (s.grade || "").toLowerCase().includes(keyword) || hasPhoneMatch;
  });

  return (
    <div className="space-y-6">
      {/* 1. 搜尋與新增按鈕 */}
      <div className="flex gap-4">
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex-1">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋姓名 / 年級 / 家長電話..." className="w-full px-5 py-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-blue-500 text-black" />
        </div>
        <button onClick={() => { setSelectedStudent(null); setIsModalOpen(true); }} className="bg-blue-600 text-white px-8 rounded-3xl font-bold text-lg shadow-lg hover:bg-blue-700 transition">
          ＋ 新增學生
        </button>
      </div>

      {/* 2. 第一層：部別切換標籤 */}
      <div className="flex gap-2 mb-[-8px]">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            className={`flex-1 py-3 rounded-t-2xl font-bold transition-all ${activeCategory === cat ? "bg-blue-600 text-white shadow-lg" : "bg-gray-200 text-gray-500"}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 3. 第二層：年級橫向捲動選單 */}
      <div className="bg-white p-3 flex gap-2 overflow-x-auto border-x border-gray-100">
        {GRADES.filter((g) => {
          if (activeCategory === "國小部") return g.includes("小");
          if (activeCategory === "國中部") return g.includes("國");
          return !g.includes("小") && !g.includes("國");
        }).map((g) => (
          <button
            key={g}
            onClick={() => setActiveGrade(g)}
            className={`px-6 py-2 rounded-full whitespace-nowrap font-bold transition-all ${activeGrade === g ? "bg-cyan-500 text-white shadow-md" : "bg-gray-100 text-gray-400 hover:bg-gray-200"}`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* 4. 第三層：學生名單卡片 */}
      <div className="bg-white p-6 rounded-b-3xl shadow-sm border-x border-b border-gray-100 min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center py-20"><p className="text-gray-400">載入中...</p></div>
        ) : (
          <div className="grid gap-4">
            <div className="flex justify-between items-end mb-4 border-b pb-2">
              <h3 className="text-2xl font-black text-gray-800">{activeGrade}</h3>
              <span className="text-sm font-bold text-gray-400">共 {filteredStudents.filter((s) => s.grade === activeGrade).length} 位學生</span>
            </div>

            {filteredStudents.filter((s) => s.grade === activeGrade).length > 0 ? (
              filteredStudents
                .filter((s) => s.grade === activeGrade)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((student) => (
                  <div key={student.id} className="flex justify-between items-center p-5 hover:bg-blue-50/30 rounded-2xl transition border border-gray-100 shadow-sm bg-white">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="font-black text-gray-900 text-xl">{student.name}</p>
                        {student.dietary_restrictions && <span className="text-red-500 text-xs bg-red-50 px-2 py-0.5 rounded border border-red-100">⚠️ {student.dietary_restrictions}</span>}
                      </div>
                      <div className="text-sm text-gray-500 mt-2 space-y-1">
                        {student.student_parent_relations?.map((rel, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-cyan-600 font-bold bg-cyan-50 px-2 py-0.5 rounded text-xs">{rel.relationship}</span>
                            <span className="font-mono">{rel.parents.phone}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-md font-black text-green-600 mt-2">餘額：${student.balance || 0}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => topupStudent(student.id, student.balance || 0, student.name)} className="bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-black shadow-md transition">儲值</button>
                      <button onClick={() => { setSelectedStudent(student); setIsModalOpen(true); }} className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-5 py-2.5 rounded-xl text-sm font-black transition">編輯</button>
                      <button onClick={() => deleteStudent(student.id)} className="bg-red-50 hover:bg-red-100 text-red-500 px-5 py-2.5 rounded-xl text-sm font-black transition">刪除</button>
                    </div>
                  </div>
                ))
            ) : (
              <div className="text-center py-20"><p className="text-gray-300 italic text-lg">目前此年級尚無資料</p></div>
            )}
          </div>
        )}
      </div>

      {/* 獨立出來的 Modal 子組件 */}
      {isModalOpen && (
        <StudentFormModal
          student={selectedStudent}
          onClose={() => setIsModalOpen(false)}
          onRefresh={fetchStudents}
        />
      )}
    </div>
  );
}

// ==========================================
// 2️⃣ 子組件：新增/編輯表單 (打字不卡頓的秘密)
// ==========================================
function StudentFormModal({ student, onClose, onRefresh }: { student: Student | null; onClose: () => void; onRefresh: () => void }) {
  const [modalTab, setModalTab] = useState("必填資料");
  const [saving, setSaving] = useState(false);
  
  // 初始化表單資料
  const [formData, setFormData] = useState<Student>(
    student ? JSON.parse(JSON.stringify(student)) : {
      name: "", grade: "", student_code: "", dietary_restrictions: "", birthday: "", address: "", student_parent_relations: []
    }
  );

  // 家長搜尋狀態
  const [searchParentPhone, setSearchParentPhone] = useState("");

  const handleInputChange = (field: keyof Student, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const detachParent = (parentId: string) => {
    setFormData((prev) => ({
      ...prev,
      student_parent_relations: prev.student_parent_relations?.filter((rel) => rel.parents.id !== parentId) || [],
    }));
  };

  const handleQuickAddParent = () => {
    const titleInput = document.getElementById("newRelTitle") as HTMLInputElement;
    const phoneInput = document.getElementById("newRelPhone") as HTMLInputElement;
    const title = titleInput?.value;
    const phone = phoneInput?.value;

    if (!title || !/^09\d{8}$/.test(phone)) {
      alert("請填寫稱謂與正確手機號碼 (09xxxxxxxx)");
      return;
    }

    const newRel = {
      relationship: title,
      parents: { id: "", name: title, phone },
    };

    setFormData((prev) => ({
      ...prev,
      student_parent_relations: [...(prev.student_parent_relations || []), newRel],
    }));

    titleInput.value = "";
    phoneInput.value = "";
  };

  const saveStudent = async () => {
    if (!formData.name?.trim() || !formData.grade) {
      alert("請填寫姓名與年級");
      return;
    }

    try {
      setSaving(true);
      const studentData = { ...formData };
      delete (studentData as any).student_parent_relations;

      // 處理資料庫不接受的空字串
      if (!studentData.id || studentData.id.length < 5) delete (studentData as any).id;
      if (studentData.birthday === "") studentData.birthday = null;
      if (studentData.student_phone === "") studentData.student_phone = null;
      if (studentData.student_code === "") studentData.student_code = null;
      if (studentData.gender === "") studentData.gender = null;

      // 儲存學生基本資料
      const { data: st, error: stError } = await supabase.from("students").upsert([studentData]).select().single();
      if (stError) throw stError;

      // 處理家長關係
      const finalRelations = [];
      if (formData.student_parent_relations) {
        for (const rel of formData.student_parent_relations) {
          let pId = rel.parents.id;

          if (!pId) {
            const { data: existingP } = await supabase.from("parents").select("id").eq("phone", rel.parents.phone).maybeSingle();
            if (existingP) {
              pId = existingP.id;
            } else {
              const { data: newP, error: pErr } = await supabase.from("parents").insert([{ name: rel.parents.name || rel.relationship, phone: rel.parents.phone }]).select().single();
              if (pErr) throw pErr;
              pId = newP.id;
            }
          }
          finalRelations.push({ student_id: st.id, parent_id: pId, relationship: rel.relationship || "家長" });
        }
      }

      // 同步關係表
      await supabase.from("student_parent_relations").delete().eq("student_id", st.id);
      if (finalRelations.length > 0) {
        const { error: relErr } = await supabase.from("student_parent_relations").insert(finalRelations);
        if (relErr) throw relErr;
      }

      alert(formData.id ? "✅ 編輯成功" : "✅ 新增成功");
      onRefresh();
      onClose();
    } catch (error: any) {
      console.error("儲存流程出錯：", error);
      alert("❌ 儲存失敗！\n\n原因：" + (error.message || "未知錯誤") + "\n詳情：請檢查生日格式或必填欄位");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-cyan-500 p-6 flex justify-between items-center text-white">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            📋 {formData.id ? "≡ 編輯學員資料" : "≡ 新增學員資料"}
          </h2>
          <button onClick={onClose} className="text-3xl text-white/70 hover:text-white">×</button>
        </div>

        {/* Tab 導覽 */}
        <div className="border-b border-gray-100 flex gap-1 px-6 pt-4 bg-gray-50">
          {MODAL_TABS.map((tabName) => (
            <button
              key={tabName}
              onClick={() => setModalTab(tabName)}
              className={`px-5 py-3 rounded-t-xl font-bold transition-all ${modalTab === tabName ? "bg-white text-blue-700 border-b-2 border-blue-700" : "text-gray-500 hover:text-blue-600 hover:bg-white/50"}`}
            >
              {tabName}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 text-black">
          {/* Tab 1: 必填資料 */}
          {modalTab === "必填資料" && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-blue-900 mb-1 font-bold">姓名 <span className="text-red-500">*</span></label>
                  <input value={formData.name || ""} onChange={(e) => handleInputChange("name", e.target.value)} placeholder="輸入中文姓名" className="w-full border px-4 py-3 rounded-xl focus:ring-blue-300 outline-none" />
                </div>
                <div>
                  <label className="block text-blue-900 mb-1 font-bold">性別</label>
                  <div className="flex gap-4 py-2">
                    {["男", "女"].map((g) => (
                      <label key={g} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="gender" value={g} checked={formData.gender === g} onChange={(e) => handleInputChange("gender", e.target.value)} className="w-5 h-5 text-cyan-500" />
                        <span>{g}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-blue-900 mb-1 font-bold">年級 <span className="text-red-500">*</span></label>
                  <select value={formData.grade || ""} onChange={(e) => handleInputChange("grade", e.target.value)} className="w-full border px-4 py-3 rounded-xl outline-none">
                    <option value="">選擇年級</option>
                    {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-gray-600 mb-1 font-bold">就讀學校</label>
                  <input value={formData.school_name || ""} onChange={(e) => handleInputChange("school_name", e.target.value)} placeholder="學校名稱 / 班級名稱" className="w-full border px-4 py-3 rounded-xl outline-none" />
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: 基本資料 */}
          {modalTab === "基本資料" && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-600 mb-1 font-bold">生日</label>
                <input type="date" value={formData.birthday || ""} onChange={(e) => handleInputChange("birthday", e.target.value)} className="w-full border px-4 py-3 rounded-xl outline-none" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1 font-bold">學員行動電話</label>
                <input value={formData.student_phone || ""} onChange={(e) => handleInputChange("student_phone", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="輸入 10 碼數字" className="w-full border px-4 py-3 rounded-xl outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-gray-600 mb-1 font-bold">推薦人</label>
                <input value={formData.referrer_name || ""} onChange={(e) => handleInputChange("referrer_name", e.target.value)} placeholder="輸入推薦人姓名或編號" className="w-full border px-4 py-3 rounded-xl outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-gray-600 mb-1 font-bold">飲食禁忌</label>
                <input value={formData.dietary_restrictions || ""} onChange={(e) => handleInputChange("dietary_restrictions", e.target.value)} placeholder="如海鮮過敏，會在姓名後加上星號" className="w-full border px-4 py-3 rounded-xl outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-gray-600 mb-1 font-bold">地址</label>
                <input value={formData.address || ""} onChange={(e) => handleInputChange("address", e.target.value)} placeholder="輸入完整居住地址" className="w-full border px-4 py-3 rounded-xl outline-none" />
              </div>
            </div>
          )}

          {/* Tab 3: 聯絡人 */}
          {modalTab === "聯絡人" && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-bold text-gray-700">當前聯絡人</h3>
                {formData.student_parent_relations?.map((rel, index) => (
                  <div key={index} className="flex gap-2 items-center bg-gray-50 p-3 rounded-2xl border border-gray-100">
                    <input
                      value={rel.relationship}
                      onChange={(e) => {
                        const newList = [...formData.student_parent_relations!];
                        newList[index].relationship = e.target.value;
                        handleInputChange("student_parent_relations", newList);
                      }}
                      placeholder="稱謂"
                      className="w-24 px-3 py-2 rounded-xl border-none bg-cyan-500 text-white font-bold placeholder-white/70 text-center outline-none"
                    />
                    <div className="flex-1 px-3 font-mono text-gray-600 font-bold">{rel.parents.phone}</div>
                    <button onClick={() => detachParent(rel.parents.id)} className="text-red-400 hover:text-red-600 px-3 font-bold">移除</button>
                  </div>
                ))}
                {!formData.student_parent_relations?.length && <p className="text-gray-400 text-center py-4 italic">尚未設定聯絡人</p>}
              </div>

              <hr className="border-gray-100" />

              <div className="bg-cyan-50/50 p-6 rounded-3xl border-2 border-dashed border-cyan-100">
                <h3 className="font-bold text-cyan-800 mb-4 flex items-center gap-2"><span>＋ 快速加入新聯絡人</span></h3>
                <div className="flex gap-3">
                  <input id="newRelTitle" placeholder="稱謂 (例: 爸爸)" className="w-1/3 p-3 rounded-xl border-2 border-white bg-white shadow-sm focus:ring-2 focus:ring-cyan-500 outline-none font-bold" />
                  <input id="newRelPhone" placeholder="手機號碼" className="flex-1 p-3 rounded-xl border-2 border-white bg-white shadow-sm focus:ring-2 focus:ring-cyan-500 outline-none font-mono" />
                  <button onClick={handleQuickAddParent} className="bg-cyan-500 text-white px-6 rounded-xl font-bold hover:bg-cyan-600 transition shadow-md">加入</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 p-6 flex justify-end items-center border-t border-gray-100">
          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving} className="bg-white text-gray-600 px-6 py-3 rounded-2xl font-bold border hover:bg-gray-100 transition">
              取消
            </button>
            <button onClick={saveStudent} disabled={saving} className="bg-cyan-500 text-white px-10 py-3 rounded-2xl font-bold shadow hover:bg-cyan-600 transition disabled:bg-cyan-300">
              {saving ? "處理中..." : (formData.id ? "≡ 儲存修改" : "≡ 送出新增")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}