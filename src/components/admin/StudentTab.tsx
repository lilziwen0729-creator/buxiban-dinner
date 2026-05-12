"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
  student_code?: string;
  balance?: number;
  student_parent_relations?: {
    parents: {
      phone: string;
      name: string;
    };
  }[];
};

export default function StudentTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  // 新增用 State
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [phone, setPhone] = useState("");

  const grades = ["大班", "小一", "小二", "小三", "小四", "小五", "小六", "國一", "國二", "國三", "無"];

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("students")
      .select(`
        *,
        student_parent_relations (
          parents (phone, name)
        )
      `)
      .order("student_code");
    
    setStudents(data as any || []);
    setLoading(false);
  };

  const addStudent = async () => {
    if (!name.trim() || !grade || !phone) {
      alert("請填寫完整資料");
      return;
    }

    // 1. 找家長 (確保電話已存在於 parents 表)
    const { data: parent } = await supabase.from("parents").select("id").eq("phone", phone).maybeSingle();
    if (!parent) {
      alert("此手機號碼尚未建立家長帳號，請先確認資料庫。");
      return;
    }

    // 2. 新增學生
    const { data: st, error } = await supabase
      .from("students")
      .insert([{ name, grade }])
      .select().single();

    if (error) {
      alert("新增失敗");
      return;
    }

    // 3. 建立關係
    await supabase.from("student_parent_relations").insert([
      { student_id: st.id, parent_id: parent.id }
    ]);

    alert("新增成功！");
    setName(""); setGrade(""); setPhone(""); setShowAdd(false);
    fetchStudents();
  };

  const deleteStudent = async (id: string) => {
    if (!confirm("確定刪除此學生？相關點名與訂單紀錄將一併移除。")) return;
    await supabase.from("students").delete().eq("id", id);
    fetchStudents();
  };

  const topupStudent = async (studentId: string, currentBalance: number, studentName: string) => {
    const input = prompt(`請輸入給 ${studentName} 的儲值金額`);
    if (!input) return;
    const amount = parseInt(input);
    if (isNaN(amount) || amount <= 0) return;

    const newBalance = (currentBalance || 0) + amount;
    await supabase.from("students").update({ balance: newBalance }).eq("id", studentId);
    
    // 記錄交易
    await supabase.from("transactions").insert([
      { student_id: studentId, type: "topup", amount, balance_after: newBalance, description: "管理員儲值" }
    ]);
    
    fetchStudents();
  };

  const filteredStudents = students.filter((s) => {
    const keyword = search.toLowerCase();
    const hasPhoneMatch = s.student_parent_relations?.some(rel => rel.parents.phone.includes(keyword));
    return s.name.toLowerCase().includes(keyword) || s.grade.toLowerCase().includes(keyword) || hasPhoneMatch;
  });

  const renderSection = (title: string, list: Student[]) => {
    if (list.length === 0) return null;
    return (
      <div className="bg-white rounded-3xl p-6 shadow-sm mb-6 border border-gray-100">
        <h2 className="text-2xl font-bold mb-5 text-gray-800 border-l-4 border-blue-600 pl-3">{title}</h2>
        {/* 按年級分組 */}
        {Array.from(new Set(list.map(s => s.grade))).sort((a,b) => grades.indexOf(a) - grades.indexOf(b)).map(g => {
            const gradeList = list.filter(s => s.grade === g);
            return (
                <div key={g} className="mb-6">
                    <h3 className="font-bold text-blue-600 text-lg mb-3 bg-blue-50 inline-block px-3 py-1 rounded-lg">
                        {g || "未設定"} ({gradeList.length})
                    </h3>
                    <div className="grid gap-3">
                        {gradeList.map(student => (
                            <div key={student.id} className="flex justify-between items-center p-4 hover:bg-gray-50 rounded-2xl transition border-b border-gray-50">
                                <div>
                                    <p className="font-bold text-gray-900 text-lg">{student.name}</p>
                                    <p className="text-sm text-gray-500">
                                        📱 {student.student_parent_relations?.map(r => r.parents.phone).join(", ") || "無電話"}
                                    </p>
                                    <p className="text-sm font-bold text-green-600 mt-1">餘額：${student.balance || 0}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => topupStudent(student.id, student.balance || 0, student.name)} className="bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm">儲值</button>
                                    <button onClick={() => deleteStudent(student.id)} className="bg-red-50 text-red-500 px-4 py-2 rounded-xl text-sm font-bold">刪除</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 搜尋欄 */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100">
        <input 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          placeholder="搜尋姓名 / 年級 / 家長電話..." 
          className="w-full px-5 py-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-blue-500 text-black" 
        />
      </div>

      {/* 新增學生按鈕與表單 */}
      <div className="bg-blue-600 rounded-3xl p-6 shadow-lg">
        <button onClick={() => setShowAdd(!showAdd)} className="w-full text-left text-white font-bold text-xl flex justify-between items-center">
          <span>{showAdd ? "收合表單" : "＋ 新增學生"}</span>
          <span>{showAdd ? "▲" : "▼"}</span>
        </button>
        {showAdd && (
          <div className="grid md:grid-cols-4 gap-4 mt-5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名" className="px-4 py-3 rounded-xl text-black" />
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className="px-4 py-3 rounded-xl text-black">
              <option value="">選擇年級</option>
              {grades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="家長手機" className="px-4 py-3 rounded-xl text-black" />
            <button onClick={addStudent} className="bg-white text-blue-600 font-bold rounded-xl py-3 hover:bg-blue-50">確認新增</button>
          </div>
        )}
      </div>

      {/* 列表內容 */}
      {loading ? <p className="text-center py-10 text-gray-400">資料載入中...</p> : (
        <>
          {renderSection("國小部", filteredStudents.filter(s => s.grade.includes("小")))}
          {renderSection("國中部", filteredStudents.filter(s => s.grade.includes("國")))}
          {renderSection("幼兒部 / 其他", filteredStudents.filter(s => !s.grade.includes("小") && !s.grade.includes("國")))}
        </>
      )}
    </div>
  );
}