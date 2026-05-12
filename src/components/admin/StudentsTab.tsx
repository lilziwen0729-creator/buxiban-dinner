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
  
  // 完整表單欄位
  const [formData, setFormData] = useState({ 
    name: "", grade: "小一", student_code: "", gender: "男", 
    birthday: "", student_phone: "", school: "", 
    parent_name: "", parent_phone: "" 
  });
  
  const [adjustData, setAdjustData] = useState({ amount: "", reason: "" });
  const [transactionLogs, setTransactionLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState({ month: "this_year", type: "all", page: 0 });
  const [hasMoreLogs, setHasMoreLogs] = useState(true);

  const PAGE_SIZE = 15;
  const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

  useEffect(() => {
    fetchStudents();
  }, []);

  // 當查帳過濾條件改變時，重新抓取第一頁
  useEffect(() => {
    if (selectedStudent && showLogModal) {
      fetchLogs(true);
    }
  }, [logFilter.month, logFilter.type]);

  const fetchStudents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("students")
      .select(`*, student_parent_relations ( parents ( id, phone, name ) )`);
    
    if (data) {
      // 依照年級與姓名排序 (處理年級為空或"無"的狀況)
      const sortedData = (data as any[]).sort((a, b) => {
        const indexA = gradeOrder.indexOf(a.grade);
        const indexB = gradeOrder.indexOf(b.grade);
        const weightA = indexA === -1 ? 99 : indexA;
        const weightB = indexB === -1 ? 99 : indexB;
        if (weightA !== weightB) return weightA - weightB;
        return (a.name || "").localeCompare(b.name || "", "zh-TW");
      });
      setStudents(sortedData);
    }
    setLoading(false);
  };

  // --- 新增學生 ---
  const handleAddStudent = async () => {
    if (!formData.name) return alert("請填寫學生姓名");

    try {
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

      if (formData.parent_phone) {
        let parentId;
        const { data: existingParent } = await supabase.from("parents").select("id").eq("phone", formData.parent_phone).maybeSingle();

        if (existingParent) {
          parentId = existingParent.id;
        } else {
          const { data: newParent, error: pError } = await supabase.from("parents").insert([{ 
            name: formData.parent_name || "家長", 
            phone: formData.parent_phone 
          }]).select().single();
          if (pError) throw pError;
          parentId = newParent.id;
        }

        if (parentId) {
          await supabase.from("student_parent_relations").insert([{ student_id: newStudent.id, parent_id: parentId }]);
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

  // --- 編輯學生 ---
  const openEdit = (s: Student) => {
    setSelectedStudent(s);
    setFormData({
      name: s.name,
      grade: s.grade || "",
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

      if (formData.parent_phone && selectedStudent.student_parent_relations?.[0]?.parents?.id) {
        const parentId = selectedStudent.student_parent_relations[0].parents.id;
        await supabase.from("parents").update({
          name: formData.parent_name || "家長",
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

  // --- 儲值功能 ---
  const handleTopup = async (s: Student) => {
    const input = prompt(`請輸入要為【${s.name}】儲值的金額：`);
    if (!input) return;
    const amount = parseInt(input);
    if (isNaN(amount) || amount <= 0) return alert("請輸入有效的正整數金額");

    const newBalance = (s.balance || 0) + amount;
    
    await supabase.from("students").update({ balance: newBalance }).eq("id", s.id);
    await supabase.from("transactions").insert([{
      student_id: s.id,
      type: "topup",
      amount: amount,
      balance_after: newBalance,
      description: "管理員手動儲值"
    }]);
    
    alert(`儲值成功！目前餘額已更新為 $${newBalance}`);
    fetchStudents();
  };

  // --- 手動調帳 ---
  const handleManualAdjust = async () => {
    if (!selectedStudent || !adjustData.amount || !adjustData.reason) return alert("請填寫完整金額與原因");
    const amount = parseInt(adjustData.amount);
    if (isNaN(amount)) return alert("請輸入正確的數字");

    const newBalance = (selectedStudent.balance || 0) + amount;
    
    await supabase.from("students").update({ balance: newBalance }).eq("id", selectedStudent.id);
    await supabase.from("transactions").insert([{ 
      student_id: selectedStudent.id, 
      type: "adjustment", 
      amount, 
      balance_after: newBalance, 
      description: `管理員調帳：${adjustData.reason}` 
    }]);
    
    alert("調帳成功！"); 
    setShowAdjustModal(false); 
    setAdjustData({ amount: "", reason: "" }); 
    fetchStudents();
  };

  // --- 查帳明細邏輯 ---
  const openLogs = (s: Student) => {
    setSelectedStudent(s);
    setLogFilter({ month: "this_year", type: "all", page: 0 });
    setTransactionLogs([]);
    setShowLogModal(true);
  };

  const fetchLogs = async (isNew = true) => {
    if (!selectedStudent) return;
    let query = supabase.from("transactions").select("*", { count: "exact" }).eq("student_id", selectedStudent.id);
    
    const now = new Date();
    if (logFilter.month === "this") query = query.gte("created_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
    else if (logFilter.month === "last") query = query.gte("created_at", new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()).lte("created_at", new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString());
    else if (logFilter.month === "this_year") query = query.gte("created_at", new Date(now.getFullYear(), 0, 1).toISOString());
    
    if (logFilter.type !== "all") query = query.eq("type", logFilter.type);
    
    const from = isNew ? 0 : (logFilter.page + 1) * PAGE_SIZE;
    const { data, count } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    
    if (data) {
      setTransactionLogs(isNew ? data : [...transactionLogs, ...data]);
      setLogFilter(p => ({ ...p, page: isNew ? 0 : p.page + 1 }));
      setHasMoreLogs((isNew ? data.length : transactionLogs.length + data.length) < (count || 0));
    }
  };

  const resetForm = () => {
    setFormData({ name: "", grade: "小一", student_code: "", gender: "男", birthday: "", student_phone: "", school: "", parent_name: "", parent_phone: "" });
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
              <th className="px-8 py-5 font-black w-48">姓名 (年級)</th>
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
                  <div className={`text-sm font-bold mt-1 w-fit px-2 py-0.5 rounded-md ${s.grade === '無' || !s.grade ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-500'}`}>
                    {s.grade || "無"}
                  </div>
                </td>
                <td className="px-8 py-6">
                  {s.student_parent_relations?.map((rel, i) => (
                    <div key={i} className="text-sm font-bold text-slate-600 mb-1">
                      {/* 💡 確保聯絡人稱謂正確顯示 */}
                      {rel.parents?.name && rel.parents.name.trim() !== "" ? rel.parents.name : "聯絡人"}: 
                      <span className="font-mono text-slate-500 ml-1">{rel.parents?.phone}</span>
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
                    <button onClick={() => openEdit(s)} className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-300 transition-all" title="編輯資料">✏️</button>
                    <button onClick={() => openLogs(s)} className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all" title="查看明細">📄</button>
                    <button onClick={() => { setSelectedStudent(s); setShowAdjustModal(true); }} className="w-10 h-10 flex items-center justify-center bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-600 hover:text-white transition-all" title="手動調帳">⚖️</button>
                    <button onClick={() => handleTopup(s)} className="w-10 h-10 flex items-center justify-center bg-green-50 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-sm" title="儲值">💰</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredStudents.length === 0 && (
          <div className="p-20 text-center text-slate-400 font-bold italic">查無符合條件的學生資料</div>
        )}
      </div>

      {/* --- 新增 / 編輯學生 Modal --- */}
      {(showAdd || showEdit) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-2xl font-black text-slate-900">{showAdd ? "建立新學籍" : "編輯學生資料"}</h3>
              <button onClick={() => { setShowAdd(false); setShowEdit(false); }} className="text-slate-400 hover:text-slate-900 text-3xl transition">&times;</button>
            </div>
            
            <div className="p-8 space-y-6 bg-white max-h-[70vh] overflow-y-auto">
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
                    <option value="無">無 / 未設定</option>
                    {gradeOrder.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">人員代碼 (ID)</label>
                  <input value={formData.student_code} onChange={e=>setFormData({...formData, student_code: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-mono text-lg" placeholder="C560-S..." />
                </div>
              </div>

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

              <h4 className="text-lg font-black text-orange-500 border-l-4 border-orange-500 pl-3 pt-4">主要聯絡人 (家長)</h4>
              <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl mb-4">
                <p className="text-xs text-orange-600 font-bold">💡 若輸入的手機系統內沒有，將會自動為您建立一位新家長並完成綁定。</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">聯絡人稱呼</label>
                  <input value={formData.parent_name} onChange={e=>setFormData({...formData, parent_name: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg" placeholder="例如: 爸爸、媽媽" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">聯絡人手機 (必填)</label>
                  <input value={formData.parent_phone} onChange={e=>setFormData({...formData, parent_phone: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 outline-none font-bold text-lg font-mono" placeholder="09..." />
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 flex gap-4 bg-slate-50">
              <button onClick={() => { setShowAdd(false); setShowEdit(false); }} className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition">取消</button>
              <button onClick={showAdd ? handleAddStudent : handleUpdateStudent} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-200 hover:bg-blue-700 transition">
                {showAdd ? "確認建立" : "儲存修改"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- 查帳明細 Modal --- */}
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
                <input type="number" value={adjustData.amount} onChange={(e) => setAdjustData(p => ({ ...p, amount: e.target.value }))} placeholder="例如: -80 或 500" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-blue-500 font-black text-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-blue-600 ml-1">調整原因 (將顯示於明細中)</label>
                <input type="text" value={adjustData.reason} onChange={(e) => setAdjustData(p => ({ ...p, reason: e.target.value }))} placeholder="例如: 系統錯誤退款" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" />
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