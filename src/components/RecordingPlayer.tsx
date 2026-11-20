"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Play } from "lucide-react";

export default function RecordingPlayer({ date, title, parts }: { date: string; title: string; parts: { part: number; videoId: string }[] }) {
  const [index, setIndex] = useState(0);
  const active = parts[index];
  return <section className="mx-auto max-w-5xl py-6">
    <div className="aspect-video w-full bg-black"><iframe className="h-full w-full" key={active.videoId}
      src={`https://www.youtube-nocookie.com/embed/${active.videoId}?rel=0`} title={`${date} ${title} P${active.part}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin" /></div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{date} {title} P{active.part}</h2><a href={`https://www.youtube.com/watch?v=${active.videoId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ExternalLink size={16} />在 YouTube 觀看</a></div>
    <nav aria-label="影片段落" className="mt-5 flex flex-wrap gap-2">{parts.map((part, i) => <button type="button" key={part.part} aria-pressed={i === index} onClick={() => setIndex(i)} className={`inline-flex min-h-11 min-w-20 items-center justify-center gap-2 rounded-lg border px-4 py-2 font-bold ${i === index ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}><Play size={16} />P{part.part}</button>)}</nav>
    <div className="mt-5 flex justify-between gap-3"><button type="button" aria-label="上一段" title="上一段" disabled={index === 0} onClick={() => setIndex(index - 1)} className="rounded-lg border border-slate-300 bg-white p-3 disabled:opacity-30"><ChevronLeft size={20} /></button><span className="self-center text-sm text-slate-500">{index + 1} / {parts.length}</span><button type="button" aria-label="下一段" title="下一段" disabled={index === parts.length - 1} onClick={() => setIndex(index + 1)} className="rounded-lg border border-slate-300 bg-white p-3 disabled:opacity-30"><ChevronRight size={20} /></button></div>
  </section>;
}
