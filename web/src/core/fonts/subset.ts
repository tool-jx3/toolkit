/**
 * TrueType 子集（PDF 嵌入用；劇本排版台修正時新增）。
 *
 * pdf-lib 內建的子集（@pdf-lib/fontkit 的 TTFSubset）有兩個問題，CJK 字型的 PDF 會缺字：
 * 子集的字形資料總長在 64 KB 以內時改用短格式的 loca（位置 ÷ 2），而原字型的字形長度可以是奇數，之後的字形全部錯位；
 * WOFF2（例如 Google Fonts 的 text= 子集）的 glyf 是轉換過的格式，它照原樣複製，字形全壞。
 * 所以自己做：讀 fontkit 解出來的外框（複合字形已攤平），只收用到的字形、重新編號，寫成單純字形（不含 hinting），
 * loca 一律長格式；另附 cmap（format 4＋12）、hmtx、name、post（3.0），fontkit 與 PDF 檢視器都能讀。
 * 只處理 TrueType 外框（二次曲線）；CFF 外框（三次曲線）請用 pdf-lib 自己的子集。
 */

/** 用到的 fontkit 介面（@pdf-lib/fontkit 的字型物件） */
export interface SubsetSourceFont {
  unitsPerEm: number;
  postscriptName?: string | null;
  familyName?: string | null;
  subfamilyName?: string | null;
  hhea: { ascent: number; descent: number; lineGap: number };
  head?: { macStyle?: { bold?: boolean; italic?: boolean } | number; fontRevision?: number };
  post?: {
    italicAngle?: number;
    underlinePosition?: number;
    underlineThickness?: number;
    isFixedPitch?: number | boolean;
  };
  getGlyph(id: number): SubsetSourceGlyph;
  glyphForCodePoint(cp: number): SubsetSourceGlyph;
  hasGlyphForCodePoint(cp: number): boolean;
}

export interface SubsetSourceGlyph {
  id: number;
  advanceWidth: number;
  path: { commands: readonly { command: string; args: readonly number[] }[] };
}

interface Pt {
  x: number;
  y: number;
  on: boolean;
}

/** 外框的路徑 → TrueType 的輪廓（座標取整數；三次曲線不支援，丟錯） */
export function pathToContours(
  commands: readonly { command: string; args: readonly number[] }[],
): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  const close = () => {
    if (cur.length > 1) {
      const a = cur[0];
      const z = cur[cur.length - 1];
      if (z.on && a.on && z.x === a.x && z.y === a.y) cur.pop();
    }
    if (cur.length) out.push(cur);
    cur = [];
  };
  const r = Math.round;
  for (const { command, args } of commands) {
    if (command === 'moveTo') {
      close();
      cur.push({ x: r(args[0]), y: r(args[1]), on: true });
    } else if (command === 'lineTo') cur.push({ x: r(args[0]), y: r(args[1]), on: true });
    else if (command === 'quadraticCurveTo') {
      cur.push({ x: r(args[0]), y: r(args[1]), on: false });
      cur.push({ x: r(args[2]), y: r(args[3]), on: true });
    } else if (command === 'closePath') close();
    else throw new Error(`TrueType 子集不支援 ${command}`);
  }
  close();
  return out;
}

/* ---------- 位元組 ---------- */

class Writer {
  private buf = new Uint8Array(1024);
  len = 0;
  private grow(n: number) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  u8(v: number) {
    this.grow(1);
    this.buf[this.len++] = v & 0xff;
  }
  u16(v: number) {
    this.u8(v >> 8);
    this.u8(v);
  }
  i16(v: number) {
    this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number) {
    this.u16(Math.floor(v / 0x10000) & 0xffff);
    this.u16(v & 0xffff);
  }
  /** 16.16 固定小數 */
  fixed(v: number) {
    const n = Math.round(v * 65536);
    this.u32(n < 0 ? n + 0x100000000 : n);
  }
  bytes(b: Uint8Array) {
    this.grow(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }
  pad4() {
    while (this.len % 4) this.u8(0);
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/* ---------- 字形 ---------- */

interface Encoded {
  data: Uint8Array;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  points: number;
  contours: number;
}

function encodeGlyph(contours: Pt[][]): Encoded {
  const pts = contours.flat();
  if (!pts.length)
    return { data: new Uint8Array(0), xMin: 0, yMin: 0, xMax: 0, yMax: 0, points: 0, contours: 0 };
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const p of pts) {
    xMin = Math.min(xMin, p.x);
    yMin = Math.min(yMin, p.y);
    xMax = Math.max(xMax, p.x);
    yMax = Math.max(yMax, p.y);
  }
  const w = new Writer();
  w.i16(contours.length);
  w.i16(xMin);
  w.i16(yMin);
  w.i16(xMax);
  w.i16(yMax);
  let end = -1;
  for (const c of contours) {
    end += c.length;
    w.u16(end);
  }
  w.u16(0); // 沒有 hinting
  const flags: number[] = [];
  const xs = new Writer();
  const ys = new Writer();
  let px = 0;
  let py = 0;
  for (const p of pts) {
    let f = p.on ? 1 : 0;
    const dx = p.x - px;
    const dy = p.y - py;
    if (dx === 0) f |= 0x10;
    else if (Math.abs(dx) < 256) {
      f |= 0x02 | (dx > 0 ? 0x10 : 0);
      xs.u8(Math.abs(dx));
    } else xs.i16(dx);
    if (dy === 0) f |= 0x20;
    else if (Math.abs(dy) < 256) {
      f |= 0x04 | (dy > 0 ? 0x20 : 0);
      ys.u8(Math.abs(dy));
    } else ys.i16(dy);
    flags.push(f);
    px = p.x;
    py = p.y;
  }
  for (const f of flags) w.u8(f);
  w.bytes(xs.done());
  w.bytes(ys.done());
  w.pad4();
  return { data: w.done(), xMin, yMin, xMax, yMax, points: pts.length, contours: contours.length };
}

/* ---------- 表 ---------- */

function cmapTable(map: readonly [number, number][]): Uint8Array {
  const sorted = [...map].sort((a, b) => a[0] - b[0]);
  /* format 4（BMP）：連續、間隔相同的碼位併成一段 */
  const bmp = sorted.filter(([cp]) => cp < 0xffff);
  const segs: { start: number; end: number; delta: number }[] = [];
  for (const [cp, gid] of bmp) {
    const last = segs[segs.length - 1];
    const delta = (gid - cp + 0x10000) % 0x10000;
    if (last && last.end === cp - 1 && last.delta === delta) last.end = cp;
    else segs.push({ start: cp, end: cp, delta });
  }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const f4 = new Writer();
  const n = segs.length;
  const sr = 2 ** Math.floor(Math.log2(n)) * 2;
  f4.u16(4);
  f4.u16(16 + n * 8);
  f4.u16(0);
  f4.u16(n * 2);
  f4.u16(sr);
  f4.u16(Math.log2(sr / 2));
  f4.u16(n * 2 - sr);
  for (const s of segs) f4.u16(s.end);
  f4.u16(0);
  for (const s of segs) f4.u16(s.start);
  for (const s of segs) f4.u16(s.delta);
  for (const _ of segs) f4.u16(0);
  /* format 12（全部） */
  const groups: { start: number; end: number; gid: number }[] = [];
  for (const [cp, gid] of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.end === cp - 1 && last.gid + (cp - last.start) === gid) last.end = cp;
    else groups.push({ start: cp, end: cp, gid });
  }
  const f12 = new Writer();
  f12.u16(12);
  f12.u16(0);
  f12.u32(16 + groups.length * 12);
  f12.u32(0);
  f12.u32(groups.length);
  for (const g of groups) {
    f12.u32(g.start);
    f12.u32(g.end);
    f12.u32(g.gid);
  }
  /* format 4 的長度是 16 位元：字太多（約 8000 段以上）時只放 format 12 */
  const a = 16 + n * 8 <= 0xffff ? f4.done() : null;
  const w = new Writer();
  w.u16(0);
  w.u16(a ? 2 : 1);
  if (a) {
    w.u16(3);
    w.u16(1);
    w.u32(4 + 2 * 8);
  }
  w.u16(3);
  w.u16(10);
  w.u32(a ? 4 + 2 * 8 + a.length : 4 + 8);
  if (a) w.bytes(a);
  w.bytes(f12.done());
  return w.done();
}

function nameTable(records: readonly [number, string][]): Uint8Array {
  const strs = records.map(([id, s]) => {
    const b = new Writer();
    for (const ch of s) {
      const c = ch.codePointAt(0) ?? 0x3f;
      if (c > 0xffff) {
        const v = c - 0x10000;
        b.u16(0xd800 + (v >> 10));
        b.u16(0xdc00 + (v & 0x3ff));
      } else b.u16(c);
    }
    return { id, data: b.done() };
  });
  const w = new Writer();
  w.u16(0);
  w.u16(strs.length);
  w.u16(6 + strs.length * 12);
  let off = 0;
  for (const s of strs) {
    w.u16(3);
    w.u16(1);
    w.u16(0x409);
    w.u16(s.id);
    w.u16(s.data.length);
    w.u16(off);
    off += s.data.length;
  }
  for (const s of strs) w.bytes(s.data);
  return w.done();
}

function checksum(b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < b.length; i += 4)
    sum =
      (sum +
        ((b[i] << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0))) >>>
      0;
  return sum;
}

function sfnt(tables: Record<string, Uint8Array>): Uint8Array {
  const tags = Object.keys(tables).sort();
  const n = tags.length;
  const sr = 2 ** Math.floor(Math.log2(n)) * 16;
  const w = new Writer();
  w.u32(0x00010000);
  w.u16(n);
  w.u16(sr);
  w.u16(Math.log2(sr / 16));
  w.u16(n * 16 - sr);
  let off = 12 + n * 16;
  const offs: number[] = [];
  for (const t of tags) {
    offs.push(off);
    off += Math.ceil(tables[t].length / 4) * 4;
  }
  tags.forEach((t, i) => {
    for (const c of t.padEnd(4, ' ')) w.u8(c.charCodeAt(0));
    w.u32(checksum(tables[t]));
    w.u32(offs[i]);
    w.u32(tables[t].length);
  });
  for (const t of tags) {
    w.bytes(tables[t]);
    w.pad4();
  }
  const out = w.done();
  /* head 的 checkSumAdjustment */
  const hi = tags.indexOf('head');
  const adj = (0xb1b0afba - checksum(out) + 0x100000000) % 0x100000000;
  const p = offs[hi] + 8;
  out[p] = adj >>> 24;
  out[p + 1] = (adj >>> 16) & 0xff;
  out[p + 2] = (adj >>> 8) & 0xff;
  out[p + 3] = adj & 0xff;
  return out;
}

/** PostScript 名稱（ASCII、不含空白與特殊字元） */
function psName(f: SubsetSourceFont): string {
  const raw = String(f.postscriptName || f.familyName || '').replace(
    /[^\x21-\x7e]|[[\](){}<>/%]/g,
    '',
  );
  return raw.slice(0, 60) || 'TKSubset';
}

/**
 * 做出只含這些字的 TrueType 字型檔（字形重新編號，0 號是原字型的 .notdef）。
 * 字型沒有的字略過。回傳的檔案可以直接用 fontkit 讀，也可以整個嵌入 PDF（pdf-lib 的 `embedFont(bytes, { subset: false })`）。
 */
export function ttfSubset(font: SubsetSourceFont, codePoints: Iterable<number>): Uint8Array {
  const order: number[] = [0];
  const newId = new Map<number, number>([[0, 0]]);
  const map: [number, number][] = [];
  for (const cp of new Set(codePoints)) {
    if (!font.hasGlyphForCodePoint(cp)) continue;
    const g = font.glyphForCodePoint(cp);
    let id = newId.get(g.id);
    if (id === undefined) {
      id = order.length;
      order.push(g.id);
      newId.set(g.id, id);
    }
    map.push([cp, id]);
  }
  const glyphs = order.map((gid) => {
    const g = font.getGlyph(gid);
    let enc: Encoded;
    try {
      enc = encodeGlyph(pathToContours(g.path.commands));
    } catch {
      enc = encodeGlyph([]);
    }
    return { enc, advance: Math.max(0, Math.round(g.advanceWidth || 0)) };
  });
  /* glyf、loca（長格式） */
  const glyf = new Writer();
  const loca = new Writer();
  for (const { enc } of glyphs) {
    loca.u32(glyf.len);
    glyf.bytes(enc.data);
  }
  loca.u32(glyf.len);
  /* hmtx */
  const hmtx = new Writer();
  for (const { enc, advance } of glyphs) {
    hmtx.u16(advance);
    hmtx.i16(enc.xMin);
  }
  const drawn = glyphs.filter((g) => g.enc.points);
  const box = drawn.length
    ? {
        xMin: Math.min(...drawn.map((g) => g.enc.xMin)),
        yMin: Math.min(...drawn.map((g) => g.enc.yMin)),
        xMax: Math.max(...drawn.map((g) => g.enc.xMax)),
        yMax: Math.max(...drawn.map((g) => g.enc.yMax)),
      }
    : { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  const ms = font.head?.macStyle;
  const bold = typeof ms === 'number' ? !!(ms & 1) : !!ms?.bold;
  const italic = typeof ms === 'number' ? !!(ms & 2) : !!ms?.italic;
  /* head */
  const head = new Writer();
  head.u32(0x00010000);
  head.fixed(font.head?.fontRevision ?? 1);
  head.u32(0);
  head.u32(0x5f0f3cf5);
  head.u16(0x000b);
  head.u16(font.unitsPerEm || 1000);
  for (let i = 0; i < 4; i++) head.u32(0);
  head.i16(box.xMin);
  head.i16(box.yMin);
  head.i16(box.xMax);
  head.i16(box.yMax);
  head.u16((bold ? 1 : 0) | (italic ? 2 : 0));
  head.u16(8);
  head.i16(2);
  head.i16(1);
  head.i16(0);
  /* hhea */
  const hhea = new Writer();
  hhea.u32(0x00010000);
  hhea.i16(Math.round(font.hhea.ascent));
  hhea.i16(Math.round(font.hhea.descent));
  hhea.i16(Math.round(font.hhea.lineGap));
  hhea.u16(Math.max(0, ...glyphs.map((g) => g.advance)));
  hhea.i16(drawn.length ? Math.min(...drawn.map((g) => g.enc.xMin)) : 0);
  hhea.i16(drawn.length ? Math.min(...drawn.map((g) => g.advance - g.enc.xMax)) : 0);
  hhea.i16(box.xMax);
  hhea.i16(1);
  hhea.i16(0);
  hhea.i16(0);
  for (let i = 0; i < 4; i++) hhea.i16(0);
  hhea.i16(0);
  hhea.u16(glyphs.length);
  /* maxp 1.0 */
  const maxp = new Writer();
  maxp.u32(0x00010000);
  maxp.u16(glyphs.length);
  maxp.u16(Math.max(0, ...glyphs.map((g) => g.enc.points)));
  maxp.u16(Math.max(0, ...glyphs.map((g) => g.enc.contours)));
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(2);
  for (let i = 0; i < 8; i++) maxp.u16(0);
  /* post 3.0 */
  const post = new Writer();
  post.u32(0x00030000);
  post.fixed(font.post?.italicAngle ?? 0);
  post.i16(Math.round(font.post?.underlinePosition ?? 0));
  post.i16(Math.round(font.post?.underlineThickness ?? 0));
  post.u32(font.post?.isFixedPitch ? 1 : 0);
  for (let i = 0; i < 4; i++) post.u32(0);
  const family = String(font.familyName || psName(font));
  const sub = String(font.subfamilyName || (bold ? 'Bold' : 'Regular'));
  return sfnt({
    cmap: cmapTable(map),
    glyf: glyf.done(),
    head: head.done(),
    hhea: hhea.done(),
    hmtx: hmtx.done(),
    loca: loca.done(),
    maxp: maxp.done(),
    name: nameTable([
      [1, family],
      [2, sub],
      [4, `${family} ${sub}`],
      [6, psName(font)],
    ]),
    post: post.done(),
  });
}
