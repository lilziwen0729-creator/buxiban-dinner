"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
  id: string;
  received: boolean;
  student_id: string;
  studentName: string;
  studentGrade: string;
};

export default function TeacherPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedGrade, setSelectedGrade] =
    useState("國一");

  useEffect(() => {
    fetchOrders();
  }, [selectedGrade]);

  const fetchOrders = async () => {
    const today = new Date()
      .toISOString()
      .split("T")[0];

    // 抓今日訂單
    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .eq("order_date", today);

    if (!orderData) {
      setOrders([]);
      return;
    }

    // 抓全部學生
    const { data: studentData } = await supabase
      .from("students")
      .select("*");

    if (!studentData) {
      setOrders([]);
      return;
    }

    const merged = orderData
      .map((order) => {
        const student = studentData.find(
          (s) => s.id === order.student_id
        );

        return {
          id: order.id,
          received: order.received || false,
          student_id: order.student_id,
          studentName: student?.name || "未知",
          studentGrade: student?.grade || "",
        };
      })
      .filter(
        (order) =>
          order.studentGrade === selectedGrade
      );

    setOrders(merged);
  };

  const toggleReceived = async (
    id: string,
    current: boolean
  ) => {
    await supabase
      .from("orders")
      .update({
        received: !current,
      })
      .eq("id", id);

    fetchOrders();
  };

  const receivedCount = orders.filter(
    (o) => o.received
  ).length;

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-3xl mx-auto space-y-8">

        <div className="bg-blue-600 text-white rounded-3xl p-8">
          <h1 className="text-3xl font-bold">
            教師領餐確認
          </h1>

          <p className="mt-3 text-xl">
            已領 {receivedCount} / {orders.length}
          </p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow">
          <select
            value={selectedGrade}
            onChange={(e) =>
              setSelectedGrade(
                e.target.value
              )
            }
            className="w-full border-2 rounded-xl px-4 py-4 text-black mb-6"
          >
            <option>國一</option>
            <option>國二</option>
            <option>國三</option>
            <option>小一</option>
            <option>小二</option>
            <option>小三</option>
            <option>小四</option>
            <option>小五</option>
            <option>小六</option>
          </select>

          <div className="space-y-4">
            {orders.length === 0 ? (
              <p className="text-center text-gray-500">
                今日無訂餐
              </p>
            ) : (
              orders.map((order) => (
                <button
                  key={order.id}
                  onClick={() =>
                    toggleReceived(
                      order.id,
                      order.received
                    )
                  }
                  className={`w-full flex justify-between p-5 rounded-2xl text-2xl font-bold ${
                    order.received
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 text-black"
                  }`}
                >
                  <span>
                    {order.studentName}
                  </span>

                  <span>
                    {order.received
                      ? "已領"
                      : "未領"}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

      </div>
    </main>
  );
}