import { safeYoutubeUploadUrl } from "./courseRecordings";

const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";
type TokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string };
type TokenClient = { requestAccessToken(options: { prompt: string }): void };
declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient(options: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback: () => void }): TokenClient;
    } } };
  }
}
export type YoutubeConnection = { accessToken: string; expiresAt: number; channelId: string; channelTitle: string };
let identityLoading: Promise<void> | null = null;
export function loadYoutubeIdentity() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (identityLoading) return identityLoading;
  identityLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client"; script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); identityLoading = null; reject(new Error("無法載入 Google 連線，請重新整理")); };
    document.head.appendChild(script);
  });
  return identityLoading;
}
export async function youtubeJson(path: string, token: string, signal?: AbortSignal) {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) throw await youtubeError(response);
  return response.json();
}
async function youtubeError(response: Response) {
  const body = await response.json().catch(() => null);
  const reason = body?.error?.errors?.[0]?.reason;
  if (response.status === 401) return new Error("YouTube 授權已過期，請重新連線後繼續上傳");
  if (reason === "quotaExceeded" || reason === "uploadLimitExceeded") return new Error("YouTube 今日上傳額度已用完，請稍後再試");
  if (response.status === 404 || response.status === 410) return new Error("上傳工作已過期。請先至 YouTube 確認是否已完成，再補登連結或重新開始");
  if (response.status === 403) return new Error("YouTube 權限不足，請確認 API 已啟用且已允許上傳與讀取頻道");
  return new Error(`YouTube 暫時無法處理（${response.status}），請稍後重試`);
}
export function connectYoutube(clientId: string): Promise<YoutubeConnection> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts.oauth2) { reject(new Error("Google 連線尚未就緒，請稍後再試")); return; }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPES,
      error_callback: () => reject(new Error("Google 授權視窗已關閉或被封鎖")),
      callback: (response) => {
        const token = response.access_token;
        if (response.error || !token || !SCOPES.split(" ").every((scope) => response.scope?.split(" ").includes(scope))) {
          reject(new Error("尚未完成 YouTube 上傳與讀取頻道授權")); return;
        }
        void youtubeJson("channels?part=snippet&mine=true", token).then((data) => {
          const channel = data.items?.[0];
          if (!channel?.id) throw new Error("這個 Google 帳號沒有可使用的 YouTube 頻道");
          resolve({ accessToken: token, expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000,
            channelId: channel.id, channelTitle: channel.snippet?.title || "YouTube" });
        }).catch(reject);
      },
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}
export function activeYoutubeToken(connection: YoutubeConnection | null) {
  if (!connection || connection.expiresAt < Date.now() + 30000) throw new Error("請重新連線 YouTube 後繼續上傳");
  return connection.accessToken;
}
export async function startYoutubeUpload(token: string, title: string, size: number, signal: AbortSignal) {
  const response = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false", {
    method: "POST", signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Length": String(size), "X-Upload-Content-Type": "video/mp4" },
    body: JSON.stringify({ snippet: { title, categoryId: "27", description: "方華補習班課程錄影" }, status: { privacyStatus: "unlisted" } }),
  });
  if (!response.ok) throw await youtubeError(response);
  const url = response.headers.get("Location");
  if (!url || !safeYoutubeUploadUrl(url)) throw new Error("無法取得安全的 YouTube 上傳網址");
  return url;
}
export async function readUploadResponse(response: Response, size: number): Promise<{ offset: number; videoId?: string }> {
  if (response.status === 200 || response.status === 201) {
    const body = await response.json();
    if (!/^[A-Za-z0-9_-]{11}$/.test(body.id || "")) throw new Error("YouTube 已接收影片但未回傳影片編號，請重新確認狀態");
    return { offset: size, videoId: body.id };
  }
  if (response.status !== 308) throw await youtubeError(response);
  const range = response.headers.get("Range");
  const match = range?.match(/^bytes=0-(\d+)$/);
  if (range && !match) throw new Error("YouTube 上傳進度格式不正確");
  const offset = match ? Number(match[1]) + 1 : 0;
  if (!Number.isSafeInteger(offset) || offset > size) throw new Error("YouTube 上傳進度超出影片大小");
  return { offset };
}
export async function uploadYoutubeFile(options: {
  file: File; url: string; token: () => string; signal: AbortSignal;
  progress: (offset: number) => Promise<void>;
}) {
  const { file, url, token, signal, progress } = options;
  if (!safeYoutubeUploadUrl(url)) throw new Error("YouTube 上傳網址不正確");
  const request = (body: Blob | null, range: string) => fetch(url, {
    method: "PUT", signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "video/mp4", "Content-Range": range }, body,
  });
  // Probe the server before resuming, including when the final response was lost.
  let state = await readUploadResponse(await request(null, `bytes */${file.size}`), file.size);
  if (state.videoId) return state.videoId;
  await progress(state.offset);
  while (state.offset < file.size) {
    signal.throwIfAborted();
    const end = Math.min(state.offset + 8 * 1024 * 1024, file.size);
    const next = await readUploadResponse(await request(file.slice(state.offset, end), `bytes ${state.offset}-${end - 1}/${file.size}`), file.size);
    if (next.videoId) return next.videoId;
    if (next.offset <= state.offset) throw new Error("YouTube 上傳進度未增加，請重試");
    state = next;
    await progress(state.offset);
  }
  throw new Error("YouTube 已接收影片，請重試以確認完成狀態");
}
export async function inspectYoutubeVideo(token: string, videoId: string, channelId: string) {
  const data = await youtubeJson(`videos?part=status,snippet,processingDetails&id=${encodeURIComponent(videoId)}`, token);
  const video = data.items?.[0];
  if (!video || video.snippet?.channelId !== channelId) throw new Error("找不到此頻道的影片，請確認連線帳號及影片連結");
  const status = video.status;
  if (status?.uploadStatus === "failed" || status?.uploadStatus === "rejected" || status?.uploadStatus === "deleted") {
    return { status: "failed" as const, error: "YouTube 未接受這支影片，請至 YouTube 工作室檢查" };
  }
  if (status?.privacyStatus !== "unlisted") return { status: "failed" as const, error: "影片須設為「不公開」才能建立補課連結，請至 YouTube 工作室調整" };
  return { status: status?.uploadStatus === "processed" ? "ready" as const : "processing" as const, error: "" };
}
