"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import { saveLeaveRecord } from "@/lib/leaveRecord";
import { logOperation } from "@/lib/operationLog";

// 👉 引入我們剛剛拆開的兩個畫面積木 (確保路徑正確)
import PrimaryAttendance from "@/components/admin/PrimaryAttendance";
import JuniorAttendance from "@/components/admin/JuniorAttendance";

type AttendanceTabProps = {
  mode?: "attendance" | "scores";
};

export default function AttendanceTab({ mode = "attendance" }: AttendanceTabProps) {
  const scoresOnly = mode === "scores";
  const [mounted, setMounted] = useState(false);
  const [systemMode, setSystemMode] = useState<"primary" | "junior">(scoresOnly ? "junior" : "primary");
  const [selectedGrade, setSelectedGrade] = useState("小一");
  
  // --- 國中專用狀態 ---
  const [juniorTab, setJuniorTab] = useState<"attendance" | "grading">(scoresOnly ? "grading" : "attendance");
  const [courses, setCourses] = useState<any[]>([]);
  const [studentCourses, setStudentCourses] = useState<any[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [currentScores, setCurrentScores] = useState<Record<string, { score_1: string, score_2: string }>>({});
  const [scoreRecords, setScoreRecords] = useState<any[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState(0); 

  // --- 共用資料狀態 ---
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const primaryGrades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六"];

  // ==========================================
  // 👇 這裡完全保留你原本寫好的所有邏輯函數 👇
  // ==========================================
  
  useEffect(() => {
    setMounted(true);
    if (scoresOnly) {
      setSystemMode("junior");
      setJuniorTab("grading");
    }
    const d = new Date().getDay() === 0 ? 7 : new Date().getDay();
    setDayOfWeek(d);
    fetchData(d);
  }, [selectedGrade, systemMode, scoresOnly]);

  const fetchData = async (d: number) => {
    setLoading(true);
    const today = getToday();
    try {
      const [stRes, logRes, orderRes, courseRes, scRes, scoreRes] = await Promise.all([
        supabase.from("students").select("*").order("name"),
        supabase.from("attendance_logs").select("*").eq("date", today),
        supabase.from("orders").select("*").eq("order_date", today),
        supabase.from("courses").select("*"),
        supabase.from("student_courses").select("*"),
        supabase.from("exam_scores").select("*").order("exam_date", { ascending: false }).limit(800)
      ]);

      setStudents(stRes.data || []);
      setAttendanceLogs(logRes.data || []);
      setOrders(orderRes.data || []);
      setCourses(courseRes.data || []);
      setStudentCourses(scRes.data || []);
      setScoreRecords(scoreRes.data || []);

      if (courseRes.data && courseRes.data.length > 0) {
        const todays = courseRes.data.filter(c => c.day_of_week === d);
        if (todays.length > 0) {
          setSelectedCourseId(prev => prev || todays[0].id);
        } else if (!selectedCourseId) {
          setSelectedCourseId(courseRes.data[0].id);
        }
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
  };

  const sendLineNotify = async (studentIds: string[], action: "arrived" | "homework" | "left", mode: "primary" | "junior") => {
    const targetStudents = students.filter(s => studentIds.includes(s.id));
    for (const student of targetStudents) {
      try {
        const { data: relations, error } = await supabase.from('student_parent_relations').select(`parents ( line_user_id )`).eq('student_id', student.id);
        if (error || !relations || relations.length === 0) continue;

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

        for (const rel of relations) {
          const parentData = rel.parents as any;
          const token = parentData?.line_user_id;
          if (token) {
            await fetch("/api/line-notify", {
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
          }
        }
      } catch (err) {
        console.error(`處理 ${student.name} 的 LINE 通知時發生錯誤:`, err);
      }
    }
  };

  const updateStudentStatus = async (studentId: string, newStatus: string, courseId: string | null = null) => {
    const today = getToday();
    setAttendanceLogs(prev => {
      const exists = prev.find(l => l.student_id === studentId);
      if (exists) return prev.map(l => l.student_id === studentId ? { ...l, status: newStatus } : l);
      return [...prev, { student_id: studentId, date: today, course_id: courseId, status: newStatus }];
    });
    try {
      let query = supabase.from("attendance_logs").select("id").eq("student_id", studentId).eq("date", today);
      if (courseId) query = query.eq("course_id", courseId);
      else query = query.is("course_id", null);

      const { data: existingLog } = await query.maybeSingle();
      const payload = { status: newStatus, ...(newStatus === 'arrived' && { arrival_time: new Date().toISOString() }), ...(newStatus === 'homework_done' && { homework_time: new Date().toISOString() }), ...(newStatus === 'left' && { leave_time: new Date().toISOString() }) };

      if (existingLog) await supabase.from("attendance_logs").update(payload).eq("id", existingLog.id);
      else await supabase.from("attendance_logs").insert({ student_id: studentId, date: today, course_id: courseId, ...payload });

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

      if (newStatus === "homework_done") sendLineNotify([studentId], "homework", "primary");
      if (newStatus === "left") sendLineNotify([studentId], "left", systemMode);
    } catch (err: any) { console.error("更新狀態失敗:", err); }
  };

  const handleBatchArrive = async (courseId: string | null = null) => {
    if (selectedIds.length === 0) return;
    const today = getToday();
    setAttendanceLogs(prev => {
      let next = [...prev];
      selectedIds.forEach(id => {
        const exists = next.find(l => l.student_id === id);
        if (exists) next = next.map(l => l.student_id === id ? { ...l, status: 'arrived' } : l);
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
      await Promise.all(promises);
      sendLineNotify(selectedIds, "arrived", systemMode);
      alert(`已成功發送 ${selectedIds.length} 位學生【到班通知】！`);
      setSelectedIds([]); 
    } catch (err) { console.error("批次簽到失敗:", err); }
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
      await Promise.all(promises);
      sendLineNotify(arrivedIds, "left", "junior");
      alert("全班已下課！離班通知已發送。");
    } catch (err) { console.error("全班下課失敗:", err); }
  };

  const handleScoreChange = (studentId: string, field: "score_1" | "score_2", value: string) => {
    setCurrentScores(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
  };

  const saveScores = async () => {
    const today = getToday();
    const upsertData = courseStudents.map(s => ({
      course_id: selectedCourseId, student_id: s.id, exam_date: today,
      score_1: currentScores[s.id]?.score_1 ? Number(currentScores[s.id].score_1) : null,
      score_2: currentScores[s.id]?.score_2 ? Number(currentScores[s.id].score_2) : null,
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
    let sentStudents = 0;
    let skippedStudents = 0;

    for (const student of studentsWithScores) {
      const score: any = recordMap.get(student.id);
      const lines = [
        "方華補習班成績通知",
        `學生：${student.name}`,
        `課程：${courses.find((course) => course.id === selectedCourseId)?.name || "今日課程"}`,
        `日期：${today}`,
      ];

      const score1 = Number(score.score_1);
      const score2 = Number(score.score_2);
      if (Number.isFinite(score1)) {
        lines.push(
          "",
          `成績一：${score1}`,
          `班平均：${score1Stats.average !== null ? score1Stats.average.toFixed(1) : "-"}`,
          `班排名：${score1Stats.ranks.get(student.id) ? `第 ${score1Stats.ranks.get(student.id)} 名` : "-"}`
        );
      }
      if (Number.isFinite(score2)) {
        lines.push(
          "",
          `成績二：${score2}`,
          `班平均：${score2Stats.average !== null ? score2Stats.average.toFixed(1) : "-"}`,
          `班排名：${score2Stats.ranks.get(student.id) ? `第 ${score2Stats.ranks.get(student.id)} 名` : "-"}`
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

      await Promise.all(lineUserIds.map((token) => fetch("/api/line-notify", {
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
            score_1: Number.isFinite(score1) ? score1 : null,
            score_2: Number.isFinite(score2) ? score2 : null,
            score_1_average: score1Stats.average,
            score_2_average: score2Stats.average,
            score_1_rank: score1Stats.ranks.get(student.id) || null,
            score_2_rank: score2Stats.ranks.get(student.id) || null,
          },
        }),
      })));
      sentStudents += 1;
    }

    alert(`成績通知已送出：${sentStudents} 位學生，略過 ${skippedStudents} 位。`);
  };

  const exportToCSV = () => {
    let csv = "\uFEFF學生姓名,成績一,成績二\n";
    courseStudents.forEach(s => {
      const s1 = currentScores[s.id]?.score_1 || "";
      const s2 = currentScores[s.id]?.score_2 || "";
      csv += `${s.name},${s1},${s2}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `成績匯出_${getToday()}.csv`;
    link.click();
  };

  const toggleSelection = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);

  // --- 資料過濾 ---
  const primaryStudents = students.filter(s => s.grade === selectedGrade);
  const p_pending = primaryStudents.filter(s => !attendanceLogs.find(l => l.student_id === s.id) || attendanceLogs.find(l => l.student_id === s.id)?.status === 'pending');
  const p_working = primaryStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'arrived' || attendanceLogs.find(l => l.student_id === s.id)?.status === 'homework_done');
  const p_left = primaryStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'left');
  const p_leave = primaryStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'leave');

  const p_stats = {
    total: primaryStudents.length,
    signedIn: p_working.length + p_left.length,
    meals: orders.filter(o => primaryStudents.some(s => s.id === o.student_id)).length,
    homeworkPending: p_working.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'arrived').length
  };

  const courseStudentIds = studentCourses.filter(sc => sc.course_id === selectedCourseId).map(sc => sc.student_id);
  const courseStudents = students.filter(s => courseStudentIds.includes(s.id));
  const selectedCourseScoreRecords = scoreRecords.filter(score => score.course_id === selectedCourseId && score.exam_date === getToday());
  const selectedCourseScoreHistory = scoreRecords.filter(score => score.course_id === selectedCourseId);
  const j_pending = courseStudents.filter(s => !attendanceLogs.find(l => l.student_id === s.id) || attendanceLogs.find(l => l.student_id === s.id)?.status === 'pending');
  const j_arrived = courseStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'arrived');
  const j_left = courseStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'left');
  const j_leave = courseStudents.filter(s => attendanceLogs.find(l => l.student_id === s.id)?.status === 'leave');

  if (!mounted) return null; 

  // ==========================================
  // 👇 畫面渲染變得超級乾淨 👇
  // ==========================================

  return (
    <div className="pb-8 font-sans animate-in fade-in">
      
      {!scoresOnly && (
        <div className="mb-5 grid gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-3 shadow-sm md:grid-cols-2">
          <button onClick={() => {setSystemMode("primary"); setSelectedIds([]);}} className={`rounded-2xl px-5 py-4 text-left transition-all ${systemMode === "primary" ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}>
            <span className="block text-lg font-black">國小課輔</span><span className={`mt-1 block text-sm font-bold ${systemMode === "primary" ? "text-blue-100" : "text-slate-400"}`}>點名、作業、離班</span>
          </button>
          <button onClick={() => {setSystemMode("junior"); setJuniorTab("attendance"); setSelectedIds([]);}} className={`rounded-2xl px-5 py-4 text-left transition-all ${systemMode === "junior" ? "bg-amber-500 text-white shadow-lg shadow-amber-100" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}>
            <span className="block text-lg font-black">國中單科</span><span className={`mt-1 block text-sm font-bold ${systemMode === "junior" ? "text-amber-100" : "text-slate-400"}`}>課程點名</span>
          </button>
        </div>
      )}

      <div className="mx-auto max-w-none space-y-4">
        {systemMode === "primary" ? (
          // 渲染國小組件
          <PrimaryAttendance 
            primaryGrades={primaryGrades} selectedGrade={selectedGrade} setSelectedGrade={setSelectedGrade} setSelectedIds={setSelectedIds} 
            p_stats={p_stats} loading={loading} p_pending={p_pending} p_working={p_working} p_left={p_left} p_leave={p_leave} 
            selectedIds={selectedIds} toggleSelection={toggleSelection} handleBatchArrive={handleBatchArrive} 
            updateStudentStatus={updateStudentStatus} attendanceLogs={attendanceLogs}
          />
        ) : (
          // 渲染國中組件
          <JuniorAttendance 
            dayOfWeek={dayOfWeek} selectedCourseId={selectedCourseId} setSelectedCourseId={setSelectedCourseId} setSelectedIds={setSelectedIds} 
            courses={courses} juniorTab={scoresOnly ? "grading" : "attendance"} setJuniorTab={setJuniorTab} loading={loading} courseStudents={courseStudents} 
            j_pending={j_pending} j_arrived={j_arrived} j_left={j_left} j_leave={j_leave} selectedIds={selectedIds} 
            toggleSelection={toggleSelection} handleBatchArrive={handleBatchArrive} handleBulkLeaveJunior={handleBulkLeaveJunior} 
            currentScores={currentScores} handleScoreChange={handleScoreChange} saveScores={saveScores} exportToCSV={exportToCSV}
            scoreRecords={selectedCourseScoreRecords}
            scoreHistoryRecords={selectedCourseScoreHistory}
            sendScoreNotifications={sendScoreNotifications}
            mode={scoresOnly ? "scores" : "attendance"}
          />
        )}
      </div>
    </div>
  );
}
