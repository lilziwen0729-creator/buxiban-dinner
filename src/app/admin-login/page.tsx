"use client";

import { useState } from "react";
import Image from "next/image";
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
    <main className="relative min-h-screen overflow-hidden bg-rose-50">
      <Image
        src="/images/funwa-study-corner.png"
        alt="粉色書桌、書包與學習用品插畫"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-white/15" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/80 bg-white/94 shadow-[0_24px_70px_rgba(125,35,77,0.18)] backdrop-blur-md">
          <div className="p-8 pb-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500 text-xl font-black text-white shadow-lg shadow-rose-200">方</div>
              <div>
                <p className="text-sm font-black text-rose-600">方華補習班</p>
                <p className="text-xs font-bold text-slate-400">楊梅校管理系統</p>
              </div>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">歡迎回來</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">登入後開始整理今天的班務</p>
          </div>

          <div className="space-y-4 px-8 pb-8">
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
          <p className="pt-2 text-center text-xs font-bold text-rose-300">方華管理系統 V2.0</p>
          </div>
        </div>
      </div>
    </main>
  );
}
