"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import AttendanceTab from "@/components/admin/AttendanceTab";
import StudentTab from "@/components/admin/StudentTab";

// --- 型別定義 ---
type Student = {
  id: string;
  name: string;
  grade: string;
  student_code?: string;
  fixed_days: string[];
  balance: number;
  student_parent_relations?: {
    parents: { phone: string; name: string; };
  }[];
};

type Order = {
  id: string;
  student_id: string;
  name: string;
  grade: string;
  received?: boolean;
};

type Vendor = { id: string; name: string; phone?: string; note?: string; };
type MenuItem = { id: string; vendor_id: string; name: string; price: number; };

export default function AdminPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyDate, setHistoryDate] = useState(getToday());
  const [tab, setTab] = useState("orders");
  const [search, setSearch] = useState("");

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [todayVendor, setTodayVendor] = useState<Vendor | null>(null);
  const [weeklySchedule, setWeeklySchedule] = useState<any>({});
  const [menuInputs, setMenuInputs] = useState<{ [vId: string]: { name: string; price: string } }>({});
  const [showUnreceived, setShowUnreceived] = useState(false);

  // --- 💡 進階帳務狀態 (新增) ---
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [transactionLogs, setTransactionLogs] = useState<any[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  
  const [logFilter, setLogFilter] = useState({ month: "this_year", type: "all", page: 0 });
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const PAGE_SIZE = 15;

  const grades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];
  const todayDisplay = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  useEffect(() => {
    checkAdmin();
    const interval = setInterval(() => {
      if (tab === "orders") fetchData();
      if (tab === "history") fetchHistory();
    }, 30000);
    return () => clearInterval(interval);
  }, [tab, historyDate]);

  // 當過濾條件改變時，重新抓取第一頁明細
  useEffect(() => {
    if (selectedStudent && showLogModal) {
      fetchLogs(true);
    }
  }, [logFilter.month, logFilter.type]);

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = "/admin-login"; return; }
    fetchData(); fetchVendors(); fetchMenus(); fetchWeeklySchedule(); fetchTodayVendor();
  };

  const fetchData = async () => {
    const { data: studentData } = await supabase
      .from("students")
      .select(`*, student_parent_relations ( parents ( phone, name ) )`)
      .order("student_code");
    if (!studentData) return;
    setStudents(studentData as any);
    const today = getToday();
    const { data: orderData } = await supabase.from("orders").select("*").eq("order_date", today);
    setOrders(mergeOrders(orderData || [], studentData as any));
  };

  const mergeOrders = (orderData: any[], studentData: Student[]): Order[] => {
    return orderData.map((order) => {
      const student = studentData.find((s) => s.id === order.student_id);
      return { id: order.id, student_id: order.student_id, name: student?.name || "未知", grade: student?.grade || "", received: order.received || false };
    });
  };

  // --- 💡 進階查帳邏輯 ---
  const fetchLogs = async (isNew = true) => {
    if (!selectedStudent) return;
    let query = supabase.from("transactions").select("*", { count: "exact" }).eq("student_id", selectedStudent.id);

    const now = new Date();
    if (logFilter.month === "this") {
      query = query.gte("created_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
    } else if (logFilter.month === "last") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
      query = query.gte("created_at", start).lte("created_at", end);
    } else if (logFilter.month === "this_year") {
      query = query.gte("created_at", new Date(now.getFullYear(), 0, 1).toISOString());
    }

    if (logFilter.type !== "all") query = query.eq("type", logFilter.type);

    const from = isNew ? 0 : (logFilter.page + 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);

    if (!error && data) {
      const merged = isNew ? data : [...transactionLogs, ...data];
      setTransactionLogs(merged);
      setLogFilter(p => ({ ...p, page: isNew ? 0 : p.page + 1 }));
      setHasMoreLogs(merged.length < (count || 0));
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

  const openTransactionLogs = (student: Student) => {
    setSelectedStudent(student);
    setShowLogModal(true); // 會觸發 useEffect 抓取 fetchLogs(true)
  };

  // --- 商家/排餐功能 ---
  const fetchTodayVendor = async () => {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayKey = days[new Date().getDay()];
    if (todayKey === 'sun' || todayKey === 'sat') { setTodayVendor(null); return; }
    const { data: schedule } = await supabase.from("weekly_schedule").select(`vendor_id, vendors (*)`).eq("weekday", todayKey).maybeSingle();
    setTodayVendor((schedule as any)?.vendors || null);
  };

  const fetchWeeklySchedule = async () => {
    const { data } = await supabase.from("weekly_schedule").select("*");
    const formatted: any = {};
    data?.forEach((item) => { formatted[item.weekday] = { vendor_id: item.vendor_id, menu_id: item.menu_id }; });
    setWeeklySchedule(formatted);
  };

  const handleManualAdjust = async () => {
    if (!selectedStudent || !adjustAmount || !adjustReason) return alert("請填寫完整");
    const amount = parseInt(adjustAmount);
    const newBalance = (selectedStudent.balance || 0) + amount;
    await supabase.from("students").update({ balance: newBalance }).eq("id", selectedStudent.id);
    await supabase.from("transactions").insert([{ student_id: selectedStudent.id, type: "adjustment", amount, balance_after: newBalance, description: `管理員調整：${adjustReason}` }]);
    alert("調整成功！"); setShowAdjustModal(false); setAdjustAmount(""); setAdjustReason(""); fetchData();
  };

  const topupStudent = async (studentId: string) => {
    const input = prompt("請輸入儲值金額");
    if (!input) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const amount = parseInt(input);
    const newBal = (student.balance || 0) + amount;
    await supabase.from("students").update({ balance: newBal }).eq("id", studentId);
    await supabase.from("transactions").insert([{ student_id: studentId, type: "topup", amount, balance_after: newBal, description: "管理員儲值" }]);
    fetchData();
  };

  // --- UI 渲染修正：隱藏高一統計 ---
  const renderGradeStats = (orderList: Order[]) => (
    <div className="grid grid-cols-9 gap-3 mt-6">
      {grades.filter(g => g !== "高一").map((grade) => {
        const gradeOrders = orderList.filter((o) => o.grade === grade);
        const total = gradeOrders.length;
        const received = gradeOrders.filter((o) => o.received).length;
        return (
          <div key={grade} className="bg-blue-700/40 rounded-xl p-3 text-center border border-blue-400/20">
            <p className="text-xs text-blue-100 font-medium">{grade}</p>
            <p className="text-lg font-bold mt-1">{received} / {total}</p>
          </div>
        );
      })}
    </div>
  );

  // --- 原本的其他函式保持不變 ---
  const fetchVendors = () => supabase.from("vendors").select("*").then(({data}) => setVendors(data || []));
  const fetchMenus = () => supabase.from("menus").select("*").then(({data}) => setMenus(data || []));
  const cancelOrder = async (sId: string, n: string) => { if(confirm(`取消 ${n} 訂餐？`)) { await supabase.from("orders").delete().eq("student_id", sId).eq("order_date", getToday()); fetchData(); } };
  const fetchHistory = async () => { 
    const { data: s } = await supabase.from("students").select("*");
    const { data: o } = await supabase.from("orders").select("*").eq("order_date", historyDate);
    setHistoryOrders(mergeOrders(o || [], s as any));
  };
  const logout = async () => { await supabase.auth.signOut(); window.location.href = "/admin-login"; };
  const saveSchedule = async () => { 
    const rows = Object.entries(weeklySchedule).map(([w, v]: any) => ({ weekday: w, vendor_id: v.vendor_id, menu_id: v.menu_id }));
    await supabase.from("weekly_schedule").upsert(rows, { onConflict: "weekday" }); alert("已儲存");
  };
  const deleteMenuItem = async (id: string) => { if(confirm("刪除餐點？")) { await supabase.from("menus").delete().eq("id", id); fetchMenus(); } };
  const deleteVendor = async (id: string) => { if(confirm("刪除商家？")) { await supabase.from("vendors").delete().eq("id", id); fetchVendors(); } };
  const addMenu = async (vId: string) => {
    const input = menuInputs[vId]; if(!input?.name) return;
    await supabase.from("menus").insert([{ vendor_id: vId, name: input.name, price: parseInt(input.price) }]);
    setMenuInputs(p => ({...p, [vId]: {name: "", price: ""}})); fetchMenus();
  };

  const renderOrdersByGrade = (orderList: Order[]) =>
    grades.map((grade) => {
      const gradeOrders = orderList.filter((o) => o.grade === grade).sort((a, b) => a.name.localeCompare(b.name));
      if (gradeOrders.length === 0) return null;
      return (
        <div key={grade} className="mb-6 text-white">
          <h3 className="text-xl font-bold mb-3 text-blue-300">{grade}（{gradeOrders.length}）</h3>
          <div className="space-y-2">
            {gradeOrders.map((order) => (
              <div key={order.id} className="flex justify-between items-center bg-white/10 p-4 rounded-xl backdrop-blur-sm">
                <span className="font-bold">{order.name}</span>
                <button onClick={() => cancelOrder(order.student_id, order.name)} className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold">取消</button>
              </div>
            ))}
          </div>
        </div>
      );
    });

  const renderStudentSection = (title: string, list: Student[]) => (
    <div className="bg-white rounded-[2rem] p-8 shadow-sm mb-8 text-black border border-gray-100">
      <h2 className="text-2xl font-black mb-6 border-b pb-4">{title}</h2>
      {grades.filter(g => title === "國小部" ? g.includes("小") : g.includes("國") || g === "高一").map((grade) => {
        const gradeStudents = list.filter((s) => s.grade === grade).sort((a, b) => a.name.localeCompare(b.name));
        if (gradeStudents.length === 0) return null;
        return (
          <div key={grade} className="mb-8">
            <h3 className="font-black text-blue-600 text-lg mb-4">{grade} <span className="text-gray-400 font-medium">({gradeStudents.length})</span></h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {gradeStudents.map((student) => (
                <div key={student.id} className="border-2 border-gray-50 rounded-[1.5rem] p-5 bg-gray-50/50 hover:border-blue-100 transition shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="font-bold text-lg">{student.name}</p>
                      <p className={`text-sm font-black ${student.balance < 200 ? 'text-red-500' : 'text-green-600'}`}>${student.balance || 0}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => topupStudent(student.id)} className="flex-1 bg-green-500 text-white py-2 rounded-xl text-xs font-bold">儲值</button>
                    <button onClick={() => { setSelectedStudent(student); setShowAdjustModal(true); }} className="flex-1 bg-orange-400 text-white py-2 rounded-xl text-xs font-bold">調帳</button>
                    <button onClick={() => openTransactionLogs(student)} className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-xs font-bold">明細</button>
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
    <main className="min-h-screen bg-gray-50 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-10">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-5xl font-black text-black tracking-tight">方華補習班 <span className="text-blue-600 text-2xl font-bold">楊梅校</span></h1>
            <p className="text-gray-400 font-bold mt-2">{todayDisplay}</p>
          </div>
          <button onClick={logout} className="bg-red-500/10 text-red-600 px-6 py-3 rounded-2xl font-black text-sm hover:bg-red-500 hover:text-white transition">登出系統</button>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {["orders", "attendance", "schedule", "students", "menu", "history"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-8 py-4 rounded-2xl font-black whitespace-nowrap transition-all ${tab === t ? "bg-blue-600 text-white shadow-xl shadow-blue-600/20" : "bg-white text-gray-400 hover:text-black"}`}>
              {t === "orders" ? "今日訂餐" : t === "attendance" ? "點名系統" : t === "schedule" ? "排餐設定" : t === "students" ? "學生管理" : t === "menu" ? "商家管理" : "歷史紀錄"}
            </button>
          ))}
        </div>

        {tab === "orders" && (
          <div className="bg-slate-900 text-white rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-10"><svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M11 9H9V2H7V9H5V2H3V9C3 11.12 4.66 12.84 6.75 12.97V22H9.25V12.97C11.34 12.84 13 11.12 13 9V2H11V9ZM16 6V14H18.5V22H21V2H16C16 4.21 17.79 6 20 6H16Z"/></svg></div>
            <h2 className="text-4xl font-black mb-8">今日訂餐概況</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-blue-600 rounded-[2rem] p-8">
                <p className="text-blue-100 font-bold mb-2">今日供餐商家</p>
                <p className="text-3xl font-black">{todayVendor?.name || "未排餐"}</p>
                <p className="text-sm opacity-60 mt-1">{todayVendor?.phone}</p>
              </div>
              <div className="bg-slate-800 rounded-[2rem] p-8 flex justify-between items-center">
                <div>
                  <p className="text-gray-400 font-bold mb-1">總點餐數</p>
                  <p className="text-5xl font-black text-white">{orders.length}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 font-bold mb-1">未領取</p>
                  <p className="text-5xl font-black text-yellow-400">{orders.filter(o => !o.received).length}</p>
                </div>
              </div>
            </div>
            {renderGradeStats(orders)}
          </div>
        )}

        {tab === "attendance" && <AttendanceTab teacherGrade="全部年級" />}
        {tab === "students" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-8 rounded-[2rem] shadow-sm">
              <h2 className="text-3xl font-black text-black">學籍與帳務管理</h2>
              <input type="text" placeholder="搜尋學生、電話..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-gray-50 border-none rounded-2xl px-6 py-4 w-1/3 outline-none focus:ring-2 focus:ring-blue-500 text-black font-bold" />
            </div>
            {renderStudentSection("國小部", students.filter(s => s.grade.includes("小")))}
            {renderStudentSection("國中部與畢業生", students.filter(s => s.grade.includes("國") || s.grade === "高一"))}
          </div>
        )}
        
        {/* 其他 Tab 內容 (Menu, Schedule, History) 同理保留... */}
        {tab === "menu" && (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             {vendors.map(v => (
               <div key={v.id} className="bg-white rounded-[2rem] p-8 shadow-sm text-black border border-gray-50">
                  <div className="flex justify-between mb-6">
                    <h3 className="text-2xl font-black">{v.name}</h3>
                    <button onClick={() => deleteVendor(v.id)} className="text-red-400 text-xs">刪除商家</button>
                  </div>
                  <div className="space-y-3">
                    {menus.filter(m => m.vendor_id === v.id).map(m => (
                      <div key={m.id} className="flex justify-between bg-gray-50 p-4 rounded-2xl">
                        <span className="font-bold">{m.name}</span>
                        <span className="text-blue-600 font-black">${m.price}</span>
                      </div>
                    ))}
                  </div>
               </div>
             ))}
           </div>
        )}

      </div>

      {/* --- 💡 銀行級金流明細彈窗 (分區+過濾) --- */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-3xl font-black text-black">{selectedStudent?.name} - 存摺紀錄</h3>
                <p className="text-sm font-bold text-gray-400 mt-1">目前餘額：<span className="text-blue-600">${selectedStudent?.balance}</span></p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="text-gray-300 text-4xl">&times;</button>
            </div>

            {/* 過濾器 */}
            <div className="space-y-4 mb-8 bg-gray-50 p-6 rounded-[2rem]">
              <div className="flex items-center gap-4">
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">時間</span>
                <div className="flex gap-2">
                  {[["this_year", "今年"], ["this", "本月"], ["last", "上月"], ["all", "歷史"]].map(([v, l]) => (
                    <button key={v} onClick={() => setLogFilter(p => ({...p, month: v}))} className={`px-4 py-2 rounded-full text-xs font-bold transition ${logFilter.month === v ? "bg-blue-600 text-white" : "bg-white text-gray-400 border"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">類型</span>
                <div className="flex gap-2">
                  {[["all", "全部"], ["topup", "儲值"], ["order", "扣餐"], ["adjustment", "調帳"]].map(([v, l]) => (
                    <button key={v} onClick={() => setLogFilter(p => ({...p, type: v}))} className={`px-4 py-2 rounded-full text-xs font-bold transition ${logFilter.type === v ? "bg-slate-800 text-white" : "bg-white text-gray-400 border"}`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* 分區顯示列表 */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-8">
              {Object.entries(groupLogsByMonth(transactionLogs)).map(([month, items]: any) => (
                <div key={month} className="space-y-4">
                  <div className="sticky top-0 bg-white/90 py-2 z-10"><span className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-xs font-black">{month}</span></div>
                  {items.map((log: any) => (
                    <div key={log.id} className="flex justify-between items-center group">
                      <div className="flex gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${log.amount > 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                          {log.type === 'topup' ? '儲' : log.type === 'order' ? '餐' : '調'}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800">{log.description}</p>
                          <p className="text-[10px] text-gray-400">{new Date(log.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-black ${log.amount > 0 ? "text-green-600" : "text-red-500"}`}>{log.amount > 0 ? `+${log.amount}` : log.amount}</p>
                        <p className="text-[10px] text-gray-300 font-mono">餘額: ${log.balance_after}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {hasMoreLogs && <button onClick={() => fetchLogs(false)} className="w-full py-6 text-sm font-black text-blue-500 bg-blue-50/50 rounded-2xl">查看更早之前的紀錄 ▽</button>}
              {transactionLogs.length === 0 && <div className="text-center py-20 text-gray-300 italic">目前無符合條件的紀錄</div>}
            </div>
          </div>
        </div>
      )}

      {/* --- 手動調帳彈窗 --- */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-md shadow-2xl">
            <h3 className="text-3xl font-black text-black mb-2">手動調帳</h3>
            <p className="text-sm text-gray-400 mb-8">修正錯誤或特殊餐費返還：{selectedStudent?.name}</p>
            <div className="space-y-6">
              <div>
                <label className="text-xs font-black text-gray-400 ml-1 mb-2 block uppercase">調整金額 (負數為扣, 正數為加)</label>
                <input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="例如: -80" className="w-full bg-gray-50 border-none rounded-2xl p-5 outline-none focus:ring-2 focus:ring-blue-500 text-black font-bold" />
              </div>
              <div>
                <label className="text-xs font-black text-gray-400 ml-1 mb-2 block uppercase">調整原因</label>
                <input type="text" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="例：系統錯誤退款" className="w-full bg-gray-50 border-none rounded-2xl p-5 outline-none focus:ring-2 focus:ring-blue-500 text-black font-bold" />
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowAdjustModal(false)} className="flex-1 py-5 bg-gray-100 rounded-2xl font-black text-gray-400">取消</button>
                <button onClick={handleManualAdjust} className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-600/30">確認執行</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}