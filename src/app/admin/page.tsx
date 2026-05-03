"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
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

  useEffect(() => {
    const adminLogin = localStorage.getItem("adminLogin");

    if (adminLogin !== "true") {
      router.push("/admin-login");
      return;
    }

    fetchData();
  }, [router]);

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

    if (!orderData) {
      setOrders([]);
      return;
    }

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

  const logout = () => {
    localStorage.removeItem("adminLogin");
    router.push("/admin-login");
  };

  const filteredStudents = students.filter((s) => {
    const keyword = search.toLowerCase();

    return (
      s.name.toLowerCase().includes(keyword) ||
      s.grade.toLowerCase().includes(keyword) ||
      s.parents?.phone?.includes(keyword)
    );
  });

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
                  className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold"
                >
                  取消
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    });

  const renderStudentSection = (
    title: string,
    list: Student[]
  ) => (
    <div className="bg-white rounded-3xl p-6 shadow">
      <h2 className="text-2xl font-bold mb-5 text-black">
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

          if (gradeStudents.length === 0)
            return null;

          return (
            <div key={grade} className="mb-5">
              <h3 className="font-bold text-blue-700 text-lg mb-2">
                {grade}
              </h3>

              {gradeStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex justify-between items-center border-b py-3"
                >
                  <div>
                    <p className="font-bold text-black">
                      {student.name}
                    </p>
                    <p className="text-sm text-gray-700">
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

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-black">
              方華補習班 楊梅校
            </h1>
            <p className="text-gray-700 mt-2">
              訂餐管理後台
            </p>
          </div>

          <button
            onClick={logout}
            className="bg-red-500 text-white px-5 py-3 rounded-xl font-bold"
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
        </div>

        {tab === "orders" && (
          <div className="bg-slate-900 text-white rounded-3xl p-8">
            <h2 className="text-3xl font-bold">
              今日訂餐名單
            </h2>

            <p className="mt-2 text-gray-300">
              共 {orders.length} 份
            </p>

            <div className="mt-6">
              {renderOrdersByGrade()}
            </div>
          </div>
        )}

        {tab === "students" && (
          <>
            <div className="bg-white rounded-3xl p-6 shadow">
              <div className="relative">
                <input
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                  placeholder="搜尋姓名 / 年級 / 家長電話"
                  className="w-full border-2 border-gray-300 focus:border-blue-500 outline-none px-5 py-4 rounded-2xl text-black pr-20"
                />
              </div>
            </div>

            <div className="bg-blue-600 rounded-3xl p-6 shadow">
              <button
                onClick={() => setShowAdd(!showAdd)}
                className="w-full text-left text-white font-bold text-xl"
              >
                {showAdd
                  ? "收合新增學生 ▲"
                  : "新增學生 ▼"}
              </button>
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
          </>
        )}
      </div>
    </main>
  );
}