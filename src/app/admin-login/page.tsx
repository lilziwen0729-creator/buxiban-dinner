"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();

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
      alert("登入失敗");
      setLoading(false);
      return;
    }

    router.push("/admin");
  };

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-black mb-8">
          管理員登入
        </h1>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="管理員 Email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            className="w-full border p-4 rounded-xl text-black"
          />

          <input
            type="password"
            placeholder="密碼"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            className="w-full border p-4 rounded-xl text-black"
          />

          <button
            onClick={login}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold"
          >
            {loading ? "登入中..." : "登入"}
          </button>
        </div>
      </div>
    </main>
  );
}