"use client";

import { useEffect, useMemo, useState } from "react";
import { logOperation } from "@/lib/operationLog";
import { supabase } from "@/lib/supabase";

type Question = {
  id: string;
  grade: string;
  subject: string;
  unit: string | null;
  difficulty: string;
  question_type: string;
  question_text: string;
  answer_text: string;
  explanation: string | null;
  tags: string[] | null;
  created_at: string;
};

const grades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];
const subjects = ["國文", "英文", "數學", "自然", "社會"];
const difficulties = [
  { value: "basic", label: "基礎" },
  { value: "medium", label: "中等" },
  { value: "advanced", label: "進階" },
];
const questionTypes = [
  { value: "single_choice", label: "單選" },
  { value: "multiple_choice", label: "複選" },
  { value: "fill_blank", label: "填充" },
  { value: "calculation", label: "計算" },
  { value: "short_answer", label: "問答" },
];

const emptyForm = {
  grade: "國一",
  subject: "數學",
  unit: "",
  difficulty: "basic",
  question_type: "short_answer",
  question_text: "",
  answer_text: "",
  explanation: "",
  tags: "",
};

const labelOf = (items: { value: string; label: string }[], value: string) =>
  items.find((item) => item.value === value)?.label || value;

export default function QuestionBankTab() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({
    grade: "all",
    subject: "all",
    difficulty: "all",
    keyword: "",
  });

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("question_bank")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.warn("題庫讀取失敗:", error.message);
      setQuestions([]);
    } else {
      setQuestions((data || []) as Question[]);
    }
    setLoading(false);
  };

  const filteredQuestions = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    return questions.filter((question) => {
      if (filters.grade !== "all" && question.grade !== filters.grade) return false;
      if (filters.subject !== "all" && question.subject !== filters.subject) return false;
      if (filters.difficulty !== "all" && question.difficulty !== filters.difficulty) return false;
      if (!keyword) return true;
      return [
        question.question_text,
        question.answer_text,
        question.explanation || "",
        question.unit || "",
        ...(question.tags || []),
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [filters, questions]);

  const stats = useMemo(() => ({
    total: questions.length,
    filtered: filteredQuestions.length,
    elementary: questions.filter((question) => question.grade.startsWith("小") || question.grade === "大班").length,
    junior: questions.filter((question) => question.grade.startsWith("國")).length,
  }), [filteredQuestions.length, questions]);

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
  };

  const editQuestion = (question: Question) => {
    setEditingId(question.id);
    setFormData({
      grade: question.grade,
      subject: question.subject,
      unit: question.unit || "",
      difficulty: question.difficulty,
      question_type: question.question_type,
      question_text: question.question_text,
      answer_text: question.answer_text,
      explanation: question.explanation || "",
      tags: (question.tags || []).join("、"),
    });
  };

  const saveQuestion = async () => {
    if (!formData.question_text.trim()) return alert("請輸入題目內容。");
    if (!formData.answer_text.trim()) return alert("請輸入答案。");
    if (saving) return;

    setSaving(true);
    const payload = {
      grade: formData.grade,
      subject: formData.subject,
      unit: formData.unit.trim() || null,
      difficulty: formData.difficulty,
      question_type: formData.question_type,
      question_text: formData.question_text.trim(),
      answer_text: formData.answer_text.trim(),
      explanation: formData.explanation.trim() || null,
      tags: formData.tags
        .split(/[、,\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingId) {
        const { error } = await supabase.from("question_bank").update(payload).eq("id", editingId);
        if (error) throw error;
        await logOperation({
          action: "question_update",
          targetType: "question",
          targetId: editingId,
          targetName: `${payload.grade} ${payload.subject}`,
          metadata: { grade: payload.grade, subject: payload.subject, unit: payload.unit },
        });
      } else {
        const { data, error } = await supabase.from("question_bank").insert([payload]).select("id").single();
        if (error) throw error;
        await logOperation({
          action: "question_create",
          targetType: "question",
          targetId: data?.id,
          targetName: `${payload.grade} ${payload.subject}`,
          metadata: { grade: payload.grade, subject: payload.subject, unit: payload.unit },
        });
      }

      resetForm();
      await fetchQuestions();
    } catch (err: any) {
      alert("儲存題目失敗：" + (err?.message || "請稍後再試"));
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestion = async (question: Question) => {
    if (!confirm("確定刪除這題？")) return;
    const { error } = await supabase.from("question_bank").delete().eq("id", question.id);
    if (error) return alert("刪除題目失敗：" + error.message);

    await logOperation({
      action: "question_delete",
      targetType: "question",
      targetId: question.id,
      targetName: `${question.grade} ${question.subject}`,
    });
    fetchQuestions();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="app-card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-blue-500">Question Bank</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">新增題目</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">建立全年級題庫，之後可接出卷與測驗通知。</p>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">年級</span>
              <select value={formData.grade} onChange={(event) => setFormData({ ...formData, grade: event.target.value })} className="app-input px-4 py-3 font-black">
                {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">科目</span>
              <select value={formData.subject} onChange={(event) => setFormData({ ...formData, subject: event.target.value })} className="app-input px-4 py-3 font-black">
                {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">單元</span>
            <input value={formData.unit} onChange={(event) => setFormData({ ...formData, unit: event.target.value })} className="app-input px-4 py-3 font-black" placeholder="例如：分數加減、一次方程式" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">題型</span>
              <select value={formData.question_type} onChange={(event) => setFormData({ ...formData, question_type: event.target.value })} className="app-input px-4 py-3 font-black">
                {questionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-400">難度</span>
              <select value={formData.difficulty} onChange={(event) => setFormData({ ...formData, difficulty: event.target.value })} className="app-input px-4 py-3 font-black">
                {difficulties.map((difficulty) => <option key={difficulty.value} value={difficulty.value}>{difficulty.label}</option>)}
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">題目內容</span>
            <textarea value={formData.question_text} onChange={(event) => setFormData({ ...formData, question_text: event.target.value })} className="app-input min-h-28 px-4 py-3 font-bold" placeholder="輸入題目..." />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">答案</span>
            <textarea value={formData.answer_text} onChange={(event) => setFormData({ ...formData, answer_text: event.target.value })} className="app-input min-h-20 px-4 py-3 font-bold" placeholder="輸入答案..." />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">解析</span>
            <textarea value={formData.explanation} onChange={(event) => setFormData({ ...formData, explanation: event.target.value })} className="app-input min-h-20 px-4 py-3 font-bold" placeholder="選填，輸入解題說明..." />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-black text-slate-400">標籤</span>
            <input value={formData.tags} onChange={(event) => setFormData({ ...formData, tags: event.target.value })} className="app-input px-4 py-3 font-bold" placeholder="例如：易錯、段考、計算" />
          </label>

          <div className="flex gap-2">
            <button onClick={saveQuestion} disabled={saving} className="flex-1 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:bg-slate-300">
              {saving ? "儲存中..." : editingId ? "儲存修改" : "新增題目"}
            </button>
            {editingId && (
              <button onClick={resetForm} className="rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black text-slate-600 transition hover:bg-slate-200">
                取消
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-xs font-black text-blue-500">題目總數</p>
            <p className="mt-2 text-3xl font-black text-blue-700">{stats.total}</p>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
            <p className="text-xs font-black text-emerald-600">國小題目</p>
            <p className="mt-2 text-3xl font-black text-emerald-700">{stats.elementary}</p>
          </div>
          <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
            <p className="text-xs font-black text-amber-600">國中題目</p>
            <p className="mt-2 text-3xl font-black text-amber-700">{stats.junior}</p>
          </div>
        </div>

        <div className="app-card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/70 p-5">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-950">題庫清單</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">目前顯示 {stats.filtered} 題</p>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <select value={filters.grade} onChange={(event) => setFilters({ ...filters, grade: event.target.value })} className="app-input px-3 py-2 text-sm font-black">
                  <option value="all">全年級</option>
                  {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
                <select value={filters.subject} onChange={(event) => setFilters({ ...filters, subject: event.target.value })} className="app-input px-3 py-2 text-sm font-black">
                  <option value="all">全科目</option>
                  {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                </select>
                <select value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value })} className="app-input px-3 py-2 text-sm font-black">
                  <option value="all">全難度</option>
                  {difficulties.map((difficulty) => <option key={difficulty.value} value={difficulty.value}>{difficulty.label}</option>)}
                </select>
                <input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} className="app-input px-3 py-2 text-sm font-bold" placeholder="搜尋題目、答案、單元" />
              </div>
            </div>
          </div>

          <div className="max-h-[720px] space-y-3 overflow-y-auto p-5">
            {loading ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">題庫讀取中...</div>
            ) : filteredQuestions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center text-sm font-bold text-slate-400">目前沒有符合條件的題目。</div>
            ) : (
              filteredQuestions.map((question) => (
                <div key={question.id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{question.grade}</span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{question.subject}</span>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{labelOf(difficulties, question.difficulty)}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{labelOf(questionTypes, question.question_type)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-base font-black leading-relaxed text-slate-950">{question.question_text}</p>
                      <p className="mt-3 whitespace-pre-wrap text-sm font-bold leading-relaxed text-blue-700">答案：{question.answer_text}</p>
                      {question.explanation && <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-500">解析：{question.explanation}</p>}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {question.unit && <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-black text-purple-700">{question.unit}</span>}
                        {(question.tags || []).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">{tag}</span>)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => editQuestion(question)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-200">編輯</button>
                      <button onClick={() => deleteQuestion(question)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-100">刪除</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
