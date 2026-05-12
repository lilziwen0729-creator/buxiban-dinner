"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// --- 型別定義 ---
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
  // --- 基礎狀態 ---
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  
  // --- 新增學生狀態 ---
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [phone, setPhone] = useState("");

  // --- 進階功能狀態：查帳/調帳 ---
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [transactionLogs, setTransactionLogs] = useState<any[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [logFilter, setLogFilter] = useState({ month: "this_year", type: "all", page: 0 });
  const [hasMoreLogs, setHasMoreLogs] = useState(true);

  const PAGE_SIZE = 15;
  const grades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

  // --- 生命週期 ---
  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    if (selectedStudent && showLogModal) {
      fetchLogs(true);
    }
  }, [logFilter.month, logFilter.type]);

  // --- 資料抓取邏輯 ---
  const fetchStudents = async () => {
    const { data: studentData } = await supabase
      .from("students")
      .select(`*, student_parent_relations ( parents ( phone, name ) )`)
      .order("student_code");
    
    if (studentData) {
      setStudents(studentData as any);
    }
  };

  // --- 學生管理功能 ---
  const addStudent = async () => {
    const cleanName = name.trim();
    if (!cleanName || !grade || !phone) { alert("請填寫完整"); return; }
    
    // 找家長
    const { data: parent } = await supabase.from("parents").select("id").eq("phone", phone).maybeSingle();
    if (!parent) { alert("此手機尚未在系統中，請先在資料庫建立家長"); return; }
    
    // 建立學生
    const { data: newStudent, error: stError } = await supabase.from("students").insert([{ name: cleanName, grade, balance: 0 }]).select().single();
    if (stError) { alert("新增失敗"); return; }
    
    // 建立關聯
    await supabase.from("student_parent_relations").insert([{ student_id: newStudent.id, parent_id: parent.id }]);
    
    alert("新增成功並已連結家長");
    setName(""); setGrade(""); setPhone(""); setShowAdd(false);
    fetchStudents();
  };

  const deleteStudent = async (id: string) => {
    if (!confirm("確定刪除學生？")) return;
    await supabase.from("students").delete().eq("id", id);
    fetchStudents();
  };

  const topupStudent = async (studentId: string) => {
    const input = prompt("請輸入儲值金額"); 
    if (!input) return;
    
    const amount = parseInt(input); 
    if (isNaN(amount) || amount <= 0) { alert("請輸入正確金額"); return; }
    
    const student = students.find((s) => s.id === studentId); 
    if (!student) return;
    
    const newBalance = (student.balance || 0) + amount;
    
    await supabase.from("students").update({ balance: newBalance }).eq("id", studentId);
    await supabase.from("transactions").insert([{ 
      student_id: studentId, type: "topup", amount, balance_after: newBalance, description: "管理員儲值" 
    }]);
    
    alert(`${student.name} 儲值成功 +${amount}`);
    fetchStudents();
  };

  // --- 銀行級查帳與調帳邏輯 ---
  const fetchLogs = async (isNew = true) => {
    if (!selectedStudent) return;
    let query = supabase.from("transactions").select("*", { count: "exact" }).eq("student_id", selectedStudent.id);
    
    const now = new Date();
    if (logFilter.month === "this") query = query.gte("created_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
    else if (logFilter.month === "last") query = query.gte("created_at", new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()).lte("created_at", new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString());
    else if (logFilter.month === "this_year") query = query.gte("created_at", new Date(now.getFullYear(), 0, 1).toISOString());
    
    if (logFilter.type !== "all") query = query.eq("type", logFilter.type);
    
    const from = isNew ? 0 : (logFilter.page + 1) * PAGE_SIZE;
    const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    
    if (!error && data) {
      setTransactionLogs(isNew ? data : [...transactionLogs, ...data]);
      setLogFilter(p => ({ ...p, page: isNew ? 0 : p.page + 1 }));
      setHasMoreLogs((isNew ? data : [...transactionLogs, ...data]).length < (count || 0));
    }
  };

  const groupLogsByMonth = (data: any[]) => {
    const groups: any = {};
    data.forEach(log => {
      const m = new Date(log.created_at).toLocaleDateString("zh-TW", { year: 'numeric', month: 'long' });
      if (!groups[m]) groups[m] = [];
      groups[m].push(log);
    });
    return groups;
  };

  const handleManualAdjust = async () => {
    if (!selectedStudent || !adjustAmount || !adjustReason) return alert("請填寫完整");
    const amount = parseInt(adjustAmount);
    const newBalance = (selectedStudent.balance || 0) + amount;
    
    await supabase.from("students").update({ balance: newBalance }).eq("id", selectedStudent.id);
    await supabase.from("transactions").insert([{ 
      student_id: selectedStudent.id, type: "adjustment", amount, balance_after: newBalance, description: `系統調帳：${adjustReason}` 
    }]);
    
    alert("調整成功！"); 
    setShowAdjustModal(false); setAdjustAmount(""); setAdjustReason(""); 
    fetchStudents();
  };

  // --- UI 渲染邏輯 ---
  const filteredStudents = students.filter((s) => {
    const keyword = search.toLowerCase();
    const hasPhoneMatch = s.student_parent_relations?.some(rel => rel.parents.phone.includes(keyword));
    return (s.name.toLowerCase().includes(keyword) || s.grade.toLowerCase().includes(keyword) || (s.student_code || "").toLowerCase().includes(keyword) || hasPhoneMatch);
  });

  const renderStudentSection = (title: string, list: Student[]) => (
    <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 mb-8">
      <h2 className="text-2xl font-black mb-6 text-slate-800 border-b-2 border-slate-100 pb-3">{title}</h2>
      {grades.filter((g) => title === "國小部" ? g.includes("小") : g.includes("國") || g === "高一").map((grade) => {
        const gradeStudents = list.filter((s) => s.grade === grade).sort((a, b) => a.name.localeCompare(b.name));
        if (gradeStudents.length === 0) return null;
        return (
          <div key={grade} className="mb-8">
            <h3 className="font-black text-blue-600 text-xl mb-4 bg-blue-50 inline-block px-4 py-1 rounded-lg">{grade}（{gradeStudents.length}）</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {gradeStudents.map((student) => (
                <div key={student.id} className="bg-white border-2 border-slate-100 p-5 rounded-2xl flex flex-col justify-between hover:border-blue-200 hover:shadow-md transition">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="font-black text-xl text-slate-800">{student.name}</p>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        {student.student_parent_relations && student.student_parent_relations.length > 0 ? student.student_parent_relations.map(rel => rel.parents.phone).join(", ") : "未綁定電話"}
                      </p>
                    </div>
                    <button onClick={() => deleteStudent(student.id)} className="text-slate-300 hover:text-red-500 text-xs font-bold transition">刪除</button>
                  </div>
                  <div className="flex justify-between items-end mt-2">
                    <p className={`text-lg font-black ${student.balance < 200 ? "text-red-500" : "text-green-600"}`}>$ {student.balance || 0}</p>
                    <div className="flex gap-2">
                      <button onClick={() => topupStudent(student.id)} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition">儲值</button>
                      <button onClick={() => { setSelectedStudent(student); setShowAdjustModal(true); }} className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition">調帳</button>
                      <button onClick={() => { setSelectedStudent(student); setShowLogModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition">明細</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
        <h2 className="text-3xl font-black text-slate-900">學生管理中心</h2>
        <div className="flex gap-4 w-full md:w-auto">
           <input type="text" placeholder="搜尋姓名、電話..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-slate-50 border-none rounded-xl px-6 py-3 outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
           <button onClick={() => setShowAdd(!showAdd)} className={`${showAdd ? "bg-slate-200 text-slate-700" : "bg-blue-600 text-white shadow-lg"} px-6 py-3 rounded-xl font-black transition`}>
              {showAdd ? "取消新增" : "＋ 新增學生"}
           </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-blue-50 p-8 rounded-[2.5rem] border-2 border-blue-200 flex flex-wrap gap-4 items-end shadow-inner">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-black text-blue-800 mb-2">學生姓名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 rounded-xl border-none font-bold outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="w-40">
            <label className="block text-sm font-black text-blue-800 mb-2">年級</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className="w-full p-4 rounded-xl border-none font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-700">
              <option value="">選擇</option>
              {grades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-black text-blue-800 mb-2">家長綁定手機</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09..." className="w-full p-4 rounded-xl border-none font-bold outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={addStudent} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-black shadow-md transition">確認建立</button>
        </div>
      )}

      {renderStudentSection("國小部", filteredStudents.filter((s) => s.grade.includes("小")))}
      {renderStudentSection("國中部與高中", filteredStudents.filter((s) => s.grade.includes("國") || s.grade === "高一"))}

      {/* --- 銀行級：查帳明細 Modal --- */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-3xl font-black text-slate-900">{selectedStudent?.name} - 存摺紀錄</h3>
                <p className="text-sm font-bold text-slate-400 mt-2">目前餘額：<span className="text-blue-600 font-black text-lg">${selectedStudent?.balance}</span></p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="text-slate-300 hover:text-slate-700 text-4xl transition">&times;</button>
            </div>

            <div className="flex gap-2 mb-8 bg-slate-50 p-2 rounded-2xl border border-slate-100 overflow-x-auto">
              {[["this_year", "今年"], ["this", "本月"], ["last", "上月"], ["all", "全部"]].map(([v, l]) => (
                <button key={v} onClick={() => setLogFilter(p => ({ ...p, month: v }))} className={`flex-1 min-w-[80px] py-2 rounded-xl text-xs font-black transition-all ${logFilter.month === v ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-400 hover:bg-slate-100"}`}>{l}</button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto pr-4 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
              {Object.entries(groupLogsByMonth(transactionLogs)).map(([month, items]: any) => (
                <div key={month} className="space-y-4">
                  <div className="sticky top-0 bg-white/95 py-2 z-10 backdrop-blur-sm"><span className="bg-slate-100 text-slate-600 px-4 py-1.5 rounded-lg text-xs font-black tracking-widest">{month}</span></div>
                  {items.map((log: any) => (
                    <div key={log.id} className="flex justify-between items-center group bg-white hover:bg-slate-50 p-3 rounded-2xl transition border border-transparent hover:border-slate-100">
                      <div className="flex gap-4 items-center">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-inner ${log.amount > 0 ? "bg-green-100 text-green-600" : "bg-red-50 text-red-500"}`}>
                          {log.type === 'topup' ? '儲' : log.type === 'order' ? '餐' : log.type === 'refund' ? '退' : '調'}
                        </div>
                        <div>
                          <p className="font-black text-slate-700">{log.description}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-1">{new Date(log.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-black ${log.amount > 0 ? "text-green-600" : "text-red-500"}`}>{log.amount > 0 ? `+${log.amount}` : log.amount}</p>
                        <p className="text-[10px] text-slate-300 font-black mt-1 font-mono">餘額: ${log.balance_after}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {hasMoreLogs && <button onClick={() => fetchLogs(false)} className="w-full py-6 text-sm font-black text-blue-500 bg-blue-50/50 hover:bg-blue-50 rounded-3xl transition">查看更早之前的紀錄 ▼</button>}
              {transactionLogs.length === 0 && <div className="text-center py-20 text-slate-300 font-bold italic">目前無符合條件的紀錄</div>}
            </div>
          </div>
        </div>
      )}

      {/* --- 手動調帳 Modal --- */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[3.5rem] p-10 w-full max-w-md shadow-2xl">
            <h3 className="text-3xl font-black text-slate-900 mb-2">手動調帳修正</h3>
            <p className="text-sm text-slate-400 font-bold mb-10">針對學生：{selectedStudent?.name}</p>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-blue-600 ml-1">調整金額 (負數代表扣款, 正數代表加錢)</label>
                <input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="例如: -80 或 500" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-blue-500 font-black text-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-blue-600 ml-1">調整原因 (將顯示於明細中)</label>
                <input type="text" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="例如: 系統錯誤退款" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" />
              </div>
              <div className="flex gap-4 pt-6">
                <button onClick={() => setShowAdjustModal(false)} className="flex-1 py-5 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-slate-500 transition">取消</button>
                <button onClick={handleManualAdjust} className="flex-1 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-xl shadow-blue-200 transition">確認執行</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}