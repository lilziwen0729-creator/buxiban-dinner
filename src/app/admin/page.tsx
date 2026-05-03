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
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyDate, setHistoryDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState("orders");

  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [phone, setPhone] = useState("");

  const grades = [
    "小一",
    "小二",
    "小三",
    "小四",
    "小五",
    "小六",
    "國一",
    "國二",
    "國三",
  ];

  const todayDisplay = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (tab === "history") {
      fetchHistory();
    }
  }, [historyDate, tab]);

  const checkAdmin = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/admin-login";
      return;
    }

    fetchData();
  };

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

    setOrders(mergeOrders(orderData || [], studentData));
  };

  const fetchHistory = async () => {
    const { data: studentData } = await supabase
      .from("students")
      .select("*");

    if (!studentData) return;

    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .eq("order_date", historyDate);

    setHistoryOrders(
      mergeOrders(orderData || [], studentData)
    );
  };

  const mergeOrders = (
    orderData: any[],
    studentData: any[]
  ) => {
    return orderData.map((order) => {
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
  };

  const cancelOrder = async (
    studentId: string,
    name: string
  ) => {
    if (!confirm(`確定取消 ${name} 今日訂餐？`))
      return;

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

  const addStudent = async () => {
    if (!name || !grade || !phone) {
      alert("請填完整");
      return;
    }

    const { data: parent } = await supabase
      .from("parents")
      .select("id")
      .eq("phone", phone)
      .single();

    if (!parent) {
      alert("找不到家長帳號");
      return;
    }

    await supabase.from("students").insert([
      {
        name,
        grade,
        parent_id: parent.id,
        fixed_days: [],
      },
    ]);

    alert("新增成功");

    setName("");
    setGrade("");
    setPhone("");
    setShowAdd(false);

    fetchData();
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin-login";
  };

  const filteredStudents = students.filter((s) => {
    const keyword = search.toLowerCase();

    return (
      s.name.toLowerCase().includes(keyword) ||
      s.grade.toLowerCase().includes(keyword) ||
      s.parents?.phone?.includes(keyword)
    );
  });

  const renderOrdersByGrade = (orderList: Order[]) =>
    grades.map((grade) => {
      const gradeOrders = orderList
        .filter((o) => o.grade === grade)
        .sort((a, b) => a.name.localeCompare(b.name));

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

                {tab === "orders" && (
                  <button
                    onClick={() =>
                      cancelOrder(
                        order.student_id,
                        order.name
                      )
                    }
                    className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold"
                  >
                    取消
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    });

  const renderGradeStats = (orderList: Order[]) => (
    <div className="grid grid-cols-9 gap-3 mt-6">
      {grades.map((grade) => {
        const count = orderList.filter(
          (o) => o.grade === grade
        ).length;

        return (
          <div
            key={grade}
            className="bg-blue-700 rounded-xl p-3 text-center"
          >
            <p className="text-sm text-blue-100">
              {grade}
            </p>
            <p className="text-2xl font-bold">
              {count}
            </p>
          </div>
        );
      })}
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-black">
              方華補習班 楊梅校
            </h1>

            <p className="text-gray-700 mt-2">
              訂餐管理後台
            </p>

            <p className="text-blue-600 font-semibold mt-1">
              {todayDisplay}
            </p>
          </div>

          <button
            onClick={logout}
            className="bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-sm"
          >
            登出
          </button>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => setTab("orders")}
            className={`px-5 py-3 rounded-xl font-bold ${
              tab === "orders"
                ? "bg-blue-600 text-white"
                : "bg-white text-black"
            }`}
          >
            今日訂餐
          </button>

          <button
            onClick={() => setTab("students")}
            className={`px-5 py-3 rounded-xl font-bold ${
              tab === "students"
                ? "bg-blue-600 text-white"
                : "bg-white text-black"
            }`}
          >
            學生管理
          </button>

          <button
            onClick={() => setTab("history")}
            className={`px-5 py-3 rounded-xl font-bold ${
              tab === "history"
                ? "bg-blue-600 text-white"
                : "bg-white text-black"
            }`}
          >
            歷史紀錄
          </button>
        </div>

        {tab === "orders" && (
          <div className="bg-slate-900 text-white rounded-3xl p-8">
            <h2 className="text-3xl font-bold">
              今日訂餐
            </h2>

            <p className="mt-2 text-gray-300">
              共 {orders.length} 份
            </p>

            {renderGradeStats(orders)}

            <div className="mt-8">
              {renderOrdersByGrade(orders)}
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="bg-slate-900 text-white rounded-3xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">
                歷史紀錄
              </h2>

              <input
                type="date"
                value={historyDate}
                onChange={(e) =>
                  setHistoryDate(e.target.value)
                }
                className="text-black px-4 py-2 rounded-xl"
              />
            </div>

            <p className="text-gray-300">
              共 {historyOrders.length} 份
            </p>

            {renderGradeStats(historyOrders)}

            <div className="mt-8">
              {renderOrdersByGrade(historyOrders)}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}