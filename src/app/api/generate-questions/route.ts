import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const grades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三"];
const subjects = ["國文", "英文", "數學", "自然", "社會"];
const difficulties = ["basic", "medium", "advanced"];
const questionTypes = ["single_choice", "multiple_choice", "fill_blank", "calculation", "short_answer"];

type GeneratedQuestion = {
  grade: string;
  subject: string;
  unit?: string | null;
  difficulty: string;
  question_type: string;
  question_text: string;
  answer_text: string;
  explanation?: string | null;
  tags?: string[];
};

const clampCount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(20, Math.max(1, Math.floor(parsed)));
};

const extractJson = (text: string) => {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 回傳格式不是 JSON。");
    return JSON.parse(match[0]);
  }
};

const getOutputText = (data: any) => {
  if (typeof data?.output_text === "string") return data.output_text;

  const parts = data?.output
    ?.flatMap((item: any) => item?.content || [])
    ?.map((content: any) => content?.text)
    ?.filter(Boolean);

  return parts?.join("\n") || "";
};

const sanitizeQuestion = (
  question: Partial<GeneratedQuestion>,
  fallback: { grade: string; subject: string; unit: string; difficulty: string; questionType: string },
) => ({
  grade: fallback.grade,
  subject: fallback.subject,
  unit: typeof question.unit === "string" && question.unit.trim() ? question.unit.trim() : fallback.unit || null,
  difficulty: difficulties.includes(question.difficulty || "") ? question.difficulty : fallback.difficulty,
  question_type: questionTypes.includes(question.question_type || "") ? question.question_type : fallback.questionType,
  question_text: String(question.question_text || "").trim(),
  answer_text: String(question.answer_text || "").trim(),
  explanation: typeof question.explanation === "string" && question.explanation.trim() ? question.explanation.trim() : null,
  tags: Array.isArray(question.tags)
    ? question.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6)
    : [fallback.subject, fallback.unit].filter(Boolean),
  updated_at: new Date().toISOString(),
});

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "尚未設定 OPENAI_API_KEY，請先在環境變數加入 OpenAI API Key。" }, { status: 500 });
    }

    const body = await req.json();
    const grade = grades.includes(body.grade) ? body.grade : "國一";
    const subject = subjects.includes(body.subject) ? body.subject : "數學";
    const unit = String(body.unit || "").trim();
    const difficulty = difficulties.includes(body.difficulty) ? body.difficulty : "basic";
    const questionType = questionTypes.includes(body.question_type) ? body.question_type : "short_answer";
    const count = clampCount(body.count);
    const model = process.env.OPENAI_QUESTION_MODEL || "gpt-4.1-mini";

    const prompt = [
      "你是台灣補習班老師，請產生原創題庫題目。",
      "規則：",
      "1. 使用繁體中文。",
      "2. 題目必須符合指定年級、科目、單元、難度與題型。",
      "3. 題目需自成一格，不要引用教科書、講義或考卷的受版權保護原文。",
      "4. 單選題請在題目內提供 A-D 選項；複選題請清楚標示可複選。",
      "5. 答案要明確，解析要適合老師快速核對。",
      "6. 只回傳 JSON，不要 Markdown，不要多餘說明。",
      "",
      `年級：${grade}`,
      `科目：${subject}`,
      `單元：${unit || "不限"}`,
      `難度：${difficulty}`,
      `題型：${questionType}`,
      `題數：${count}`,
      "",
      "JSON 格式：",
      `{"questions":[{"grade":"${grade}","subject":"${subject}","unit":"${unit}","difficulty":"${difficulty}","question_type":"${questionType}","question_text":"題目","answer_text":"答案","explanation":"解析","tags":["標籤"]}]}`,
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
      }),
    });

    const aiData = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: aiData?.error?.message || "AI 產生題目失敗。" }, { status: response.status });
    }

    const outputText = getOutputText(aiData);
    const parsed = extractJson(outputText);
    const generated = Array.isArray(parsed?.questions) ? parsed.questions : [];

    const rows = generated
      .map((question: Partial<GeneratedQuestion>) =>
        sanitizeQuestion(question, { grade, subject, unit, difficulty, questionType }),
      )
      .filter((question: GeneratedQuestion) => question.question_text && question.answer_text)
      .slice(0, count);

    if (rows.length === 0) {
      return NextResponse.json({ error: "AI 沒有產生可儲存的題目，請換一個單元或題型再試。" }, { status: 422 });
    }

    const { data, error } = await supabase.from("question_bank").insert(rows).select("*");
    if (error) throw error;

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      questions: data || [],
    });
  } catch (error: any) {
    console.error("AI 產生題目失敗:", error);
    return NextResponse.json({ error: error?.message || "AI 產生題目失敗。" }, { status: 500 });
  }
}
