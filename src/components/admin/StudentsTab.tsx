"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
  student_code?: string;
  gender?: string;
  birthday?: string;
  student_phone?: string;
  school?: string;
  balance: number;
  student_parent_relations?: {
    parents: { id: string; phone: string; name: string; };
  }[];
};

export default function StudentsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // 彈窗控制
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // 資料暫存
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  
  // 💡 完整表單欄位恢復
  const [formData, setFormData] = useState({ 
    name: "", grade: "小一", student_code: "", gender: "男", 
    birthday: "", student_phone: "", school: "", 
    parent_name: "", parent_phone: "" 
  });
  
  const [adjustData, setAdjustData] = useState({ amount: "", reason: "" });
  const [transactionLogs, setTransactionLogs] = useState<any[]>([]);

  const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("students")
      .select(`*, student_parent_relations ( parents ( id, phone, name ) )`);
    
    if (data) {
      // 依照年級與姓名排序
      const sortedData = (data as any[]).sort((a, b) => {
        const indexA = gradeOrder.indexOf(a.grade);
        const indexB = gradeOrder.indexOf(b.grade);
        if (indexA !== indexB) return indexA - indexB;
        return a.name.localeCompare(b.name, "zh-TW");
      });
      setStudents(sortedData);
    }
    setLoading(false);
  };

  // --- 💡 恢復：全功能新增學生 (支援聯絡人自動建檔) ---
  const handleAddStudent = async () => {
    if (!formData.name) return alert("請填寫學生姓名");

    try {
      // 1. 建立學生資料 (包含所有擴充欄位)
      const { data: newStudent, error: stError } = await supabase.from("students").insert([{ 
        name: formData.name, 
        grade: formData.grade, 
        student_code: formData.student_code,
        gender: formData.gender,
        birthday: formData.birthday || null,
        student_phone: formData.student_phone,
        school: formData.school,
        balance: 0 
      }]).select().single();

      if (stError) throw stError;

      // 2. 處理聯絡人邏輯 (如果有填寫聯絡人電話)
      if (formData.parent_phone) {
        let parentId;
        
        // 先去資料庫找這支電話存不存在
        const { data: existingParent } = await supabase.from("parents").select("id").eq("phone", formData.parent_phone).maybeSingle();

        if (existingParent) {
          parentId = existingParent.id; // 已存在，直接使用
        } else {
          // 不存在，當場幫家長建檔！
          const { data: newParent, error: pError } = await supabase.from("parents").insert([{ 
            name: formData.parent_name || "家長", 
            phone: formData.parent_phone 
          }]).select().single();
          
          if (pError) throw pError;
          parentId = newParent.id;
        }

        // 3. 將學生與聯絡人綁定
        if (parentId) {
          await supabase.from("student_parent_relations").insert([{ 
            student_id: newStudent.id, 
            parent_id: parentId 
          }]);
        }
      }

      alert("新增成功！");
      setShowAdd(false);
      resetForm();
      fetchStudents();
    } catch (err: any) {
      alert("新增失敗：" + err.message);
    }
  };

  // --- 💡 恢復：全功能編輯學生 ---
  const openEdit = (s: Student) => {
    setSelectedStudent(s);
    setFormData({
      name: s.name,
      grade: s.grade,
      student_code: s.student_code || "",
      gender: s.gender || "男",
      birthday: s.birthday || "",
      student_phone: s.student_phone || "",
      school: s.school || "",
      parent_name: s.student_parent_relations?.[0]?.parents?.name || "",
      parent_phone: s.student_parent_relations?.[0]?.parents?.phone || ""
    });
    setShowEdit(true);
  };

  const handleUpdateStudent = async () => {
    if (!selectedStudent) return;
    
    try {
      // 1. 更新學生資料
      const { error } = await supabase.from("students").update({
        name: formData.name,
        grade: formData.grade,
        student_code: formData.student_code,
        gender: formData.gender,
        birthday: formData.birthday || null,
        student_phone: formData.student_phone,
        school: formData.school,
      }).eq("id", selectedStudent.id);

      if (error) throw error;

      // 2. 更新主要聯絡人資訊 (如果有原本的關聯)
      if (formData.parent_phone && selectedStudent.student_parent_relations?.[0]?.parents?.id) {
        const parentId = selectedStudent.student_parent_relations[0].parents.id;
        await supabase.from("parents").update({
          name: formData.parent_name,
          phone: formData.parent_phone
        }).eq("id", parentId);
      }

      alert("資料已更新");
      setShowEdit(false);
      fetchStudents();
    } catch (err: any) {
      alert("更新失敗：" + err.message);
    }
  };

  const resetForm = () => {
    setFormData({ name: "", grade: "小一", student_code: "", gender: "男", birthday: "", student_phone: "", school: "", parent_name: "", parent_phone: "" });
  };

  // 搜尋過濾
  const filteredStudents = students.filter(s => 
    s.name.includes(search) || 
    s.student_code?.includes(search) ||
    s.student_parent_relations?.some(r => r.parents.phone.includes(search) || r.parents.name.includes(search))
  );

  return (
    <div className="bg-white rounded-3xl shadow-lg border border-slate-200 overflow-hidden text-lg">
      {/* 頂部操作列 */}
      <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-50/50">
        <div className="flex items-center gap-6">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">學生資料管理</h2>
          <button 
            onClick={() => { resetForm(); setShowAdd(true); }}
            className="bg-[#22c55e] hover:bg-[#16a34a] text-white px-8 py-3 rounded-2xl font-black text-lg shadow-lg shadow-green-100 transition-all active:scale-95"
          >
            新增 +
          </button>
        </div>
        <div className="relative w-full md:w-96">
          <input 
            type="text" 
            placeholder="搜尋姓名、聯絡人、電話、代碼..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none text-base font-bold shadow-inner"
          />
          <span className="absolute left-4 top-4.5 opacity-30 text-xl">🔍</span>
        </div>
      </div>

      {/* 學生列表表格 */}
      <div className="overflow-x-auto min-h-[500px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-400 text-sm uppercase tracking-widest border-b border-slate-200">
              <th className="px-8 py-5 font-black">#</th>
              <th className="px-8 py-5 font-black">姓名 (年級)</th>
              <th className="px-8 py-5 font-black">聯絡方式</th>
              <th className="px-8 py-5 font-black">學校</th>
              <th className="px-8 py-5 font-black">人員代碼</th>
              <th className="px-8 py-5 font-black">餘額</th>
              <th className="px-8 py-5 font-black text-center">管理</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStudents.map((s, index) => (
              <tr key={s.id} className="hover:bg-blue-50/50 transition-colors">
                <td className="px-8 py-6 text-slate-300 font-mono text-base">{index + 1}</td>
                <td className="px-8 py-6">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-800 text-xl">{s.name}</span>
                    {s.gender && <span className="text-xs text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">{s.gender}</span>}
                  </div>
                  <div className="text-sm text-blue-500 font-bold mt-1 bg-blue-50 w-fit px-2 py-0.5 rounded-md">{s.grade}</div>
                </td>
                <td className="px-8 py-6">
                  {s.student_parent_relations?.map((rel, i) => (
                    <div key={i} className="text-sm font-bold text-slate-600">
                      {rel.parents.name || "聯絡人"}: <span className="font-mono text-slate-500">{rel.parents.phone}</span>
                    </div>
                  ))}
                  {(!s.student_parent_relations || s.student_parent_relations.length === 0) && <span className="text-slate-300 text-sm">未綁定</span>}
                </td>
                <td className="px-8 py-6 text-slate-500 font-bold text-base">{s.school || "---"}</td>
                <td className="px-8 py-6 font-mono text-slate-400 text-base">{s.student_code || "---"}</td>
                <td className="px-8 py-6">
                  <span className={`text-xl font-black ${s.balance < 200 ? "text-red-500" : "text-green-600"}`}>${s.balance}</span>
                </td>
                <td className="px-8 py-6">
                  <div className="flex justify-center gap-2">
                    <button onClick={() => openEdit(s)} className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all" title="編輯資料">✏️</button>
                    <button onClick={() => { setSelectedStudent(s); setShowLogModal(true); }} className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-600 hover:text-white transition-all" title="查看明細">📄</button>
                    <button onClick={() => { setSelectedStudent(s); setShowAdjustModal(true); }} className="w-10 h-10 flex items-center justify-center bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-600 hover:text-white transition-all" title="手動調帳">⚖️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- 💡 滿血版：新增/編輯學生表單 Modal --- */}
      {(showAdd || showEdit) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-2xl font-black text-slate-900">{showAdd ? "建立新學籍" : "編輯學生資料"}</h3>
              <button onClick={() => { setShowAdd(false); setShowEdit(false); }} className="text-slate-400 hover:text-slate-900 text-3xl transition">&times;</button>
            </div>
            
            <div className="p-8 space-y-6 bg-white max-h-[70vh] overflow-y-auto">
              {/* 區塊 1：基本資料 */}
              <h4 className="text-lg font-black text-blue-600 border-l-4 border-blue-600 pl-3">基本資料</h4>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">學生姓名</label>
                  <input value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg" placeholder="姓名" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">性別</label>
                  <select value={formData.gender} onChange={e=>setFormData({...formData, gender: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg">
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">年級</label>
                  <select value={formData.grade} onChange={e=>setFormData({...formData, grade: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg">
                    {gradeOrder.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">人員代碼 (ID)</label>
                  <input value={formData.student_code} onChange={e=>setFormData({...formData, student_code: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-mono text-lg" placeholder="C560-S..." />
                </div>
              </div>

              {/* 區塊 2：詳細資訊 */}
              <h4 className="text-lg font-black text-blue-600 border-l-4 border-blue-600 pl-3 pt-4">詳細資訊</h4>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">生日</label>
                  <input type="date" value={formData.birthday} onChange={e=>setFormData({...formData, birthday: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">就讀學校</label>
                  <input value={formData.school} onChange={e=>setFormData({...formData, school: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg" placeholder="例如: 楊梅國小" />
                </div>
                <div className="space-y-2 col-span-2 md:col-span-1">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">學員行動電話</label>
                  <input value={formData.student_phone} onChange={e=>setFormData({...formData, student_phone: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg font-mono" placeholder="學生手機 (選填)" />
                </div>
              </div>

              {/* 區塊 3：聯絡人資訊 */}
              <h4 className="text-lg font-black text-orange-500 border-l-4 border-orange-500 pl-3 pt-4">主要聯絡人 (家長)</h4>
              <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl mb-4">
                <p className="text-xs text-orange-600 font-bold">💡 若輸入的電話系統內沒有，將會自動為您建立一位新家長並完成綁定。</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">聯絡人稱呼</label>
                  <input value={formData.parent_name} onChange={e=>setFormData({...formData, parent_name: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg" placeholder="例如: 爸爸、媽媽、王先生" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">聯絡人手機 (必填)</label>
                  <input value={formData.parent_phone} onChange={e=>setFormData({...formData, parent_phone: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg font-mono" placeholder="09..." />
                </div>
              </div>
            </div>

            {/* 按鈕區 */}
            <div className="p-8 border-t border-slate-100 flex gap-4 bg-slate-50">
              <button onClick={() => { setShowAdd(false); setShowEdit(false); }} className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition">取消</button>
              <button onClick={showAdd ? handleAddStudent : handleUpdateStudent} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-200 hover:bg-blue-700 transition">
                {showAdd ? "確認建立" : "儲存修改"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 查帳 / 調帳 Modal 區塊 (保持不變) */}
    </div>
  );
}