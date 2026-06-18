"use client";

import { useEffect, useMemo, useState } from "react";
import { getToday } from "@/lib/date";
import { logOperation } from "@/lib/operationLog";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade?: string | null;
  enrollment_status?: string;
  balance?: number | null;
  student_phone?: string | null;
  fixed_days_off?: string[] | number[] | null;
  student_parent_relations?: {
    parents?: { line_user_id?: string | null; phone?: string | null } | { line_user_id?: string | null; phone?: string | null }[] | null;
  }[];
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
  student_id: string | null;
  student_name: string | null;
  grade: string | null;
  status: string;
};

type TransportSchedule = {
  id: string;
  weekday: number;
  transport_time: string;
  direction: "inbound" | "outbound";
  student_id: string;
  student_name: string;
  grade: string | null;
  location: string | null;
  note: string | null;
  is_active: boolean;
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
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [automationRuns, setAutomationRuns] = useState<AutomationRun[]>([]);
  const [adminTasks, setAdminTasks] = useState<AdminTask[]>([]);
  const [transportSchedules, setTransportSchedules] = useState<TransportSchedule[]>([]);
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
    const todayWeekday = new Date(`${today}T00:00:00+08:00`).getDay();

    try {
      const [studentsRes, ordersRes, attendanceRes, automationRes, tasksRes, transportRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, name, grade, balance, student_phone, fixed_days_off, enrollment_status, student_parent_relations ( parents ( phone, line_user_id ) )")
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
          .select("id, task_time, task_type, title, note, student_id, student_name, grade, status")
          .eq("task_date", today)
          .order("task_time", { ascending: true }),
        supabase
          .from("transport_schedules")
          .select("id, weekday, transport_time, direction, student_id, student_name, grade, location, note, is_active")
          .eq("weekday", todayWeekday)
          .eq("is_active", true)
          .order("transport_time", { ascending: true }),
      ]);

      const fullStudentList = (studentsRes.data || []) as unknown as Student[];
      const studentList = fullStudentList
        .filter((student) => (student.enrollment_status || "active") === "active");
      const studentMap = new Map(studentList.map((student) => [student.id, student]));

      setAllStudents(fullStudentList);
      setStudents(studentList);
      setOrders((ordersRes.data || []).map((order) => ({
        ...order,
        student: studentMap.get(order.student_id),
      })).filter((order) => order.student) as DashboardOrder[]);
      setAttendanceLogs(((attendanceRes.data || []) as AttendanceLog[]).filter((log) => studentMap.has(log.student_id)));
      setAutomationRuns((automationRes.data || []) as AutomationRun[]);
      setAdminTasks((tasksRes.data || []) as AdminTask[]);
      if (transportRes.error) {
        console.warn("交通車排程讀取失敗:", transportRes.error.message);
        setTransportSchedules([]);
      } else {
        setTransportSchedules((transportRes.data || []) as TransportSchedule[]);
      }
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

  const statusDashboard = useMemo(() => {
    const active = allStudents.filter((student) => (student.enrollment_status || "active") === "active");
    const lowBalance = active
      .filter((student) => Number(student.balance || 0) < 200)
      .sort((a, b) => Number(a.balance || 0) - Number(b.balance || 0));
    const leaveIds = new Set(attendanceLogs.filter((log) => log.status === "leave").map((log) => log.student_id));
    const presentIds = new Set(
      attendanceLogs
        .filter((log) => ["arrived", "homework_done", "left"].includes(log.status))
        .map((log) => log.student_id)
    );
    const todayLeave = active
      .filter((student) => leaveIds.has(student.id))
      .sort((a, b) => `${a.grade}${a.name}`.localeCompare(`${b.grade}${b.name}`, "zh-TW"));
    const absent = active
      .filter((student) => !presentIds.has(student.id) && !leaveIds.has(student.id))
      .sort((a, b) => `${a.grade}${a.name}`.localeCompare(`${b.grade}${b.name}`, "zh-TW"));
    const noLine = active.filter((student) => {
      const relations = student.student_parent_relations || [];
      return !relations.some((relation) => {
        const parents = Array.isArray(relation.parents) ? relation.parents : [relation.parents];
        return parents.some((parent) => Boolean(parent?.line_user_id));
      });
    }).sort((a, b) => `${a.grade}${a.name}`.localeCompare(`${b.grade}${b.name}`, "zh-TW"));

    return {
      active,
      lowBalance,
      todayLeave,
      absent,
      noLine,
    };
  }, [allStudents, attendanceLogs]);

  const dataQuality = useMemo(() => {
    const active = allStudents.filter((student) => (student.enrollment_status || "active") === "active");
    const getParents = (student: Student) => (student.student_parent_relations || [])
      .flatMap((relation) => Array.isArray(relation.parents) ? relation.parents : [relation.parents])
      .filter(Boolean) as { phone?: string | null; line_user_id?: string | null }[];
    const hasParent = (student: Student) => getParents(student).length > 0;
    const hasPhone = (student: Student) => {
      const parentHasPhone = getParents(student).some((parent) => Boolean(parent.phone));
      return Boolean(student.student_phone) || parentHasPhone;
    };
    const hasLine = (student: Student) => getParents(student).some((parent) => Boolean(parent.line_user_id));
    const fixedMealDays = (student: Student) => Array.isArray(student.fixed_days_off) ? student.fixed_days_off.length : 0;

    return {
      noPhone: active.filter((student) => !hasPhone(student)),
      noParent: active.filter((student) => !hasParent(student)),
      noLine: active.filter((student) => !hasLine(student)),
      noGrade: active.filter((student) => !student.grade),
      abnormalBalance: active.filter((student) => student.balance === null || student.balance === undefined || Number(student.balance) < 0),
      withdrawnFixedMeal: allStudents.filter((student) => student.enrollment_status === "withdrawn" && fixedMealDays(student) > 0),
    };
  }, [allStudents]);

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
  const transportDirectionLabel: Record<TransportSchedule["direction"], string> = {
    inbound: "搭車來",
    outbound: "搭車回去",
  };
  const transportDirectionClass: Record<TransportSchedule["direction"], string> = {
    inbound: "bg-blue-50 text-blue-700",
    outbound: "bg-emerald-50 text-emerald-700",
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

  const completeAdminTask = async (task: AdminTask) => {
    if (task.status === "done") return;

    setAdminTasks((current) => current.map((item) =>
      item.id === task.id ? { ...item, status: "done" } : item
    ));

    const { error } = await supabase
      .from("admin_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", task.id);

    if (error) {
      alert("完成待辦失敗：" + error.message);
      fetchDashboard();
      return;
    }

    await logOperation({
      action: "admin_task_complete",
      targetType: "admin_task",
      targetId: task.id,
      targetName: task.title,
      studentId: task.student_id || undefined,
      studentName: task.student_name || undefined,
      metadata: { source: "dashboard" },
    });
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

  const statusCardClass: Record<string, string> = {
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    red: "border-red-100 bg-red-50 text-red-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    purple: "border-purple-100 bg-purple-50 text-purple-700",
  };

  const renderStatusList = (
    title: string,
    items: Student[],
    emptyText: string,
    tone: string,
    getDetail?: (student: Student) => string
  ) => (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-black text-slate-900">{title}</h4>
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusCardClass[tone]}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-400">{emptyText}</p>
      ) : (
        <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
          {items.slice(0, 36).map((student) => (
            <span key={student.id} className={`rounded-xl border px-3 py-2 text-sm font-black ${statusCardClass[tone]}`}>
              {student.grade || "未分級"} · {student.name}
              {getDetail && <span className="ml-1 opacity-75">{getDetail(student)}</span>}
            </span>
          ))}
          {items.length > 36 && (
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-500">
              還有 {items.length - 36} 人
            </span>
          )}
        </div>
      )}
    </div>
  );

  const renderQualityList = (
    title: string,
    items: Student[],
    emptyText: string,
    tone: string,
    getDetail?: (student: Student) => string
  ) => (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-black text-slate-900">{title}</h4>
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusCardClass[tone]}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-400">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 10).map((student) => (
            <div key={student.id} className={`rounded-2xl border px-3 py-2 text-sm font-black ${statusCardClass[tone]}`}>
              <span>{student.grade || "未分級"} · {student.name}</span>
              {getDetail && <span className="ml-1 opacity-75">{getDetail(student)}</span>}
            </div>
          ))}
          {items.length > 10 && (
            <p className="text-xs font-black text-slate-400">還有 {items.length - 10} 筆，請到學生管理查看。</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="rounded-3xl bg-slate-950 px-5 py-4 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-200">今日營運儀表板</p>
            <h2 className="mt-0.5 text-xl font-black tracking-tight">今天狀況一眼看</h2>
            <p className="mt-1 text-xs font-bold text-slate-300">{getToday()} · 每 30 秒自動刷新</p>
          </div>
          <button onClick={fetchDashboard} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black text-white hover:bg-white/15">
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
                  <div className="flex gap-3">
                    <button
                      onClick={() => completeAdminTask(task)}
                      disabled={task.status === "done"}
                      className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-black transition ${
                        task.status === "done"
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-orange-200 bg-white text-transparent hover:border-green-500 hover:bg-green-50"
                      }`}
                      title={task.status === "done" ? "已完成" : "標記完成"}
                    >
                      ✓
                    </button>
                    <div>
                      <p className="text-2xl font-black text-slate-950">{task.task_time.slice(0, 5)}</p>
                      <p className="mt-1 text-xs font-black text-orange-600">{taskTypeLabel[task.task_type] || "其他事項"}</p>
                    </div>
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
            <p className="text-sm font-black uppercase tracking-wider text-cyan-500">Transport</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">今日交通車</h3>
          </div>
          <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">
            {transportSchedules.length} 筆排程
          </span>
        </div>

        {transportSchedules.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 py-10 text-center text-sm font-bold text-slate-400">
            今天沒有交通車接送排程。
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {transportSchedules.map((schedule) => (
              <div key={schedule.id} className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-2xl font-black text-slate-950">{schedule.transport_time.slice(0, 5)}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${transportDirectionClass[schedule.direction]}`}>
                    {transportDirectionLabel[schedule.direction]}
                  </span>
                </div>
                <p className="mt-3 font-black text-slate-900">{schedule.grade || "未分級"} · {schedule.student_name}</p>
                {schedule.location && <p className="mt-1 text-sm font-bold text-cyan-700">地點：{schedule.location}</p>}
                {schedule.note && <p className="mt-1 text-xs font-bold text-slate-500">{schedule.note}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

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
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-blue-500">Student Status</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">學生狀態儀表板</h3>
            <p className="mt-1 text-[15px] font-bold text-slate-500">一進後台先看哪些資料、出勤與 LINE 綁定需要處理。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
            低餘額門檻 $200
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[
            { label: "在班", value: statusDashboard.active.length, tone: "green", note: "會進入點名與訂餐" },
            { label: "低餘額", value: statusDashboard.lowBalance.length, tone: "red", note: "建議安排儲值" },
            { label: "今日請假", value: statusDashboard.todayLeave.length, tone: "amber", note: "家長或老師已登記" },
            { label: "今日未到", value: statusDashboard.absent.length, tone: "blue", note: "未到班也未請假" },
            { label: "未綁 LINE", value: statusDashboard.noLine.length, tone: "purple", note: "無法主動通知家長" },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl border p-4 ${statusCardClass[item.tone]}`}>
              <p className="text-sm font-black opacity-75">{item.label}</p>
              <p className="mt-2 text-3xl font-black">{item.value}</p>
              <p className="mt-1 text-xs font-bold leading-snug opacity-75">{item.note}</p>
            </div>
          ))}
        </div>

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

      {(stats.unchargedReceived > 0 || stats.missingMeal > 0) && (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-red-800">
          <h3 className="text-lg font-black">需要處理的帳務異常</h3>
          <p className="mt-1 text-sm font-bold">已領未扣款 {stats.unchargedReceived} 筆，缺少餐點 {stats.missingMeal} 筆。</p>
        </div>
      )}

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

      <section className="app-card p-5">
        <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-fuchsia-500">Data Quality</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">資料品質檢查</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">把會影響點名、通知、訂餐與帳務的資料問題集中列出。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
            共 {Object.values(dataQuality).reduce((sum, items) => sum + items.length, 0)} 筆待確認
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {renderQualityList("沒電話", dataQuality.noPhone, "目前都有電話資料。", "amber")}
          {renderQualityList("沒家長", dataQuality.noParent, "目前都有家長關聯。", "red")}
          {renderQualityList("沒 LINE", dataQuality.noLine, "目前都有家長 LINE。", "purple")}
          {renderQualityList("沒年級", dataQuality.noGrade, "目前都有設定年級。", "blue")}
          {renderQualityList("餘額異常", dataQuality.abnormalBalance, "目前沒有負數或空白餘額。", "red", (student) => `$${student.balance ?? "空白"}`)}
          {renderQualityList("固定訂餐但沒有在班", dataQuality.withdrawnFixedMeal, "目前沒有退班學生保留固定訂餐。", "amber")}
        </div>
      </section>

      <section className="app-card p-5">
        <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-purple-500">Follow Up</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">待追蹤名單</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">放在下方保留查核用，上方儀表板只顯示重點數字。</p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {renderStatusList("低餘額名單", statusDashboard.lowBalance, "目前沒有低餘額學生。", "red", (student) => `$${student.balance || 0}`)}
          {renderStatusList("今日未到", statusDashboard.absent, "目前沒有未到學生。", "blue")}
          {renderStatusList("未綁家長 LINE", statusDashboard.noLine, "目前都有綁定 LINE。", "purple")}
        </div>
      </section>

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
