"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Parent = {
  id: string;
  name?: string | null;
  phone?: string | null;
  line_user_id?: string | null;
};

type Student = {
  id: string;
  name: string;
  grade: string;
  enrollment_status?: string | null;
  student_parent_relations?: StudentParentRelation[];
};

type StudentParentRelation = {
  relationship?: string | null;
  parents?: Parent | Parent[] | null;
};

const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

const getParent = (relation: StudentParentRelation) => {
  const parent = relation.parents;
  return Array.isArray(parent) ? parent[0] : parent;
};

const uniqueLineParents = (student: Student) => {
  const map = new Map<string, { id: string; name: string }>();
  (student.student_parent_relations || []).forEach((relation) => {
    const parent = getParent(relation);
    if (!parent?.line_user_id) return;
    const label = parent.name || relation.relationship || parent.phone || "家長";
    map.set(parent.line_user_id, { id: parent.line_user_id, name: label });
  });
  return Array.from(map.values());
};

export default function NotificationBroadcastTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select("id, name, grade, enrollment_status, student_parent_relations ( relationship, parents ( id, name, phone, line_user_id ) )")
      .order("grade");

    if (error) {
      alert(`讀取學生失敗：${error.message}`);
      setStudents([]);
    } else {
      setStudents(
        ((data || []) as Student[])
          .filter((student) => (student.enrollment_status || "active") === "active")
          .sort((a, b) => {
            const gradeA = gradeOrder.indexOf(a.grade);
            const gradeB = gradeOrder.indexOf(b.grade);
            return (gradeA === -1 ? 99 : gradeA) - (gradeB === -1 ? 99 : gradeB) || a.name.localeCompare(b.name, "zh-Hant");
          })
      );
    }
    setLoading(false);
  };

  const grades = useMemo(() => {
    const set = new Set(students.map((student) => student.grade).filter(Boolean));
    return Array.from(set).sort((a, b) => {
      const gradeA = gradeOrder.indexOf(a);
      const gradeB = gradeOrder.indexOf(b);
      return (gradeA === -1 ? 99 : gradeA) - (gradeB === -1 ? 99 : gradeB);
    });
  }, [students]);

  const visibleStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return students.filter((student) => {
      const matchGrade = gradeFilter === "all" || student.grade === gradeFilter;
      const matchKeyword = !keyword || `${student.name} ${student.grade}`.toLowerCase().includes(keyword);
      return matchGrade && matchKeyword;
    });
  }, [students, gradeFilter, search]);

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedIds.includes(student.id)),
    [students, selectedIds]
  );

  const selectedWithLine = selectedStudents.filter((student) => uniqueLineParents(student).length > 0);
  const selectedWithoutLine = selectedStudents.filter((student) => uniqueLineParents(student).length === 0);
  const totalParentReceivers = selectedWithLine.reduce((sum, student) => sum + uniqueLineParents(student).length, 0);

  const toggleStudent = (studentId: string) => {
    setSelectedIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
  };

  const replaceByGrade = (grade: string) => {
    setGradeFilter(grade);
    setSelectedIds(students.filter((student) => student.grade === grade).map((student) => student.id));
  };

  const addByGrade = (grade: string) => {
    const ids = students.filter((student) => student.grade === grade).map((student) => student.id);
    setSelectedIds((current) => Array.from(new Set([...current, ...ids])));
  };

  const sendBroadcast = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return alert("請先輸入要發送的訊息。");
    if (selectedIds.length === 0) return alert("請先選擇要發送的學生。");
    if (selectedWithLine.length === 0) return alert("勾選名單都沒有已綁定 LINE 的家長，無法發送。");

    const confirmed = confirm(
      `即將發送給 ${selectedWithLine.length} 位學生、${totalParentReceivers} 位 LINE 家長。\n` +
      (selectedWithoutLine.length > 0 ? `另有 ${selectedWithoutLine.length} 位未綁 LINE 會略過。\n` : "") +
      "確定要發送嗎？"
    );
    if (!confirmed) return;

    setSending(true);
    let sent = 0;
    let failed = 0;

    for (const student of selectedWithLine) {
      const parents = uniqueLineParents(student);
      for (const parent of parents) {
        try {
          const response = await fetch("/api/line-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: parent.id,
              message: trimmedMessage,
              notificationType: "broadcast",
              studentId: student.id,
              studentName: student.name,
              recipientName: parent.name,
              metadata: {
                source: "admin_broadcast",
                grade: student.grade,
              },
            }),
          });

          if (response.ok) sent += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
    }

    setSending(false);
    alert(`廣播發送完成：成功 ${sent} 筆，失敗 ${failed} 筆，未綁 LINE 略過 ${selectedWithoutLine.length} 位學生。`);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-slate-950 px-6 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-green-200">LINE Broadcast</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">通知廣播</h2>
            <p className="mt-1 text-sm font-bold text-slate-300">選年級或挑學生，一次發送行政訊息給已綁定 LINE 的家長。</p>
          </div>
          <button onClick={fetchStudents} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white hover:bg-white/15">
            重新整理名單
          </button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="app-card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 p-5">
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">Recipients</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">選擇收件學生</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">可先一鍵選年級，再用下方名單加減個別學生。</p>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="app-input px-4 py-3 font-bold">
                <option value="all">全部年級</option>
                {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
              <button
                onClick={() => gradeFilter !== "all" && replaceByGrade(gradeFilter)}
                disabled={gradeFilter === "all"}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                選取此年級
              </button>
              <button
                onClick={() => gradeFilter !== "all" && addByGrade(gradeFilter)}
                disabled={gradeFilter === "all"}
                className="rounded-2xl bg-blue-50 px-5 py-3 text-sm font-black text-blue-700 disabled:bg-slate-100 disabled:text-slate-300"
              >
                加入年級
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {grades.map((grade) => (
                <button
                  key={grade}
                  onClick={() => replaceByGrade(grade)}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 transition hover:bg-blue-600 hover:text-white"
                >
                  {grade}
                </button>
              ))}
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋學生姓名或年級..."
              className="app-input px-4 py-3 font-bold"
            />

            <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <div className="rounded-3xl bg-slate-50 p-10 text-center text-sm font-bold text-slate-400">名單載入中...</div>
              ) : visibleStudents.length === 0 ? (
                <div className="rounded-3xl bg-slate-50 p-10 text-center text-sm font-bold text-slate-400">沒有符合條件的學生。</div>
              ) : visibleStudents.map((student) => {
                const checked = selectedIds.includes(student.id);
                const lineCount = uniqueLineParents(student).length;
                return (
                  <button
                    key={student.id}
                    onClick={() => toggleStudent(student.id)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      checked ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span>
                      <span className="block font-black text-slate-900">{student.grade} · {student.name}</span>
                      <span className={`mt-1 block text-xs font-black ${lineCount > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {lineCount > 0 ? `已綁 LINE 家長 ${lineCount} 位` : "未綁 LINE"}
                      </span>
                    </span>
                    <span className={`grid h-6 w-6 place-items-center rounded-lg border text-xs font-black ${
                      checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-white"
                    }`}>
                      {checked ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
              <p className="text-xs font-black text-blue-500">已選學生</p>
              <p className="mt-2 text-3xl font-black text-blue-700">{selectedStudents.length}</p>
            </div>
            <div className="rounded-3xl border border-green-100 bg-green-50 p-5">
              <p className="text-xs font-black text-green-500">可發送</p>
              <p className="mt-2 text-3xl font-black text-green-700">{selectedWithLine.length}</p>
            </div>
            <div className="rounded-3xl border border-red-100 bg-red-50 p-5">
              <p className="text-xs font-black text-red-500">未綁 LINE</p>
              <p className="mt-2 text-3xl font-black text-red-700">{selectedWithoutLine.length}</p>
            </div>
          </div>

          <div className="app-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-emerald-500">Message</p>
                <h3 className="mt-1 text-xl font-black text-slate-950">編輯訊息</h3>
              </div>
              <button onClick={() => setSelectedIds([])} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-500 hover:bg-slate-200">
                清空名單
              </button>
            </div>

            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="例如：三年級的小朋友今天在本棟接送。&#10;例如：國一學生今天留班到 21:00，請家長留意接送時間。"
              className="min-h-[10rem] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white"
            />

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black text-slate-400">發送預覽</p>
              <p className="mt-2 whitespace-pre-line text-sm font-bold text-slate-700">
                {message.trim() || "尚未輸入訊息。"}
              </p>
            </div>

            <button
              onClick={sendBroadcast}
              disabled={sending || selectedWithLine.length === 0 || !message.trim()}
              className="mt-4 w-full rounded-2xl bg-green-600 py-4 font-black text-white shadow-lg shadow-green-100 transition hover:bg-green-700 disabled:bg-slate-300 disabled:shadow-none"
            >
              {sending ? "發送中..." : `發送 LINE 廣播 (${selectedWithLine.length} 位學生 / ${totalParentReceivers} 位家長)`}
            </button>
          </div>

          <div className="app-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-950">已選名單</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{selectedStudents.length} 人</span>
            </div>
            {selectedStudents.length === 0 ? (
              <div className="rounded-3xl bg-slate-50 p-10 text-center text-sm font-bold text-slate-400">尚未選擇學生。</div>
            ) : (
              <div className="flex max-h-[18rem] flex-wrap gap-2 overflow-y-auto">
                {selectedStudents.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => toggleStudent(student.id)}
                    className={`rounded-full px-3 py-2 text-xs font-black transition ${
                      uniqueLineParents(student).length > 0
                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "bg-red-50 text-red-600 hover:bg-red-100"
                    }`}
                  >
                    {student.grade} · {student.name} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
