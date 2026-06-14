// 📁 路徑：src/components/parent/OrderSettings.tsx
export type Student = {
  id: string;
  name: string;
  grade: string;
  fixed_days_off: string[];
  today_cancelled: boolean;
  today_leave?: boolean;
  auto_ordered?: boolean;
  balance: number;
};

interface Props {
  student: Student;
  isLocked: boolean;
  onToggleToday: () => void;
  onLeaveToday: () => void;
  onToggleFixed: (day: string) => void;
}

export default function OrderSettings({ student, isLocked, onToggleToday, onLeaveToday, onToggleFixed }: Props) {
  // 防呆機制：確保不會因為 null 壞掉
  const currentDays = student.fixed_days_off || [];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
        <p>每週固定設定會自動套用到未來；每日 <span className="font-black text-red-600">中午 12:00</span> 後停止當日修改。</p>
      </div>

      <div className="app-card p-5 text-center">
        <p className="text-xs font-black text-slate-400">目前學生</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">{student.name} ({student.grade})</h2>
        
        <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-500">餐費餘額</p>
          <p className={`text-4xl font-black ${student.balance < 200 ? "text-red-500" : "text-blue-700"}`}>
            ${student.balance || 0}
          </p>
        </div>

        <div className={`mt-4 rounded-3xl p-4 text-xl font-black ${
          student.today_leave ? "bg-orange-50 text-orange-600" : student.today_cancelled ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"
        }`}>
          {student.today_leave ? "今日目前：已請假" : student.today_cancelled ? "今日目前：無訂餐" : "今日目前：已訂餐 ✅"}
        </div>

        <button
          onClick={onToggleToday}
          disabled={isLocked}
          className={`mt-4 w-full rounded-2xl py-4 text-lg font-black shadow-lg transition ${
            isLocked ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
            : student.today_cancelled ? "bg-green-600 text-white" : "bg-red-500 text-white"
          }`}
        >
          {isLocked ? "今日已截止修改" : student.today_cancelled ? "我要點今天的餐" : "取消今日訂餐"}
        </button>

        <button
          onClick={onLeaveToday}
          disabled={isLocked || student.today_leave}
          className={`mt-3 w-full rounded-2xl py-4 text-lg font-black shadow-lg transition ${
            isLocked || student.today_leave
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-orange-500 text-white hover:bg-orange-600"
          }`}
        >
          {student.today_leave ? "今日已請假" : isLocked ? "今日已截止請假" : "今日請假"}
        </button>
      </div>

      <div className="app-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-black text-slate-950">每週固定訂餐</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{currentDays.length} 天</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {["週一", "週二", "週三", "週四", "週五"].map((day) => {
            // ✅ 修復點：使用安全陣列檢查
            const active = currentDays.includes(day);
            return (
              <button
                key={day}
                onClick={() => onToggleFixed(day)}
                className={`rounded-2xl py-3 text-sm font-black transition ${active ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
