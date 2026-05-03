"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";

export default function ForgotPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] =
    useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const sendCode = async () => {
    if (!phone) {
      alert("請輸入手機號碼");
      return;
    }

    const verifyCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    const { error } = await supabase
      .from("parents")
      .update({
        reset_code: verifyCode,
      })
      .eq("phone", phone);

    if (error) {
      alert("發送失敗");
      return;
    }

    alert(`驗證碼：${verifyCode}`);
  };

  const resetPassword = async () => {
    if (
      !phone ||
      !code ||
      !newPassword ||
      !confirmPassword
    ) {
      alert("請填完整");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("兩次密碼不一致");
      return;
    }

    const { data: parent } = await supabase
      .from("parents")
      .select("*")
      .eq("phone", phone)
      .eq("reset_code", code)
      .maybeSingle();

    if (!parent) {
      alert("驗證碼錯誤");
      return;
    }

    await supabase
      .from("parents")
      .update({
        password: newPassword,
        reset_code: null,
      })
      .eq("phone", phone);

    alert("密碼修改成功");
    router.push("/login");
  };

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl p-10">

        <h1 className="text-4xl font-bold text-center text-blue-600">
          忘記密碼
        </h1>

        <div className="mt-8 space-y-4">

          <input
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value)
            }
            placeholder="手機號碼"
            className="w-full px-5 py-4 rounded-xl border-2 text-black"
          />

          <button
            onClick={sendCode}
            className="w-full bg-slate-800 text-white py-4 rounded-xl font-bold"
          >
            取得驗證碼
          </button>

          <input
            value={code}
            onChange={(e) =>
              setCode(e.target.value)
            }
            placeholder="輸入驗證碼"
            className="w-full px-5 py-4 rounded-xl border-2 text-black"
          />

          <input
            type="password"
            value={newPassword}
            onChange={(e) =>
              setNewPassword(
                e.target.value
              )
            }
            placeholder="新密碼"
            className="w-full px-5 py-4 rounded-xl border-2 text-black"
          />

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(
                e.target.value
              )
            }
            placeholder="確認新密碼"
            className="w-full px-5 py-4 rounded-xl border-2 text-black"
          />

          <button
            onClick={resetPassword}
            className="w-full bg-blue-600 text-white py-4 rounded-xl text-xl font-bold"
          >
            重設密碼
          </button>

        </div>
      </div>
    </main>
  );
}