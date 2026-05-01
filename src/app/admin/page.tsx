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
  students: {
    name: string;
    grade: string;
  };
};

export default function AdminPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    const { data, error } = await supabase
      .from("students")
      .select(`
        *,
        parents(phone)
      `);

    if (!error && data) {
      setStudents(data);
    }

    const today = new Date().toISOString().split("T")[0];

    const { data: orderData } = await supabase
     .from("orders")
     .select("id, student_id")
      .eq("order_date", today);

    if (orderData) {
    const detailedOrders = orderData.map((order) => {
    const student = data?.find(
      (s) => s.id === order.student_id
    );

    return {
      id: order.id,
      students: {
        name: student?.name || "未知",
        grade: student?.grade || "",
      },
    };
  });

  setOrders(detailedOrders);
 }
 };

  const addStudent = async () => {
    if (!name || !grade || !phone) {
      alert("請填完整");
      return;
    }

    const { data: parent, error: parentError } =
      await supabase
        .from("parents")
        .select("id")
        .eq("phone", phone)
        .single();

    if (parentError || !parent) {
      alert("找不到家長帳號");
      return;
    }

    const { error } = await supabase
      .from("students")
      .insert([
        {
          name,
          grade,
          parent_id: parent.id,
          fixed_days: [],
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert("新增成功");

    setName("");
    setGrade("");
    setPhone("");

    fetchStudents();
  };

  const deleteStudent = async (id: string) => {
    if (!confirm("確定刪除？")) return;

    await supabase
      .from("students")
      .delete()
      .eq("id", id);

    fetchStudents();
  };

  const elementary = students.filter((s) =>
    s.grade.includes("小")
  );

  const junior = students.filter((s) =>
    s.grade.includes("國")
  );

  const renderSection = (
    title: string,
    list: Student[]
  ) => (
    <div className="bg-white rounded-3xl shadow-lg p-8">
      <h2 className="text-3xl font-bold mb-6 text-black">
        {title}
      </h2>

      {list.length === 0 ? (
        <p className="text-gray-500">
          尚無學生
        </p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((student) => (
            <div
              key={student.id}
              className="border rounded-2xl p-5 shadow"
            >
              <h3 className="text-2xl font-bold text-black">
                {student.name}
              </h3>

              <p className="text-gray-600 mt-2">
                {student.grade}
              </p>

              <p className="text-blue-600 mt-2">
                家長：{student.parents?.phone}
              </p>

              <button
                onClick={() =>
                  deleteStudent(student.id)
                }
                className="mt-4 w-full bg-red-500 text-white py-3 rounded-xl font-bold"
              >
                刪除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto space-y-8">

        <div>
          <h1 className="text-5xl font-bold text-black">
            方華補習班 楊梅校
          </h1>
          <p className="text-gray-600 text-xl mt-2">
            晚餐管理後台
          </p>
        </div>

        <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-lg">
          <h2 className="text-3xl font-bold">
            今日訂餐名單
          </h2>

          <p className="mt-2 text-xl">
            共 {orders.length} 份
          </p>

          <div className="mt-6 space-y-3">
            {orders.length === 0 ? (
              <p>今日無訂單</p>
            ) : (
              orders.map((order, index) => (
                <div
                  key={order.id}
                  className="flex justify-between bg-white text-black p-4 rounded-xl"
                >
                  <span>{index + 1}</span>
                  <span>{order.students.name}</span>
                  <span>{order.students.grade}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-blue-600 rounded-3xl p-8 shadow-lg">
          <h2 className="text-3xl font-bold text-white mb-6">
            新增學生
          </h2>

          <div className="grid md:grid-cols-4 gap-4">
            <input
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              placeholder="學生姓名"
              className="px-4 py-4 rounded-xl text-black bg-white"
            />

            <select
              value={grade}
              onChange={(e) =>
                setGrade(e.target.value)
              }
              className="px-4 py-4 rounded-xl text-black bg-white"
            >
              <option value="">選擇年級</option>
              <option>小一</option>
              <option>小二</option>
              <option>小三</option>
              <option>小四</option>
              <option>小五</option>
              <option>小六</option>
              <option>國一</option>
              <option>國二</option>
              <option>國三</option>
            </select>

            <input
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
              placeholder="家長手機"
              className="px-4 py-4 rounded-xl text-black bg-white"
            />

            <button
              onClick={addStudent}
              className="bg-white text-blue-600 font-bold rounded-xl"
            >
              新增
            </button>
          </div>
        </div>

        {renderSection("國小部", elementary)}
        {renderSection("國中部", junior)}

      </div>
    </main>
  );
}