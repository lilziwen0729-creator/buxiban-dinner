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
    parents: { phone: string; name: string; };
  }[];
};

export default function StudentsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // 彈窗狀態
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // 表單狀態
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState({ name: "", grade: "小一", phone: "", student_code: "" });
  const [adjustData, setAdjustData] = useState({ amount: "", reason: "" });
  
  // 帳務明細狀態
  const [transactionLogs, setTransactionLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState({ month: "this_year", type: "all", page: 0 });
  const [hasMoreLogs, setHasMoreLogs] = useState(true);

  const grades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("students")
      .select(`*, student_parent_relations ( parents ( phone, name ) )`)
      .order("student_code", { ascending: true });
    if (data) setStudents(data as any);
    setLoading(false);
  };

  // --- 核心功能：編輯學生 ---
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
      alert("更新成功");
      setShowEdit(false);
      fetchStudents();
    }
  };

  // --- 帳務明細邏輯 ---
  const openLogs = async (s: Student) => {
    setSelectedStudent(s);
    setLogFilter({ ...logFilter, page: 0 });
    setShowLogModal(true);
    fetchLogs(s.id, true);
  };

  const fetchLogs = async (studentId: string, isNew = true) => {
    let query = supabase.from("transactions").select("*", { count: "exact" }).eq("student_id", studentId);
    const PAGE_SIZE = 15;
    const from = isNew ? 0 : (logFilter.page + 1) * PAGE_SIZE;
    const { data, count } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    if (data) {
      setTransactionLogs(isNew ? data : [...transactionLogs, ...data]);
      setLogFilter(prev => ({ ...prev, page: isNew ? 0 : prev.page + 1 }));
      setHasMoreLogs((isNew ? data.length : transactionLogs.length + data.length) < (count || 0));
    }
  };

  // 搜尋過濾
  const filteredStudents = students.filter(s => 
    s.name.includes(search) || 
    s.student_code?.includes(search) ||
    s.student_parent_relations?.some(r => r.parents.phone.includes(search))
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-500">
      {/* 頂部操作列 */}
      <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/50">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">學生資料管理</h2>
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-[#22c55e] hover:bg-[#16a34a] text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition"
          >
            <span>新增 +</span>
          </button>
        </div>
        <div className="relative w-full md:w-72">
          <input 
            type="text" 
            placeholder="搜尋姓名、電話、代碼..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          />
          <span className="absolute left-3 top-2.5 opacity-30">🔍</span>
        </div>
      </div>

      {/* 學生列表表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
              <th className="px-6 py-4 font-bold">#</th>
              <th className="px-6 py-4 font-bold">姓名 (年級)</th>
              <th className="px-6 py-4 font-bold">聯絡電話</th>
              <th className="px-6 py-4 font-bold">人員代碼</th>
              <th className="px-6 py-4 font-bold">餐費餘額</th>
              <th className="px-6 py-4 font-bold text-center">管理操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStudents.map((s, index) => (
              <tr key={s.id} className="hover:bg-blue-50/30 transition text-sm">
                <td className="px-6 py-4 text-slate-400 font-mono">{index + 1}</td>
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-800">{s.name}</div>
                  <div className="text-xs text-blue-500 font-medium">{s.grade}</div>
                </td>
                <td className="px-6 py-4 text-slate-600 font-medium">
                  {s.student_parent_relations?.[0]?.parents?.phone || "未綁定"}
                </td>
                <td className="px-6 py-4 font-mono text-slate-500">{s.student_code || "---"}</td>
                <td className="px-6 py-4">
                  <span className={`font-bold ${s.balance < 200 ? "text-red-500" : "text-green-600"}`}>
                    ${s.balance}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => openEdit(s)} className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg title='編輯'" title="編輯資料">✏️</button>
                    <button onClick={() => openLogs(s)} className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg" title="查看明細">📄</button>
                    <button onClick={() => { setSelectedStudent(s); setShowAdjustModal(true); }} className="p-2 hover:bg-orange-100 text-orange-600 rounded-lg" title="手動調帳">⚖️</button>
                    <button onClick={() => { /* 儲值邏輯... */ }} className="p-2 hover:bg-green-100 text-green-600 rounded-lg" title="快速儲值">💰</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredStudents.length === 0 && (
          <div className="p-20 text-center text-slate-400 italic">查無符合條件的學生</div>
        )}
      </div>

      {/* --- 編輯學生彈窗 --- */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-lg">編輯學生資料</h3>
              <button onClick={() => setShowEdit(false)} className="text-slate-400 text-2xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">姓名</label>
                <input value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2 font-bold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">年級</label>
                <select value={formData.grade} onChange={e=>setFormData({...formData, grade: e.target.value})} className="w-full border rounded-lg p-2 font-bold">
                  {grades.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">人員代碼</label>
                <input value={formData.student_code} onChange={e=>setFormData({...formData, student_code: e.target.value})} className="w-full border rounded-lg p-2 font-mono" />
              </div>
            </div>
            <div className="p-6 bg-slate-50 flex gap-3">
              <button onClick={() => setShowEdit(false)} className="flex-1 py-2 rounded-lg font-bold text-slate-500">取消</button>
              <button onClick={handleUpdateStudent} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold">儲存修改</button>
            </div>
          </div>
        </div>
      )}

      {/* --- 明細彈窗 (與之前邏輯相同，但 UI 優化) --- */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black">{selectedStudent?.name} - 存摺明細</h3>
              <button onClick={() => setShowLogModal(false)} className="text-slate-300 text-3xl hover:text-slate-600">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {transactionLogs.map(log => (
                <div key={log.id} className="flex justify-between items-center border-b border-slate-50 pb-3">
                  <div>
                    <div className="font-bold text-slate-700">{log.description}</div>
                    <div className="text-[10px] text-slate-400">{new Date(log.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-black ${log.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                      {log.amount > 0 ? `+${log.amount}` : log.amount}
                    </div>
                    <div className="text-[10px] text-slate-300">餘額: ${log.balance_after}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* 這裡可繼續補回 AdjustModal ... */}
    </div>
  );
}