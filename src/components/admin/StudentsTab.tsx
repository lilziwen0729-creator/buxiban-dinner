"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
  student_code?: string;
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
  const [formData, setFormData] = useState({ name: "", grade: "小一", phone: "", student_code: "" });
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
      // 💡 核心優化：依照年級權重排序
      const sortedData = (data as any[]).sort((a, b) => {
        const indexA = gradeOrder.indexOf(a.grade);
        const indexB = gradeOrder.indexOf(b.grade);
        if (indexA !== indexB) return indexA - indexB;
        return a.name.localeCompare(b.name, "zh-TW"); // 同年級按姓名排
      });
      setStudents(sortedData);
    }
    setLoading(false);
  };

  // --- 新增學生功能 ---
  const handleAddStudent = async () => {
    if (!formData.name || !formData.phone) return alert("請填寫姓名與家長電話");
    
    // 1. 檢查/建立家長
    const { data: parent } = await supabase.from("parents").select("id").eq("phone", formData.phone).maybeSingle();
    if (!parent) return alert("系統找不到此家長電話，請先確認家長已註冊 LINE 並綁定。");

    // 2. 建立學生
    const { data: st, error } = await supabase.from("students").insert([{ 
      name: formData.name, 
      grade: formData.grade, 
      student_code: formData.student_code,
      balance: 0 
    }]).select().single();

    if (error) return alert("新增失敗");

    // 3. 建立關聯
    await supabase.from("student_parent_relations").insert([{ student_id: st.id, parent_id: parent.id }]);
    
    alert("新增成功！");
    setShowAdd(false);
    setFormData({ name: "", grade: "小一", phone: "", student_code: "" });
    fetchStudents();
  };

  // --- 編輯功能 ---
  const openEdit = (s: Student) => {
    setSelectedStudent(s);
    setFormData({
      name: s.name,
      grade: s.grade,
      phone: s.student_parent_relations?.[0]?.parents?.phone || "",
      student_code: s.student_code || ""
    });
    setShowEdit(true);
  };

  const handleUpdateStudent = async () => {
    if (!selectedStudent) return;
    
    // 更新學生基本資料
    const { error } = await supabase
      .from("students")
      .update({
        name: formData.name,
        grade: formData.grade,
        student_code: formData.student_code
      })
      .eq("id", selectedStudent.id);

    if (error) alert("更新失敗");
    else {
      alert("資料已更新");
      setShowEdit(false);
      fetchStudents();
    }
  };

  // 搜尋過濾
  const filteredStudents = students.filter(s => 
    s.name.includes(search) || 
    s.student_code?.includes(search) ||
    s.student_parent_relations?.some(r => r.parents.phone.includes(search))
  );

  return (
    <div className="bg-white rounded-3xl shadow-lg border border-slate-200 overflow-hidden text-lg">
      {/* 頂部操作列 */}
      <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-50/50">
        <div className="flex items-center gap-6">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">學生資料管理</h2>
          <button 
            onClick={() => {
              setFormData({ name: "", grade: "小一", phone: "", student_code: "" });
              setShowAdd(true);
            }}
            className="bg-[#22c55e] hover:bg-[#16a34a] text-white px-8 py-3 rounded-2xl font-black text-lg shadow-lg shadow-green-100 transition-all active:scale-95"
          >
            新增 +
          </button>
        </div>
        <div className="relative w-full md:w-96">
          <input 
            type="text" 
            placeholder="搜尋姓名、電話、代碼..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none text-base font-bold shadow-inner"
          />
          <span className="absolute left-4 top-4.5 opacity-30 text-xl">🔍</span>
        </div>
      </div>

      {/* 學生列表表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-400 text-sm uppercase tracking-widest border-b border-slate-200">
              <th className="px-8 py-5 font-black">#</th>
              <th className="px-8 py-5 font-black">姓名 (年級)</th>
              <th className="px-8 py-5 font-black">聯絡電話</th>
              <th className="px-8 py-5 font-black">人員代碼</th>
              <th className="px-8 py-5 font-black">餐費餘額</th>
              <th className="px-8 py-5 font-black text-center">管理操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStudents.map((s, index) => (
              <tr key={s.id} className="hover:bg-blue-50/50 transition-colors">
                <td className="px-8 py-6 text-slate-300 font-mono text-base">{index + 1}</td>
                <td className="px-8 py-6">
                  <div className="font-black text-slate-800 text-xl">{s.name}</div>
                  <div className="text-sm text-blue-500 font-bold mt-1 bg-blue-50 w-fit px-2 py-0.5 rounded-md">{s.grade}</div>
                </td>
                <td className="px-8 py-6 text-slate-600 font-bold text-base tracking-tight">
                  {s.student_parent_relations?.[0]?.parents?.phone || "---"}
                </td>
                <td className="px-8 py-6 font-mono text-slate-500 text-base">{s.student_code || "---"}</td>
                <td className="px-8 py-6">
                  <span className={`text-xl font-black ${s.balance < 200 ? "text-red-500" : "text-green-600"}`}>
                    ${s.balance}
                  </span>
                </td>
                <td className="px-8 py-6">
                  <div className="flex justify-center gap-3">
                    <button onClick={() => openEdit(s)} className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="編輯資料">✏️</button>
                    <button onClick={() => { setSelectedStudent(s); setShowLogModal(true); }} className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-600 hover:text-white transition-all shadow-sm" title="查看明細">📄</button>
                    <button onClick={() => { setSelectedStudent(s); setShowAdjustModal(true); }} className="w-10 h-10 flex items-center justify-center bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm" title="手動調帳">⚖️</button>
                    <button onClick={() => {
                        const input = prompt("請輸入儲值金額");
                        if(input) {
                            const amt = parseInt(input);
                            supabase.from("students").update({ balance: (s.balance || 0) + amt }).eq("id", s.id).then(() => fetchStudents());
                            supabase.from("transactions").insert([{ student_id: s.id, type: "topup", amount: amt, balance_after: (s.balance || 0) + amt, description: "管理員儲值" }]);
                        }
                    }} className="w-10 h-10 flex items-center justify-center bg-green-50 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-sm" title="儲值">💰</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- 新增學生彈窗 --- */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden p-10 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-3xl font-black text-slate-900">建立新學籍</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-300 hover:text-slate-900 text-4xl">&times;</button>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-400 ml-1 uppercase tracking-widest">學生姓名</label>
                  <input value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl p-5 outline-none font-bold text-lg" placeholder="姓名" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-400 ml-1 uppercase tracking-widest">年級</label>
                  <select value={formData.grade} onChange={e=>setFormData({...formData, grade: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl p-5 outline-none font-bold text-lg">
                    {gradeOrder.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-400 ml-1 uppercase tracking-widest">人員代碼 (ID)</label>
                <input value={formData.student_code} onChange={e=>setFormData({...formData, student_code: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl p-5 outline-none font-mono text-lg" placeholder="例如: C560-S..." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-400 ml-1 uppercase tracking-widest">家長手機 (必填，需已連動)</label>
                <input value={formData.phone} onChange={e=>setFormData({...formData, phone: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl p-5 outline-none font-bold text-lg" placeholder="09..." />
              </div>
              <div className="flex gap-4 pt-6">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-5 bg-slate-100 rounded-2xl font-black text-slate-500 hover:bg-slate-200 transition">取消</button>
                <button onClick={handleAddStudent} className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-200 hover:bg-blue-700 transition">確認新增</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- 編輯學生彈窗 (完整欄位) --- */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden p-10">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-3xl font-black text-slate-900">編輯學生資料</h3>
              <button onClick={() => setShowEdit(false)} className="text-slate-300 hover:text-slate-900 text-4xl">&times;</button>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-400 ml-1">修改姓名</label>
                  <input value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl p-5 outline-none font-black text-lg" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-400 ml-1">修改年級</label>
                  <select value={formData.grade} onChange={e=>setFormData({...formData, grade: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl p-5 outline-none font-black text-lg">
                    {gradeOrder.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-black text-slate-400 ml-1">修改人員代碼</label>
                <input value={formData.student_code} onChange={e=>setFormData({...formData, student_code: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl p-5 outline-none font-mono text-lg" />
              </div>
              <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl">
                <p className="text-xs text-orange-600 font-bold italic">💡 註：如需更改綁定手機，請聯繫系統管理員刪除學籍後重新建立。</p>
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowEdit(false)} className="flex-1 py-5 bg-slate-100 rounded-2xl font-black text-slate-500">取消</button>
                <button onClick={handleUpdateStudent} className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-200">儲存修改</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}