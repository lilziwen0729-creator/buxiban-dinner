"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Student = {
  id: string;
  name: string;
  grade: string;
  parent_id: string;
  fixed_days: string[];
  parents?: {
    phone: string;
  };
};

type Order = {
  id: string;
  student_id: string;
  name: string;
  grade: string;
};

export default function AdminPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: studentData } = await supabase
      .from("students")
      .select(`*, parents(phone)`);

    if (!studentData) return;

    setStudents(studentData);

    const today = new Date().toISOString().split("T")[0];

    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .eq("order_date", today);

    if (!orderData) return;

    const merged = orderData.map((order) => {
      const student = studentData.find(
        (s) => s.id === order.student_id
      );

      return {
        id: order.id,
        student_id: order.student_id,
        name: student?.name || "未知",
        grade: student?.grade || "",
      };
    });

    setOrders(merged);
  };

  const cancelOrder = async (
    studentId: string,
    name: string
  ) => {
    if (!confirm(`確定取消 ${name} 今日訂餐？`)) return;

    const today = new Date().toISOString().split("T")[0];

    await supabase
      .from("orders")
      .delete()
      .eq("student_id", studentId)
      .eq("order_date", today);

    fetchData();
  };

  const deleteStudent = async (id: string) => {
    if (!confirm("確定刪除學生？")) return;

    await supabase
      .from("students")
      .delete()
      .eq("id", id);

    fetchData();
  };

  const grades = [
    "小一","小二","小三","小四","小五","小六",
    "國一","國二","國三"
  ];

  const renderOrdersByGrade = () =>
    grades.map((grade) => {
      const gradeOrders = orders.filter(
        (o) => o.grade === grade
      );

      if (gradeOrders.length === 0) return null;

      return (
        <div key={grade} className="mb-6">
          <h3 className="text-xl font-bold mb-3 text-blue-300">
            {grade}（{gradeOrders.length}）
          </h3>

          <div className="space-y-2">
            {gradeOrders.map((order) => (
              <div
                key={order.id}
                className="flex justify-between items-center bg-white text-black p-4 rounded-xl"
              >
                <span className="font-bold">
                  {order.name}
                </span>

                <button
                  onClick={() =>
                    cancelOrder(
                      order.student_id,
                      order.name
                    )
                  }
                  className="bg-red-500 text-white px-4 py-2 rounded-lg"
                >
                  取消
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    });

  const filteredStudents = students.filter((s) =>
    s.name.includes(search)
  );

  const renderStudentSection = (
    title: string,
    list: Student[]
  ) => (
    <div className="bg-white rounded-3xl p-6 shadow">
      <h2 className="text-2xl font-bold mb-5">
        {title}
      </h2>

      {grades
        .filter((g) =>
          title === "國小部"
            ? g.includes("小")
            : g.includes("國")
        )
        .map((grade) => {
          const gradeStudents = list.filter(
            (s) => s.grade === grade
          );

          if (gradeStudents.length === 0) return null;

          return (
            <div key={grade} className="mb-5">
              <h3 className="font-bold text-blue-600 mb-2">
                {grade}
              </h3>

              {gradeStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex justify-between items-center border-b py-3"
                >
                  <div>
                    <p className="font-bold">
                      {student.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {student.parents?.phone}
                    </p>
                  </div>

                  <button
                    onClick={() =>
                      deleteStudent(student.id)
                    }
                    className="bg-red-500 text-white px-3 py-1 rounded"
                  >
                    刪除
                  </button>
                </div>
              ))}
            </div>
          );
        })}
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-8">

        <div>
          <h1 className="text-4xl font-bold text-black">
            方華補習班 楊梅校
          </h1>
          <p className="text-gray-600 mt-2">
            訂餐管理後台
          </p>
        </div>

        <div className="bg-slate-900 text-white rounded-3xl p-8">
          <h2 className="text-3xl font-bold">
            今日訂餐名單
          </h2>

          <p className="mt-2">
            共 {orders.length} 份
          </p>

          <div className="mt-6">
            {renderOrdersByGrade()}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow">
          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="搜尋學生姓名"
            className="w-full border px-4 py-3 rounded-xl"
          />
        </div>

        {renderStudentSection(
          "國小部",
          filteredStudents.filter((s) =>
            s.grade.includes("小")
          )
        )}

        {renderStudentSection(
          "國中部",
          filteredStudents.filter((s) =>
            s.grade.includes("國")
          )
        )}

      </div>
    </main>
  );
}