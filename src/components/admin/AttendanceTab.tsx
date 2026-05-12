"use client";

import { useState } from "react";
import ElementaryAttendance from "./ElementaryAttendance";
// import JuniorHighAttendance from "./JuniorHighAttendance"; // 我們下一步再來寫國中版

export default function AttendanceTab() {
  const [mode, setMode] = useState<"elementary" | "junior">("elementary");

  return (
    <div className="animate-in fade-in duration-500">
      {/* 頂部切換開關 */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit mx-auto mb-8 shadow-inner">
        <button
          onClick={() => setMode("elementary")}
          className={`px-8 py-3 rounded-xl font-black text-lg transition-all ${
            mode === "elementary" ? "bg-white text-blue-600 shadow-md" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          👶 國小課輔點名
        </button>
        <button
          onClick={() => setMode("junior")}
          className={`px-8 py-3 rounded-xl font-black text-lg transition-all ${
            mode === "junior" ? "bg-white text-blue-600 shadow-md" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          👦 國中單科點名
        </button>
      </div>

      {/* 載入對應的組件 */}
      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
        {mode === "elementary" && <ElementaryAttendance />}
        {mode === "junior" && (
          <div className="text-center py-32 text-slate-400 font-bold text-xl border-2 border-dashed border-slate-200 rounded-3xl">
            國中課表與成績系統建置中... (下一步即將解鎖 🚀)
          </div>
        )}
      </div>
    </div>
  );
}