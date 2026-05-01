"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [isRegister, setIsRegister] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [students, setStudents] = useState([
    { name: "", grade: "國一" },
  ]);

  const addStudent = () => {
    setStudents([...students, { name: "", grade: "國一" }]);
  };

  const updateStudent = (
    index: number,
    field: "name" | "grade",
    value: string
  ) => {
    const updated = [...students];
    updated[index][field] = value;
    setStudents(updated);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data, error } = await supabase
      .from("parents")
      .select("*")
      .eq("phone", phone)
      .eq("password", password)
      .single();

    if (error || !data) {
      alert("帳號或密碼錯誤");
      return;
    }

    localStorage.setItem("currentParent", data.phone);
    router.push("/parent");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone || !password) {
      alert("請輸入手機號碼與密碼");
      return;
    }

    if (students.some((s) => !s.name.trim())) {
      alert("請填寫所有學生姓名");
      return;
    }

    const { data: parentData, error: parentError } = await supabase
      .from("parents")
      .insert([
        {
          phone,
          password,
        },
      ])
      .select()
      .single();

    if (parentError) {
      if (parentError.message.includes("parents_phone_key")) {
        alert("這個手機號碼已經註冊過了");
      } else {
        console.error(parentError);
        alert("註冊失敗");
      }
      return;
    }

    const studentRows = students.map((student) => ({
      parent_id: parentData.id,
      name: student.name,
      grade: student.grade,
      fixed_days: [],
      today_cancelled: false,
    }));

    const { data: insertedStudents, error: studentError } =
     await supabase
        .from("students")
        .insert(studentRows)
        .select();

     console.log("parent:", parentData);
     console.log("students:", insertedStudents);

    if (studentError) {
     console.error("學生建立失敗", studentError);
     alert("學生資料建立失敗");
     return;
    }

    localStorage.setItem(
     "currentParent",
      parentData.phone
    );

    alert("註冊成功");
    router.push("/parent");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-200 px-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md">
        <h3 className="text-blue-600 font-bold text-center mb-2">
          方華補習班 楊梅校
        </h3>

        <h1 className="text-5xl font-bold text-center text-black mb-3">
          {isRegister ? "家長註冊" : "家長登入"}
        </h1>

        <p className="text-center text-gray-500 mb-8">
          晚餐訂餐管理系統
        </p>

        <form
          onSubmit={isRegister ? handleRegister : handleLogin}
          className="space-y-4"
        >
          <input
            type="text"
            placeholder="手機號碼"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-gray-300 p-4 rounded-xl text-black bg-white placeholder-gray-400"
          />

          <input
            type="password"
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 p-4 rounded-xl text-black bg-white placeholder-gray-400"
          />

          {isRegister && (
            <div>
              <h2 className="font-bold text-2xl text-black mb-4">
                學生資料
              </h2>

              {students.map((student, index) => (
                <div
                  key={index}
                  className="border rounded-2xl p-4 mb-4"
                >
                  <input
                    type="text"
                    placeholder="學生姓名"
                    value={student.name}
                    onChange={(e) =>
                      updateStudent(
                        index,
                        "name",
                        e.target.value
                      )
                    }
                    className="w-full border border-gray-300 p-3 rounded-xl text-black bg-white placeholder-gray-400 mb-3"
                  />

                  <select
                    value={student.grade}
                    onChange={(e) =>
                      updateStudent(
                        index,
                        "grade",
                        e.target.value
                      )
                    }
                    className="w-full border border-gray-300 p-3 rounded-xl text-black bg-white"
                  >
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
                </div>
              ))}

              <button
                type="button"
                onClick={addStudent}
                className="w-full bg-gray-200 text-black py-3 rounded-xl font-bold"
              >
                + 新增學生
              </button>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-700 text-white py-4 rounded-2xl font-bold text-xl"
          >
            {isRegister ? "註冊" : "登入"}
          </button>
        </form>

        <button
          onClick={() => setIsRegister(!isRegister)}
          className="w-full mt-4 text-blue-700 font-bold"
        >
          {isRegister
            ? "已有帳號？登入"
            : "沒有帳號？註冊"}
        </button>
        
        <button
         onClick={() => router.push("/forgot")}
         className="w-full mt-3 text-blue-600 font-bold"
        >
          忘記密碼？
        </button>
      </div>
    </div>
  );
}