"use client";

import { useEffect, useMemo, useState } from "react";
import { getToday } from "@/lib/date";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
};

type Order = {
  id: string;
  student_id: string;
  received: boolean;
  charged: boolean;
  meal_id: string | null;
};

type AttendanceLog = {
  id: string;
  student_id: string;
  status: string;
};

type AutomationRun = {
  id: string;
  job_name: string;
  run_date: string;
  status: string;
  total: number;
  success_count: number;
  skipped_count: number;
  failed_count: number;
  message: string | null;
  created_at: string;
};

type AdminTask = {
  id: string;
  task_time: string;
  task_type: string;
  title: string;
  note: string | null;
  student_name: string | null;
  grade: string | null;
  status: string;
};

type DashboardOrder = Order & {
  student?: Student;
};

const primaryGrades = new Set(["幼兒", "大班", "小一", "小二", "小三", "小四", "小五", "小六"]);
const getDivision = (grade?: string | null) => primaryGrades.has(grade || "") ? "primary" : "junior";
const divisionLabel: Record<"primary" | "junior", string> = {
  primary: "國小",
  junior: "國中",
};

export default function DashboardTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [automationRuns, setAutomationRuns] = useState<AutomationRun[]>([]);
  const [adminTasks, setAdminTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
    const handleFocus = () => fetchDashboard();
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    const today = getToday();

    try {
      const [studentsRes, ordersRes, attendanceRes, automationRes, tasksRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, name, grade")
          .order("grade"),
        supabase
          .from("orders")
          .select("id, student_id, received, charged, meal_id")
          .eq("order_date", today),
        supabase
          .from("attendance_logs")
          .select("id, student_id, status")
          .eq("date", today),
        supabase
          .from("automation_runs")
          .select("id, job_name, run_date, status, total, success_count, skipped_count, failed_count, message, created_at")
          .eq("run_date", today)
          .order("created_at", { ascending: false }),
        supabase
          .from("admin_tasks")
          .select("id, task_time, task_type, title, note, student_name, grade, status")
          .eq("task_date", today)
          .order("task_time", { ascending: true }),
      ]);

      const studentList = (studentsRes.data || []) as unknown as Student[];
      const studentMap = new Map(studentList.map((student) => [student.id, student]));

      setStudents(studentList);
      setOrders((ordersRes.data || []).map((order) => ({
        ...order,
        student: studentMap.get(order.student_id),
      })) as DashboardOrder[]);
      setAttendanceLogs((attendanceRes.data || []) as AttendanceLog[]);
      setAutomationRuns((automationRes.data || []) as AutomationRun[]);
      setAdminTasks((tasksRes.data || []) as AdminTask[]);
    } catch (err) {
      console.error("儀表板資料同步失敗:", err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const arrivedStatuses = ["arrived", "homework_done", "left"];
    const arrived = attendanceLogs.filter((log) => arrivedStatuses.includes(log.status)).length;
    const leave = attendanceLogs.filter((log) => log.status === "leave").length;
    const left = attendanceLogs.filter((log) => log.status === "left").length;
    const homeworkPending = attendanceLogs.filter((log) => log.status === "arrived").length;
    const received = orders.filter((order) => order.received).length;
    const unreceived = orders.filter((order) => !order.received).length;
    const unchargedReceived = orders.filter((order) => order.received && !order.charged).length;
    const missingMeal = orders.filter((order) => !order.meal_id).length;
    const primaryOrders = orders.filter((order) => getDivision(order.student?.grade) === "primary");
    const juniorOrders = orders.filter((order) => getDivision(order.student?.grade) === "junior");
    const studentMap = new Map(students.map((student) => [student.id, student]));
    const leaveStudents = attendanceLogs
      .filter((log) => log.status === "leave")
      .map((log) => studentMap.get(log.student_id))
      .filter((student): student is Student => Boolean(student));
    const primaryLeave = leaveStudents.filter((student) => getDivision(student.grade) === "primary").length;
    const juniorLeave = leaveStudents.filter((student) => getDivision(student.grade) === "junior").length;

    return {
      totalStudents: students.length,
      arrived,
      leave,
      left,
      homeworkPending,
      orders: orders.length,
      received,
      unreceived,
      unchargedReceived,
      missingMeal,
      primaryOrders: primaryOrders.length,
      primaryReceived: primaryOrders.filter((order) => order.received).length,
      juniorOrders: juniorOrders.length,
      juniorReceived: juniorOrders.filter((order) => order.received).length,
      primaryLeave,
      juniorLeave,
    };
  }, [attendanceLogs, orders, students]);

  const leaveStudents = useMemo(() => {
    const studentMap = new Map(students.map((student) => [student.id, student]));
    return attendanceLogs
      .filter((log) => log.status === "leave")
      .map((log) => studentMap.get(log.student_id))
      .filter((student): student is Student => Boolean(student))
      .sort((a, b) => (a.grade || "").localeCompare(b.grade || "", "zh-TW"))
      .slice(0, 16);
  }, [attendanceLogs, students]);

  const unreceivedOrders = useMemo(
    () => orders
      .filter((order) => !order.received)
      .sort((a, b) => (a.student?.grade || "").localeCompare(b.student?.grade || "", "zh-TW"))
      .slice(0, 16),
    [orders]
  );

  const abnormalOrders = useMemo(
    () => orders.filter((order) => !order.meal_id || (order.received && !order.charged)).slice(0, 12),
    [orders]
  );

  const sortedAdminTasks = useMemo(
    () => [...adminTasks].sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return a.task_time.localeCompare(b.task_time);
    }).slice(0, 8),
    [adminTasks]
  );

  const latestRun = (jobName: string) => automationRuns.find((run) => run.job_name === jobName);
  const orderRun = latestRun("generate_orders");
  const settleRun = latestRun("settle_orders");

  const runStatusLabel: Record<string, string> = {
    success: "已執行",
    skipped: "已略過",
    partial: "部分完成",
    failed: "失敗",
  };

  const systemChecks = [
    {
      label: "固定訂餐名單",
      value: `${stats.orders} 筆`,
      note: stats.orders > 0 ? "今日訂餐已建立" : "若固定訂餐未出現，可到今日訂餐補產",
      tone: stats.orders > 0 ? "green" : "amber",
    },
    {
      label: "餐費結算",
      value: stats.unchargedReceived > 0 ? `${stats.unchargedReceived} 筆待扣` : "正常",
      note: stats.unchargedReceived > 0 ? "可到今日訂餐執行結算" : "目前沒有已領未扣款",
      tone: stats.unchargedReceived > 0 ? "amber" : "green",
    },
    {
      label: "缺餐點訂單",
      value: stats.missingMeal,
      note: stats.missingMeal > 0 ? "需先補餐點，避免扣款失敗" : "今日訂單餐點完整",
      tone: stats.missingMeal > 0 ? "red" : "green",
    },
    {
      label: "排程紀錄",
      value: orderRun ? runStatusLabel[orderRun.status] || orderRun.status : "未記錄",
      note: orderRun
        ? orderRun.message || `產單成功 ${orderRun.success_count}，略過 ${orderRun.skipped_count}`
        : "只代表自動排程沒有留下紀錄，不代表名單一定錯誤",
      tone: orderRun?.status === "failed" ? "red" : orderRun ? "green" : "slate",
    },
    {
      label: "結算紀錄",
      value: settleRun ? runStatusLabel[settleRun.status] || settleRun.status : "未記錄",
      note: settleRun
        ? settleRun.message || `扣款成功 ${settleRun.success_count}，略過 ${settleRun.skipped_count}`
        : "若今日還沒結算，這裡會顯示未記錄",
      tone: settleRun?.status === "failed" ? "red" : settleRun ? "green" : "slate",
    },
  ];

  const cards = [
    { label: "今日到班", value: `${stats.arrived}/${stats.totalStudents}`, note: `請假 ${stats.leave} · 已離班 ${stats.left}`, tone: "blue" },
    {
      label: "今日訂餐",
      value: stats.orders,
      note: `國小 ${stats.primaryReceived}/${stats.primaryOrders} · 國中 ${stats.juniorReceived}/${stats.juniorOrders}`,
      tone: "green",
    },
    { label: "作業未完", value: stats.homeworkPending, note: "狀態仍為到班", tone: "rose" },
    { label: "今日請假", value: stats.leave, note: `國小 ${stats.primaryLeave} · 國中 ${stats.juniorLeave}`, tone: "amber" },
  ];

  const taskTypeLabel: Record<string, string> = {
    early_leave: "提早離開",
    pickup: "接送提醒",
    call_parent: "聯絡家長",
    payment: "收費提醒",
    other: "其他事項",
  };

  const toneClass: Record<string, string> = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-green-100 bg-green-50 text-green-700",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
  };

  const systemToneClass: Record<string, string> = {
    green: "border-green-100 bg-green-50 text-green-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    red: "border-red-100 bg-red-50 text-red-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };

  const renderStudentChipsByDivision = (items: Student[], emptyText: string, tone: "amber" | "blue") => {
    const groups = (["primary", "junior"] as const).map((division) => ({
      division,
      students: items.filter((student) => getDivision(student.grade) === division),
    }));
    const chipClass = tone === "amber"
      ? "border-amber-100 bg-amber-50 text-amber-700"
      : "border-blue-100 bg-blue-50 text-blue-700";

    if (items.length === 0) {
      return (
        <div className="rounded-3xl border border-dashed border-slate-200 py-10 text-center text-sm font-bold text-slate-400">
          {emptyText}
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.division} className="rounded-2xl bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-700">{divisionLabel[group.division]}</h4>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-500">{group.students.length} 人</span>
            </div>
            {group.students.length === 0 ? (
              <p className="text-sm font-bold text-slate-400">目前沒有</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.students.map((student) => (
                  <span key={student.id} className={`rounded-xl border px-3 py-2 text-sm font-black ${chipClass}`}>
                    {student.grade || "未分級"} · {student.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl shadow-slate-200">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-blue-200">今日營運儀表板</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight md:text-[1.8rem]">今天狀況一眼看</h2>
            <p className="mt-2 text-[15px] font-bold text-slate-300">{getToday()} · 每 30 秒自動刷新</p>
          </div>
          <button onClick={fetchDashboard} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white hover:bg-white/15">
            {loading ? "同步中..." : "重新整理"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-3xl border p-5 ${toneClass[card.tone]}`}>
            <p className="text-sm font-black tracking-wide opacity-70">{card.label}</p>
            <p className="mt-3 text-3xl font-black md:text-[2.35rem]">{card.value}</p>
            <p className="mt-2 text-[15px] font-bold opacity-75">{card.note}</p>
          </div>
        ))}
      </div>

      {(stats.unchargedReceived > 0 || stats.missingMeal > 0) && (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-red-800">
          <h3 className="text-lg font-black">需要處理的帳務異常</h3>
          <p className="mt-1 text-sm font-bold">已領未扣款 {stats.unchargedReceived} 筆，缺少餐點 {stats.missingMeal} 筆。</p>
        </div>
      )}

      <section className="app-card p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-orange-500">Front Desk Tasks</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">今日行政待辦</h3>
          </div>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
            {adminTasks.filter((task) => task.status === "pending").length} 件待處理
          </span>
        </div>

        {sortedAdminTasks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 py-10 text-center text-sm font-bold text-slate-400">
            今天沒有行政待辦。
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {sortedAdminTasks.map((task) => (
              <div key={task.id} className={`rounded-2xl border p-4 ${task.status === "done" ? "border-slate-100 bg-slate-50 opacity-70" : "border-orange-100 bg-orange-50/70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-black text-slate-950">{task.task_time.slice(0, 5)}</p>
                    <p className="mt-1 text-xs font-black text-orange-600">{taskTypeLabel[task.task_type] || "其他事項"}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-black ${task.status === "done" ? "bg-slate-200 text-slate-500" : "bg-white text-orange-700"}`}>
                    {task.status === "done" ? "已完成" : "待處理"}
                  </span>
                </div>
                <p className={`mt-3 font-black ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-900"}`}>{task.title}</p>
                {task.student_name && <p className="mt-1 text-sm font-bold text-blue-700">{task.grade || "未分級"} · {task.student_name}</p>}
                {task.note && <p className="mt-1 text-xs font-bold text-slate-500">{task.note}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="app-card p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-emerald-500">System Check</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">今日系統提醒</h3>
            <p className="mt-1 text-[15px] font-bold text-slate-500">直接對應今日訂餐、扣款與排程紀錄。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{getToday()}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          {systemChecks.map((check) => (
            <div key={check.label} className={`rounded-2xl border p-4 ${systemToneClass[check.tone]}`}>
              <p className="text-sm font-black opacity-70">{check.label}</p>
              <p className="mt-2 text-2xl font-black">{check.value}</p>
              <p className="mt-1 text-sm font-bold leading-snug opacity-75">{check.note}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="app-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-amber-500">Leave</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">今日請假名單</h3>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{stats.leave} 人</span>
          </div>

          {renderStudentChipsByDivision(leaveStudents, "目前沒有請假學生。", "amber")}
        </section>

        <section className="app-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-500">Meals</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">尚未領餐</h3>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{stats.unreceived} 人</span>
          </div>

          {renderStudentChipsByDivision(
            unreceivedOrders.map((order) => order.student).filter((student): student is Student => Boolean(student)),
            "目前沒有未領餐學生。",
            "blue"
          )}
        </section>
      </div>

      {abnormalOrders.length > 0 && (
        <section className="app-card p-5">
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-widest text-red-500">Check</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">訂單檢查清單</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {abnormalOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                <p className="font-black text-slate-900">{order.student?.name || "未知學生"}</p>
                <p className="mt-1 text-sm font-bold text-red-600">
                  {!order.meal_id ? "缺少餐點" : "已領未扣款"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
