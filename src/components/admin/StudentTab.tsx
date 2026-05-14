"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
  gender?: string| null;        // 增加性別
  student_phone?: string| null; // 增加學員手機
  school_name?: string| null;  // 增加就讀學校
  referrer_name?: string| null; // 增加推薦人
  student_code?: string| null;
  balance?: number;
  dietary_restrictions?: string;
  birthday?: string| null;
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

  const [activeCategory, setActiveCategory] = useState("國小部");
  const [activeGrade, setActiveGrade] = useState("小一"); // 預設顯示小一

  const categories = ["國小部", "國中部", "幼兒部 / 其他"];

  // 自動連動：切換部別時，自動選中該部別的第一個年級
  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    if (cat === "國小部") setActiveGrade("小一");
    else if (cat === "國中部") setActiveGrade("國一");
    else setActiveGrade("大班");
  };

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
        name: "", grade: "", student_code: "", fixed_days_off: [], dietary_restrictions: "", birthday: "", address: "", student_parent_relations: []
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
    // 0. 基本檢查：姓名與年級必填
    if (!editingStudent || !editingStudent.name.trim() || !editingStudent.grade) {
      alert("請填寫姓名與年級");
      return;
    }

    try {
      setLoading(true);

      // 1. 準備學生資料 (拷貝一份出來改，避免污染原本的 UI 狀態)
      const studentData = { ...editingStudent };
      delete (studentData as any).student_parent_relations;

      // 💡 修正 1：處理 ID。如果是新增模式，把空 ID 刪除，讓資料庫自動生成 UUID
      if (!studentData.id || studentData.id === "" || studentData.id.length < 5) {
        delete (studentData as any).id;
      }

      // 💡 修正 2：處理「日期」與「空字串」。
      // 資料庫的 Date 格式不收 ""，只收 "YYYY-MM-DD" 或 null
      if (studentData.birthday === "") studentData.birthday = null;
      if (studentData.student_phone === "") studentData.student_phone = null;
      if (studentData.student_code === "") studentData.student_code = null;
      if (studentData.gender === "") studentData.gender = null;

      // 2. 儲存學生基本資料 (Upsert)
      const { data: st, error: stError } = await supabase
        .from("students")
        .upsert([studentData])
        .select()
        .single();

      if (stError) throw stError;

      // 3. 處理家長關係資料 (智慧連結)
      const finalRelations = [];
      if (editingStudent.student_parent_relations) {
        for (const rel of editingStudent.student_parent_relations) {
          let pId = rel.parents.id;

          // 如果這筆關係沒有家長 ID，代表是手動輸入的新電話
          if (!pId) {
            // 先去資料庫查一下這個手機是否已經存在於 parents 表
            const { data: existingP } = await supabase
              .from("parents")
              .select("id")
              .eq("phone", rel.parents.phone)
              .maybeSingle();

            if (existingP) {
              pId = existingP.id;
            } else {
              // 資料庫完全沒這號碼，幫他在 parents 表創一個新紀錄
              const { data: newP, error: pErr } = await supabase
                .from("parents")
                .insert([{ 
                  name: rel.parents.name || rel.relationship, // 沒填姓名就拿稱謂當名字
                  phone: rel.parents.phone 
                }])
                .select()
                .single();
              
              if (pErr) throw pErr;
              pId = newP.id;
            }
          }

          // 收集整理好的關係資料
          finalRelations.push({
            student_id: st.id,
            parent_id: pId,
            relationship: rel.relationship || "家長"
          });
        }
      }

      // 4. 同步關係表：先刪除該學生現有的所有關係，再重新插入
      await supabase.from("student_parent_relations").delete().eq("student_id", st.id);
      
      if (finalRelations.length > 0) {
        const { error: relErr } = await supabase
          .from("student_parent_relations")
          .insert(finalRelations);
        
        if (relErr) throw relErr;
      }

      alert(editingStudent.id ? "✅ 編輯成功" : "✅ 新增成功");
      closeModal();
      fetchStudents();

    } catch (error: any) {
      console.error("儲存流程出錯：", error);
      // 這裡會跳出詳細原因，幫助我們判斷是否還有其他欄位出錯
      alert(
        "❌ 儲存失敗！\n\n" + 
        "原因：" + (error.message || "未知錯誤") + "\n" +
        "詳情：請檢查生日格式或必填欄位"
      );
    } finally {
      setLoading(false);
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
      {/* 1. 搜尋與新增按鈕 (保持在最上方) */}
      <div className="flex gap-4">
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex-1">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋姓名 / 年級 / 家長電話..." className="w-full px-5 py-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-blue-500 text-black" />
        </div>
        <button onClick={() => openModal()} className="bg-blue-600 text-white px-8 rounded-3xl font-bold text-lg shadow-lg hover:bg-blue-700 transition">
            ＋ 新增學生
        </button>
      </div>

      {/* 2. 第一層：部別切換標籤 (國小/國中/其他) */}
      <div className="flex gap-2 mb-[-8px]"> {/* 負 margin 讓它跟下面接起來 */}
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            className={`flex-1 py-3 rounded-t-2xl font-bold transition-all ${
              activeCategory === cat 
              ? "bg-blue-600 text-white shadow-lg" 
              : "bg-gray-200 text-gray-500"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 3. 第二層：年級橫向捲動選單 */}
      <div className="bg-white p-3 flex gap-2 overflow-x-auto border-x border-gray-100">
        {grades
          .filter(g => {
            if (activeCategory === "國小部") return g.includes("小");
            if (activeCategory === "國中部") return g.includes("國");
            return !g.includes("小") && !g.includes("國");
          })
          .map(g => (
            <button
              key={g}
              onClick={() => setActiveGrade(g)}
              className={`px-6 py-2 rounded-full whitespace-nowrap font-bold transition-all ${
                activeGrade === g 
                ? "bg-cyan-500 text-white shadow-md" 
                : "bg-gray-100 text-gray-400 hover:bg-gray-200"
              }`}
            >
              {g}
            </button>
          ))
        }
      </div>

      {/* 4. 第三層：選中個年級的學生名單卡片 */}
      <div className="bg-white p-6 rounded-b-3xl shadow-sm border-x border-b border-gray-100 min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center py-20">
             <p className="text-gray-400">載入中...</p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex justify-between items-end mb-4 border-b pb-2">
                <h3 className="text-2xl font-black text-gray-800">{activeGrade}</h3>
                <span className="text-sm font-bold text-gray-400">共 {filteredStudents.filter(s => s.grade === activeGrade).length} 位學生</span>
            </div>
            
            {filteredStudents.filter(s => s.grade === activeGrade).length > 0 ? (
              filteredStudents
                .filter(s => s.grade === activeGrade)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(student => (
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
                          <button onClick={() => openModal(student)} className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-5 py-2.5 rounded-xl text-sm font-black transition">編輯</button>
                      </div>
                  </div>
                ))
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-300 italic text-lg">目前此年級尚無資料</p>
              </div>
            )}
          </div>
        )}
      </div>

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

{/* Tab 3: 聯絡人 (稱謂自訂精簡版) */}
{modalTab === "聯絡人" && (
  <div className="space-y-6 text-black">
    
    {/* 1. 已綁定列表：讓稱謂也可以直接改 */}
    <div className="space-y-3">
      <h3 className="font-bold text-gray-700">當前聯絡人</h3>
      {editingStudent.student_parent_relations?.map((rel, index) => (
        <div key={index} className="flex gap-2 items-center bg-gray-50 p-3 rounded-2xl border border-gray-100">
          <input 
            value={rel.relationship} 
            onChange={(e) => {
              const newList = [...editingStudent.student_parent_relations!];
              newList[index].relationship = e.target.value;
              handleInputChange("student_parent_relations", newList);
            }}
            placeholder="稱謂"
            className="w-24 px-3 py-2 rounded-xl border-none bg-cyan-500 text-white font-bold placeholder-white/70 text-center"
          />
          <div className="flex-1 px-3 font-mono text-gray-600">
            {rel.parents.phone}
          </div>
          <button 
            onClick={() => detachParent(rel.parents.id)} 
            className="text-red-400 hover:text-red-600 px-3 font-bold"
          >
            移除
          </button>
        </div>
      ))}
      {!editingStudent.student_parent_relations?.length && (
        <p className="text-gray-400 text-center py-4 italic">尚未設定聯絡人</p>
      )}
    </div>

    <hr className="border-gray-100" />

    {/* 2. 快速加入區：手動輸入稱謂 */}
    <div className="bg-cyan-50/50 p-6 rounded-3xl border-2 border-dashed border-cyan-100">
      <h3 className="font-bold text-cyan-800 mb-4 flex items-center gap-2">
        <span>＋ 快速加入新聯絡人</span>
      </h3>
      <div className="flex gap-3">
        <input 
          id="newRelTitle"
          placeholder="稱謂 (例: 爸爸、媽媽)" 
          className="w-1/3 p-3 rounded-xl border-2 border-white bg-white shadow-sm focus:ring-2 focus:ring-cyan-500 outline-none"
        />
        <input 
          id="newRelPhone"
          placeholder="手機號碼" 
          className="flex-1 p-3 rounded-xl border-2 border-white bg-white shadow-sm focus:ring-2 focus:ring-cyan-500 outline-none"
        />
        <button 
          onClick={() => {
            const title = (document.getElementById("newRelTitle") as HTMLInputElement).value;
            const phone = (document.getElementById("newRelPhone") as HTMLInputElement).value;
            if(!title || !/^09\d{8}$/.test(phone)) { alert("請填寫稱謂與正確手機號碼"); return; }
            
            // 建立新關係
            const newRel = { 
              relationship: title, 
              parents: { id: "", name: title, phone } // 名字暫時跟稱謂一樣，儲存時會自動處理
            };
            handleInputChange("student_parent_relations", [...(editingStudent.student_parent_relations || []), newRel]);
            
            // 清空輸入
            (document.getElementById("newRelTitle") as HTMLInputElement).value = "";
            (document.getElementById("newRelPhone") as HTMLInputElement).value = "";
          }}
          className="bg-cyan-500 text-white px-6 rounded-xl font-bold hover:bg-cyan-600 transition shadow-md"
        >
          加入
        </button>
      </div>
    </div>
    </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 p-6 flex justify-between items-center border-t border-gray-100">
              
              {/* 左側：刪除按鈕 (僅在編輯模式出現) */}
              {editingStudent?.id ? (
                <button 
                  onClick={() => { 
                    if (confirm("⚠️ 確定要永久刪除此學生資料嗎？")) { 
                      deleteStudent(editingStudent.id); 
                      closeModal(); 
                    } 
                  }} 
                  className="text-red-500 hover:text-red-700 hover:underline font-bold text-sm flex items-center gap-1"
                >
                  🗑️ 刪除學員資料
                </button>
              ) : (
                <div></div> // 新增模式時左側留空
              )}
            
              {/* 右側：取消與儲存按鈕 */}
              <div className="flex gap-3">
                <button 
                  onClick={closeModal} 
                  className="bg-white text-gray-600 px-6 py-3 rounded-2xl font-bold border hover:bg-gray-100 transition"
                >
                  取消
                </button>
                <button 
                  onClick={saveStudent} 
                  className="bg-cyan-500 text-white px-10 py-3 rounded-2xl font-bold shadow hover:bg-cyan-600 transition"
                >
                  {editingStudent?.id ? "≡ 儲存修改" : "≡ 送出新增"}
                </button>
              </div>
            </div> 
                    </div> 
                  </div> 
                )} 
            
                </div> 
   );
}