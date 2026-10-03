/**
 * core/video 的影片封裝（純函式）：MP4 的檔頭（ftyp＋moov＋mdat 標頭）、AVI 的各段、H.264 的編碼設定候選。
 */
import { describe, expect, it } from 'vitest';
import { aviParts, mp4Bitrate, mp4ConfigCandidates, mp4Header } from '@/core/video/encode';

const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o);
const le32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o, true);
const le16 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint16(o, true);
const ascii = (b: Uint8Array, o: number, n = 4) => String.fromCharCode(...b.subarray(o, o + n));

/** MP4 的 box 樹：[{ type, start, size, children? }] */
interface Box {
  type: string;
  start: number;
  size: number;
  children?: Box[];
}
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf']);
function parseBoxes(b: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = [];
  let o = start;
  while (o + 8 <= end) {
    const size = u32(b, o);
    const type = ascii(b, o + 4);
    const box: Box = { type, start: o, size };
    if (CONTAINERS.has(type)) box.children = parseBoxes(b, o + 8, Math.min(end, o + size));
    out.push(box);
    if (type === 'mdat') break;
    o += size;
  }
  return out;
}
const find = (boxes: Box[], path: string[]): Box | undefined => {
  let cur: Box | undefined;
  let list = boxes;
  for (const t of path) {
    cur = list.find((x) => x.type === t);
    if (!cur) return undefined;
    list = cur.children ?? [];
  }
  return cur;
};

describe('mp4Header', () => {
  const sizes = [100, 37, 250];
  const desc = new Uint8Array([1, 0x42, 0, 0x1f, 0xff, 0xe1, 0]);
  const head = mp4Header(sizes, desc, 640, 360, 30);
  const boxes = parseBoxes(head, 0, head.length);
  it('ftyp、moov、mdat 依序；mdat 的大小＝資料總量 + 8', () => {
    expect(boxes.map((b) => b.type)).toEqual(['ftyp', 'moov', 'mdat']);
    expect(ascii(head, 8)).toBe('isom');
    const mdat = boxes[2];
    expect(mdat.size).toBe(8 + 387);
    expect(mdat.start + 8).toBe(head.length);
  });
  it('mvhd／mdhd 的時間單位＝FPS、長度＝影格數', () => {
    const mvhd = find(boxes, ['moov', 'mvhd'])!;
    expect(u32(head, mvhd.start + 20)).toBe(30);
    expect(u32(head, mvhd.start + 24)).toBe(3);
    const mdhd = find(boxes, ['moov', 'trak', 'mdia', 'mdhd'])!;
    expect(u32(head, mdhd.start + 20)).toBe(30);
    expect(u32(head, mdhd.start + 24)).toBe(3);
  });
  it('tkhd 的寬高（16.16）、avc1 的寬高與 avcC', () => {
    const tkhd = find(boxes, ['moov', 'trak', 'tkhd'])!;
    expect(u32(head, tkhd.start + tkhd.size - 8)).toBe(640 * 65536);
    expect(u32(head, tkhd.start + tkhd.size - 4)).toBe(360 * 65536);
    const stsd = find(boxes, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd'])!;
    const avc1 = stsd.start + 16;
    expect(ascii(head, avc1 + 4)).toBe('avc1');
    expect(new DataView(head.buffer).getUint16(avc1 + 32)).toBe(640);
    expect(new DataView(head.buffer).getUint16(avc1 + 34)).toBe(360);
    const avcC = avc1 + 86;
    expect(ascii(head, avcC + 4)).toBe('avcC');
    expect([...head.subarray(avcC + 8, avcC + 8 + desc.length)]).toEqual([...desc]);
  });
  it('stts（每格 1 單位）、stsz（每格大小）、stco（資料的位移）、stss（全部是同步樣本）', () => {
    const stbl = ['moov', 'trak', 'mdia', 'minf', 'stbl'];
    const stts = find(boxes, [...stbl, 'stts'])!;
    expect([
      u32(head, stts.start + 12),
      u32(head, stts.start + 16),
      u32(head, stts.start + 20),
    ]).toEqual([1, 3, 1]);
    const stsz = find(boxes, [...stbl, 'stsz'])!;
    expect(u32(head, stsz.start + 16)).toBe(3);
    expect([0, 1, 2].map((i) => u32(head, stsz.start + 20 + i * 4))).toEqual(sizes);
    const stco = find(boxes, [...stbl, 'stco'])!;
    expect(u32(head, stco.start + 16)).toBe(head.length);
    const stss = find(boxes, [...stbl, 'stss'])!;
    expect(u32(head, stss.start + 12)).toBe(3);
    expect([0, 1, 2].map((i) => u32(head, stss.start + 16 + i * 4))).toEqual([1, 2, 3]);
  });
});

describe('aviParts', () => {
  const sizes = [1001, 500, 777];
  const p = aviParts(sizes, 320, 180, 12);
  it('RIFF AVI 標頭：檔案大小、avih（每格微秒、影格數、尺寸、有索引）', () => {
    expect(ascii(p.head, 0)).toBe('RIFF');
    expect(le32(p.head, 4)).toBe(p.fileSize - 8);
    expect(ascii(p.head, 8)).toBe('AVI ');
    expect(ascii(p.head, 12)).toBe('LIST');
    expect(ascii(p.head, 20)).toBe('hdrl');
    expect(ascii(p.head, 24)).toBe('avih');
    const avih = 32;
    expect(le32(p.head, avih)).toBe(Math.round(1_000_000 / 12));
    expect(le32(p.head, avih + 12)).toBe(0x10);
    expect(le32(p.head, avih + 16)).toBe(3);
    expect(le32(p.head, avih + 28)).toBe(1001);
    expect(le32(p.head, avih + 32)).toBe(320);
    expect(le32(p.head, avih + 36)).toBe(180);
  });
  it('strh：vids／MJPG、速率＝FPS、長度＝影格數；movi 的 LIST', () => {
    const strh = ascii(p.head, 0, p.head.length).indexOf('strh');
    expect(ascii(p.head, strh + 8, 8)).toBe('vidsMJPG');
    expect(le32(p.head, strh + 8 + 24)).toBe(12);
    expect(le32(p.head, strh + 8 + 32)).toBe(3);
    expect(le16(p.head, strh + 8 + 52)).toBe(320);
    const movi = p.head.length - 12;
    expect(ascii(p.head, movi)).toBe('LIST');
    const movieSize = sizes.reduce((a, s) => a + 8 + s + (s % 2), 0);
    expect(le32(p.head, movi + 4)).toBe(movieSize + 4);
    expect(ascii(p.head, movi + 8)).toBe('movi');
  });
  it('每格的標頭與補位；idx1 的位移從 movi 算起', () => {
    expect(ascii(p.chunkHeader(0), 0)).toBe('00dc');
    expect(le32(p.chunkHeader(0), 4)).toBe(1001);
    expect(p.padding(0).length).toBe(1);
    expect(p.padding(1).length).toBe(0);
    expect(ascii(p.index, 0)).toBe('idx1');
    expect(le32(p.index, 4)).toBe(48);
    const entry = (i: number) => [
      ascii(p.index, 8 + i * 16),
      le32(p.index, 12 + i * 16),
      le32(p.index, 16 + i * 16),
      le32(p.index, 20 + i * 16),
    ];
    expect(entry(0)).toEqual(['00dc', 0x10, 4, 1001]);
    expect(entry(1)).toEqual(['00dc', 0x10, 4 + 8 + 1002, 500]);
    expect(entry(2)).toEqual(['00dc', 0x10, 4 + 8 + 1002 + 8 + 500, 777]);
  });
  it('檔案大小＝標頭＋影格＋索引', () => {
    const frames = sizes.reduce((a, s) => a + 8 + s + (s % 2), 0);
    expect(p.fileSize).toBe(p.head.length + frames + p.index.length);
  });
});

describe('H.264 的編碼設定', () => {
  it('位元率＝min(5,000 萬, max(200 萬, 寬 × 高 × FPS × 0.6))', () => {
    expect(mp4Bitrate(640, 360, 10)).toBe(2_000_000);
    expect(mp4Bitrate(1920, 1080, 30)).toBe(Math.round(1920 * 1080 * 30 * 0.6));
    expect(mp4Bitrate(4096, 4096, 60)).toBe(50_000_000);
  });
  it('依等級由低到高，每個等級試 Baseline、Main、High；奇數尺寸沒有候選', () => {
    /* 960 × 540＝2040 個巨集區塊，超過 3.0 的 1620，從 3.1 開始 */
    const list = mp4ConfigCandidates({ width: 960, height: 540, fps: 10 });
    expect(list.slice(0, 3).map((c) => c.codec)).toEqual([
      'avc1.42001f',
      'avc1.4d001f',
      'avc1.64001f',
    ]);
    expect(list[0]).toMatchObject({
      width: 960,
      height: 540,
      framerate: 10,
      avc: { format: 'avc' },
    });
    expect(mp4ConfigCandidates({ width: 961, height: 540, fps: 10 })).toEqual([]);
    /* 1920 × 1080、60 FPS：超過 4.0 的每秒巨集區塊數，從 4.2 開始 */
    expect(mp4ConfigCandidates({ width: 1920, height: 1080, fps: 60 })[0].codec).toBe(
      'avc1.42002a',
    );
  });
});
