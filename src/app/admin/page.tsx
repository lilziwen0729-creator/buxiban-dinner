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
  // --- 基礎狀態 ---
  const [students, setStudents] = useState<Student[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyDate, setHistoryDate] = useState(getToday());
  const [tab, setTab] = useState("orders");
  const [search, setSearch] = useState("");

  // --- 商家與菜單狀態 ---
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [expandedVendor, setExpandedVendor] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorNote, setVendorNote] = useState("");
  const [todayVendor, setTodayVendor] = useState<Vendor | null>(null);
  const [menuInputs, setMenuInputs] = useState<{ [vId: string]: { name: string; price: string } }>({});

  // --- 查帳與調帳狀態 (新增) ---
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [transactionLogs, setTransactionLogs] = useState<any[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const [weeklySchedule, setWeeklySchedule] = useState<{ [key: string]: { vendor_id: string; menu_id: string } }>({});
  const [showUnreceived, setShowUnreceived] = useState(false);

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

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = "/admin-login"; return; }
    fetchData();
    fetchVendors();
    fetchMenus();
    fetchWeeklySchedule();
    fetchTodayVendor();
  };

  const fetchData = async () => {
    const { data: studentData } = await supabase
      .from("students")
      .select(`*, student_parent_relations ( parents ( phone, name ) )`)
      .order("grade");

    if (!studentData) return;
    setStudents(studentData as any);
    
    const today = getToday();
    const { data: orderData } = await supabase.from("orders").select("*").eq("order_date", today);
    setOrders(mergeOrders(orderData || [], studentData as any));
  };

  const mergeOrders = (orderData: any[], studentData: Student[]): Order[] => {
    return orderData.map((order) => {
      const student = studentData.find((s) => s.id === order.student_id);
      return {
        id: order.id,
        student_id: order.student_id,
        name: student?.name || "未知",
        grade: student?.grade || "",
        received: order.received || false,
      };
    });
  };

  // --- 商家菜單功能 (新增：編輯/刪除) ---
  const fetchMenus = async () => {
    const { data } = await supabase.from("menus").select("*").order("created_at");
    setMenus(data || []);
  };

  const addMenu = async (vendorId: string) => {
    const input = menuInputs[vendorId];
    if (!input?.name || !input?.price) { alert("請填完整"); return; }
    await supabase.from("menus").insert([{ vendor_id: vendorId, name: input.name, price: parseInt(input.price) }]);
    setMenuInputs((prev) => ({ ...prev, [vendorId]: { name: "", price: "" } }));
    fetchMenus();
  };

  const editMenuItem = async (menu: MenuItem) => {
    const newName = prompt("請輸入新餐點名稱", menu.name);
    const newPrice = prompt("請輸入新價格", menu.price.toString());
    if (newName && newPrice) {
      await supabase.from("menus").update({ name: newName, price: parseInt(newPrice) }).eq("id", menu.id);
      fetchMenus();
    }
  };

  const deleteMenuItem = async (id: string) => {
    if (!confirm("確定要刪除此餐點嗎？")) return;
    await supabase.from("menus").delete().eq("id", id);
    fetchMenus();
  };

  // --- 學生管理功能 (新增：查帳/調帳) ---
  const openTransactionLogs = async (student: Student) => {
    setSelectedStudent(student);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false });
    setTransactionLogs(data || []);
    setShowLogModal(true);
  };

  const handleManualAdjust = async () => {
    if (!selectedStudent || !adjustAmount || !adjustReason) return alert("請填寫完整");
    const amount = parseInt(adjustAmount);
    const newBalance = (selectedStudent.balance || 0) + amount;

    await supabase.from("students").update({ balance: newBalance }).eq("id", selectedStudent.id);
    await supabase.from("transactions").insert([{
      student_id: selectedStudent.id,
      type: "adjustment",
      amount: amount,
      balance_after: newBalance,
      description: `管理員手動調整：${adjustReason}`
    }]);

    alert("調整成功！");
    setShowAdjustModal(false);
    setAdjustAmount(""); setAdjustReason("");
    fetchData();
  };

  // --- 其他功能 (保持不變) ---
  const fetchVendors = async () => {
    const { data } = await supabase.from("vendors").select("*").order("created_at");
    setVendors(data || []);
  };

  const fetchTodayVendor = async () => {
    const weekday = new Date().toLocaleDateString("zh-TW", { weekday: "long" });
    const { data: schedule } = await supabase.from("weekly_schedule").select(`*, vendors (*)`).eq("weekday", weekday).maybeSingle();
    setTodayVendor(schedule?.vendors || null);
  };

  const fetchWeeklySchedule = async () => {
    const { data } = await supabase.from("weekly_schedule").select("*");
    const formatted: any = {};
    data?.forEach((item) => { formatted[item.weekday] = { vendor_id: item.vendor_id, menu_id: item.menu_id }; });
    setWeeklySchedule(formatted);
  };

  const saveSchedule = async () => {
    const rows = Object.entries(weeklySchedule).map(([weekday, value]) => ({
      weekday, vendor_id: value.vendor_id, menu_id: value.menu_id,
    }));
    await supabase.from("weekly_schedule").upsert(rows, { onConflict: "weekday" });
    alert("排餐已儲存");
  };

  const topupStudent = async (studentId: string) => {
    const input = prompt("請輸入儲值金額");
    if (!input) return;
    const amount = parseInt(input);
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    const newBalance = (student.balance || 0) + amount;
    await supabase.from("students").update({ balance: newBalance }).eq("id", studentId);
    await supabase.from("transactions").insert([{ student_id: studentId, type: "topup", amount, balance_after: newBalance, description: "管理員儲值" }]);
    fetchData();
  };

  const fetchHistory = async () => {
    const { data: studentData } = await supabase.from("students").select("*");
    const { data: orderData } = await supabase.from("orders").select("*").eq("order_date", historyDate);
    setHistoryOrders(mergeOrders(orderData || [], studentData as any));
  };

  const cancelOrder = async (studentId: string, name: string) => {
    if (!confirm(`確定取消 ${name} 今日訂餐？`)) return;
    await supabase.from("orders").delete().eq("student_id", studentId).eq("order_date", getToday());
    fetchData();
  };

  const logout = async () => { await supabase.auth.signOut(); window.location.href = "/admin-login"; };

  const addVendor = async () => {
    await supabase.from("vendors").insert([{ name: vendorName, phone: vendorPhone, note: vendorNote }]);
    setVendorName(""); setVendorPhone(""); setVendorNote(""); fetchVendors();
  };

  const deleteVendor = async (id: string) => {
    if (confirm("確定刪除商家？")) { await supabase.from("vendors").delete().eq("id", id); fetchVendors(); }
  };

  const renderGradeStats = (orderList: Order[]) => (
    <div className="grid grid-cols-10 gap-2 mt-6">
      {grades.map((grade) => {
        const gradeOrders = orderList.filter((o) => o.grade === grade);
        const total = gradeOrders.length;
        const received = gradeOrders.filter((o) => o.received).length;
        if (total === 0) return null;
        return (
          <div key={grade} className="bg-blue-700 rounded-xl p-2 text-center">
            <p className="text-xs text-blue-100">{grade}</p>
            <p className="text-lg font-bold">{received}/{total}</p>
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
          <h3 className="text-xl font-bold mb-3 text-blue-300">{grade}（{gradeOrders.length}）</h3>
          <div className="space-y-2">
            {gradeOrders.map((order) => (
              <div key={order.id} className="flex justify-between items-center bg-white text-black p-4 rounded-xl">
                <span className="font-bold">{order.name}</span>
                <button onClick={() => cancelOrder(order.student_id, order.name)} className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold">取消</button>
              </div>
            ))}
          </div>
        </div>
      );
    });

  // --- 學生管理 UI ---
  const renderStudentSection = (title: string, list: Student[]) => (
    <div className="bg-white rounded-3xl p-6 shadow mb-8 text-black">
      <h2 className="text-2xl font-bold mb-5 border-b pb-2">{title}</h2>
      {grades.filter(g => title === "國小部" ? g.includes("小") : g.includes("國") || g === "高一").map((grade) => {
        const gradeStudents = list.filter((s) => s.grade === grade).sort((a, b) => a.name.localeCompare(b.name));
        if (gradeStudents.length === 0) return null;
        return (
          <div key={grade} className="mb-6">
            <h3 className="font-bold text-blue-700 text-lg mb-2">{grade}（{gradeStudents.length}）</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {gradeStudents.map((student) => (
                <div key={student.id} className="border rounded-2xl p-4 bg-gray-50 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-lg">{student.name}</p>
                    <p className={`text-sm font-bold ${student.balance < 200 ? 'text-red-500' : 'text-green-600'}`}>餘額：${student.balance || 0}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1">
                      <button onClick={() => topupStudent(student.id)} className="bg-green-500 text-white px-2 py-1 rounded-md text-xs font-bold">儲值</button>
                      <button onClick={() => { setSelectedStudent(student); setShowAdjustModal(true); }} className="bg-orange-400 text-white px-2 py-1 rounded-md text-xs font-bold">調帳</button>
                    </div>
                    <button onClick={() => openTransactionLogs(student)} className="bg-blue-600 text-white px-2 py-1 rounded-md text-xs font-bold">明細</button>
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
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* 標題與登出 */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-black">方華補習班 楊梅校</h1>
            <p className="text-blue-600 font-semibold mt-1">{todayDisplay} 管理後台</p>
          </div>
          <button onClick={logout} className="bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-sm">登出</button>
        </div>

        {/* Tab 切換 */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {["orders", "attendance", "schedule", "students", "menu", "history"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-5 py-3 rounded-xl font-bold whitespace-nowrap transition ${tab === t ? "bg-blue-600 text-white shadow-lg" : "bg-white text-black hover:bg-gray-50"}`}>
              {t === "orders" ? "今日訂餐" : t === "attendance" ? "點名系統" : t === "schedule" ? "本週排餐" : t === "students" ? "學生管理" : t === "menu" ? "商家管理" : "歷史紀錄"}
            </button>
          ))}
        </div>

        {/* 今日訂餐 */}
        {tab === "orders" && (
          <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-2xl">
            <h2 className="text-3xl font-bold">今日訂餐概況</h2>
            <div className="mt-4 bg-blue-800 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <p className="font-bold text-lg">今日商家：{todayVendor?.name || "未排餐"}</p>
                <p className="text-sm opacity-80">{todayVendor?.phone}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black">{orders.length}</p>
                <p className="text-xs opacity-60">總份數</p>
              </div>
            </div>
            {renderGradeStats(orders)}
            <div className="mt-8">{renderOrdersByGrade(orders)}</div>
          </div>
        )}

        {/* 點名系統 (A方案整合) */}
        {tab === "attendance" && <AttendanceTab teacherGrade="全部年級" />}

        {/* 商家管理 (整合編輯/刪除) */}
        {tab === "menu" && (
          <div className="space-y-6 text-black">
            <div className="bg-white rounded-3xl p-6 shadow flex justify-between items-center">
              <h2 className="text-3xl font-bold">商家與菜單管理</h2>
              <div className="flex gap-2">
                <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="商家名稱" className="border px-3 py-2 rounded-lg" />
                <button onClick={addVendor} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold">＋新增商家</button>
              </div>
            </div>
            <div className="space-y-4">
              {vendors.map((v) => (
                <div key={v.id} className="bg-white rounded-3xl p-6 shadow border">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold">{v.name}</h3>
                      <p className="text-sm text-gray-500">{v.phone} | {v.note}</p>
                    </div>
                    <button onClick={() => deleteVendor(v.id)} className="text-red-400 hover:text-red-600 text-sm underline">刪除商家</button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-4 rounded-2xl">
                      <h4 className="font-bold mb-3">菜單列表</h4>
                      <div className="space-y-2">
                        {menus.filter(m => m.vendor_id === v.id).map(m => (
                          <div key={m.id} className="flex justify-between bg-white p-3 rounded-xl border">
                            <span>{m.name} (${m.price})</span>
                            <div className="flex gap-2">
                              <button onClick={() => editMenuItem(m)} className="text-blue-500 text-xs">編輯</button>
                              <button onClick={() => deleteMenuItem(m.id)} className="text-red-500 text-xs">刪除</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl">
                      <h4 className="font-bold mb-3">新增餐點</h4>
                      <div className="flex flex-col gap-2">
                        <input value={menuInputs[v.id]?.name || ""} onChange={(e) => setMenuInputs(p => ({...p, [v.id]: {...p[v.id], name: e.target.value}}))} placeholder="餐點名稱" className="border p-2 rounded-lg" />
                        <input value={menuInputs[v.id]?.price || ""} onChange={(e) => setMenuInputs(p => ({...p, [v.id]: {...p[v.id], price: e.target.value}}))} placeholder="價格" className="border p-2 rounded-lg" />
                        <button onClick={() => addMenu(v.id)} className="bg-blue-600 text-white py-2 rounded-lg font-bold">確認新增</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 學生管理 (整合查帳/調帳) */}
        {tab === "students" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow">
              <h2 className="text-3xl font-bold text-black">學籍與帳務管理</h2>
              <input type="text" placeholder="搜尋學生、年級、電話..." value={search} onChange={(e) => setSearch(e.target.value)} className="border-2 border-gray-100 rounded-2xl px-6 py-3 w-1/3 outline-none focus:border-blue-500 text-black" />
            </div>
            {renderStudentSection("國小部", students.filter(s => s.grade.includes("小")))}
            {renderStudentSection("國中部與畢業生", students.filter(s => s.grade.includes("國") || s.grade === "高一"))}
          </div>
        )}

        {/* 歷史紀錄與本週排餐頁面... (保持你原本的結構即可) */}
        {tab === "history" && (
          <div className="bg-slate-900 text-white rounded-3xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">歷史訂單查詢</h2>
              <input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} className="bg-slate-800 text-white p-3 rounded-xl border" />
            </div>
            {renderGradeStats(historyOrders)}
            <div className="mt-8">{renderOrdersByGrade(historyOrders)}</div>
          </div>
        )}

        {tab === "schedule" && (
          <div className="bg-white rounded-3xl p-8 shadow text-black">
            <h2 className="text-3xl font-bold mb-6">本週排餐設定</h2>
            <div className="space-y-4">
              {[["mon", "星期一"], ["tue", "星期二"], ["wed", "星期三"], ["thu", "星期四"], ["fri", "星期五"]].map(([key, day]) => (
                <div key={key} className="flex items-center gap-4 border-b pb-4">
                  <div className="w-24 font-bold">{day}</div>
                  <select value={weeklySchedule[key]?.vendor_id || ""} onChange={(e) => setWeeklySchedule(p => ({...p, [key]: {vendor_id: e.target.value, menu_id: ""}}))} className="border p-3 rounded-xl flex-1">
                    <option value="">選擇商家</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <select value={weeklySchedule[key]?.menu_id || ""} onChange={(e) => setWeeklySchedule(p => ({...p, [key]: {...p[key], menu_id: e.target.value}}))} className="border p-3 rounded-xl flex-1">
                    <option value="">選擇菜單</option>
                    {menus.filter(m => m.vendor_id === weeklySchedule[key]?.vendor_id).map(m => <option key={m.id} value={m.id}>{m.name} (${m.price})</option>)}
                  </select>
                </div>
              ))}
              <button onClick={saveSchedule} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold mt-4">儲存排餐設定</button>
            </div>
          </div>
        )}
      </div>

      {/* --- 彈窗：金流明細 --- */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-black">{selectedStudent?.name} - 帳目歷史</h3>
              <button onClick={() => setShowLogModal(false)} className="text-gray-400 text-3xl">&times;</button>
            </div>
            <div className="overflow-y-auto flex-1 pr-2 space-y-3">
              {transactionLogs.map(log => (
                <div key={log.id} className="flex justify-between items-center border-b pb-3 text-black">
                  <div>
                    <p className="font-bold text-gray-800">{log.description}</p>
                    <p className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString("zh-TW")}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${log.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {log.amount > 0 ? `+${log.amount}` : log.amount}
                    </p>
                    <p className="text-[10px] text-gray-400">餘額：${log.balance_after}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- 彈窗：手動調帳 --- */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl text-black">
            <h3 className="text-2xl font-bold mb-2">手動調帳</h3>
            <p className="text-sm text-gray-400 mb-6">對學生：{selectedStudent?.name}</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">調整金額 (負數代表扣錢, 正數代表加錢)</label>
                <input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="例如: -80" className="w-full border p-3 rounded-xl outline-none focus:border-blue-600" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">調整原因 (將顯示在明細中)</label>
                <input type="text" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="例如: 儲值打錯字修正" className="w-full border p-3 rounded-xl outline-none focus:border-blue-600" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowAdjustModal(false)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold">取消</button>
                <button onClick={handleManualAdjust} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold">確認執行</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}