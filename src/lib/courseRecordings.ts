export type RecordingPart = {
  id: string; recording_id: string; part_no: number; file_name: string; file_size: number;
  fingerprint: string; status: "pending" | "uploading" | "paused" | "processing" | "ready" | "failed";
  uploaded_bytes: number; upload_url: string | null; youtube_id: string | null;
  channel_id: string | null; error_message: string; lease_token?: string | null;
};
export type CourseRecording = {
  id: string; course_id: string | null; lesson_date: string; course_title: string; classroom: string;
  share_token: string; share_enabled: boolean; archived: boolean; created_at: string;
  recording_parts: RecordingPart[];
};

export const recordingStatus = {
  pending: "待上傳", uploading: "上傳中", paused: "已暫停", processing: "YouTube 處理中", ready: "可觀看", failed: "待處理",
};
export function recordingTitle(date: string, course: string, part: number) {
  const name = course.trim().replace(/\s+/g, " ");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date
    || !name || /[<>]/.test(name) || !Number.isInteger(part) || part < 1 || part > 30) throw new Error("請確認日期、課程名稱及段落");
  const title = `${date} ${name} P${part}`;
  if (title.length > 100) throw new Error("影片標題不可超過 100 個字元");
  return title;
}
export function validateRecordingFile(file: { name: string; size: number }) {
  if (!/\.mp4$/i.test(file.name) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 256 * 1024 ** 3) {
    throw new Error("請選擇有效的 MP4 影片，每支不得超過 256 GB");
  }
}
export function sortRecordingFiles<T extends { name: string }>(files: T[]) {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant", { numeric: true }));
}
export function moveRecordingPart<T>(items: T[], index: number, direction: -1 | 1) {
  const next = [...items], target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
// Sample both ends and the middle without loading multi-GB videos into memory.
export async function recordingFingerprint(file: File) {
  validateRecordingFile(file);
  const size = 1024 * 1024;
  const positions = [0, Math.max(0, Math.floor(file.size / 2) - size / 2), Math.max(0, file.size - size)];
  const data = new Blob([String(file.size), ...positions.map((start) => file.slice(start, start + size))]);
  const digest = await crypto.subtle.digest("SHA-256", await data.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function formatRecordingSize(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
export function recordingShareMessage(recording: Pick<CourseRecording, "lesson_date" | "course_title">, url: string) {
  return `家長您好，以下是孩子的補課影片：\n日期：${recording.lesson_date}\n課程：${recording.course_title}\n\n${url}\n\n請依頁面上的段落順序觀看，謝謝！`;
}
export function safeYoutubeUploadUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.googleapis.com" && !url.username && !url.password
      && url.pathname === "/upload/youtube/v3/videos" && url.searchParams.get("uploadType") === "resumable"
      && Boolean(url.searchParams.get("upload_id"));
  } catch { return false; }
}
