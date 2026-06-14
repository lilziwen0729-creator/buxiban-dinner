"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTaipeiWeekday, getToday } from "@/lib/date";
import AttendanceTab from "@/components/admin/AttendanceTab"; 

type Order = {
  id: string;
  received: boolean;
  charged: boolean;
  student_id: string;
  studentName: string;
  studentGrade: string;
};

export default function TeacherPage() {
  const [tab, setTab] = useState<"attendance" | "meal">("attendance"); 
  const [selectedGrade, setSelectedGrade] = useState("小一");
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  // 統計狀態
  const [attendanceStats, setAttendanceStats] = useState({ 
    total: 0, 
    arrived: 0,
    hwIncomplete: 0 
  });

  const grades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "無"];
  
  const isPrimary = selectedGrade.includes("小"); // 國小部判斷
  const isJuniorHigh = selectedGrade.includes("國"); // 國中部判斷

  const todayDisplay = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 30000); // 30秒自動刷新
    return () => clearInterval(interval);
  }, [selectedGrade, tab]);

  const refreshData = () => {
    if (tab === "meal") fetchOrders();
    fetchAttendanceStats();
  };

  // --- 1. 抓取點名與作業統計 ---
  const fetchAttendanceStats = async () => {
    const today = getToday();
    
    // 抓取該年級總人數
    const { count } = await supabase
      .from("students")
      .select("*", { count: 'exact', head: true })
      .eq("grade", selectedGrade);

    // 抓取今日點名狀況
    const { data: attData } = await supabase
      .from("attendance_logs")
      .select(`status, students!inner(grade)`)
      .eq("date", today)
      .eq("students.grade", selectedGrade);

    const signedInStatuses = ["arrived", "homework_done", "left"];
    const arrived = attData?.filter(a => signedInStatuses.includes(a.status)).length || 0;
    const hwIncomplete = attData?.filter(a => a.status === "arrived").length || 0;

    setAttendanceStats({
      total: count || 0,
      arrived: arrived,
      hwIncomplete
    });
  };

  // --- 2. 領餐邏輯 (含自動扣款/退款) ---
  const fetchOrders = async () => {
    const today = getToday();
    const { data: orderData } = await supabase.from("orders").select("*").eq("order_date", today);
    const { data: studentData } = await supabase.from("students").select("id, name, grade");
    if (!orderData || !studentData) return;

    const merged = orderData.map((order) => {
      const student = studentData.find((s) => s.id === order.student_id);
      return {
        id: order.id,
        received: order.received || false,
        charged: order.charged || false,
        student_id: order.student_id,
        studentName: student?.name || "未知",
        studentGrade: student?.grade || "",
      };
    });

    setAllOrders(merged);
    setOrders(
      merged
        .filter((o) => o.studentGrade === selectedGrade)
        .sort((a, b) => a.studentName.localeCompare(b.studentName, "zh-Hant"))
    );
  };

const toggleReceived = async (orderId: string, currentStatus: boolean, studentId: string, studentName: string) => {
    const weekday = getTaipeiWeekday();

    // A. 抓取餐費
    const { data: schedule } = await supabase
      .from("weekly_schedule")
      .select("menus(price, name)")
      .eq("weekday", weekday)
      .maybeSingle(); // 使用 maybeSingle 避免找不到資料時崩潰

    // 取得價格與名稱
    const mealPrice = (schedule?.menus as any)?.price || 0;
    const mealName = (schedule?.menus as any)?.name || "今日餐點";

    // 防呆：如果沒設定價格，絕對不允許扣款，以免造成帳務混亂
    if (mealPrice <= 0) {
      return alert(`⚠️ 錯誤：\n系統找不到【${weekday}】的排餐價格。\n請先至後台「本週排餐」設定價格後再領餐。`);
    }

    try {
      const { data: currentOrder } = await supabase
        .from("orders")
        .select("charged")
        .eq("id", orderId)
        .maybeSingle();

      if (currentStatus === true) {
        // ---【返回：已領 -> 未領】---
        const shouldRefund = currentOrder?.charged === true;
        if (!confirm(`確定取消 ${studentName} 的領餐？${shouldRefund ? `\n系統將退回餐費 $${mealPrice}。` : "\n此訂單尚未扣款，不會產生退款。"}`)) return;

        const updates: PromiseLike<unknown>[] = [
          supabase.from("orders").update({ received: false, charged: false }).eq("id", orderId),
        ];

        if (shouldRefund) {
          const { data: st } = await supabase.from("students").select("balance").eq("id", studentId).single();
          const newBal = (st?.balance || 0) + mealPrice;

          updates.push(
            supabase.from("students").update({ balance: newBal }).eq("id", studentId),
            supabase.from("transactions").insert([{
            student_id: studentId,
            type: "refund",
            amount: mealPrice,
            balance_after: newBal,
            description: `老師修正：取消領餐退款(${mealName})`
            }])
          );
        }

        await Promise.all(updates);
        
      } else {
        // ---【領餐：未領 -> 已領】---
        const { data: st } = await supabase.from("students").select("balance").eq("id", studentId).single();
        
        // 檢查餘額是否足夠（可選，如果你允許負債可拿掉此判斷）
        if ((st?.balance || 0) < mealPrice) {
          if (!confirm(`⚠️ 學生餘額不足（剩餘 $${st?.balance}）\n是否仍要執行扣款並領餐？`)) return;
        }

        const newBal = (st?.balance || 0) - mealPrice;

        // 更新餘額、寫入扣款紀錄、修改訂單狀態
        await Promise.all([
          supabase.from("students").update({ balance: newBal }).eq("id", studentId),
          supabase.from("transactions").insert([{
            student_id: studentId,
            type: "order",
            amount: -mealPrice,
            balance_after: newBal,
            description: `領餐扣款：${mealName}`
          }]),
          supabase.from("orders").update({ received: true, charged: true }).eq("id", orderId)
        ]);
      }
      
      // 重新抓取資料更新畫面
      if (typeof fetchOrders === "function") fetchOrders();
      
    } catch (err) {
      console.error("交易失敗:", err);
      alert("操作失敗，請檢查網路連線或聯繫管理員。");
    }
  };

  // --- 3. 國中統一離班邏輯 ---
  const handleBulkLeave = async () => {
    if (!confirm(`確定要將【${selectedGrade}】所有在班學生設為離班？`)) return;
    const today = getToday();
    
    const { data: currentAtt } = await supabase
      .from("attendance_logs")
      .select("id, student_id, students!inner(grade)")
      .eq("date", today)
      .eq("students.grade", selectedGrade)
      .in("status", ["arrived", "homework_done"]);

    if (currentAtt && currentAtt.length > 0) {
      const ids = currentAtt.map(a => a.id);
      await supabase.from("attendance_logs").update({ status: "left", leave_time: new Date().toISOString() }).in("id", ids);
      alert(`已處理 ${ids.length} 位學生統一離班`);
      refreshData();
      window.location.reload(); 
    }
  };

  const currentGradeTotal = allOrders.filter((o) => o.studentGrade === selectedGrade).length;
  const currentGradeReceived = allOrders.filter((o) => o.studentGrade === selectedGrade && o.received).length;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* 頂部切換 */}
        <div className="bg-white rounded-3xl p-2 shadow-sm flex gap-2 border border-gray-100">
          <button onClick={() => setTab("attendance")} className={`flex-1 py-4 rounded-2xl font-bold transition ${tab === "attendance" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:bg-gray-50"}`}>📝 點名與作業</button>
          <button onClick={() => setTab("meal")} className={`flex-1 py-4 rounded-2xl font-bold transition ${tab === "meal" ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:bg-gray-50"}`}>🍱 領餐扣款</button>
        </div>

        {/* 統計面板 (設定成：只有在看「領餐扣款」時才顯示) */}
        {tab === "meal" && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div className="flex-1">
                <label className="block text-gray-500 font-bold mb-2 text-sm">負責年級：</label>
                <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 text-black font-bold text-xl outline-none bg-gray-50 focus:ring-2 focus:ring-blue-500">
                  {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <div className="bg-blue-50 px-5 py-3 rounded-2xl text-center border border-blue-100">
                  <p className="text-blue-500 text-xs font-bold mb-1">今日簽到</p>
                  <p className="text-2xl font-black text-blue-700">{attendanceStats.arrived} <span className="text-sm font-normal text-blue-400">/ {attendanceStats.total}</span></p>
                </div>
                <div className="bg-green-50 px-5 py-3 rounded-2xl text-center border border-green-100">
                  <p className="text-green-500 text-xs font-bold mb-1">今日領餐</p>
                  <p className="text-2xl font-black text-green-700">{currentGradeReceived} <span className="text-sm font-normal text-green-400">/ {currentGradeTotal}</span></p>
                </div>
                {isPrimary && (
                  <div className="bg-red-50 px-5 py-3 rounded-2xl text-center border border-red-100">
                    <p className="text-red-500 text-xs font-bold mb-1">作業未完</p>
                    <p className="text-2xl font-black text-red-700">{attendanceStats.hwIncomplete}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 國中專用：全體統一離班 (只有在點名模式顯示) */}
        {tab === "attendance" && isJuniorHigh && (
          <button onClick={handleBulkLeave} className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold text-lg hover:bg-slate-900 shadow-lg transition">🚀 {selectedGrade} 全體統一離班</button>
        )}

        {/* 分頁內容 */}
        {tab === "attendance" ? (
          <div className="bg-white rounded-3xl p-2 shadow-sm border border-gray-100 min-h-[400px]">
            <AttendanceTab />
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex justify-between">
              <span>領餐清單 ({selectedGrade})</span>
              <span className="text-sm text-gray-400 font-normal">{todayDisplay}</span>
            </h2>
            <div className="grid gap-3">
              {orders.length === 0 ? (
                <p className="text-center text-gray-400 py-10">今日無訂餐紀錄</p>
              ) : (
                orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => toggleReceived(order.id, order.received, order.student_id, order.studentName)}
                    className={`w-full flex justify-between items-center p-5 rounded-2xl font-bold transition-all ${
                      order.received 
                      ? "bg-gray-100 text-gray-400 border-none" 
                      : "bg-white text-gray-700 border-2 border-gray-100 hover:border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${order.received ? "bg-gray-300" : "bg-green-500"}`}></div>
                      <span className="text-xl">{order.studentName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.received ? (
                        <span className="text-sm bg-gray-200 px-3 py-1 rounded-lg">✅ 已領/已扣款 (點擊返回)</span>
                      ) : (
                        <span className="text-sm text-blue-600">點擊領餐扣款 ➔</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
        <div className="text-center text-gray-300 text-xs py-4">方華管理系統 V2.0 - 老師端操作面板</div>
      </div>
    </main>
  );
}
