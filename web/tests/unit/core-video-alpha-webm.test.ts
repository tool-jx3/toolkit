/**
 * 透明 WebM（core/video 的 webmMux.ts、alpha.ts；lyric-fx 規格 3.9.2）：
 * - muxWebm：解析組出來的檔案，檢查 EBML 檔頭、已知長度的 Segment、SeekHead 指到的位置、Tracks（AlphaMode、Colour、Opus）、
 *   Cluster 的 BlockGroup（BlockAdditional＝透明度那一路的資料、非關鍵影格的 ReferenceBlock）、聲音的 SimpleBlock、Cues 指到的 Cluster。
 * - rgbaToI420Alpha：BT.709 有限範圍、透明度加權的色差、透明度那一路（Y＝A、U＝V＝128）。
 */
import { describe, expect, it } from 'vitest';
import { muxWebm, opusHead, readWebmDuration, rgbaToI420Alpha, vintSize } from '@/core/video';

interface Ebml {
  id: number;
  start: number;
  data: number;
  size: number;
  children?: Ebml[];
}

const MASTER = new Set([
  0x1a45dfa3, 0x18538067, 0x114d9b74, 0x4dbb, 0x1549a966, 0x1654ae6b, 0xae, 0xe0, 0xe1, 0x55b0,
  0x1f43b675, 0xa0, 0x75a1, 0xa6, 0x1c53bb6b, 0xbb, 0xb7,
]);

function vlen(b: number) {
  for (let l = 1; l <= 8; l++) if (b & (0x100 >> l)) return l;
  return 0;
}

function parse(bytes: Uint8Array, from = 0, to = bytes.length): Ebml[] {
  const out: Ebml[] = [];
  let p = from;
  while (p < to) {
    const il = vlen(bytes[p]);
    let id = 0;
    for (let i = 0; i < il; i++) id = id * 256 + bytes[p + i];
    const sp = p + il;
    const sl = vlen(bytes[sp]);
    let size = bytes[sp] & (0xff >> sl);
    for (let i = 1; i < sl; i++) size = size * 256 + bytes[sp + i];
    const data = sp + sl;
    const e: Ebml = { id, start: p, data, size };
    if (MASTER.has(id)) e.children = parse(bytes, data, data + size);
    out.push(e);
    p = data + size;
  }
  expect(p).toBe(to);
  return out;
}

const uint = (b: Uint8Array, e: Ebml) => {
  let v = 0;
  for (let i = 0; i < e.size; i++) v = v * 256 + b[e.data + i];
  return v;
};
const str = (b: Uint8Array, e: Ebml) => new TextDecoder().decode(b.subarray(e.data, e.data + e.size));
const find = (list: Ebml[] | undefined, id: number) => list?.find((x) => x.id === id);
const all = (list: Ebml[] | undefined, id: number) => list?.filter((x) => x.id === id) ?? [];

const concat = (parts: (Uint8Array | Blob)[]) => {
  const arrs = parts.map((p) => p as Uint8Array);
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.byteLength, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.byteLength;
  }
  return out;
};

describe('vintSize', () => {
  it('最短的寫法；全部是 1 的值多用一個位元組', () => {
    expect([...vintSize(0)]).toEqual([0x80]);
    expect([...vintSize(126)]).toEqual([0xfe]);
    expect([...vintSize(127)]).toEqual([0x40, 0x7f]);
    expect([...vintSize(300)]).toEqual([0x41, 0x2c]);
  });
});

describe('muxWebm（透明度＋Opus）', () => {
  const fps = 30;
  const video = Array.from({ length: 70 }, (_, i) => ({
    data: new Uint8Array([0xc0, i, 1, 2, 3]),
    alpha: new Uint8Array([0xa0, i]),
    key: i % 60 === 0,
    timestampMs: Math.round((i * 1000) / fps),
  }));
  const audioFrames = Array.from({ length: 120 }, (_, i) => ({
    data: new Uint8Array([0x0a, i & 0xff]),
    timestampMs: i * 20,
  }));
  const head = opusHead(2, 312, 48000);
  const bytes = concat(
    muxWebm({
      width: 640,
      height: 360,
      fps,
      codec: 'V_VP9',
      alpha: true,
      durationMs: (70 * 1000) / fps,
      video,
      audio: { codecPrivate: head, sampleRate: 48000, channels: 2, preSkip: 312, frames: audioFrames },
      app: 'test',
    }),
  );
  const top = parse(bytes);

  it('EBML 檔頭與已知長度的 Segment', () => {
    expect(top.map((e) => e.id)).toEqual([0x1a45dfa3, 0x18538067]);
    expect(str(bytes, find(top[0].children, 0x4282)!)).toBe('webm');
    expect(uint(bytes, find(top[0].children, 0x4287)!)).toBe(4);
    expect(top[1].data + top[1].size).toBe(bytes.length);
    expect(readWebmDuration(bytes)).toBeCloseTo((70 * 1000) / fps, 6);
  });

  const seg = top[1];
  const segData = seg.data;

  it('SeekHead 指到 Info、Tracks、Cues', () => {
    const seeks = all(find(seg.children, 0x114d9b74)?.children, 0x4dbb);
    expect(seeks).toHaveLength(3);
    for (const s of seeks) {
      const idEl = find(s.children, 0x53ab)!;
      let id = 0;
      for (let i = 0; i < idEl.size; i++) id = id * 256 + bytes[idEl.data + i];
      const pos = uint(bytes, find(s.children, 0x53ac)!);
      const target = seg.children!.find((c) => c.start === segData + pos);
      expect(target?.id).toBe(id);
    }
  });

  it('Tracks：VP9＋AlphaMode 1＋BT.709、Opus（CodecPrivate、CodecDelay、SeekPreRoll）', () => {
    const entries = all(find(seg.children, 0x1654ae6b)?.children, 0xae);
    expect(entries).toHaveLength(2);
    const v = entries[0].children!;
    expect(str(bytes, find(v, 0x86)!)).toBe('V_VP9');
    expect(uint(bytes, find(v, 0x55ee)!)).toBe(1);
    expect(uint(bytes, find(v, 0x23e383)!)).toBe(Math.round(1e9 / 30));
    const vid = find(v, 0xe0)!.children!;
    expect(uint(bytes, find(vid, 0xb0)!)).toBe(640);
    expect(uint(bytes, find(vid, 0xba)!)).toBe(360);
    expect(uint(bytes, find(vid, 0x53c0)!)).toBe(1);
    const colour = find(vid, 0x55b0)!.children!;
    expect(uint(bytes, find(colour, 0x55b1)!)).toBe(1);
    expect(uint(bytes, find(colour, 0x55b9)!)).toBe(1);
    const a = entries[1].children!;
    expect(str(bytes, find(a, 0x86)!)).toBe('A_OPUS');
    const cp = find(a, 0x63a2)!;
    expect([...bytes.subarray(cp.data, cp.data + cp.size)]).toEqual([...head]);
    expect(uint(bytes, find(a, 0x56aa)!)).toBe(Math.round((312 / 48000) * 1e9));
    expect(uint(bytes, find(a, 0x56bb)!)).toBe(80_000_000);
  });

  it('Cluster：每個關鍵影格一個；BlockGroup 的透明度、ReferenceBlock；聲音的 SimpleBlock', () => {
    const clusters = all(seg.children, 0x1f43b675);
    expect(clusters).toHaveLength(2);
    expect(uint(bytes, find(clusters[0].children, 0xe7)!)).toBe(0);
    expect(uint(bytes, find(clusters[1].children, 0xe7)!)).toBe(2000);
    let videoCount = 0;
    let audioCount = 0;
    let lastAbs = -1;
    for (const c of clusters) {
      const base = uint(bytes, find(c.children, 0xe7)!);
      for (const b of c.children!.slice(1)) {
        if (b.id === 0xa0) {
          const block = find(b.children, 0xa1)!;
          expect(bytes[block.data]).toBe(0x81);
          const rel = new DataView(bytes.buffer, block.data + 1, 2).getInt16(0);
          const i = videoCount++;
          expect(base + rel).toBe(video[i].timestampMs);
          expect([...bytes.subarray(block.data + 4, block.data + block.size)]).toEqual([...video[i].data]);
          const add = find(find(find(b.children, 0x75a1)?.children, 0xa6)?.children, 0xa5)!;
          expect([...bytes.subarray(add.data, add.data + add.size)]).toEqual([...video[i].alpha]);
          expect(!!find(b.children, 0xfb)).toBe(!video[i].key);
          expect(base + rel).toBeGreaterThanOrEqual(lastAbs);
          lastAbs = base + rel;
        } else if (b.id === 0xa3) {
          expect(bytes[b.data]).toBe(0x82);
          expect(bytes[b.data + 3]).toBe(0x80);
          audioCount++;
        }
      }
    }
    expect(videoCount).toBe(70);
    expect(audioCount).toBe(120);
  });

  it('Cues 指到每個 Cluster', () => {
    const clusters = all(seg.children, 0x1f43b675);
    const points = all(find(seg.children, 0x1c53bb6b)?.children, 0xbb);
    expect(points).toHaveLength(2);
    points.forEach((p, i) => {
      const tp = find(p.children, 0xb7)!.children!;
      expect(uint(bytes, find(tp, 0xf7)!)).toBe(1);
      expect(segData + uint(bytes, find(tp, 0xf1)!)).toBe(clusters[i].start);
      expect(uint(bytes, find(p.children, 0xb3)!)).toBe(i * 2000);
    });
  });

  it('沒有透明度：SimpleBlock（關鍵影格旗標）', () => {
    const b = concat(
      muxWebm({
        width: 4,
        height: 4,
        fps: 10,
        codec: 'V_VP8',
        durationMs: 300,
        video: [0, 1, 2].map((i) => ({ data: new Uint8Array([i]), key: i === 0, timestampMs: i * 100 })),
      }),
    );
    const s = parse(b)[1];
    const blocks = all(find(s.children, 0x1f43b675)?.children, 0xa3);
    expect(blocks.map((x) => b[x.data + 3])).toEqual([0x80, 0, 0]);
    expect(find(find(find(s.children, 0x1654ae6b)?.children, 0xae)?.children, 0x55ee)).toBeUndefined();
  });
});

describe('rgbaToI420Alpha', () => {
  it('BT.709 有限範圍；透明度那一路 Y＝A、U＝V＝128；透明的像素不把色差染黑', () => {
    const w = 4;
    const h = 2;
    const rgba = new Uint8ClampedArray(w * h * 4);
    const set = (x: number, y: number, r: number, g: number, b: number, a: number) =>
      rgba.set([r, g, b, a], (y * w + x) * 4);
    /* 左邊 2 × 2：白，右邊 2 × 2：一半紅、一半透明 */
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])
      set(x, y, 255, 255, 255, 255);
    set(2, 0, 255, 0, 0, 255);
    set(3, 1, 255, 0, 0, 128);
    const color = new Uint8Array(w * h * 1.5);
    const alpha = new Uint8Array(w * h * 1.5);
    rgbaToI420Alpha(rgba, w, h, color, alpha);
    expect(color[0]).toBe(235);
    expect(color[w * h]).toBe(128);
    expect(color[w * h + 2]).toBe(128);
    /* 紅：Y＝16＋0.2126 × 219、Cr 偏高；透明的像素的亮度用同一格的平均色（不是黑） */
    expect(color[2]).toBe(Math.round(16 + 0.2126 * 219));
    expect(color[3]).toBe(Math.round(16 + 0.2126 * 219));
    expect(color[w * h + 1]).toBeLessThan(128);
    expect(color[w * h + 2 + 1]).toBeGreaterThan(200);
    expect([...alpha.subarray(0, w * h)]).toEqual([255, 255, 255, 0, 255, 255, 0, 128]);
    expect([...alpha.subarray(w * h)].every((v) => v === 128)).toBe(true);
  });
});
