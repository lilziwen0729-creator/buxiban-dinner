# Course Recordings

Admin navigation: `admin?tab=courseRecordings` under 教務成績.

## Setup

1. Apply `database/course_recordings.sql` to the existing Supabase project. The migration is additive and repeatable.
2. In the Google Cloud project controlled by the school's YouTube owner, enable YouTube Data API v3.
3. Configure Google Auth Platform branding, audience and data access. Use only the intended school operators as test users while testing. Required scopes: `youtube.upload` and `youtube.readonly`.
4. Create an OAuth client of type Web application. Authorized JavaScript origins must include `https://buxiban-dinner-6y9x.vercel.app`. Add the exact localhost origin separately for local verification. Do not add untrusted preview origins.
5. Save the public client ID in 課程錄影 > YouTube 連線設定. No client secret or Google password is collected.
6. The channel owner clicks 連線 YouTube and grants access. Verify the displayed channel before uploading a non-sensitive test clip.

Google terms, MFA and consent must be completed by the account owner. No billing account, paid trial or service-account key is required by this implementation. Google may require application verification depending on the chosen audience and account policies.

## Behavior

- Select one or more MP4 files, one lesson date and one course. Check the filename-based order; arrow controls and local video preview allow correction before creating the job.
- The exact title is `2026-11-21 國二數學 P1`, then P2, P3, etc. Original local files are not renamed, modified or deleted.
- Files are sent directly from the browser to Google in 8 MiB chunks, not through Next.js/Vercel or Supabase Storage.
- The Google access token lives only in browser memory. It expires; reconnect when prompted. Keep the page open and prevent the computer from sleeping while uploading. Switching admin tabs pauses the current transfer.
- Job metadata, sampled file fingerprints and resumable URLs are private to authenticated administrators. A job lease prevents overlapping uploads. Save the resumable URL before sending any video bytes; retry probes the server to recover lost completion responses.
- Re-select original files after reopening. Matching uses size plus SHA-256 of samples at the beginning, middle and end, not the copied file timestamp. This is a practical matching fingerprint, not a complete-file integrity checksum.
- Completed parts are never automatically uploaded again. Expired sessions require an explicit reset after checking YouTube, or supplementing the already-uploaded YouTube URL. This is deliberate to avoid duplicate videos.
- Videos are requested as unlisted, with subscriber notifications disabled. Check actual processing and privacy state before enabling a lesson link. A restricted Google project may require changing visibility in YouTube Studio.
- Sharing is disabled by default. `get_recording_share` returns only date, course title and ordered YouTube IDs for an enabled, unarchived, fully-ready lesson. It never exposes student information, local filenames or upload sessions. Public links are random UUID capabilities and should be treated as shareable credentials.
- Disabling a lesson link does not revoke an already-forwarded unlisted YouTube URL. Change video privacy in YouTube to revoke that access.
- Do not delete source footage solely because an upload completed. Keep independent local backups according to the school's retention policy.

## Verification

`node --test scripts/test-course-recordings.mjs`

Covers naming, dates, file matching, database permissions, share visibility, atomic job creation, duplicate prevention, upload leases, recovery and the resumable protocol. Google OAuth and an actual upload still require the school's configured project and explicit channel-owner consent.

Primary references:
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- https://support.google.com/youtube/answer/157177?hl=zh-Hant
