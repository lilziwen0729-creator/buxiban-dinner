"use client";

import { useEffect, useState } from "react";

type Student = {
  id: number;
  name: string;
  grade: string;
  ordered: boolean;
  fixedDays: number[];
};

type Parent = {
  phone: string;
  password: string;
  students: Student[];
};

export default function ParentPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const now = new Date();
  const isLocked = now.getHours() >= 12;

  useEffect(() => {
    const currentParent =
      localStorage.getItem("currentParent");

    const parents: Parent[] = JSON.parse(
      localStorage.getItem("parents") || "[]"
    );

    const parent = parents.find(
      (p) => p.phone === currentParent
    );

    if (parent) {
      setStudents(parent.students);
      setSelectedId(parent.students[0]?.id || null);
    }
  }, []);

  const selectedStudent = students.find(
    (s) => s.id === selectedId
  );

  const saveStudents = (updated: Student[]) => {
    setStudents(updated);

    const currentParent =
      localStorage.getItem("currentParent");

    const parents: Parent[] = JSON.parse(
      localStorage.getItem("parents") || "[]"
    );

    const updatedParents = parents.map((p) =>
      p.phone === currentParent
        ? { ...p, students: updated }
        : p
    );

    localStorage.setItem(
      "parents",
      JSON.stringify(updatedParents)
    );
  };

  const toggleOrder = () => {
    if (isLocked || !selectedStudent) return;

    const updated = students.map((student) =>
      student.id === selectedId
        ? {
            ...student,
            ordered: !student.ordered,
          }
        : student
    );

    saveStudents(updated);
  };

  const toggleFixedDay = (day: number) => {
    if (!selectedStudent) return;

    const updated = students.map((student) => {
      if (student.id !== selectedId) return student;

      const exists =
        student.fixedDays.includes(day);

      return {
        ...student,
        fixedDays: exists
          ? student.fixedDays.filter(
              (d) => d !== day
            )
          : [...student.fixedDays, day],
      };
    });

    saveStudents(updated);
  };

  if (!selectedStudent) {
    return (
      <div className="p-10 text-center">
        請先登入
      </div>
    );
  }

  const weekdays = [
    "週一",
    "週二",
    "週三",
    "週四",
    "週五",
  ];

  return (
    <main className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="bg-white rounded-3xl shadow p-6">
          <p className="text-blue-600 font-bold">
            方華補習班 楊梅校
          </p>
          <h1 className="text-4xl font-bold text-black">
            晚餐訂餐系統
          </h1>
          <p className="text-gray-600">
            家長線上管理訂餐
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow p-6">
          <select
            value={selectedId || ""}
            onChange={(e) =>
              setSelectedId(
                Number(e.target.value)
              )
            }
            className="w-full border rounded-xl px-4 py-3 mb-6 text-black"
          >
            {students.map((student) => (
              <option
                key={student.id}
                value={student.id}
              >
                {student.name}（
                {student.grade}）
              </option>
            ))}
          </select>

          <h2 className="text-5xl font-bold text-center text-black">
            {selectedStudent.name}
          </h2>

          <p className="text-center text-2xl text-gray-700 mt-2">
            {selectedStudent.grade}
          </p>

          <p
            className={`text-center text-3xl font-bold mt-6 ${
              selectedStudent.ordered
                ? "text-green-500"
                : "text-red-500"
            }`}
          >
            {selectedStudent.ordered
              ? "已訂餐"
              : "未訂餐"}
          </p>

          <button
            onClick={toggleOrder}
            disabled={isLocked}
            className={`w-full mt-6 py-5 rounded-2xl text-2xl font-bold ${
              isLocked
                ? "bg-gray-500 text-white"
                : "bg-blue-600 text-white"
            }`}
          >
            {isLocked
              ? "今日已截止"
              : selectedStudent.ordered
              ? "取消訂餐"
              : "我要訂餐"}
          </button>

          <p className="text-center text-red-500 mt-4 font-bold">
            每日中午 12:00 後無法修改
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow p-6">
          <h3 className="text-xl font-bold text-black mb-4">
            固定訂餐設定
          </h3>

          <div className="flex gap-3">
            {weekdays.map((day, index) => {
              const active =
                selectedStudent.fixedDays.includes(
                  index + 1
                );

              return (
                <button
                  key={day}
                  onClick={() =>
                    toggleFixedDay(index + 1)
                  }
                  className={`flex-1 py-4 rounded-xl font-bold ${
                    active
                      ? "bg-blue-600 text-white"
                      : "bg-gray-300 text-black"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}