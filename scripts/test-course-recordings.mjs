import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const helperUrl = moduleUrl(readFileSync(new URL('../src/lib/courseRecordings.ts', import.meta.url), 'utf8'));
const helpers = await import(helperUrl);
const upload = await import(moduleUrl(readFileSync(new URL('../src/lib/youtubeRecordingUpload.ts', import.meta.url), 'utf8')
  .replace('"./courseRecordings"', JSON.stringify(helperUrl))));
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const files = [1, 2, 3].map((n) => ({ file_name: `camera_${n}.mp4`, file_size: 100, fingerprint: String(n).repeat(64) }));
const create = (parts = files, recordingId = id(1)) => scalar("select create_course_recording($1,$2,'2026-11-21','國二數學','A',$3) as value", [recordingId, id(9), JSON.stringify(parts)]);
const parts = () => db.query('select * from recording_parts order by part_no').then((r) => r.rows);
const claim = (part, lease = id(99), channel = 'channel-test') => scalar('select claim_recording_part($1,$2,$3) as value', [part, lease, channel]);
const session = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test';
const update = (part, status = 'uploading', video = null, url = session, lease = id(99)) => db.query(
  'select update_recording_upload($1,$2,$3,$4,$5,$6,$7)', [part, lease, url, video ? 100 : 50, video, status, '']);
const share = (enabled) => db.query('select set_recording_visibility($1,$2,false)', [id(1), enabled]);
const shared = async () => scalar('select get_recording_share(share_token) as value from course_recordings where id=$1', [id(1)]);

before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    create table courses(id uuid primary key,name text);
    insert into courses values('${id(9)}','國二數學');`);
  const sql = readFileSync(new URL('../database/course_recordings.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
});
beforeEach(async () => {
  await db.exec('reset role; truncate course_recordings,recording_parts,recording_settings cascade');
  await db.query("select set_config('test.actor',$1,false)", [id(100)]);
});
after(() => db.close());

test('exact user title format and numeric file order, not copy timestamps', () => {
  assert.equal(helpers.recordingTitle('2026-11-21', '國二數學', 1), '2026-11-21 國二數學 P1');
  assert.equal(helpers.recordingTitle('2026-11-21', ' 國二數學 ', 3), '2026-11-21 國二數學 P3');
  assert.deepEqual(helpers.sortRecordingFiles([{ name: '10.mp4' }, { name: '2.mp4' }, { name: '1.mp4' }]).map((f) => f.name), ['1.mp4', '2.mp4', '10.mp4']);
  assert.deepEqual(helpers.moveRecordingPart([1, 2, 3], 2, -1), [1, 3, 2]);
  assert.deepEqual(helpers.moveRecordingPart([1, 2, 3], 0, -1), [1, 2, 3]);
});
test('reject malformed dates, parts and invalid files', () => {
  for (const args of [['2026-02-30', 'Math', 1], ['2026-11-21', '', 1], ['2026-11-21', '<test>', 1], ['2026-11-21', 'Math', 0], ['2026-11-21', 'Math', 31]]) assert.throws(() => helpers.recordingTitle(...args));
  for (const file of [{ name: 'x.exe', size: 1 }, { name: 'x.mp4', size: 0 }, { name: 'x.mp4', size: 274877906945 }]) assert.throws(() => helpers.validateRecordingFile(file));
  helpers.validateRecordingFile({ name: 'x.MP4', size: 100 });
});
test('fingerprint detects same bytes after renaming and differs for other content', async () => {
  assert.equal(await helpers.recordingFingerprint(new File(['abc'], 'a.mp4')), await helpers.recordingFingerprint(new File(['abc'], 'renamed.mp4')));
  assert.notEqual(await helpers.recordingFingerprint(new File(['abc'], 'a.mp4')), await helpers.recordingFingerprint(new File(['xyz'], 'a.mp4')));
});
test('only exact Google resumable upload hosts receive tokens', () => {
  assert.equal(helpers.safeYoutubeUploadUrl(session), true);
  for (const url of [session.replace('www.googleapis.com', 'www.googleapis.com.evil.test'), session.replace('https:', 'http:'), 'https://www.googleapis.com/youtube/v3/videos', session.replace('www.', 'user@www.')]) assert.equal(helpers.safeYoutubeUploadUrl(url), false);
});
test('create is atomic, preserves ordering and safely idempotent', async () => {
  await create(); await create();
  assert.deepEqual((await parts()).map((p) => [p.part_no, p.file_name, p.status]), files.map((f, i) => [i + 1, f.file_name, 'pending']));
  await assert.rejects(create([files[1], files[0], files[2]]), /已存在/);
  await assert.rejects(create(files, id(2)), /unique/);
});
test('invalid or repeated parts roll back the whole lesson', async () => {
  for (const invalid of [[], [{ ...files[0], file_name: 'a.exe' }], [files[0], files[0]], [{ ...files[0], file_size: -1 }], [{ ...files[0], fingerprint: 'bad' }], Array(31).fill(files[0])]) {
    await assert.rejects(create(invalid));
    assert.equal(await scalar('select count(*)::int as value from course_recordings'), 0);
  }
});
test('lease prevents simultaneous upload and preserves original channel', async () => {
  await create(); const part = (await parts())[0];
  await claim(part.id);
  await assert.rejects(claim(part.id, id(98)), /另一個視窗/);
  await assert.rejects(claim(part.id, id(99), 'other-channel'), /原本/);
  await update(part.id, 'paused');
  await claim(part.id, id(98));
  await assert.rejects(update(part.id), /已被更新/);
});
test('saved resumable session cannot be replaced and completed uploads cannot be repeated', async () => {
  await create(); const part = (await parts())[0]; await claim(part.id); await update(part.id);
  await assert.rejects(update(part.id, 'uploading', null, session + 'changed'), /不可覆蓋/);
  await update(part.id, 'processing', 'abcdefghijk');
  assert.equal((await claim(part.id, id(98))).youtube_id, 'abcdefghijk');
  await assert.rejects(db.query('select recover_recording_part($1,null,null,true)', [part.id]), /不可重複/);
});
test('anonymous callers cannot list private jobs, settings, or invoke admin RPCs', async () => {
  await create();
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from recording_parts'), /permission denied/);
  await assert.rejects(db.query('select * from recording_settings'), /permission denied/);
  await assert.rejects(create(), /permission denied/);
  await db.exec('reset role');
  await db.query("select set_config('test.actor','',false)");
  await assert.rejects(create(), /管理員/);
});
test('share is off by default and blocked until all videos ready', async () => {
  await create(); assert.equal(await shared(), null);
  await assert.rejects(share(true), /每段影片/);
  for (const [i, part] of (await parts()).entries()) {
    await claim(part.id); await update(part.id, 'processing', `abcdefghij${i}`);
    await db.query("select verify_recording_video($1,$2,'ready','')", [part.id, `abcdefghij${i}`]);
  }
  await share(true);
  const value = await shared();
  assert.deepEqual(Object.keys(value).sort(), ['date', 'parts', 'title']);
  assert.deepEqual(Object.keys(value.parts[0]).sort(), ['part', 'videoId']);
  assert.equal(value.parts.length, 3);
  const token = await scalar('select share_token as value from course_recordings');
  await db.exec('set role anon');
  assert.equal((await scalar('select get_recording_share($1) as value', [token])).parts.length, 3);
  assert.equal(await scalar('select get_recording_share($1) as value', [id(888)]), null);
  await db.exec('reset role');
  await share(false); assert.equal(await shared(), null);
  await share(true);
  await db.query('select set_recording_visibility($1,false,true)', [id(1)]);
  assert.equal(await shared(), null);
});
test('recovering an existing video preserves identity and explicit reset only works while idle', async () => {
  await create(); const part = (await parts())[0]; await claim(part.id);
  await assert.rejects(db.query('select recover_recording_part($1,null,null,true)', [part.id]), /仍在上傳/);
  await update(part.id, 'paused');
  await db.query('select recover_recording_part($1,null,null,true)', [part.id]);
  assert.equal((await parts())[0].upload_url, null);
  await db.query("select recover_recording_part($1,'abcdefghijk','channel-test',false)", [part.id]);
  await assert.rejects(db.query("select recover_recording_part($1,'12345678901','channel-test',false)", [part.id]), /不可覆蓋/);
});
test('upload parser validates server range and final video IDs', async () => {
  assert.deepEqual(await upload.readUploadResponse(new Response(null, { status: 308 }), 100), { offset: 0 });
  assert.deepEqual(await upload.readUploadResponse(new Response(null, { status: 308, headers: { Range: 'bytes=0-49' } }), 100), { offset: 50 });
  await assert.rejects(upload.readUploadResponse(new Response(null, { status: 308, headers: { Range: 'bytes=0-150' } }), 100));
  await assert.rejects(upload.readUploadResponse(Response.json({ id: 'bad' }), 100));
});
test('completed but lost final response is probed, never re-uploaded', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'abcdefghijk' }));
  const result = await upload.uploadYoutubeFile({ file: new File(['abc'], 'test.mp4'), url: session, token: () => 'test-token', signal: new AbortController().signal, progress: async () => assert.fail('should not send data') });
  assert.equal(result, 'abcdefghijk'); assert.equal(mock.mock.callCount(), 1);
  assert.equal(mock.mock.calls[0].arguments[1].headers['Content-Range'], 'bytes */3');
});
test('resumes from server bytes rather than stale local progress', async (t) => {
  const responses = [new Response(null, { status: 308, headers: { Range: 'bytes=0-1' } }), Response.json({ id: 'abcdefghijk' }, { status: 201 })];
  const mock = t.mock.method(globalThis, 'fetch', async () => responses.shift());
  const progress = [];
  await upload.uploadYoutubeFile({ file: new File(['abcd'], 'test.mp4'), url: session, token: () => 'test-token', signal: new AbortController().signal, progress: async (bytes) => progress.push(bytes) });
  assert.deepEqual(progress, [2]);
  assert.equal(mock.mock.calls[1].arguments[1].headers['Content-Range'], 'bytes 2-3/4');
  assert.equal(await mock.mock.calls[1].arguments[1].body.text(), 'cd');
});
test('expiry, server failure and invalid URLs do not start replacement uploads', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  await assert.rejects(upload.uploadYoutubeFile({ file: new File(['abc'], 'test.mp4'), url: session, token: () => 'test', signal: new AbortController().signal, progress: async () => {} }), /已過期/);
  assert.equal(mock.mock.callCount(), 1);
  await assert.rejects(upload.uploadYoutubeFile({ file: new File(['abc'], 'test.mp4'), url: 'https://evil.test/', token: () => 'test', signal: new AbortController().signal, progress: async () => {} }));
  assert.equal(mock.mock.callCount(), 1);
});
test('upload creates unlisted videos with the exact agreed title', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 200, headers: { Location: session } }));
  await upload.startYoutubeUpload('test-token', '2026-11-21 國二數學 P3', 123, new AbortController().signal);
  const body = JSON.parse(mock.mock.calls[0].arguments[1].body);
  assert.equal(body.snippet.title, '2026-11-21 國二數學 P3'); assert.equal(body.status.privacyStatus, 'unlisted');
  assert.match(mock.mock.calls[0].arguments[0], /notifySubscribers=false/);
});
test('only processed unlisted videos in the connected channel can be shared', async (t) => {
  const video = { snippet: { channelId: 'channel-test' }, status: { uploadStatus: 'processed', privacyStatus: 'unlisted' } };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ items: [video] }));
  assert.equal((await upload.inspectYoutubeVideo('test', 'abcdefghijk', 'channel-test')).status, 'ready');
  video.status.privacyStatus = 'private';
  assert.equal((await upload.inspectYoutubeVideo('test', 'abcdefghijk', 'channel-test')).status, 'failed');
  await assert.rejects(upload.inspectYoutubeVideo('test', 'abcdefghijk', 'other'), /頻道/);
});
