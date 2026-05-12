"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
  gender?: string;        // 增加性別
  student_phone?: string; // 增加學員手機
  school_name?: string;   // 增加就讀學校
  referrer_name?: string; // 增加推薦人
  student_code?: string;
  balance?: number;
  dietary_restrictions?: string;
  birthday?: string;
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

export default function StudentTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // 核心：控制編輯/新增 Modal 的 State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [modalTab, setModalTab] = useState("必填資料");

  // 家長搜尋用 State (Tab 3 關鍵)
  const [searchParentPhone, setSearchParentPhone] = useState("");
  const [foundParent, setFoundParent] = useState<any | null>(null);

  const grades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "無"];
  const modalTabs = ["必填資料", "基本資料", "聯絡人"];

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("students")
      .select(`
        *,
        student_parent_relations (
          relationship, 
          parents (id, phone, name)
        )
      `)
      .order("student_code");
    
    setStudents(data as any || []);
    setLoading(false);
  };

  // 打開 Modal 的邏輯 (兼容新增與編輯)
  const openModal = (student: Student | null = null) => {
    setEditingStudent(student ? JSON.parse(JSON.stringify(student)) : {
        name: "", grade: "", student_code: "", fixed_days: [], dietary_restrictions: "", birthday: "", address: "", student_parent_relations: []
    } as any);
    setModalTab("必填資料");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingStudent(null);
    setSearchParentPhone("");
    setFoundParent(null);
  };

  const handleInputChange = (field: keyof Student, value: any) => {
    setEditingStudent(prev => prev ? { ...prev, [field]: value } : null);
  };

  // 🔎 核心：搜尋資料庫家長 (Tab 3 用)
  const searchParent = async () => {
    if (!/^09\d{8}$/.test(searchParentPhone)) { alert("請輸入正確手機號碼"); return; }
    const { data, error } = await supabase.from("parents").select("id, phone, name").eq("phone", searchParentPhone).maybeSingle();
    
    if (error) { alert("搜尋失敗"); return; }
    if (!data) { alert("此手機號碼尚未建立家長帳號，請先確認家長名單白名單"); return; }
    
    // 檢查是否已在列表中
    if (editingStudent?.student_parent_relations?.some(r => r.parents.id === data.id)) {
        alert("此家長已連結"); return;
    }
    
    setFoundParent(data);
  };

  // ➕ 核心：連結新家長 (Tab 3 用)
  const attachParent = (relationship: string) => {
    if (!foundParent || !editingStudent) return;
    const newRelation = { relationship, parents: foundParent };
    
    setEditingStudent(prev => ({
        ...prev!,
        student_parent_relations: [...(prev!.student_parent_relations || []), newRelation]
    }));
    
    setFoundParent(null);
    setSearchParentPhone("");
  };

  // ➖ 核心：解綁家長 (Tab 3 用)
  const detachParent = (parentId: string) => {
    if (!editingStudent) return;
    setEditingStudent(prev => ({
        ...prev!,
        student_parent_relations: prev!.student_parent_relations?.filter(rel => rel.parents.id !== parentId) || []
    }));
  };

  // 💾 終極編輯/新增儲存邏輯
  const saveStudent = async () => {
    if (!editingStudent || !editingStudent.name.trim() || !editingStudent.grade) { alert("請填寫姓名與年級"); return; }

    try {
        // 1. 更新或新增學生基本資料 (upsert 會依據 id 自動判斷)
        const studentDataToSave = { ...editingStudent };
        // 移除 relations 嵌套，因為 upsert 不支援 nested insert
        delete studentDataToSave.student_parent_relations;
        
        const { data: st, error: stError } = await supabase
          .from("students")
          .upsert([studentDataToSave])
          .select().single();
          
        if (stError) throw new Error("學生資料儲存失敗");

        // 2. 更新關係表 (最麻煩的一步)
        // 先解綁所有舊關係，再綁定所有新關係，這是處理多對多最安全的方法
        // 如果是新增學生， st.id 就是新 ID，如果是編輯， st.id 保持不變
        if (editingStudent.student_parent_relations) {
            // 2a. 解綁該學生的所有當前關係
            await supabase.from("student_parent_relations").delete().eq("student_id", st.id);
            
            // 2b. 建立 Modal 裡面的所有新關係
            const relationRows = editingStudent.student_parent_relations.map(rel => ({
                student_id: st.id,
                parent_id: rel.parents.id,
                relationship: rel.relationship
            }));
            if (relationRows.length > 0) {
                const { error: relError } = await supabase.from("student_parent_relations").insert(relationRows);
                if (relError) throw new Error("家長關係建立失敗");
            }
        }
        
        alert(editingStudent.id ? "編輯成功" : "新增成功");
        closeModal();
        fetchStudents();
    } catch (error: any) {
        alert(error.message);
    }
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
    const hasPhoneMatch = s.student_parent_relations?.some(rel => rel.parents.phone.includes(keyword));
    return s.name.toLowerCase().includes(keyword) || s.grade.toLowerCase().includes(keyword) || hasPhoneMatch;
  });

  const renderStudentSection = (title: string, list: Student[]) => {
    if (list.length === 0) return null;
    return (
      <div className="bg-white rounded-3xl p-6 shadow-sm mb-6 border border-gray-100">
        <h2 className="text-2xl font-bold mb-5 text-gray-800 border-l-4 border-blue-600 pl-3">{title}</h2>
        {Array.from(new Set(list.map(s => s.grade))).sort((a,b) => grades.indexOf(a) - grades.indexOf(b)).map(g => {
            const gradeList = list.filter(s => s.grade === g);
            return (
                <div key={g} className="mb-6">
                    <h3 className="font-bold text-blue-600 text-lg mb-3 bg-blue-50 inline-block px-3 py-1 rounded-lg">
                        {g || "未設定"} ({gradeList.length})
                    </h3>
                    <div className="grid gap-3">
                        {gradeList.map(student => (
                            <div key={student.id} className="flex justify-between items-center p-4 hover:bg-gray-50 rounded-2xl transition border-b border-gray-50">
                                <div>
                                    <p className="font-bold text-gray-900 text-lg">{student.name}</p>
                                    <div className="text-sm text-gray-500 space-y-1">
                                        {student.student_parent_relations && student.student_parent_relations.length > 0 ? (
                                            student.student_parent_relations.map((rel, index) => (
                                                <p key={index}>
                                                    <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs mr-2">
                                                        {rel.relationship}
                                                    </span>
                                                    {rel.parents.phone}
                                                </p>
                                            ))
                                        ) : (
                                            <p>📱 無電話</p>
                                        )}
                                    </div>
                                    <p className="text-sm font-bold text-green-600 mt-1">餘額：${student.balance || 0}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => topupStudent(student.id, student.balance || 0, student.name)} className="bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm">儲值</button>
                                    {/* 💡 修改此處：新增編輯按鈕 */}
                                    <button onClick={() => openModal(student)} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-sm font-bold">編輯</button>
                                    <button onClick={() => deleteStudent(student.id)} className="bg-red-50 text-red-500 px-4 py-2 rounded-xl text-sm font-bold">刪除</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 搜尋與新增按鈕 */}
      <div className="flex gap-4">
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex-1">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋姓名 / 年級 / 家長電話..." className="w-full px-5 py-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-blue-500 text-black" />
        </div>
        <button onClick={() => openModal()} className="bg-blue-600 text-white px-8 rounded-3xl font-bold text-lg shadow-lg hover:bg-blue-700transition">
            ＋ 新增學生
        </button>
      </div>

      {/* 列表內容 */}
      {loading ? <p className="text-center py-10 text-gray-400">資料載入中...</p> : (
        <>
          {renderStudentSection("國小部", filteredStudents.filter(s => s.grade.includes("小")))}
          {renderStudentSection("國中部", filteredStudents.filter(s => s.grade.includes("國")))}
          {renderStudentSection("幼兒部 / 其他", filteredStudents.filter(s => !s.grade.includes("小") && !s.grade.includes("國")))}
        </>
      )}

      {/* 終極 Mido9 風格 多 Tab 編輯 Modal */}
      {isModalOpen && editingStudent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            
            {/* Modal Header (參考 Mido9 色塊) */}
            <div className="bg-cyan-500 p-6 flex justify-between items-center text-white">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                📋 {editingStudent.id ? "≡ 編輯學員資料" : "≡ 新增學員資料"}
              </h2>
              <button onClick={closeModal} className="text-3xl text-white/70 hover:text-white">×</button>
            </div>

            {/* Tab 導覽 (參考 image_11.png) */}
            <div className="border-b border-gray-100 flex gap-1 px-6 pt-4 bg-gray-50">
              {modalTabs.map(tabName => (
                <button
                  key={tabName}
                  onClick={() => setModalTab(tabName)}
                  className={`px-5 py-3 rounded-t-xl font-bold transition-all ${
                    modalTab === tabName 
                    ? "bg-white text-blue-700 border-b-2 border-blue-700" 
                    : "text-gray-500 hover:text-blue-600 hover:bg-white/50"
                  }`}
                >
                  {tabName}
                </button>
              ))}
            </div>

            {/* Modal Body (各 Tab 內容) */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 text-black">
              
              {/* Tab 1: 必填資料 (增加性別、學校) */}
              {modalTab === "必填資料" && (
                <div className="space-y-4 text-black">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-blue-900 mb-1 font-bold">姓名 <span className="text-red-500">*</span></label>
                      <input value={editingStudent.name} onChange={(e) => handleInputChange("name", e.target.value)} placeholder="輸入中文姓名" className="w-full border px-4 py-3 rounded-xl focus:ring-blue-300" />
                    </div>
                    <div>
                      <label className="block text-blue-900 mb-1 font-bold">性別 <span className="text-red-500">*</span></label>
                      <div className="flex gap-4 py-2">
                        {["男", "女"].map(g => (
                          <label key={g} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="gender" value={g} checked={editingStudent.gender === g} onChange={(e) => handleInputChange("gender", e.target.value)} className="w-5 h-5 text-cyan-500" />
                           <span>{g}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-blue-900 mb-1 font-bold">年級 <span className="text-red-500">*</span></label>
                      <select value={editingStudent.grade} onChange={(e) => handleInputChange("grade", e.target.value)} className="w-full border px-4 py-3 rounded-xl">
                        <option value="">選擇年級</option>
                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-gray-600 mb-1">就讀學校</label>
                      <input value={editingStudent.school_name || ""} onChange={(e) => handleInputChange("school_name", e.target.value)} placeholder="學校名稱 / 班級名稱" className="w-full border px-4 py-3 rounded-xl" />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: 基本資料 (增加學員手機、推薦人，移除大頭照、卡號) */}
              {modalTab === "基本資料" && (
                <div className="grid md:grid-cols-2 gap-4 text-black">
                  <div>
                    <label className="block text-gray-600 mb-1 font-medium">生日</label>
                    <input type="date" value={editingStudent.birthday || ""} onChange={(e) => handleInputChange("birthday", e.target.value)} className="w-full border px-4 py-3 rounded-xl" />
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1 font-medium">學員行動電話</label>
                    <input value={editingStudent.student_phone || ""} onChange={(e) => handleInputChange("student_phone", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="輸入 10 碼數字" className="w-full border px-4 py-3 rounded-xl" />
                  </div>
                  <div className="md:col-span-2">
                      <label className="block text-gray-600 mb-1 font-medium">推薦人</label>
                      <input value={editingStudent.referrer_name || ""} onChange={(e) => handleInputChange("referrer_name", e.target.value)} placeholder="輸入推薦人姓名或編號" className="w-full border px-4 py-3 rounded-xl" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-gray-600 mb-1 font-medium">飲食禁忌</label>
                    <input value={editingStudent.dietary_restrictions || ""} onChange={(e) => handleInputChange("dietary_restrictions", e.target.value)} placeholder="如海鮮過敏，會在姓名後加上星號" className="w-full border px-4 py-3 rounded-xl" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-gray-600 mb-1 font-medium">地址</label>
                    <input value={editingStudent.address || ""} onChange={(e) => handleInputChange("address", e.target.value)} placeholder="輸入完整居住地址" className="w-full border px-4 py-3 rounded-xl" />
                  </div>
                </div>
              )}

              {/* Tab 3: 聯絡人 (最核心：管理關係) (參考 image_14.png) */}
              {modalTab === "聯絡人" && (
                <div className="space-y-6">
                  
                  {/* 當前已綁定家長 */}
                  <h3 className="text-xl font-bold text-gray-800">當前聯絡人 ({editingStudent.student_parent_relations?.length || 0})</h3>
                  <div className="space-y-3">
                    {editingStudent.student_parent_relations?.map((rel, index) => (
                        <div key={index} className="flex justify-between items-center bg-gray-50 border p-4 rounded-xl">
                            <div>
                                <span className="bg-cyan-500 text-white px-3 py-1 rounded-full text-sm font-medium mr-3">{rel.relationship}</span>
                                <span className="font-bold text-black">{rel.parents.name}</span>
                                <span className="text-gray-600 ml-4">📱 {rel.parents.phone}</span>
                            </div>
                            <button onClick={() => detachParent(rel.parents.id)} className="text-red-500 font-bold text-sm">解綁</button>
                        </div>
                    ))}
                    {!editingStudent.student_parent_relations?.length && <p className="text-gray-400 text-center py-4 bg-gray-50 rounded-xl">尚未連結任何家長</p>}
                  </div>

                  <hr className="border-gray-100" />

                  {/* ➕ 核心功能：搜尋與新增連結 */}
                  <h3 className="text-xl font-bold text-gray-800">＋ 連結新家長 (搜尋白名單)</h3>
                  <div className="flex gap-2">
                    <input value={searchParentPhone} onChange={(e) => setSearchParentPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="輸入家長手機號碼..." className="w-full flex-1 border px-4 py-3 rounded-xl" />
                    <button onClick={searchParent} className="bg-cyan-500 text-white px-6 rounded-xl font-bold">搜尋</button>
                  </div>

                  {/* 搜尋結果顯示與選擇關係 */}
                  {foundParent && (
                    <div className="bg-cyan-50 border border-cyan-200 p-5 rounded-2xl space-y-4">
                        <div className="flex justify-between">
                            <p className="font-bold text-black">找到家長：{foundParent.name} ({foundParent.phone})</p>
                            <button onClick={() => setFoundParent(null)} className="text-cyan-600">取消</button>
                        </div>
                        <p className="text-sm text-cyan-800 font-medium">請選擇稱謂並綁定：</p>
                        <div className="flex gap-2 flex-wrap">
                            {["爸爸", "媽媽", "阿嬤", "阿公", "其他"].map(rel => (
                                <button key={rel} onClick={() => attachParent(rel)} className="bg-white border-cyan-300 border text-cyan-800 px-5 py-2 rounded-lg font-bold hover:bg-cyan-100 transition">
                                    ＋ 綁定為【{rel}】
                                </button>
                            ))}
                        </div>
                    </div>
                  )}
                  
                  <div className="bg-gray-100 text-gray-600 text-sm p-4 rounded-xl">
                    <p className="font-bold">💡 小提醒：</p>
                    <p>舊系統匯入的家長稱謂多為「家長」，您可以在此處「解綁」後，搜尋該號碼，重新選擇「爸爸/媽媽」並「綁定」來更新關係。</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 p-6 flex justify-end gap-3 border-t border-gray-100">
              <button onClick={closeModal} className="bg-white text-gray-600 px-6 py-3 rounded-2xl font-bold border hover:bg-gray-100 transition">
                取消
              </button>
              <button onClick={saveStudent} className="bg-cyan-500 text-white px-10 py-3 rounded-2xl font-bold shadow hover:bg-cyan-600 transition flex items-center gap-2">
                {editingStudent.id ? "≡ 儲存修改" : "≡ 送出新增"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}