/**
 * 即時錄影的 WebM 補上總長（core/video/webm.ts）：MediaRecorder 分段錄（timeslice）的檔案沒有寫 Duration，
 * 播放器打開時不知道多長（拖桿、上傳平台會受影響）。錄完把 Segment › Info › Duration 補進檔頭。
 * - fixtures/core-video-recorded.webm：Chromium 的 MediaRecorder 分段錄的 32 × 32 VP8（9 格、約 0.8 秒；沒有 Duration、
 *   Segment 與 Cluster 是未知長度）。
 * - e2e/fixtures/video-anim-clip.webm：ffmpeg 做的（SeekHead、Duration、Cues 都有）：已經有 Duration 的照原值改寫、長度不變。
 * - 自己組的最小 WebM：已知長度的 Segment 要跟著加長；有 SeekHead 但沒有 Duration（插進去會讓位置表失準）＝不動。
 */
import { describe, expect, it } from 'vitest';
import { readWebmDuration, webmLastTimestampMs, withWebmDuration } from '@/core/video';

const FS = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS)) as {
  readFileSync: (p: string) => Uint8Array;
};
const CWD = (globalThis as { process?: { cwd: () => string } }).process?.cwd();
const recorded = new Uint8Array(
  readFileSync(`${CWD}/tests/unit/fixtures/core-video-recorded.webm`),
);
const ffmpeg = new Uint8Array(readFileSync(`${CWD}/tests/e2e/fixtures/video-anim-clip.webm`));

/* ---- 自己組 EBML（測試用） ---- */
const idBytes = (id: number) => {
  const out: number[] = [];
  let v = id;
  while (v > 0) {
    out.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return out;
};
const size8 = (n: number) => {
  const out = [0x01];
  for (let i = 6; i >= 0; i--) out.push(Math.floor(n / 2 ** (8 * i)) & 0xff);
  return out;
};
const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const el = (id: number, data: number[], unknown = false) => [
  ...idBytes(id),
  ...(unknown ? UNKNOWN : size8(data.length)),
  ...data,
];
const uint = (id: number, v: number) => el(id, [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
const block = (rel: number) => el(0xa3, [0x81, (rel >> 8) & 0xff, rel & 0xff, 0x80, 0, 0]);
function webm(opts: { segmentKnown?: boolean; seekHead?: boolean } = {}): Uint8Array {
  const header = el(0x1a45dfa3, el(0x4282, [...new TextEncoder().encode('webm')]));
  const info = el(0x1549a966, [...uint(0x2ad7b1, 1_000_000), ...el(0x4d80, [0x41])]);
  const tracks = el(0x1654ae6b, el(0xae, uint(0xd7, 1)));
  const c1 = el(0x1f43b675, [...uint(0xe7, 0), ...block(0), ...block(50), ...block(100)], true);
  const c2 = el(0x1f43b675, [...uint(0xe7, 150), ...block(0), ...block(50)], true);
  const seek = opts.seekHead ? el(0x114d9b74, el(0x4dbb, uint(0x53ac, 30))) : [];
  const body = [...seek, ...info, ...tracks, ...c1, ...c2];
  const seg = opts.segmentKnown ? el(0x18538067, body) : el(0x18538067, body, true);
  return new Uint8Array([...header, ...seg]);
}
const blob = (b: Uint8Array) => new Blob([b as BlobPart], { type: 'video/webm' });
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe('即時錄影的 WebM：補上總長', () => {
  it('MediaRecorder 分段錄的檔：沒有 Duration → 補上最後一格的時間；其他位元組不變', async () => {
    expect(readWebmDuration(recorded)).toBeNull();
    const last = webmLastTimestampMs(recorded);
    expect(last).toBeGreaterThan(700);
    expect(last).toBeLessThan(900);
    const out = await bytesOf(await withWebmDuration(blob(recorded)));
    expect(readWebmDuration(out)).toBeCloseTo(last ?? 0, 6);
    /* 只在 Info 裡多了 Duration（11 個位元組），Cluster 的資料原封不動 */
    expect(out.length).toBe(recorded.length + 11);
    expect(out.slice(-600)).toEqual(recorded.slice(-600));
    expect(webmLastTimestampMs(out)).toBe(last);
  });

  it('給了總長就照給的寫（毫秒）', async () => {
    const out = await bytesOf(await withWebmDuration(blob(recorded), { durationMs: 4242 }));
    expect(readWebmDuration(out)).toBeCloseTo(4242, 6);
  });

  it('已經有 Duration（ffmpeg 的檔）：給了總長＝照原位改寫（長度與 SeekHead、Cues 的位置都不變）；沒給＝不動', async () => {
    const before = readWebmDuration(ffmpeg);
    expect(before).toBeGreaterThan(2900);
    const out = await bytesOf(await withWebmDuration(blob(ffmpeg), { durationMs: 3000 }));
    expect(out.length).toBe(ffmpeg.length);
    expect(readWebmDuration(out)).toBeCloseTo(3000, 6);
    /* 不給總長：已經寫好的就不動 */
    const out2 = await bytesOf(await withWebmDuration(blob(ffmpeg)));
    expect(out2).toEqual(ffmpeg);
  });

  it('自己組的檔：未知長度的 Cluster 也讀得到最後一格（150 ＋ 50）；已知長度的 Segment 跟著加長', async () => {
    const a = webm();
    expect(webmLastTimestampMs(a)).toBe(200);
    const outA = await bytesOf(await withWebmDuration(blob(a)));
    expect(readWebmDuration(outA)).toBe(200);
    const k = webm({ segmentKnown: true });
    const outK = await bytesOf(await withWebmDuration(blob(k)));
    expect(readWebmDuration(outK)).toBe(200);
    expect(outK.length).toBe(k.length + 11);
    /* Segment 的長度欄＝新的內容長度 */
    const segSizeAt = outK.indexOf(0x67) + 1;
    let seg = 0;
    for (let i = 1; i < 8; i++) seg = seg * 256 + outK[segSizeAt + i];
    expect(seg).toBe(outK.length - (segSizeAt + 8));
  });

  it('有 SeekHead、沒有 Duration（插進去位置表會失準）、不是 WebM、讀不懂的檔：原封不動', async () => {
    const s = webm({ seekHead: true });
    expect(await bytesOf(await withWebmDuration(blob(s)))).toEqual(s);
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    expect(await bytesOf(await withWebmDuration(blob(junk)))).toEqual(junk);
    const mp4 = new Blob([new Uint8Array(16)], { type: 'video/mp4' });
    expect(await withWebmDuration(mp4)).toBe(mp4);
  });
});
