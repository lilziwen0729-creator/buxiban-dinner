"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTaipeiNow, getToday } from "@/lib/date";
import { saveLeaveRecord } from "@/lib/leaveRecord";
import { logOperation } from "@/lib/operationLog";
import { authenticatedFetch } from "@/lib/authenticatedFetch";

// 👉 引入我們剛剛拆開的兩個畫面積木 (確保路徑正確)
import PrimaryAttendance from "@/components/admin/PrimaryAttendance";
import JuniorAttendance from "@/components/admin/JuniorAttendance";

type AttendanceTabProps = {
  mode?: "attendance" | "scores" | "mixed";
  allowAdminLeave?: boolean;
};

type ScoreMeta = {
  score_1_subject: string;
  score_1_scope: string;
  score_2_subject: string;
  score_2_scope: string;
};

const emptyScoreMeta: ScoreMeta = {
  score_1_subject: "",
  score_1_scope: "",
  score_2_subject: "",
  score_2_scope: "",
};

export default function AttendanceTab({ mode = "attendance", allowAdminLeave = true }: AttendanceTabProps) {
  const scoresOnly = mode === "scores";
  const [mounted, setMounted] = useState(false);
  const [systemMode, setSystemMode] = useState<"primary" | "junior">(scoresOnly ? "junior" : "primary");
  const [selectedGrade, setSelectedGrade] = useState("小一");
  
  // --- 國中專用狀態 ---
  const [juniorTab, setJuniorTab] = useState<"attendance" | "grading">(scoresOnly ? "grading" : "attendance");
  const [courses, setCourses] = useState<any[]>([]);
  const [studentCourses, setStudentCourses] = useState<any[]>([]);
  const [selectedPrimaryCourseId, setSelectedPrimaryCourseId] = useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [currentScores, setCurrentScores] = useState<Record<string, { score_1: string, score_2: string }>>({});
  const [scoreMeta, setScoreMeta] = useState<ScoreMeta>(emptyScoreMeta);
  const [scoreRecords, setScoreRecords] = useState<any[]>([]);
  const [dayOfWeek] = useState(() => {
    const taipeiDay = getTaipeiNow().getDay();
    return taipeiDay === 0 ? 7 : taipeiDay;
  });

  // --- 共用資料狀態 ---
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [leaveRecords, setLeaveRecords] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preLeaveFromDate, setPreLeaveFromDate] = useState(getToday());
  const [preLeaveToDate, setPreLeaveToDate] = useState(getToday());
  const [preLeaveGrade, setPreLeaveGrade] = useState("all");
  const [preLeaveKeyword, setPreLeaveKeyword] = useState("");
  const [preLeaveReason, setPreLeaveReason] = useState("");
  const [preLeaveStudentIds, setPreLeaveStudentIds] = useState<string[]>([]);
  const [preLeaveSaving, setPreLeaveSaving] = useState(false);
  const [showPreLeavePlanner, setShowPreLeavePlanner] = useState(false);

  const primaryGrades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六"];
  const preLeaveGrades = ["小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];
  const primaryGradeOrder = new Map(primaryGrades.map((grade, index) => [grade, index]));
  const getCourseAttendanceSection = (course: any) => {
    const setting = course?.attendance_section || "auto";
    if (setting === "primary" || setting === "junior" || setting === "hidden") return setting;
    return primaryGrades.includes(course?.grade) ? "primary" : "junior";
  };
  const sortPrimaryCourses = (courseList: any[]) => [...courseList].sort((a, b) => {
    const gradeA = primaryGradeOrder.get(a.grade) ?? 99;
    const gradeB = primaryGradeOrder.get(b.grade) ?? 99;
    if (gradeA !== gradeB) return gradeA - gradeB;
    const timeA = a.start_time || "";
    const timeB = b.start_time || "";
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return (a.name || "").localeCompare(b.name || "", "zh-TW");
  });
  const logMatchesScope = (log: any, studentId: string, courseId: string | null = null) => {
    if (log.student_id !== studentId) return false;
    if (courseId) return log.course_id === courseId;
    return !log.course_id;
  };
  const parseDateInput = (value: string) => new Date(`${value}T00:00:00+08:00`);
  const formatDateInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const getWeekdayFromDate = (value: string) => {
    const weekday = parseDateInput(value).getDay();
    return weekday === 0 ? 7 : weekday;
  };
  const getDateRange = (fromDate: string, toDate: string) => {
    const start = parseDateInput(fromDate);
    const end = parseDateInput(toDate);
    const dates: string[] = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      dates.push(formatDateInput(cursor));
      if (dates.length > 90) break;
    }
    return dates;
  };

  // ==========================================
  // 👇 這裡完全保留你原本寫好的所有邏輯函數 👇
  // ==========================================
  
  useEffect(() => {
    const today = getToday();
    const todayRecord = scoreRecords.find((score) => score.course_id === selectedCourseId && score.exam_date === today);
    const timer = window.setTimeout(() => {
      setScoreMeta({
        score_1_subject: todayRecord?.score_1_subject || "",
        score_1_scope: todayRecord?.score_1_scope || "",
        score_2_subject: todayRecord?.score_2_subject || "",
        score_2_scope: todayRecord?.score_2_scope || "",
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedCourseId, scoreRecords]);

  const fetchData = useCallback(async (d: number) => {
    setLoading(true);
    const today = getToday();
    try {
      const [stRes, logRes, leaveRecordRes, orderRes, courseRes, scRes, scoreRes] = await Promise.all([
        supabase.from("students").select("*").order("name"),
        supabase.from("attendance_logs").select("*").eq("date", today),
        supabase.from("leave_records").select("student_id, reason, metadata").eq("leave_date", today),
        supabase.from("orders").select("*").eq("order_date", today),
        supabase.from("courses").select("*"),
        supabase.from("student_courses").select("*"),
        supabase.from("exam_scores").select("*").order("exam_date", { ascending: false }).limit(800)
      ]);
      const queryError = [stRes, logRes, leaveRecordRes, orderRes, courseRes, scRes, scoreRes]
        .find((result) => result.error)?.error;
      if (queryError) throw queryError;

      setStudents((stRes.data || []).filter((student: any) => (student.enrollment_status || "active") === "active"));
      setAttendanceLogs(logRes.data || []);
      setLeaveRecords(leaveRecordRes.data || []);
      setOrders(orderRes.data || []);
      setCourses(courseRes.data || []);
      setStudentCourses(scRes.data || []);
      setScoreRecords(scoreRes.data || []);

      if (courseRes.data && courseRes.data.length > 0) {
        const todays = courseRes.data.filter(c => c.day_of_week === d);
        const primaryTodays = sortPrimaryCourses(todays.filter((course) => getCourseAttendanceSection(course) === "primary"));
        const juniorTodays = todays.filter((course) => getCourseAttendanceSection(course) === "junior");
        setSelectedPrimaryCourseId((previousId) => {
          if (primaryTodays.some((course) => course.id === previousId)) return previousId;
          return primaryTodays[0]?.id || "";
        });
        setSelectedCourseId((previousId) => {
          if (juniorTodays.some((course) => course.id === previousId)) return previousId;
          return juniorTodays[0]?.id || "";
        });
      }

      const scoreMap: Record<string, { score_1: string, score_2: string }> = {};
      if (scoreRes.data) {
        scoreRes.data.filter(score => score.exam_date === today).forEach(score => {
          scoreMap[score.student_id] = { 
            score_1: score.score_1 !== null ? String(score.score_1) : "", 
            score_2: score.score_2 !== null ? String(score.score_2) : "" 
          };
        });
      }
      setCurrentScores(scoreMap);
    } catch (err) {
      console.error("資料抓取失敗:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const mountTimer = window.setTimeout(() => setMounted(true), 0);
    const dataTimer = window.setTimeout(() => void fetchData(dayOfWeek), 0);
    return () => {
      window.clearTimeout(mountTimer);
      window.clearTimeout(dataTimer);
    };
  }, [dayOfWeek, fetchData, selectedGrade, systemMode]);

  const sendLineNotify = async (studentIds: string[], action: "arrived" | "homework" | "left", mode: "primary" | "junior") => {
    const targetStudents = students.filter(s => studentIds.includes(s.id));
    const result = { sent: 0, failed: 0, skipped: 0 };
    for (const student of targetStudents) {
      try {
        const { data: relations, error } = await supabase.from('student_parent_relations').select(`parents ( line_user_id )`).eq('student_id', student.id);
        if (error || !relations || relations.length === 0) {
          result.skipped += 1;
          continue;
        }

        let message = "";
        if (action === "arrived") {
          message = [
            "方華補習班通知",
            `學生：${student.name}`,
            `狀態：${mode === "primary" ? "已安全抵達補習班" : "已到班"}`,
          ].join("\n");
        } else if (action === "homework") {
          message = [
            "方華補習班通知",
            `學生：${student.name}`,
            "事項：今日作業已檢查完成",
          ].join("\n");
        } else if (action === "left") {
          message = [
            "方華補習班通知",
            `學生：${student.name}`,
            "狀態：已下課離班",
            "提醒：請留意接送安全",
          ].join("\n");
        }

        const tokens = Array.from(new Set(relations.flatMap((rel: any) => {
          const parents = Array.isArray(rel.parents) ? rel.parents : [rel.parents];
          return parents.map((parent: any) => parent?.line_user_id).filter(Boolean);
        }))) as string[];

        if (tokens.length === 0) {
          result.skipped += 1;
          continue;
        }

        for (const token of tokens) {
          try {
            const response = await authenticatedFetch("/api/line-notify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token,
                message,
                notificationType: action === "homework" ? "homework_done" : action,
                studentId: student.id,
                studentName: student.name,
                metadata: { mode },
              }),
            });
            if (response.ok) result.sent += 1;
            else result.failed += 1;
          } catch {
            result.failed += 1;
          }
        }
      } catch (err) {
        console.error(`處理 ${student.name} 的 LINE 通知時發生錯誤:`, err);
        result.failed += 1;
      }
    }
    return result;
  };

  const updateStudentStatus = async (studentId: string, newStatus: string, courseId: string | null = null) => {
    const today = getToday();
    setAttendanceLogs(prev => {
      const exists = prev.find(l => logMatchesScope(l, studentId, courseId));
      if (exists) return prev.map(l => logMatchesScope(l, studentId, courseId) ? { ...l, status: newStatus, course_id: courseId } : l);
      return [...prev, { student_id: studentId, date: today, course_id: courseId, status: newStatus }];
    });
    try {
      let query = supabase.from("attendance_logs").select("id").eq("student_id", studentId).eq("date", today);
      if (courseId) query = query.eq("course_id", courseId);
      else query = query.is("course_id", null);

      const { data: existingLog } = await query.maybeSingle();
      const payload = { status: newStatus, ...(newStatus === 'arrived' && { arrival_time: new Date().toISOString() }), ...(newStatus === 'homework_done' && { homework_time: new Date().toISOString() }), ...(newStatus === 'left' && { leave_time: new Date().toISOString() }) };

      const writeResult = existingLog
        ? await supabase.from("attendance_logs").update(payload).eq("id", existingLog.id)
        : await supabase.from("attendance_logs").insert({ student_id: studentId, date: today, course_id: courseId, ...payload });
      if (writeResult.error) throw writeResult.error;

      if (newStatus === "leave") {
        const student = students.find((item) => item.id === studentId);
        await saveLeaveRecord({
          leaveDate: today,
          studentId,
          studentName: student?.name,
          source: "admin",
          cancelledOrder: false,
          refunded: false,
          refundAmount: 0,
          keptOrder: orders.some((order) => order.student_id === studentId),
          metadata: { course_id: courseId },
        });
        await logOperation({
          action: "leave_create",
          targetType: "leave_record",
          targetId: studentId,
          targetName: student?.name,
          studentId,
          studentName: student?.name,
          metadata: { source: "admin", course_id: courseId },
        });
      }

      if (newStatus === "homework_done") await sendLineNotify([studentId], "homework", "primary");
      if (newStatus === "left") await sendLineNotify([studentId], "left", systemMode);
    } catch (err: any) {
      console.error("更新狀態失敗:", err);
      alert("點名狀態更新失敗：" + (err?.message || "請稍後再試"));
      await fetchData(dayOfWeek);
    }
  };

  const handleBatchArrive = async (courseId: string | null = null) => {
    if (selectedIds.length === 0) return;
    const today = getToday();
    setAttendanceLogs(prev => {
      let next = [...prev];
      selectedIds.forEach(id => {
        const exists = next.find(l => logMatchesScope(l, id, courseId));
        if (exists) next = next.map(l => logMatchesScope(l, id, courseId) ? { ...l, status: 'arrived', course_id: courseId } : l);
        else next.push({ student_id: id, date: today, course_id: courseId, status: 'arrived' });
      });
      return next;
    });

    try {
      const promises = selectedIds.map(async (id) => {
        let query = supabase.from("attendance_logs").select("id").eq("student_id", id).eq("date", today);
        if (courseId) query = query.eq("course_id", courseId);
        else query = query.is("course_id", null);
        const { data: existingLog } = await query.maybeSingle();
        const payload = { status: 'arrived', arrival_time: new Date().toISOString() };
        if (existingLog) return supabase.from("attendance_logs").update(payload).eq("id", existingLog.id);
        else return supabase.from("attendance_logs").insert({ student_id: id, date: today, course_id: courseId, ...payload });
      });
      const writeResults = await Promise.all(promises);
      const writeError = writeResults.find((result) => result?.error)?.error;
      if (writeError) throw writeError;
      const notifyResult = await sendLineNotify(selectedIds, "arrived", systemMode);
      alert(`到班登記完成 ${selectedIds.length} 位。LINE 成功 ${notifyResult.sent} 則、失敗 ${notifyResult.failed} 則、未綁定略過 ${notifyResult.skipped} 位。`);
      setSelectedIds([]); 
    } catch (err: any) {
      console.error("批次簽到失敗:", err);
      alert("批次簽到失敗：" + (err?.message || "請稍後再試"));
      await fetchData(dayOfWeek);
    }
  };

  const cancelArrive = async (studentId: string, courseId: string | null = null) => {
    const today = getToday();
    const student = students.find((item) => item.id === studentId);
    if (!confirm(`確定取消【${student?.name || "此學生"}】今日簽到嗎？`)) return;

    setAttendanceLogs(prev => prev.filter(l => !logMatchesScope(l, studentId, courseId)));
    setSelectedIds(prev => prev.filter(id => id !== studentId));

    try {
      let query = supabase
        .from("attendance_logs")
        .delete()
        .eq("student_id", studentId)
        .eq("date", today)
        .in("status", ["arrived", "homework_done"]);
      if (courseId) query = query.eq("course_id", courseId);
      else query = query.is("course_id", null);

      const { error } = await query;
      if (error) throw error;
    } catch (err: any) {
      console.error("取消簽到失敗:", err);
      alert("取消簽到失敗：" + (err?.message || "請稍後再試"));
      await fetchData(dayOfWeek);
    }
  };

  const handleBatchLeave = async (courseId: string | null = null) => {
    if (selectedIds.length === 0) return;
    const today = getToday();
    const targetStudents = students.filter((student) => selectedIds.includes(student.id));
    if (!confirm(`確定要將 ${targetStudents.length} 位學生登記為今日請假嗎？`)) return;

    setAttendanceLogs(prev => {
      let next = [...prev];
      selectedIds.forEach(id => {
        const exists = next.find(l => logMatchesScope(l, id, courseId));
        if (exists) next = next.map(l => logMatchesScope(l, id, courseId) ? { ...l, status: "leave", course_id: courseId } : l);
        else next.push({ student_id: id, date: today, course_id: courseId, status: "leave" });
      });
      return next;
    });

    try {
      const writeResults = await Promise.all(selectedIds.map(async (id) => {
        let query = supabase.from("attendance_logs").select("id").eq("student_id", id).eq("date", today);
        if (courseId) query = query.eq("course_id", courseId);
        else query = query.is("course_id", null);
        const { data: existingLog } = await query.maybeSingle();
        const payload = { status: "leave" };
        const writeResult = existingLog
          ? await supabase.from("attendance_logs").update(payload).eq("id", existingLog.id)
          : await supabase.from("attendance_logs").insert({ student_id: id, date: today, course_id: courseId, ...payload });
        if (writeResult.error) return writeResult;

        const student = students.find((item) => item.id === id);
        await saveLeaveRecord({
          leaveDate: today,
          studentId: id,
          studentName: student?.name,
          source: "admin",
          reason: "後台人工登記",
          cancelledOrder: false,
          refunded: false,
          refundAmount: 0,
          keptOrder: orders.some((order) => order.student_id === id),
          metadata: { course_id: courseId },
        });
        await logOperation({
          action: "leave_create",
          targetType: "leave_record",
          targetId: id,
          targetName: student?.name,
          studentId: id,
          studentName: student?.name,
          metadata: { source: "admin_manual", course_id: courseId },
        });
        return writeResult;
      }));
      const writeError = writeResults.find((result) => result?.error)?.error;
      if (writeError) throw writeError;
      alert(`已登記請假 ${targetStudents.length} 位。`);
      setSelectedIds([]);
    } catch (err: any) {
      console.error("批次請假失敗:", err);
      alert("批次請假失敗：" + (err?.message || "請稍後再試"));
      await fetchData(dayOfWeek);
    }
  };

  const cancelLeave = async (studentId: string, courseId: string | null = null) => {
    const student = students.find((item) => item.id === studentId);
    if (!confirm(`確定取消【${student?.name || "此學生"}】今日請假，改回待簽到嗎？`)) return;
    const today = getToday();
    setAttendanceLogs(prev => prev.filter((log) => !logMatchesScope(log, studentId, courseId)));

    try {
      let logQuery = supabase.from("attendance_logs").delete().eq("student_id", studentId).eq("date", today).eq("status", "leave");
      if (courseId) logQuery = logQuery.eq("course_id", courseId);
      else logQuery = logQuery.is("course_id", null);
      const { error: logError } = await logQuery;
      if (logError) throw logError;

      const { error: leaveError } = await supabase
        .from("leave_records")
        .delete()
        .eq("leave_date", today)
        .eq("student_id", studentId);
      if (leaveError) throw leaveError;
    } catch (err: any) {
      console.error("取消請假失敗:", err);
      alert("取消請假失敗：" + (err?.message || "請稍後再試"));
      await fetchData(dayOfWeek);
    }
  };

  const preLeaveVisibleStudents = students
    .filter((student) => {
      const keyword = preLeaveKeyword.trim().toLowerCase();
      if (!preLeaveGrades.includes(student.grade)) return false;
      if (preLeaveGrade !== "all" && student.grade !== preLeaveGrade) return false;
      if (!keyword) return true;
      return [student.name, student.grade, student.student_code].some((value) => String(value || "").toLowerCase().includes(keyword));
    })
    .sort((a, b) => {
      const gradeDifference = preLeaveGrades.indexOf(a.grade) - preLeaveGrades.indexOf(b.grade);
      return gradeDifference || a.name.localeCompare(b.name, "zh-TW");
    });
  const preLeaveVisibleIds = preLeaveVisibleStudents.map((student) => student.id);
  const togglePreLeaveStudent = (studentId: string) => {
    setPreLeaveStudentIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
  };
  const selectPreLeaveVisibleStudents = () => {
    setPreLeaveStudentIds((current) => Array.from(new Set([...current, ...preLeaveVisibleIds])));
  };
  const clearPreLeaveVisibleStudents = () => {
    const visibleSet = new Set(preLeaveVisibleIds);
    setPreLeaveStudentIds((current) => current.filter((id) => !visibleSet.has(id)));
  };
  const registerPreLeave = async () => {
    if (preLeaveStudentIds.length === 0) return alert("請先選擇要請假的學生。");
    if (!preLeaveFromDate || !preLeaveToDate) return alert("請選擇請假日期。");
    if (preLeaveFromDate > preLeaveToDate) return alert("起始日期不能晚於結束日期。");
    const leaveDates = getDateRange(preLeaveFromDate, preLeaveToDate);
    if (leaveDates.length === 0) return alert("請假日期不正確。");
    if (leaveDates.length > 90) return alert("一次最多登記 90 天，請縮小日期範圍。");
    const targetStudents = students.filter((student) => preLeaveStudentIds.includes(student.id));
    const dateText = preLeaveFromDate === preLeaveToDate ? preLeaveFromDate : `${preLeaveFromDate} 到 ${preLeaveToDate}`;
    if (!confirm(`確定要替 ${targetStudents.length} 位學生登記 ${dateText} 的請假嗎？`)) return;

    setPreLeaveSaving(true);
    try {
      const courseIdsByStudentDate = new Map<string, string[]>();
      preLeaveStudentIds.forEach((studentId) => {
        leaveDates.forEach((leaveDate) => {
          const weekday = getWeekdayFromDate(leaveDate);
          const courseIds = studentCourses
            .filter((relation) => {
              if (relation.student_id !== studentId) return false;
              if (relation.start_date && relation.start_date > leaveDate) return false;
              const course = courses.find((item) => item.id === relation.course_id);
              if (!course) return false;
              if (course.start_date && course.start_date > leaveDate) return false;
              if (course.day_of_week !== weekday) return false;
              return getCourseAttendanceSection(course) !== "hidden";
            })
            .map((relation) => relation.course_id);
          courseIdsByStudentDate.set(`${studentId}:${leaveDate}`, Array.from(new Set(courseIds)));
        });
      });

      const { data: existingLogs, error: existingError } = await supabase
        .from("attendance_logs")
        .select("id, student_id, date, course_id")
        .in("student_id", preLeaveStudentIds)
        .in("date", leaveDates);
      if (existingError) throw existingError;

      const existingMap = new Map(
        (existingLogs || []).map((log: any) => [`${log.student_id}:${log.date}:${log.course_id || "none"}`, log.id])
      );
      const updateIds: string[] = [];
      const insertRows: any[] = [];
      preLeaveStudentIds.forEach((studentId) => {
        leaveDates.forEach((leaveDate) => {
          const courseIds = courseIdsByStudentDate.get(`${studentId}:${leaveDate}`) || [];
          const targets = courseIds.length > 0 ? courseIds : [null];
          targets.forEach((courseId) => {
            const key = `${studentId}:${leaveDate}:${courseId || "none"}`;
            const existingId = existingMap.get(key);
            if (existingId) {
              updateIds.push(existingId);
            } else {
              insertRows.push({
                student_id: studentId,
                date: leaveDate,
                course_id: courseId,
                status: "leave",
              });
            }
          });
        });
      });

      if (updateIds.length > 0) {
        const { error } = await supabase
          .from("attendance_logs")
          .update({ status: "leave", arrival_time: null, homework_time: null, leave_time: null })
          .in("id", updateIds);
        if (error) throw error;
      }
      if (insertRows.length > 0) {
        const { error } = await supabase.from("attendance_logs").insert(insertRows);
        if (error) throw error;
      }

      await Promise.all(targetStudents.flatMap((student) =>
        leaveDates.map((leaveDate) => saveLeaveRecord({
          leaveDate,
          studentId: student.id,
          studentName: student.name,
          source: "admin",
          reason: preLeaveReason.trim() || "預先請假",
          cancelledOrder: false,
          refunded: false,
          refundAmount: 0,
          keptOrder: false,
          metadata: {
            source: "admin_pre_leave",
            course_ids: courseIdsByStudentDate.get(`${student.id}:${leaveDate}`) || [],
          },
        }))
      ));
      await logOperation({
        action: "leave_create",
        targetType: "leave_record",
        targetName: "預先請假",
        metadata: {
          source: "admin_pre_leave",
          from_date: preLeaveFromDate,
          to_date: preLeaveToDate,
          dates: leaveDates.length,
          students: targetStudents.length,
          inserted_logs: insertRows.length,
          updated_logs: updateIds.length,
        },
      });

      if (leaveDates.includes(getToday())) await fetchData(dayOfWeek);
      setPreLeaveStudentIds([]);
      setPreLeaveReason("");
      alert(`已完成預先請假：${targetStudents.length} 位、${leaveDates.length} 天。`);
    } catch (err: any) {
      console.error("預先請假失敗:", err);
      alert("預先請假失敗：" + (err?.message || "請稍後再試"));
    } finally {
      setPreLeaveSaving(false);
    }
  };

  const handleBulkLeaveJunior = async () => {
    const arrivedIds = j_arrived.map(s => s.id);
    if (arrivedIds.length === 0) return alert("目前沒有已到班的學生可下課！");
    if (!confirm(`確定要將這 ${arrivedIds.length} 位學生設為「已離班」並發送通知嗎？`)) return;
    const today = getToday();
    setAttendanceLogs(prev => prev.map(l => arrivedIds.includes(l.student_id) ? { ...l, status: 'left' } : l));

    try {
      const promises = arrivedIds.map(async (id) => {
        const { data: existingLog } = await supabase.from("attendance_logs").select("id").eq("student_id", id).eq("date", today).eq("course_id", selectedCourseId).maybeSingle();
        const payload = { status: 'left', leave_time: new Date().toISOString() };
        if (existingLog) return supabase.from("attendance_logs").update(payload).eq("id", existingLog.id);
      });
      const writeResults = await Promise.all(promises);
      const writeError = writeResults.find((result) => result?.error)?.error;
      if (writeError) throw writeError;
      const notifyResult = await sendLineNotify(arrivedIds, "left", "junior");
      alert(`全班離班完成。LINE 成功 ${notifyResult.sent} 則、失敗 ${notifyResult.failed} 則、未綁定略過 ${notifyResult.skipped} 位。`);
    } catch (err: any) {
      console.error("全班下課失敗:", err);
      alert("全班離班更新失敗：" + (err?.message || "請稍後再試"));
      await fetchData(dayOfWeek);
    }
  };

  const handleScoreChange = (studentId: string, field: "score_1" | "score_2", value: string) => {
    setCurrentScores(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
  };

  const handleScoreMetaChange = (field: keyof ScoreMeta, value: string) => {
    setScoreMeta((prev) => ({ ...prev, [field]: value }));
  };

  const saveScores = async () => {
    const today = getToday();
    const upsertData = courseStudents.map(s => ({
      course_id: selectedCourseId, student_id: s.id, exam_date: today,
      score_1: currentScores[s.id]?.score_1 ? Number(currentScores[s.id].score_1) : null,
      score_2: currentScores[s.id]?.score_2 ? Number(currentScores[s.id].score_2) : null,
      score_1_subject: scoreMeta.score_1_subject.trim() || null,
      score_1_scope: scoreMeta.score_1_scope.trim() || null,
      score_2_subject: scoreMeta.score_2_subject.trim() || null,
      score_2_scope: scoreMeta.score_2_scope.trim() || null,
    }));
    const { error } = await supabase.from("exam_scores").upsert(upsertData, { onConflict: "course_id, student_id, exam_date" });
    if (error) alert("儲存失敗：" + error.message);
    else {
      setScoreRecords((prev) => {
        const keepOthers = prev.filter((score) => !(score.course_id === selectedCourseId && score.exam_date === today));
        return [...keepOthers, ...upsertData];
      });
      alert("今日成績已成功儲存！");
    }
  };

  const buildScoreStats = (records: any[], field: "score_1" | "score_2") => {
    const values = records
      .filter((score) => score[field] !== null && score[field] !== undefined && String(score[field]).trim() !== "")
      .map((score) => ({ studentId: score.student_id, value: Number(score[field]) }))
      .filter((item) => Number.isFinite(item.value));
    const average = values.length > 0
      ? values.reduce((sum, item) => sum + item.value, 0) / values.length
      : null;
    const sorted = [...values].sort((a, b) => b.value - a.value);
    const ranks = new Map<string, number>();
    let previousValue: number | null = null;
    let previousRank = 0;

    sorted.forEach((item, index) => {
      const rank = previousValue === item.value ? previousRank : index + 1;
      ranks.set(item.studentId, rank);
      previousValue = item.value;
      previousRank = rank;
    });

    return { average, ranks };
  };

  const sendScoreNotifications = async () => {
    const today = getToday();
    const records = selectedCourseScoreRecords;
    const recordMap = new Map(records.map((record) => [record.student_id, record]));
    const studentsWithScores = courseStudents.filter((student) => recordMap.has(student.id));

    if (!selectedCourseId) return alert("請先選擇課程。");
    if (studentsWithScores.length === 0) return alert("今天尚未儲存成績，無法發送通知。");
    if (!confirm(`確定要發送 ${studentsWithScores.length} 位學生的成績通知嗎？`)) return;

    const score1Stats = buildScoreStats(records, "score_1");
    const score2Stats = buildScoreStats(records, "score_2");
    const { data: contactBook, error: contactBookError } = await supabase
      .from("contact_books")
      .select("lesson_content, homework, quiz_scope")
      .eq("course_id", selectedCourseId)
      .eq("entry_date", today)
      .maybeSingle();
    if (contactBookError) {
      console.warn("聯絡簿讀取失敗，成績通知將不附上聯絡簿:", contactBookError.message);
    }
    const hasContactBook = Boolean(contactBook?.lesson_content || contactBook?.homework || contactBook?.quiz_scope);
    let sentStudents = 0;
    let skippedStudents = 0;

    for (const student of studentsWithScores) {
      const score: any = recordMap.get(student.id);
      const lines = [
        "方華補習班成績通知",
        `學生：${student.name}`,
      ];

      const hasScore1 = score.score_1 !== null && score.score_1 !== undefined && String(score.score_1).trim() !== "";
      const hasScore2 = score.score_2 !== null && score.score_2 !== undefined && String(score.score_2).trim() !== "";
      const score1 = hasScore1 ? Number(score.score_1) : null;
      const score2 = hasScore2 ? Number(score.score_2) : null;
      if (score1 !== null && Number.isFinite(score1)) {
        lines.push(
          "",
          `科目：${score.score_1_subject || "未設定"}`,
          `範圍：${score.score_1_scope || "-"}`,
          `成績：${score1}`,
          `班平均：${score1Stats.average !== null ? score1Stats.average.toFixed(1) : "-"}`,
          `班排名：${score1Stats.ranks.get(student.id) ? `第 ${score1Stats.ranks.get(student.id)} 名` : "-"}`
        );
      }
      if (score2 !== null && Number.isFinite(score2)) {
        lines.push(
          "",
          `科目：${score.score_2_subject || "未設定"}`,
          `範圍：${score.score_2_scope || "-"}`,
          `成績：${score2}`,
          `班平均：${score2Stats.average !== null ? score2Stats.average.toFixed(1) : "-"}`,
          `班排名：${score2Stats.ranks.get(student.id) ? `第 ${score2Stats.ranks.get(student.id)} 名` : "-"}`
        );
      }
      if (hasContactBook) {
        lines.push(
          "",
          "方華聯絡簿",
          `上課內容：${contactBook?.lesson_content || "-"}`,
          `今日作業：${contactBook?.homework || "-"}`,
          `下次週考範圍：${contactBook?.quiz_scope || "-"}`
        );
      }

      const { data: relations, error } = await supabase
        .from("student_parent_relations")
        .select("parents ( line_user_id )")
        .eq("student_id", student.id);

      if (error || !relations || relations.length === 0) {
        skippedStudents += 1;
        continue;
      }

      const lineUserIds = Array.from(new Set(
        relations
          .map((relation: any) => {
            const parent = Array.isArray(relation.parents) ? relation.parents[0] : relation.parents;
            return parent?.line_user_id;
          })
          .filter(Boolean)
      ));

      if (lineUserIds.length === 0) {
        skippedStudents += 1;
        continue;
      }

      await Promise.all(lineUserIds.map((token) => authenticatedFetch("/api/line-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          message: lines.join("\n"),
          notificationType: "score",
          studentId: student.id,
          studentName: student.name,
          metadata: {
            course_id: selectedCourseId,
            date: today,
            score_1: score1 !== null && Number.isFinite(score1) ? score1 : null,
            score_2: score2 !== null && Number.isFinite(score2) ? score2 : null,
            score_1_subject: score.score_1_subject || null,
            score_1_scope: score.score_1_scope || null,
            score_2_subject: score.score_2_subject || null,
            score_2_scope: score.score_2_scope || null,
            score_1_average: score1Stats.average,
            score_2_average: score2Stats.average,
            score_1_rank: score1Stats.ranks.get(student.id) || null,
            score_2_rank: score2Stats.ranks.get(student.id) || null,
            contact_book_attached: hasContactBook,
          },
        }),
      })));
      sentStudents += 1;
    }

    alert(`成績通知已送出：${sentStudents} 位學生，略過 ${skippedStudents} 位。`);
  };

  const exportToCSV = () => {
    const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const excelTextCell = (value: unknown) => {
      const text = String(value ?? "");
      if (!text) return "";
      return `"=""${text.replace(/"/g, '""""')}"""`;
    };

    let csv = "\uFEFF學生姓名,成績一科目,成績一範圍,成績一分數,成績二科目,成績二範圍,成績二分數\n";
    courseStudents.forEach(s => {
      const s1 = currentScores[s.id]?.score_1 || "";
      const s2 = currentScores[s.id]?.score_2 || "";
      csv += [
        csvCell(s.name),
        csvCell(scoreMeta.score_1_subject),
        excelTextCell(scoreMeta.score_1_scope),
        csvCell(s1),
        csvCell(scoreMeta.score_2_subject),
        excelTextCell(scoreMeta.score_2_scope),
        csvCell(s2),
      ].join(",") + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `成績匯出_${getToday()}.csv`;
    link.click();
  };

  const toggleSelection = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);

  // --- 資料過濾 ---
  const primaryCourses = sortPrimaryCourses(courses.filter((course) => course.day_of_week === dayOfWeek && getCourseAttendanceSection(course) === "primary"));
  const juniorCourses = courses.filter((course) => getCourseAttendanceSection(course) === "junior");
  const primaryCourseStudentIds = studentCourses.filter(sc => sc.course_id === selectedPrimaryCourseId).map(sc => sc.student_id);
  const primaryStudents = students.filter(s => primaryCourseStudentIds.includes(s.id));
  const primaryLogFor = (studentId: string) => attendanceLogs.find(l => logMatchesScope(l, studentId, selectedPrimaryCourseId));
  const preLeaveStudentIdSet = new Set(
    leaveRecords
      .filter((record) => record?.metadata?.source === "admin_pre_leave" || record?.reason === "預先請假")
      .map((record) => record.student_id)
  );
  const p_pending = primaryStudents.filter(s => !primaryLogFor(s.id) || primaryLogFor(s.id)?.status === 'pending');
  const p_working = primaryStudents.filter(s => primaryLogFor(s.id)?.status === 'arrived' || primaryLogFor(s.id)?.status === 'homework_done');
  const p_left = primaryStudents.filter(s => primaryLogFor(s.id)?.status === 'left');
  const p_all_leave = primaryStudents.filter(s => primaryLogFor(s.id)?.status === 'leave');
  const p_leave = p_all_leave.filter(s => !preLeaveStudentIdSet.has(s.id));
  const p_pre_leave = p_all_leave.filter(s => preLeaveStudentIdSet.has(s.id));

  const p_stats = {
    total: primaryStudents.length,
    expected: primaryStudents.length - p_all_leave.length,
    signedIn: p_working.length + p_left.length,
    meals: orders.filter(o => primaryStudents.some(s => s.id === o.student_id)).length,
    homeworkPending: p_working.filter(s => primaryLogFor(s.id)?.status === 'arrived').length
  };

  const courseStudentIds = studentCourses.filter(sc => sc.course_id === selectedCourseId).map(sc => sc.student_id);
  const courseStudents = students.filter(s => courseStudentIds.includes(s.id));
  const selectedCourseScoreRecords = scoreRecords.filter(score => score.course_id === selectedCourseId && score.exam_date === getToday());
  const selectedCourseScoreHistory = scoreRecords.filter(score => score.course_id === selectedCourseId);
  const juniorLogFor = (studentId: string) => attendanceLogs.find(l => logMatchesScope(l, studentId, selectedCourseId));
  const j_pending = courseStudents.filter(s => !juniorLogFor(s.id) || juniorLogFor(s.id)?.status === 'pending');
  const j_arrived = courseStudents.filter(s => juniorLogFor(s.id)?.status === 'arrived');
  const j_left = courseStudents.filter(s => juniorLogFor(s.id)?.status === 'left');
  const j_all_leave = courseStudents.filter(s => juniorLogFor(s.id)?.status === 'leave');
  const j_leave = j_all_leave.filter(s => !preLeaveStudentIdSet.has(s.id));
  const j_pre_leave = j_all_leave.filter(s => preLeaveStudentIdSet.has(s.id));

  if (!mounted) return null; 

  // ==========================================
  // 👇 畫面渲染變得超級乾淨 👇
  // ==========================================

  return (
    <div className="pb-8 font-sans animate-in fade-in">
      {!scoresOnly && allowAdminLeave && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setShowPreLeavePlanner(true)}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-rose-600 shadow-sm ring-1 ring-rose-100 transition hover:bg-rose-50"
          >
            預先請假
          </button>
        </div>
      )}

      {!scoresOnly && allowAdminLeave && showPreLeavePlanner && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
          <section className="w-full max-w-6xl rounded-[1.75rem] border border-rose-100 bg-white p-4 shadow-2xl">
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rose-500">Leave Planner</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">預先請假</h3>
              <p className="mt-1 text-sm font-bold text-slate-500">可一次登記多天請假；到該日期會自動進入請假名單，不會出現在待簽到。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowPreLeavePlanner(false)}
                className="rounded-2xl bg-slate-100 px-6 py-3 text-sm font-black text-slate-500 transition hover:bg-slate-200"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={registerPreLeave}
                disabled={preLeaveSaving || preLeaveStudentIds.length === 0}
                className="rounded-2xl bg-rose-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-100 transition hover:bg-rose-600 disabled:bg-slate-300 disabled:shadow-none"
              >
                {preLeaveSaving ? "登記中..." : `登記預先請假 (${preLeaveStudentIds.length})`}
              </button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[0.85fr_0.85fr_0.8fr_1.2fr]">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">起始日期</span>
              <input type="date" value={preLeaveFromDate} onChange={(event) => setPreLeaveFromDate(event.target.value)} className="app-input px-4 py-3 font-black" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">結束日期</span>
              <input type="date" value={preLeaveToDate} onChange={(event) => setPreLeaveToDate(event.target.value)} className="app-input px-4 py-3 font-black" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">年級</span>
              <select value={preLeaveGrade} onChange={(event) => setPreLeaveGrade(event.target.value)} className="app-input px-4 py-3 font-black">
                <option value="all">全部年級</option>
                {preLeaveGrades.map((grade) => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">搜尋學生</span>
              <input value={preLeaveKeyword} onChange={(event) => setPreLeaveKeyword(event.target.value)} placeholder="輸入姓名、年級或代碼" className="app-input px-4 py-3 font-black" />
            </label>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.1fr]">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">原因備註</span>
              <input value={preLeaveReason} onChange={(event) => setPreLeaveReason(event.target.value)} placeholder="例如：出國、病假、家中有事（選填）" className="app-input px-4 py-3 font-black" />
            </label>
            <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-500">學生名單 <span className="text-rose-500">{preLeaveStudentIds.length}</span></p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={selectPreLeaveVisibleStudents} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-600 shadow-sm hover:bg-blue-50">全選目前名單</button>
                  <button type="button" onClick={clearPreLeaveVisibleStudents} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-rose-500 shadow-sm hover:bg-rose-50">取消目前名單</button>
                </div>
              </div>
              <div className="max-h-36 overflow-y-auto pr-1">
                {preLeaveVisibleStudents.length === 0 ? (
                  <p className="rounded-xl bg-white py-6 text-center text-sm font-bold text-slate-400">沒有符合條件的學生。</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {preLeaveVisibleStudents.map((student) => {
                      const selected = preLeaveStudentIds.includes(student.id);
                      return (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => togglePreLeaveStudent(student.id)}
                          className={`rounded-xl px-3 py-2 text-sm font-black transition ${
                            selected ? "bg-rose-500 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-rose-100"
                          }`}
                        >
                          {student.grade} · {student.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          </section>
        </div>
      )}
      
      {!scoresOnly && (
        <div className="mb-5 grid gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-3 shadow-sm md:grid-cols-2">
          <button onClick={() => {setSystemMode("primary"); setSelectedIds([]);}} className={`rounded-2xl px-5 py-4 text-left transition-all ${systemMode === "primary" ? "bg-rose-500 text-white shadow-lg shadow-rose-100" : "bg-rose-50/60 text-slate-500 hover:bg-rose-100"}`}>
            <span className="block text-lg font-black">國小課輔</span><span className={`mt-1 block text-sm font-bold ${systemMode === "primary" ? "text-rose-100" : "text-slate-400"}`}>點名、作業、離班</span>
          </button>
          <button onClick={() => {setSystemMode("junior"); setJuniorTab("attendance"); setSelectedIds([]);}} className={`rounded-2xl px-5 py-4 text-left transition-all ${systemMode === "junior" ? "bg-amber-500 text-white shadow-lg shadow-amber-100" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}>
            <span className="block text-lg font-black">國中單科</span><span className={`mt-1 block text-sm font-bold ${systemMode === "junior" ? "text-amber-100" : "text-slate-400"}`}>{mode === "mixed" ? "課程點名、成績登錄" : "課程點名"}</span>
          </button>
        </div>
      )}

      <div className="mx-auto max-w-none space-y-4">
        {systemMode === "primary" ? (
          // 渲染國小組件
          <PrimaryAttendance 
            primaryGrades={primaryGrades} selectedGrade={selectedGrade} setSelectedGrade={setSelectedGrade} setSelectedIds={setSelectedIds}
            primaryCourses={primaryCourses}
            selectedPrimaryCourseId={selectedPrimaryCourseId}
            setSelectedPrimaryCourseId={setSelectedPrimaryCourseId}
            p_stats={p_stats} loading={loading} p_pending={p_pending} p_working={p_working} p_left={p_left} p_leave={p_leave} p_pre_leave={p_pre_leave}
            selectedIds={selectedIds} toggleSelection={toggleSelection} handleBatchArrive={handleBatchArrive} 
            cancelArrive={cancelArrive}
            handleBatchLeave={allowAdminLeave ? handleBatchLeave : undefined}
            cancelLeave={allowAdminLeave ? cancelLeave : undefined}
            updateStudentStatus={updateStudentStatus} attendanceLogs={attendanceLogs}
          />
        ) : (
          // 渲染國中組件
          <JuniorAttendance 
            dayOfWeek={dayOfWeek} selectedCourseId={selectedCourseId} setSelectedCourseId={setSelectedCourseId} setSelectedIds={setSelectedIds} 
            courses={juniorCourses} juniorTab={scoresOnly ? "grading" : mode === "mixed" ? juniorTab : "attendance"} setJuniorTab={setJuniorTab} loading={loading} courseStudents={courseStudents} 
            j_pending={j_pending} j_arrived={j_arrived} j_left={j_left} j_leave={j_leave} j_pre_leave={j_pre_leave} selectedIds={selectedIds}
            toggleSelection={toggleSelection} handleBatchArrive={handleBatchArrive} cancelArrive={cancelArrive} handleBulkLeaveJunior={handleBulkLeaveJunior}
            handleBatchLeave={allowAdminLeave ? handleBatchLeave : undefined}
            cancelLeave={allowAdminLeave ? cancelLeave : undefined}
            currentScores={currentScores} handleScoreChange={handleScoreChange} saveScores={saveScores} exportToCSV={exportToCSV}
            scoreMeta={scoreMeta}
            handleScoreMetaChange={handleScoreMetaChange}
            scoreRecords={selectedCourseScoreRecords}
            scoreHistoryRecords={selectedCourseScoreHistory}
            allScoreHistoryRecords={scoreRecords}
            allStudents={students}
            studentCourses={studentCourses}
            sendScoreNotifications={sendScoreNotifications}
            mode={scoresOnly ? "scores" : mode === "mixed" ? "mixed" : "attendance"}
          />
        )}
      </div>
    </div>
  );
}
