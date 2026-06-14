"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] =
    useState("");
  const [loading, setLoading] =
    useState(false);

  const login = async () => {
    setLoading(true);

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/admin";
  };

  return (
    <main className="app-page flex min-h-screen items-center justify-center p-5">
      <div className="app-card w-full max-w-md overflow-hidden">
        <div className="bg-slate-950 p-8 text-white">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl font-black">方</div>
          <p className="text-sm font-bold text-blue-200">方華補習班 楊梅校</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">管理員登入</h1>
          <p className="mt-2 text-sm font-bold text-slate-300">今天也把班務整理得漂漂亮亮</p>
        </div>

        <div className="space-y-4 p-7">
          <input
            type="email"
            placeholder="管理員 Email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            className="app-input px-4 py-4 font-bold"
          />

          <input
            type="password"
            placeholder="密碼"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            className="app-input px-4 py-4 font-bold"
          />

          <button
            onClick={login}
            disabled={loading}
            className="app-button-primary w-full rounded-2xl py-4 font-black transition disabled:bg-slate-300 disabled:shadow-none"
          >
            {loading ? "登入中..." : "登入"}
          </button>
          <p className="pt-2 text-center text-xs font-bold text-slate-400">方華管理系統 V2.0</p>
        </div>
      </div>
    </main>
  );
}
