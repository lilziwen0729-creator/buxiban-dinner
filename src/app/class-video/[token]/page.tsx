import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import RecordingPlayer from "@/components/RecordingPlayer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "課程補課影片 | 方華補習班", robots: { index: false, follow: false }, referrer: "strict-origin" };
type Share = { date: string; title: string; parts: { part: number; videoId: string }[] };

export default async function ClassVideoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let share: Share | null = null;
  let failed = false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("get_recording_share", { p_token: token });
    failed = Boolean(error);
    if (!error && data?.date && data?.title && Array.isArray(data.parts) && data.parts.length
      && data.parts.every((part: { part: unknown; videoId: string }) => Number.isInteger(part.part) && /^[A-Za-z0-9_-]{11}$/.test(part.videoId))) share = data;
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-8">
    <header className="mx-auto max-w-5xl border-b border-slate-200 pb-5"><p className="text-sm font-bold text-rose-700">方華補習班</p><h1 className="mt-2 text-2xl font-black">{share?.title || "課程補課影片"}</h1>{share && <p className="mt-2 text-sm text-slate-600">{share.date} · 共 {share.parts.length} 段</p>}</header>
    {share ? <RecordingPlayer date={share.date} title={share.title} parts={share.parts} /> : <section className="mx-auto max-w-5xl py-16 text-center"><h2 className="text-lg font-bold">{failed ? "暫時無法載入影片" : "此補課連結尚未開放或已停用"}</h2><p className="mt-3 text-slate-600">{failed ? "請稍後重新整理。" : "請向補習班確認最新的補課連結。"}</p></section>}
  </main>;
}
