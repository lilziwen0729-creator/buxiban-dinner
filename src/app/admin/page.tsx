"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import AttendanceTab from "@/components/admin/AttendanceTab";

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

type Vendor = {
  id: string;
  name: string;
  phone?: string;
  note?: string;
};

type MenuItem = {
  id: string;
  vendor_id: string;
  name: string;
  price: number;
};

export default function AdminPage() {
  // --- 原本的狀態 (全數保留) ---
  const [students, setStudents] = useState<Student[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyDate, setHistoryDate] = useState(getToday());
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState("orders");
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorNote, setVendorNote] = useState("");
  const [expandedVendor, setExpandedVendor] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [todayVendor, setTodayVendor] = useState<Vendor | null>(null);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [weeklySchedule, setWeeklySchedule] = useState<{ [key: string]: { vendor_id: string; menu_id: string; }; }>({});
  const [menuInputs, setMenuInputs] = useState<{ [vendorId: string]: { name: string; price: string; }; }>({});
  const [showUnreceived, setShowUnreceived] = useState(false);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [phone, setPhone] = useState("");

  // --- 進階功能狀態 (新增：查帳/調帳) ---
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [transactionLogs, setTransactionLogs] = useState<any[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [logFilter, setLogFilter] = useState({ month: "this_year", type: "all", page: 0 });
  const [hasMoreLogs, setHasMoreLogs] = useState(true);

  const grades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];
  const todayDisplay = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  // --- 原本的 useEffect 生命週期 (保留 handleFocus) ---
  useEffect(() => {
    checkAdmin();
    const interval = setInterval(() => {
      if (tab === "orders") fetchData();
      if (tab === "history") fetchHistory();
    }, 30000);
    return () => clearInterval(interval);
  }, [tab, historyDate]);

  useEffect(() => {
    const handleFocus = () => {
      if (tab === "orders") fetchData();
      if (tab === "history") fetchHistory();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [tab, historyDate]);

  useEffect(() => {
    if (tab === "history") fetchHistory();
  }, [historyDate, tab]);

  // 當過濾條件改變時重新抓取明細
  useEffect(() => {
    if (selectedStudent && showLogModal) fetchLogs(true);
  }, [logFilter.month, logFilter.type]);

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = "/admin-login"; return; }
    fetchData(); fetchVendors(); fetchMenus(); fetchWeeklySchedule(); fetchTodayVendor();
  };

  const mergeOrders = (orderData: any[], studentData: Student[]): Order[] => {
    return orderData.map((order) => {
      const student = studentData.find((s) => s.id === order.student_id);
      return { id: order.id, student_id: order.student_id, name: student?.name || "未知", grade: student?.grade || "", received: order.received || false };
    });
  };

  // --- 💡 修正：抓取今日商家與解紅字 ---
  const fetchTodayVendor = async () => {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayKey = days[new Date().getDay()];
    if (todayKey === 'sun' || todayKey === 'sat') { setTodayVendor(null); return; }
    
    const { data: schedule } = await supabase.from("weekly_schedule").select(`vendor_id, vendors (*)`).eq("weekday", todayKey).maybeSingle();
    setTodayVendor((schedule as any)?.vendors || null);
  };

  const fetchData = async () => {
    const { data: studentData } = await supabase.from("students").select(`*, student_parent_relations ( parents ( phone, name ) )`).order("student_code");
    if (!studentData) return;
    setStudents(studentData as any);
    const today = getToday();
    const { data: orderData } = await supabase.from("orders").select("*").eq("order_date", today);
    setOrders(mergeOrders(orderData || [], studentData as any));
  };

  const fetchHistory = async () => {
    const { data: studentData } = await supabase.from("students").select("*");
    if (!studentData) return;
    const { data: orderData } = await supabase.from("orders").select("*").eq("order_date", historyDate);
    setHistoryOrders(mergeOrders(orderData || [], studentData as Student[]));
  };

  // --- 原本的所有功能函式 (全數保留) ---
  const fetchMenus = async () => { const { data } = await supabase.from("menus").select("*").order("created_at"); setMenus(data || []); };
  const fetchVendors = async () => { const { data } = await supabase.from("vendors").select("*").order("created_at"); setVendors(data || []); };
  const fetchWeeklySchedule = async () => {
    const { data } = await supabase.from("weekly_schedule").select("*");
    const formatted: any = {};
    data?.forEach((item) => { formatted[item.weekday] = { vendor_id: item.vendor_id, menu_id: item.menu_id }; });
    setWeeklySchedule(formatted);
  };
  const cancelOrder = async (studentId: string, name: string) => {
    if (!confirm(`確定取消 ${name} 今日訂餐？`)) return;
    await supabase.from("orders").delete().eq("student_id", studentId).eq("order_date", getToday()); fetchData();
  };
  const deleteStudent = async (id: string) => {
    if (!confirm("確定刪除學生？")) return;
    await supabase.from("students").delete().eq("id", id); fetchData();
  };
  const addStudent = async () => {
    const cleanName = name.trim();
    if (!cleanName || !grade || !phone) { alert("請填寫完整"); return; }
    const { data: parent } = await supabase.from("parents").select("id").eq("phone", phone).maybeSingle();
    if (!parent) { alert("此手機尚未在系統中，請先在資料庫建立家長"); return; }
    const { data: newStudent, error: stError } = await supabase.from("students").insert([{ name: cleanName, grade }]).select().single();
    if (stError) { alert("新增失敗"); return; }
    await supabase.from("student_parent_relations").insert([{ student_id: newStudent.id, parent_id: parent.id }]);
    alert("新增成功並已連結家長"); setName(""); setGrade(""); setPhone(""); setShowAdd(false); fetchData();
  };
  const addVendor = async () => {
    const cleanName = vendorName.trim();
    if (!cleanName) { alert("請輸入商家名稱"); return; }
    const { error } = await supabase.from("vendors").insert([{ name: cleanName, phone: vendorPhone, note: vendorNote }]);
    if (error) { alert("新增失敗"); return; }
    setVendorName(""); setVendorPhone(""); setVendorNote(""); fetchVendors();
  };
  const deleteVendor = async (id: string) => {
    if (!confirm("確定刪除商家？")) return;
    await supabase.from("vendors").delete().eq("id", id); fetchVendors();
  };
  const addMenu = async (vendorId: string) => {
    const input = menuInputs[vendorId];
    if (!input?.name || !input?.price) { alert("請填完整"); return; }
    const { error } = await supabase.from("menus").insert([{ vendor_id: vendorId, name: input.name, price: parseInt(input.price) }]);
    if (error) { alert(error.message); return; }
    setMenuInputs((prev) => ({ ...prev, [vendorId]: { name: "", price: "" } })); await fetchMenus();
  };
  const saveSchedule = async () => {
    const rows = Object.entries(weeklySchedule).map(([weekday, value]) => ({ weekday, vendor_id: value.vendor_id, menu_id: value.menu_id }));
    const { error } = await supabase.from("weekly_schedule").upsert(rows, { onConflict: "weekday" });
    if (error) { alert(error.message); return; } alert("排餐已儲存"); fetchTodayVendor();
  };
  const topupStudent = async (studentId: string) => {
    const input = prompt("請輸入儲值金額"); if (!input) return;
    const amount = parseInt(input); if (isNaN(amount) || amount <= 0) { alert("請輸入正確金額"); return; }
    const student = students.find((s) => s.id === studentId); if (!student) return;
    const newBalance = (student.balance || 0) + amount;
    await supabase.from("students").update({ balance: newBalance }).eq("id", studentId);
    await supabase.from("transactions").insert([{ student_id: studentId, type: "topup", amount, balance_after: newBalance, description: "管理員儲值" }]);
    alert(`${student.name} 儲值成功 +${amount}`); fetchData();
  };
  const logout = async () => { await supabase.auth.signOut(); window.location.href = "/admin-login"; };

  // --- 💡 進階功能：編輯/刪除菜單 ---
  const editMenuItem = async (menu: MenuItem) => {
    const newName = prompt("請輸入新餐點名稱", menu.name); const newPrice = prompt("請輸入新價格", menu.price.toString());
    if (newName && newPrice) { await supabase.from("menus").update({ name: newName, price: parseInt(newPrice) }).eq("id", menu.id); fetchMenus(); }
  };
  const deleteMenuItem = async (id: string) => {
    if (!confirm("確定要刪除此餐點嗎？")) return;
    await supabase.from("menus").delete().eq("id", id); fetchMenus();
  };

  // --- 💡 進階功能：查帳與調帳 ---
  const fetchLogs = async (isNew = true) => {
    if (!selectedStudent) return;
    let query = supabase.from("transactions").select("*", { count: "exact" }).eq("student_id", selectedStudent.id);
    const now = new Date();
    if (logFilter.month === "this") query = query.gte("created_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
    else if (logFilter.month === "last") query = query.gte("created_at", new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()).lte("created_at", new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString());
    else if (logFilter.month === "this_year") query = query.gte("created_at", new Date(now.getFullYear(), 0, 1).toISOString());
    if (logFilter.type !== "all") query = query.eq("type", logFilter.type);
    
    const PAGE_SIZE = 15;
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
    await supabase.from("transactions").insert([{ student_id: selectedStudent.id, type: "adjustment", amount, balance_after: newBalance, description: `系統調帳：${adjustReason}` }]);
    alert("調整成功！"); setShowAdjustModal(false); setAdjustAmount(""); setAdjustReason(""); fetchData();
  };

  // --- 原本的渲染篩選器 (保留搜尋手機功能) ---
  const filteredStudents = students.filter((s) => {
    const keyword = search.toLowerCase();
    const hasPhoneMatch = s.student_parent_relations?.some(rel => rel.parents.phone.includes(keyword));
    return (s.name.toLowerCase().includes(keyword) || s.grade.toLowerCase().includes(keyword) || (s.student_code || "").toLowerCase().includes(keyword) || hasPhoneMatch);
  });

  // --- 原本的渲染區塊 (高一隱藏) ---
  const renderGradeStats = (orderList: Order[]) => (
    <div className="grid grid-cols-3 md:grid-cols-9 gap-3 mt-6">
      {grades.filter(g => g !== "高一").map((grade) => {
        const gradeOrders = orderList.filter((o) => o.grade === grade);
        const total = gradeOrders.length;
        const received = gradeOrders.filter((o) => o.received).length;
        return (
          <div key={grade} className="bg-white/10 rounded-2xl p-4 text-center border border-white/20 shadow-sm backdrop-blur-sm">
            <p className="text-sm text-blue-200 font-bold tracking-wider">{grade}</p>
            <p className="text-2xl font-black mt-1">{received} <span className="text-sm font-normal">/ {total}</span></p>
            <p className="text-xs text-yellow-300 mt-1 font-bold">未領 {total - received}</p>
          </div>
        );
      })}
    </div>
  );

  const renderOrdersByGrade = (orderList: Order[]) =>
    grades.map((grade) => {
      const gradeOrders = orderList.filter((o) => o.grade === grade).sort((a, b) => a.name.localeCompare(b.name));
      if (gradeOrders.length === 0) return null;
      return (
        <div key={grade} className="mb-6">
          <h3 className="text-xl font-bold mb-3 text-blue-300 border-b border-blue-800 pb-2 inline-block">{grade}（{gradeOrders.length}）</h3>
          <div className="space-y-2">
            {gradeOrders.map((order) => (
              <div key={order.id} className="flex justify-between items-center bg-white/5 text-white border border-white/10 p-4 rounded-xl hover:bg-white/10 transition">
                <span className="font-bold text-lg">{order.name}</span>
                {tab === "orders" && (
                  <button onClick={() => cancelOrder(order.student_id, order.name)} className="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg font-bold shadow-md transition">取消</button>
                )}
              </div>
            ))}
          </div>
        </div>
      );
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
    <main className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
      {/* 頂部 Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">方華補習班 <span className="text-blue-600">楊梅校</span></h1>
            <p className="text-slate-500 font-bold text-sm mt-1">{todayDisplay}</p>
          </div>
          <button onClick={logout} className="bg-red-50 text-red-600 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-red-500 hover:text-white transition">登出系統</button>
        </div>
        {/* 導覽列 Tab */}
        <div className="max-w-7xl mx-auto px-6 flex gap-2 overflow-x-auto pb-3 scrollbar-hide pt-2">
          {[
            { id: "orders", icon: "🍱", label: "今日訂餐" },
            { id: "attendance", icon: "📝", label: "點名系統" },
            { id: "schedule", icon: "📅", label: "本週排餐" },
            { id: "students", icon: "👥", label: "學生管理" },
            { id: "menu", icon: "🏪", label: "商家管理" },
            { id: "history", icon: "🕒", label: "歷史紀錄" }
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-6 py-3 rounded-xl font-black whitespace-nowrap transition-all flex items-center gap-2 ${tab === t.id ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-100"}`}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        
        {/* --- 1. 今日訂餐 (保留未領名單展開) --- */}
        {tab === "orders" && (
          <div className="bg-[#0f172a] text-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
            <h2 className="text-4xl font-black mb-2">今日訂餐</h2>
            <p className="text-slate-400 font-bold text-lg mb-8">總計 {orders.length} 份餐點</p>
            
            <div className="bg-blue-600/20 border border-blue-500/30 rounded-2xl p-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div>
                <p className="text-blue-300 font-black text-sm uppercase tracking-widest mb-1">今日供餐資訊</p>
                <p className="text-3xl font-black text-white">{todayVendor?.name || "未設定排餐"}</p>
                <p className="text-blue-200 mt-1">{todayVendor?.phone || ""}</p>
              </div>
            </div>

            {renderGradeStats(orders)}

            {/* 原本的未領名單黃色區塊 */}
            {orders.filter((o) => !o.received).length > 0 && (
              <div className="mt-8 bg-yellow-400 text-slate-900 rounded-2xl overflow-hidden shadow-lg border border-yellow-500">
                <button onClick={() => setShowUnreceived(!showUnreceived)} className="w-full px-6 py-5 flex justify-between items-center font-black text-xl hover:bg-yellow-300 transition">
                  <span>⚠️ 尚未領餐名單（{orders.filter((o) => !o.received).length} 人）</span>
                  <span>{showUnreceived ? "▲ 收起" : "▼ 展開"}</span>
                </button>
                {showUnreceived && (
                  <div className="px-6 pb-6 pt-2">
                    <div className="flex flex-wrap gap-3">
                      {orders.filter((o) => !o.received).sort((a, b) => a.grade.localeCompare(b.grade)).map((order) => (
                        <div key={order.id} className="bg-white/90 px-4 py-2 rounded-xl font-bold shadow-sm">{order.grade}｜{order.name}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="mt-10">{renderOrdersByGrade(orders)}</div>
          </div>
        )}

        {/* --- 2. 點名系統 (A方案整合) --- */}
        {tab === "attendance" && (
          <div className="bg-white rounded-[2.5rem] p-4 shadow-sm border border-slate-200">
             <AttendanceTab teacherGrade="全部年級" />
          </div>
        )}

        {/* --- 3. 本週排餐 --- */}
        {tab === "schedule" && (
          <div className="space-y-6">
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
              <h2 className="text-3xl font-black text-slate-900">本週排餐設定</h2>
              <p className="text-slate-500 mt-2 font-bold">安排本週每日供餐內容</p>
            </div>
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200 space-y-4">
              {[["mon", "星期一"], ["tue", "星期二"], ["wed", "星期三"], ["thu", "星期四"], ["fri", "星期五"]].map(([key, day]) => (
                <div key={day} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center border-b border-slate-100 pb-6 pt-2">
                  <div className="font-black text-xl text-blue-600 bg-blue-50 px-4 py-2 rounded-xl w-fit">{day}</div>
                  <select value={weeklySchedule[key]?.vendor_id || ""} onChange={(e) => setWeeklySchedule((prev:any) => ({ ...prev, [key]: { vendor_id: e.target.value, menu_id: "" } }))} className="bg-slate-50 border-none px-6 py-4 rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">選擇商家</option>
                    {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                  </select>
                  <select value={weeklySchedule[key]?.menu_id || ""} onChange={(e) => setWeeklySchedule((prev:any) => ({ ...prev, [key]: { ...prev[key], menu_id: e.target.value } }))} className="bg-slate-50 border-none px-6 py-4 rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">選擇菜單</option>
                    {menus.filter((menu) => menu.vendor_id === weeklySchedule[key]?.vendor_id).map((menu) => <option key={menu.id} value={menu.id}>{menu.name} (${menu.price})</option>)}
                  </select>
                </div>
              ))}
              <button onClick={saveSchedule} className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white py-5 rounded-2xl font-black text-lg transition shadow-xl">💾 儲存本週排餐</button>
            </div>
          </div>
        )}

        {/* --- 4. 學生管理 (保留新增學生與搜尋) --- */}
        {tab === "students" && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
              <h2 className="text-3xl font-black text-slate-900">學生管理中心</h2>
              <div className="flex gap-4 w-full md:w-auto">
                 <input type="text" placeholder="搜尋姓名、電話..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-slate-50 border-none rounded-xl px-6 py-3 outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
                 <button onClick={() => setShowAdd(!showAdd)} className={`${showAdd ? "bg-slate-200 text-slate-700" : "bg-blue-600 text-white shadow-lg"} px-6 py-3 rounded-xl font-black transition`}>
                    {showAdd ? "取消新增" : "＋ 新增學生"}
                 </button>
              </div>
            </div>

            {/* 原本的新增學生區塊 */}
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
          </div>
        )}

        {/* --- 5. 商家管理 (手風琴保留+編輯刪除功能) --- */}
        {tab === "menu" && (
          <div className="space-y-6">
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
              <h2 className="text-3xl font-black text-slate-900 mb-6">商家與菜單管理</h2>
              <div className="flex flex-wrap gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="新商家名稱" className="flex-1 min-w-[200px] border-none px-6 py-4 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} placeholder="商家電話" className="flex-1 min-w-[150px] border-none px-6 py-4 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={vendorNote} onChange={(e) => setVendorNote(e.target.value)} placeholder="備註 (選填)" className="flex-1 min-w-[200px] border-none px-6 py-4 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={addVendor} className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black shadow-md">＋ 新增商家</button>
              </div>
            </div>

            <div className="space-y-4">
              {vendors.length === 0 ? <p className="text-center text-slate-400 font-bold py-10">尚未新增商家</p> : vendors.map((vendor) => {
                const isExpanded = expandedVendor === vendor.id;
                return (
                  <div key={vendor.id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-200 transition-all">
                    {/* 手風琴 Header */}
                    <div onClick={() => setExpandedVendor(isExpanded ? "" : vendor.id)} className="flex justify-between items-center cursor-pointer group">
                      <div>
                        <p className="font-black text-2xl text-slate-800 group-hover:text-blue-600 transition">{vendor.name}</p>
                        <div className="flex gap-4 mt-2 text-sm text-slate-500 font-bold">
                          {vendor.phone && <span>📞 {vendor.phone}</span>}
                          <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md">🍱 {menus.filter((menu) => menu.vendor_id === vendor.id).length} 道菜</span>
                        </div>
                        {vendor.note && <p className="text-slate-400 mt-1 text-sm">{vendor.note}</p>}
                      </div>
                      <div className="flex items-center gap-4">
                        <button onClick={(e) => { e.stopPropagation(); deleteVendor(vendor.id); }} className="bg-red-50 text-red-500 hover:bg-red-500 hover:text-white px-5 py-2.5 rounded-xl font-black text-sm transition">刪除商家</button>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 text-slate-400 font-bold transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</div>
                      </div>
                    </div>
                    
                    {/* 手風琴 Content */}
                    {isExpanded && (
                      <div className="grid md:grid-cols-2 gap-8 mt-8 pt-6 border-t border-slate-100">
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                          <h4 className="font-black text-slate-700 mb-4 border-b border-slate-200 pb-2">現有菜單</h4>
                          <div className="space-y-3">
                            {menus.filter((menu) => menu.vendor_id === vendor.id).map((menu) => (
                              <div key={menu.id} className="flex justify-between items-center bg-white px-5 py-3 rounded-xl shadow-sm border border-slate-100 hover:border-blue-200 transition">
                                <span className="font-bold text-slate-700">{menu.name}</span>
                                <div className="flex items-center gap-4">
                                  <span className="text-blue-600 font-black">${menu.price}</span>
                                  <div className="flex gap-2">
                                     <button onClick={() => editMenuItem(menu)} className="text-slate-400 hover:text-blue-600 font-bold text-xs bg-slate-50 px-2 py-1 rounded">編輯</button>
                                     <button onClick={() => deleteMenuItem(menu.id)} className="text-slate-400 hover:text-red-500 font-bold text-xs bg-slate-50 px-2 py-1 rounded">刪除</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100">
                          <h4 className="font-black text-blue-800 mb-4 border-b border-blue-200 pb-2">＋ 新增餐點</h4>
                          <div className="space-y-4">
                            <input value={menuInputs[vendor.id]?.name || ""} onChange={(e) => setMenuInputs((prev) => ({ ...prev, [vendor.id]: { name: e.target.value, price: prev[vendor.id]?.price || "" } }))} placeholder="輸入菜名" className="w-full border-none px-5 py-4 rounded-xl font-bold shadow-sm outline-none focus:ring-2 focus:ring-blue-500" />
                            <input type="number" value={menuInputs[vendor.id]?.price || ""} onChange={(e) => setMenuInputs((prev) => ({ ...prev, [vendor.id]: { name: prev[vendor.id]?.name || "", price: e.target.value } }))} placeholder="價格" className="w-full border-none px-5 py-4 rounded-xl font-bold shadow-sm outline-none focus:ring-2 focus:ring-blue-500" />
                            <button onClick={() => addMenu(vendor.id)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-black shadow-md transition">確認新增餐點</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --- 6. 歷史紀錄 (修正日期搜尋) --- */}
        {tab === "history" && (
          <div className="bg-slate-900 text-white rounded-[3rem] p-10 md:p-12 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 mb-10 bg-white/10 rounded-3xl p-6 backdrop-blur-md border border-white/10">
              <div>
                <h2 className="text-3xl font-black">歷史紀錄查詢</h2>
                <p className="text-blue-300 font-bold mt-1">目前顯示：{historyDate} 的訂單</p>
              </div>
              <input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} className="bg-white text-slate-900 px-6 py-4 rounded-2xl font-black text-lg outline-none shadow-inner" />
            </div>
            
            <p className="font-bold text-slate-300 mb-2">當日總訂餐：{historyOrders.length} 份</p>
            {renderGradeStats(historyOrders)}
            <div className="mt-12">{renderOrdersByGrade(historyOrders)}</div>
          </div>
        )}
      </div>

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
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-md shadow-2xl">
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
    </main>
  );
}