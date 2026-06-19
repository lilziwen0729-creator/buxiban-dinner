"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ParentRecord = {
  id: string;
  name?: string | null;
  phone?: string | null;
  line_user_id?: string | null;
  reset_code?: string | null;
};

type StudentRelation = {
  id: string;
  relationship?: string | null;
  parents?: ParentRecord | ParentRecord[] | null;
};

type BindingStudent = {
  id: string;
  name: string;
  grade?: string | null;
  enrollment_status?: string | null;
  student_parent_relations?: StudentRelation[];
};

const gradeOrder = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "高一"];

const getParent = (relation: StudentRelation) => {
  if (Array.isArray(relation.parents)) return relation.parents[0] || null;
  return relation.parents || null;
};

const hasLineBinding = (student: BindingStudent) =>
  (student.student_parent_relations || []).some((relation) => Boolean(getParent(relation)?.line_user_id));

export default function ParentBindingTab() {
  const [students, setStudents] = useState<BindingStudent[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "bound" | "unbound">("unbound");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyParentId, setBusyParentId] = useState<string | null>(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  const parentUrl = typeof window === "undefined" ? "/parent" : `${window.location.origin}/parent`;

  const fetchStudents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select("id, name, grade, enrollment_status, student_parent_relations ( id, relationship, parents ( id, name, phone, line_user_id, reset_code ) )")
      .order("grade");

    if (error) {
      alert("讀取家長綁定資料失敗：" + error.message);
      setLoading(false);
      return;
    }

    const sorted = ((data || []) as BindingStudent[])
      .filter((student) => (student.enrollment_status || "active") === "active")
      .sort((a, b) => {
        const gradeA = gradeOrder.indexOf(a.grade || "");
        const gradeB = gradeOrder.indexOf(b.grade || "");
        return (gradeA === -1 ? 99 : gradeA) - (gradeB === -1 ? 99 : gradeB) || (a.name || "").localeCompare(b.name || "", "zh-TW");
      });
    setStudents(sorted);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const bound = students.filter(hasLineBinding).length;
    return {
      total: students.length,
      bound,
      unbound: students.length - bound,
      noParent: students.filter((student) => (student.student_parent_relations || []).length === 0).length,
    };
  }, [students]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim();
    return students.filter((student) => {
      const bound = hasLineBinding(student);
      if (statusFilter === "bound" && !bound) return false;
      if (statusFilter === "unbound" && bound) return false;
      if (gradeFilter !== "all" && student.grade !== gradeFilter) return false;
      if (!keyword) return true;
      return student.name.includes(keyword) ||
        (student.grade || "").includes(keyword) ||
        (student.student_parent_relations || []).some((relation) => {
          const parent = getParent(relation);
          return (relation.relationship || "").includes(keyword) ||
            (parent?.name || "").includes(keyword) ||
            (parent?.phone || "").includes(keyword) ||
            (parent?.reset_code || "").includes(keyword);
        });
    });
  }, [gradeFilter, search, statusFilter, students]);

  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(message);
    } catch {
      window.prompt("請手動複製", text);
    }
  };

  const generateCode = async (parent: ParentRecord) => {
    setBusyParentId(parent.id);
    const { data, error } = await supabase.rpc("issue_parent_binding_code_atomic", {
      p_parent_id: parent.id,
    });
    setBusyParentId(null);

    if (error) {
      if (error.message.includes("issue_parent_binding_code_atomic")) {
        alert("請先到 Supabase 執行 database/parent_binding_secure.sql");
        return;
      }
      alert("產生綁定碼失敗：" + error.message);
      return;
    }

    const code = String(data || "");
    await fetchStudents();
    await copyText(`${parentUrl}?code=${code}`, `綁定碼已產生：${code}\n已複製家長綁定連結。`);
  };

  const clearLineBinding = async (parent: ParentRecord) => {
    if (!confirm(`確定解除 ${parent.phone || parent.name || "此家長"} 的 LINE 綁定？\n解除後家長需重新進入家長端綁定。`)) return;
    setBusyParentId(parent.id);
    const { error } = await supabase
      .from("parents")
      .update({ line_user_id: null })
      .eq("id", parent.id);
    setBusyParentId(null);

    if (error) {
      alert("解除綁定失敗：" + error.message);
      return;
    }

    await fetchStudents();
  };

  const grades = ["all", ...gradeOrder.filter((grade) => students.some((student) => student.grade === grade))];

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-purple-500">Parent Binding</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">家長綁定管理</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">確認家長 LINE 綁定狀態，複製綁定入口或產生一次性綁定碼。</p>
            </div>
            <button
              onClick={() => copyText(parentUrl, "已複製家長端入口連結。")}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:bg-blue-600"
            >
              複製家長端入口
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              { label: "在班學生", value: stats.total, tone: "border-blue-100 bg-blue-50 text-blue-700" },
              { label: "已綁 LINE", value: stats.bound, tone: "border-emerald-100 bg-emerald-50 text-emerald-700" },
              { label: "未綁 LINE", value: stats.unbound, tone: "border-red-100 bg-red-50 text-red-700" },
              { label: "無家長資料", value: stats.noParent, tone: "border-amber-100 bg-amber-50 text-amber-700" },
            ].map((item) => (
              <div key={item.label} className={`rounded-2xl border p-4 ${item.tone}`}>
                <p className="text-sm font-black opacity-75">{item.label}</p>
                <p className="mt-2 text-3xl font-black">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_auto_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋學生、家長、手機、綁定碼..."
              className="app-input px-5 py-4 font-bold"
            />
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="app-input px-5 py-4 font-bold xl:w-44">
              {grades.map((grade) => (
                <option key={grade} value={grade}>{grade === "all" ? "全年級" : grade}</option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
              {[
                { value: "unbound", label: "未綁" },
                { value: "bound", label: "已綁" },
                { value: "all", label: "全部" },
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => setStatusFilter(item.value as "all" | "bound" | "unbound")}
                  className={`rounded-xl px-4 py-3 text-sm font-black transition ${statusFilter === item.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:bg-white/70"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-[420px] divide-y divide-slate-100">
          {loading ? (
            <div className="p-20 text-center font-bold text-slate-400">資料載入中...</div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-20 text-center font-bold text-slate-400">沒有符合條件的學生。</div>
          ) : (
            filteredStudents.map((student) => {
              const relations = student.student_parent_relations || [];
              const bound = hasLineBinding(student);
              return (
                <div key={student.id} className="grid gap-4 p-5 xl:grid-cols-[240px_1fr]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-black text-slate-950">{student.name}</p>
                      <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-sm font-black text-blue-600">{student.grade || "未分級"}</span>
                    </div>
                    <p className={`mt-2 w-fit rounded-full px-3 py-1 text-xs font-black ${bound ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                      {bound ? "已綁 LINE" : "尚未綁 LINE"}
                    </p>
                  </div>

                  {relations.length === 0 ? (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                      <p className="font-black text-amber-700">尚未建立家長聯絡人</p>
                      <p className="mt-1 text-sm font-bold text-amber-600">請先到學生管理補上家長手機，才能產生綁定碼。</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {relations.map((relation) => {
                        const parent = getParent(relation);
                        if (!parent) return null;
                        const bindingUrl = parent.reset_code ? `${parentUrl}?code=${parent.reset_code}` : parentUrl;
                        return (
                          <div key={relation.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-black text-slate-900">{relation.relationship || "家長"} {parent.name ? `· ${parent.name}` : ""}</p>
                                <p className="mt-1 font-mono text-sm font-bold text-slate-500">{parent.phone || "未填手機"}</p>
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${parent.line_user_id ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                                {parent.line_user_id ? "已綁" : "未綁"}
                              </span>
                            </div>

                            <div className="mt-3 rounded-xl bg-white p-3">
                              <p className="text-xs font-black text-slate-400">綁定碼</p>
                              <p className="mt-1 font-mono text-lg font-black text-slate-900">{parent.reset_code || "尚未產生"}</p>
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              <button onClick={() => generateCode(parent)} disabled={busyParentId === parent.id} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:bg-slate-300">
                                {parent.reset_code ? "重產代碼" : "產生代碼"}
                              </button>
                              <button onClick={() => copyText(bindingUrl, "已複製綁定連結。")} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-100">
                                複製連結
                              </button>
                              <button onClick={() => copyText(parent.reset_code || "", "已複製綁定碼。")} disabled={!parent.reset_code} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-200 disabled:text-slate-300">
                                複製代碼
                              </button>
                              <button onClick={() => clearLineBinding(parent)} disabled={!parent.line_user_id || busyParentId === parent.id} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-100 disabled:text-slate-300">
                                解除綁定
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
