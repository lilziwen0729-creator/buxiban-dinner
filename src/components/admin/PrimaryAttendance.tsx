// 📁 路徑：src/components/admin/PrimaryAttendance.tsx
import React from 'react';

// 我們把原本又臭又長的 props 定義清楚，這樣就不會亂掉
interface PrimaryProps {
  primaryGrades: string[];
  selectedGrade: string;
  setSelectedGrade: (grade: string) => void;
  setSelectedIds: (ids: any) => void;
  p_stats: any;
  loading: boolean;
  p_pending: any[];
  p_working: any[];
  p_left: any[];
  p_leave: any[];
  selectedIds: string[];
  toggleSelection: (id: string) => void;
  handleBatchArrive: (courseId: string | null) => void;
  updateStudentStatus: (id: string, status: string) => void;
  attendanceLogs: any[];
}

export default function PrimaryAttendance({
  primaryGrades, selectedGrade, setSelectedGrade, setSelectedIds, p_stats,
  loading, p_pending, p_working, p_left, p_leave, selectedIds,
  toggleSelection, handleBatchArrive, updateStudentStatus, attendanceLogs
}: PrimaryProps) {
  
  return (
    <>
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
        {/* ... (這裡貼上你原本 214 行到 225 行的 年級按鈕 和 統計數字) ... */}
        <div className="mb-4 text-slate-500 font-bold text-sm">負責年級：</div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {primaryGrades.map(g => (
            <button key={g} onClick={() => { setSelectedGrade(g); setSelectedIds([]); }} className={`whitespace-nowrap px-5 py-2.5 rounded-xl font-black text-sm transition-all ${selectedGrade === g ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200"}`}>{g}</button>
          ))}
        </div>
        {/* ... 省略部分 HTML 以節省版面，就是把原本國小區塊的代碼原封不動貼過來 ... */}
      </div>

      {loading ? <div className="text-center py-20 text-slate-400 font-bold animate-pulse">資料同步中...</div> : (
        <div className="space-y-4">
           {/* ... (這裡貼上你原本的 待簽到區、作業檢查區、已離班區) ... */}
        </div>
      )}
    </>
  );
}