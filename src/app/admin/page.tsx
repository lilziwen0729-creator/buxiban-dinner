"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

type Student = {
  id: string;
  name: string;
  grade: string;
  parent_id: string;
  fixed_days: string[];
  balance?: number;
  low_balance_threshold?: number;
  parents?: {
    phone: string;
  };
};

type Order = {
  id: string;
  student_id: string;
  name: string;
  grade: string;
  received?: boolean;
};

type Vendor = {
  id: string;
  name: string;
  phone?: string;
  note?: string;
};

type MenuItem = {
  id: string;
  vendor_id: string;
  name: string;
  price: number;
};

export default function AdminPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyDate, setHistoryDate] = useState(
    getToday()
  );

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState("orders");
  const [vendorName, setVendorName] =
  useState("");
  const [vendorPhone, setVendorPhone] =
  useState("");
  const [vendorNote, setVendorNote] =
   useState("");
  const [expandedVendor, setExpandedVendor] =
   useState("");
  const [vendors, setVendors] =
   useState<Vendor[]>([]);

  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [menuInputs, setMenuInputs] = useState<{
   [vendorId: string]: {
     name: string;
     price: string;
   };
 }>({});

  const [showUnreceived, setShowUnreceived] =
   useState(false);

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
  const interval = setInterval(() => {
    if (tab === "orders") {
      fetchData();
    }

    if (tab === "history") {
      fetchHistory();
    }
  }, 30000);

  return () => clearInterval(interval);
}, [tab, historyDate]);

useEffect(() => {
  const handleFocus = () => {
    if (tab === "orders") fetchData();
    if (tab === "history") fetchHistory();
  };

  window.addEventListener("focus", handleFocus);

  return () =>
    window.removeEventListener("focus", handleFocus);
}, [tab, historyDate]);

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
    fetchVendors();
    fetchMenus();
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
        received: order.received || false,
      };
    });
  };

  const fetchMenus = async () => {
  const { data } = await supabase
    .from("menus")
    .select("*")
    .order("created_at");

  setMenus(data || []);
};

const addMenu = async (vendorId: string) => {
  const input = menuInputs[vendorId];

  if (!input?.name || !input?.price) {
    alert("請填完整");
    return;
  }

  const { error } = await supabase
    .from("menus")
    .insert([
      {
        vendor_id: vendorId,
        name: input.name,
        price: parseInt(input.price),
      },
    ]);

  if (error) {
    alert(error.message);
    console.error(error);
    return;
  }

  setMenuInputs((prev) => ({
    ...prev,
    [vendorId]: {
      name: "",
      price: "",
    },
  }));

  await fetchMenus();
};

  const fetchData = async () => {
    const { data: studentData } = await supabase
      .from("students")
      .select(`*, parents(phone)`);

    if (!studentData) return;

    setStudents(studentData);

    const today = getToday();

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

  const fetchVendors = async () => {
  const { data } = await supabase
    .from("vendors")
    .select("*")
    .order("created_at");

  setVendors(data || []);
};

  const cancelOrder = async (
    studentId: string,
    name: string
  ) => {
    if (!confirm(`確定取消 ${name} 今日訂餐？`))
      return;

    const today = getToday();

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
    const cleanName = name.trim();
  if (!cleanName) {
    alert("請輸入學生姓名");
    return;
  }

  if (!grade) {
    alert("請選擇年級");
    return;
  }

  if (!phone) {
    alert("請輸入家長手機");
    return;
  }

  if (!/^09\d{8}$/.test(phone)) {
    alert("請輸入正確手機格式（09開頭，共10碼）");
    return;
  }

    const { data: parent } = await supabase
      .from("parents")
      .select("id")
      .eq("phone", phone)
      .single();

      
    if (!parent) {
      alert("此手機尚未註冊家長帳號");
      return;
    }

    const { data: existingStudent } = await supabase
  .from("students")
  .select("id")
  .eq("parent_id", parent.id)
  .eq("name", cleanName)
  .maybeSingle();

if (existingStudent) {
  alert("此學生已存在");
  return;
}

    await supabase.from("students").insert([
      {
        name: cleanName,
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

  const addVendor = async () => {
  const cleanName = vendorName.trim();

  if (!cleanName) {
    alert("請輸入商家名稱");
    return;
  }

  const { error } = await supabase
    .from("vendors")
    .insert([
      {
        name: cleanName,
        phone: vendorPhone,
        note: vendorNote,
      },
    ]);

  if (error) {
    alert("新增失敗");
    return;
  }

  setVendorName("");
  setVendorPhone("");
  setVendorNote("");
  fetchVendors();
};

const deleteVendor = async (id: string) => {
  if (!confirm("確定刪除商家？"))
    return;

  await supabase
    .from("vendors")
    .delete()
    .eq("id", id);

  fetchVendors();
};

  const topupStudent = async (
  studentId: string
) => {
  const input = prompt("請輸入儲值金額");

  if (!input) return;

  const amount = parseInt(input);

  if (isNaN(amount) || amount <= 0) {
    alert("請輸入正確金額");
    return;
  }

  const student = students.find(
    (s) => s.id === studentId
  );

  if (!student) return;

  const currentBalance =
    student.balance || 0;

  const newBalance =
    currentBalance + amount;

  await supabase
    .from("students")
    .update({
      balance: newBalance,
    })
    .eq("id", studentId);

  const { data, error } = await supabase
  .from("transactions")
  .insert([
    {
      student_id: studentId,
      type: "topup",
      amount,
      balance_after: newBalance,
      description: "管理員儲值",
    },
  ])
  .select();

console.log("transaction result", data, error);

if (error) {
  alert("交易紀錄失敗：" + error.message);
  console.error(error);
  return;
}

  alert(
    `${student.name} 儲值成功 +${amount}`
  );

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

  const renderGradeStats = (orderList: Order[]) => (
    <div className="grid grid-cols-9 gap-3 mt-6">
      {grades.map((grade) => {
        const gradeOrders = orderList.filter(
          (o) => o.grade === grade
        );

        const total = gradeOrders.length;

        const received = gradeOrders.filter(
           (o) => o.received
          ).length;

          return (
            <div
          key={grade}
          className="bg-blue-700 rounded-xl p-3 text-center"
        >
          <p className="text-sm text-blue-100 font-medium">
            {grade}
          </p>

          <p className="text-lg font-bold mt-2">
            {received} / {total}
          </p>

          <p className="text-xs text-blue-200 mt-1">
            未領 {total - received}
          </p>
        </div>
      );
    })}
  </div>
);

  const renderOrdersByGrade = (orderList: Order[]) =>
    grades.map((grade) => {
      const gradeOrders = orderList
        .filter((o) => o.grade === grade)
        .sort((a, b) =>
          a.name.localeCompare(b.name)
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
          const gradeStudents = list
            .filter((s) => s.grade === grade)
            .sort((a, b) =>
              a.name.localeCompare(b.name)
            );

          if (gradeStudents.length === 0)
            return null;

          return (
            <div key={grade} className="mb-5">
              <h3 className="font-bold text-blue-700 text-lg mb-2">
                {grade}（{gradeStudents.length}）
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

                    <p className="text-sm text-gray-600">
                      {student.parents?.phone}
                    </p>

                    <p className="text-sm font-bold text-green-600">
                     餘額：${student.balance || 0}
                    </p>

                  </div>

                  <div className="flex gap-2">
  <button
    onClick={() =>
      topupStudent(student.id)
    }
    className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-bold"
  >
    儲值
  </button>

  <button
    onClick={() =>
      deleteStudent(student.id)
    }
    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-bold"
  >
    刪除
  </button>
</div>
                </div>
              ))}
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
          {["orders", "students", "menu", "history"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 rounded-xl font-bold ${
                tab === t
                  ? "bg-blue-600 text-white"
                  : "bg-white text-black"
              }`}
            >
              {t === "orders"
                ? "今日訂餐"
                : t === "students"
                ? "學生管理"
                : t === "menu"
                ? "菜單排程"
                : "歷史紀錄"}
            </button>
          ))}
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

            {orders.filter((o) => !o.received).length > 0 && (
  <div className="mt-8 bg-yellow-400 text-black rounded-2xl overflow-hidden">
    <button
      onClick={() =>
        setShowUnreceived(!showUnreceived)
      }
      className="w-full px-5 py-4 flex justify-between items-center font-bold text-lg"
    >
      <span>
        未領名單（
        {orders.filter((o) => !o.received).length}
        ）
      </span>

      <span>
        {showUnreceived ? "▲" : "▼"}
      </span>
    </button>

    {showUnreceived && (
      <div className="px-5 pb-5">
        <div className="flex flex-wrap gap-3">
          {orders
            .filter((o) => !o.received)
            .sort((a, b) =>
              a.grade.localeCompare(b.grade)
            )
            .map((order) => (
              <div
                key={order.id}
                className="bg-white px-4 py-2 rounded-xl font-semibold"
              >
                {order.grade}｜{order.name}
              </div>
            ))}
        </div>
      </div>
    )}
  </div>
)}

            <div className="mt-8">
              {renderOrdersByGrade(orders)}
            </div>
          </div>
        )}

        {tab === "students" && (
          <>
            <div className="bg-white rounded-3xl p-6 shadow">
              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="搜尋姓名 / 年級 / 家長電話"
                className="w-full border-2 border-gray-300 px-5 py-4 rounded-2xl text-black"
              />
            </div>

            <div className="bg-blue-600 rounded-3xl p-6 shadow">
              <button
                onClick={() =>
                  setShowAdd(!showAdd)
                }
                className="w-full text-left text-white font-bold text-xl hover:text-blue-100 transition"
              >
                {showAdd
                  ? "收合新增學生 ▲"
                  : "新增學生 ▼"}
              </button>

              {showAdd && (
                <div className="grid md:grid-cols-4 gap-4 mt-5">
  <input
    value={name}
    onChange={(e) => setName(e.target.value)}
    placeholder="學生姓名"
    className="px-4 py-3 rounded-2xl bg-white text-black border-none focus:outline-none focus:ring-4 focus:ring-blue-300"
  />

  <select
    value={grade}
    onChange={(e) => setGrade(e.target.value)}
    className="px-4 py-3 rounded-2xl bg-white text-black border-none focus:outline-none focus:ring-4 focus:ring-blue-300"
  >
    <option value="">選擇年級</option>
    {grades.map((g) => (
      <option key={g}>{g}</option>
    ))}
  </select>

  <input
    value={phone}
    onChange={(e) => 
      setPhone(
        e.target.value.replace(/\D/g, "").slice(0, 10)
        )
      }
    placeholder="家長手機"
    className="px-4 py-3 rounded-2xl bg-white text-black border-none focus:outline-none focus:ring-4 focus:ring-blue-300"
  />

  <button
    onClick={addStudent}
    className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition"
  >
    新增學生
  </button>
</div>

              )}
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

        {tab === "menu" && (
  <div className="space-y-6">

    <div className="bg-white rounded-3xl p-6 shadow">
      <h2 className="text-3xl font-bold text-black">
        商家管理
      </h2>

      <p className="text-gray-500 mt-2">
        管理商家與每日排餐
      </p>
    </div>

    <div className="bg-white rounded-3xl p-6 shadow">
  <h3 className="text-xl font-bold text-black mb-4">
    商家管理
  </h3>

  <div className="flex gap-3 mb-5">
    <input
      value={vendorName}
      onChange={(e) =>
        setVendorName(e.target.value)
      }
      placeholder="輸入商家名稱"
      className="flex-1 border px-4 py-3 rounded-xl text-black"
    />

    <input
  value={vendorPhone}
  onChange={(e) =>
    setVendorPhone(e.target.value)
  }
  placeholder="商家電話"
  className="flex-1 border px-4 py-3 rounded-xl text-black"
/>

<input
  value={vendorNote}
  onChange={(e) =>
    setVendorNote(e.target.value)
  }
  placeholder="備註"
  className="flex-1 border px-4 py-3 rounded-xl text-black"
/>

    <button
      onClick={addVendor}
      className="bg-blue-600 text-white px-5 py-3 rounded-xl font-bold"
    >
      新增
    </button>
  </div>

  <div className="space-y-3">

  

  {vendors.length === 0 ? (
    <p className="text-gray-500">
      尚未新增商家
    </p>
  ) : (

vendors.map((vendor) => {
  const isExpanded = expandedVendor === vendor.id;

  return (
    <div
      key={vendor.id}
      className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition"
    >
      {/* Header */}
      <div
        onClick={() =>
          setExpandedVendor(
            isExpanded ? "" : vendor.id
          )
        }
        className="flex justify-between items-center cursor-pointer"
      >
        <div>
          <p className="font-bold text-xl text-black">
            {vendor.name}
          </p>

          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            {vendor.phone && (
              <span>📞 {vendor.phone}</span>
            )}

            <span>
              🍱{" "}
              {
                menus.filter(
                  (menu) =>
                    menu.vendor_id === vendor.id
                ).length
              }{" "}
              道菜
            </span>
          </div>

          {vendor.note && (
            <p className="text-gray-400 mt-1">
              {vendor.note}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteVendor(vendor.id);
            }}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl font-semibold"
          >
            刪除
          </button>

          <span className="text-gray-500 text-xl">
            {isExpanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Expand Content */}
      {isExpanded && (
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          {/* 已有菜單 */}
          <div className="bg-gray-50 rounded-2xl p-4">
            <h4 className="font-bold text-black mb-4">
              已有菜單
            </h4>

            <div className="space-y-3">
              {menus
                .filter(
                  (menu) =>
                    menu.vendor_id === vendor.id
                )
                .map((menu) => (
                  <div
                    key={menu.id}
                    className="flex justify-between items-center bg-white px-4 py-3 rounded-xl shadow-sm"
                  >
                    <span className="font-medium text-black">
                      {menu.name}
                    </span>

                    <span className="text-blue-600 font-bold">
                      ${menu.price}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* 新增菜單 */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <h4 className="font-bold text-blue-900 mb-4">
              新增菜單
            </h4>

            <div className="space-y-3">
              <input
                value={menuInputs[vendor.id]?.name || ""}
                onChange={(e) =>
                  setMenuInputs((prev) => ({
                    ...prev,
                   [vendor.id]: {
                     name: e.target.value,
                     price: prev[vendor.id]?.price || "",
                   },
                  }))
                }
                placeholder="輸入菜名"
                className="w-full border px-4 py-3 rounded-xl text-black"
              />

              <input
                value={menuInputs[vendor.id]?.price || ""}
                onChange={(e) =>
                  setMenuInputs((prev) => ({
                    ...prev,
                    [vendor.id]: {
                      name: prev[vendor.id]?.name || "",
                      price: e.target.value,
                    },
                  }))
                }
                placeholder="價格"
                className="w-full border px-4 py-3 rounded-xl text-black"
              />

              <button
                onClick={() =>
                  addMenu(vendor.id)
                }
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold"
              >
                ＋ 新增菜單
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
})
)}
</div>
</div>
</div>
)}

        {tab === "history" && (
          <div className="bg-slate-900 text-white rounded-3xl p-8">
            <div className="flex justify-between items-center mb-8 bg-slate-800 rounded-2xl p-4">
              <h2 className="text-3xl font-bold">
                歷史紀錄
              </h2>

              <input
                type="date"
                value={historyDate}
                onChange={(e) =>
                  setHistoryDate(e.target.value)
                }
                className="bg-white text-slate-900 px-4 py-3 rounded-2xl font-semibold shadow-md border-2 border-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-400"
              />
            </div>

            <p>共 {historyOrders.length} 份</p>

            {renderGradeStats(historyOrders)}

            <div className="mt-8">
              {renderOrdersByGrade(
                historyOrders
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}