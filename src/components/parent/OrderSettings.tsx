// 📁 路徑：src/components/parent/OrderSettings.tsx
export type Student = {
  id: string;
  name: string;
  grade: string;
  fixed_days_off: string[];
  today_cancelled: boolean;
  auto_ordered?: boolean;
  balance: number;
};

interface Props {
  student: Student;
  isLocked: boolean;
  onToggleToday: () => void;
  onToggleFixed: (day: string) => void;
}

export default function OrderSettings({ student, isLocked, onToggleToday, onToggleFixed }: Props) {
  // 防呆機制：確保不會因為 null 壞掉
  const currentDays = student.fixed_days_off || [];

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border-l-4 border-amber-400 rounded-2xl p-4 shadow-sm text-sm text-amber-900 space-y-1">
        <p>① 每週固定設定會自動套用到未來</p>
        <p>② 每日 <span className="font-bold text-red-600">中午 12:00</span> 後停止當日修改</p>
      </div>

      <div className="bg-white rounded-3xl shadow p-6 text-center">
        <h2 className="text-2xl font-bold text-black">{student.name} ({student.grade})</h2>
        
        <div className="mt-4 bg-blue-50 rounded-2xl p-4">
          <p className="text-gray-500 text-sm">餐費餘額</p>
          <p className={`text-3xl font-bold ${student.balance < 200 ? "text-red-500" : "text-blue-600"}`}>
            ${student.balance || 0}
          </p>
        </div>

        <div className={`mt-6 p-4 rounded-2xl font-bold text-xl ${student.today_cancelled ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>
          {student.today_cancelled ? "今日目前：無訂餐" : "今日目前：已訂餐 ✅"}
        </div>

        <button
          onClick={onToggleToday}
          disabled={isLocked}
          className={`w-full mt-4 py-4 rounded-2xl text-lg font-bold shadow-lg transition ${
            isLocked ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
            : student.today_cancelled ? "bg-green-600 text-white" : "bg-red-500 text-white"
          }`}
        >
          {isLocked ? "今日已截止修改" : student.today_cancelled ? "我要點今天的餐" : "取消今日訂餐"}
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow p-6">
        <h3 className="font-bold text-black mb-4">每週固定訂餐天數</h3>
        <div className="grid grid-cols-5 gap-2">
          {["週一", "週二", "週三", "週四", "週五"].map((day) => {
            // ✅ 修復點：使用安全陣列檢查
            const active = currentDays.includes(day);
            return (
              <button
                key={day}
                onClick={() => onToggleFixed(day)}
                className={`py-3 rounded-xl font-bold text-sm transition ${active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}
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