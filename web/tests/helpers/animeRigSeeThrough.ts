/**
 * 2.5D 動態立繪（anime-rig）測試用的 see-through 風格 PSD：用程式畫的簡單人形（不用任何 see-through 的輸出或素材）。
 *
 * 照 see-through（shitagaki-lab/see-through，Apache-2.0）輸出的格式做（common/utils/inference_utils.py 的
 * further_extr、part_lr_split、dump_parts_psd，common/utils/io_utils.py 的 save_psd）：
 * - 圖層名稱＝部位標籤（V3）。`split`（`--tblr_split`）時 handwear、eyewhite、irides、eyelash、eyebrow、ears 分成
 *   `<標籤>-r`（畫面左邊的區塊＝角色的右邊）與 `<標籤>-l`（畫面右邊），`-r` 在前；
 * - 依 depth_median 由遠到近排（第一個在最下面）；每層裁到自己的範圍（top／left＝xyxy）；
 * - 深度 PSD（`_depth.psd`）：灰階、8 位元；圖層名稱、位置、範圍與彩色的一一對應；部件裡是深度（0＝近、255＝遠，
 *   這裡加了 ±1 的起伏，中位數＝設定值），部件外是 255，透明度全部 255（psd-tools 寫 L 模式的圖層就是這樣）；
 * - `.psd.json`：`parts[標籤]` 的 `xyxy`、`depth_median`（0～1）、`tag`，`frame_size`＝[高, 寬]。
 *
 * 256 × 256；`tests/unit/fixtures/anime-rig/` 的三個檔案是這裡產生的（`anime-rig-see-through.test.ts` 確認兩者相同）。
 */
import { writePsdUint8Array } from 'ag-psd';
import { ellipse, layer, type Rgba, rect, type TestPsd, union } from './animeRig';

export const ST_SIZE = 256;

type Paint = (x: number, y: number) => Rgba | null;

export interface StPart {
  tag: string;
  paint: Paint;
  /** 深度（0＝近、255＝遠；json 的 depth_median＝這個值 ÷ 255） */
  depth: number;
}

type Rgb = [number, number, number];

/** 部件的顏色（e2e 從匯出的 PNG 找部件用） */
export const ST_COLORS = {
  backHair: [90, 50, 110] as Rgb,
  frontHair: [150, 80, 170] as Rgb,
  skin: [250, 220, 200] as Rgb,
  arm: [240, 205, 185] as Rgb,
  ear: [245, 210, 190] as Rgb,
  top: [60, 90, 160] as Rgb,
  white: [255, 255, 255] as Rgb,
  iris: [40, 90, 200] as Rgb,
  lash: [40, 20, 30] as Rgb,
  brow: [80, 40, 60] as Rgb,
  nose: [230, 170, 160] as Rgb,
  mouth: [160, 40, 60] as Rgb,
  hat: [230, 60, 120] as Rgb,
};

/** 下緣是 n 個尖端的鋸齒（髮束偵測得到） */
const jagged =
  (x0: number, x1: number, y0: number, bottom: number, depth: number, n: number, c: Rgb): Paint =>
  (x, y) => {
    if (x < x0 || x >= x1 || y < y0) return null;
    const t = (x - x0) / (x1 - x0);
    const tooth = Math.abs(((t * n) % 1) - 0.5) * 2; /* 0＝尖端、1＝凹處 */
    return y <= bottom - tooth * depth ? [c[0], c[1], c[2], 255] : null;
  };

/**
 * 部件（由遠到近）。split＝see-through 的 `--tblr_split`：左右分開的部件各自一層（`-r`＝畫面左邊）。
 * 深度：瀏海 84 ＜ 頭飾 90 ＜ 前面的手 92 ＜ 臉 102 ＜ 耳朵 110 ＜ 上身 120 ＜ 後面的手 133 ＜ 後髮 158。
 */
export function seeThroughParts({ split = true }: { split?: boolean } = {}): StPart[] {
  const C = ST_COLORS;
  const pair = (tag: string, depth: number, left: Paint, right: Paint): StPart[] =>
    split
      ? [
          { tag: `${tag}-r`, paint: left, depth },
          { tag: `${tag}-l`, paint: right, depth },
        ]
      : [{ tag, paint: union(left, right), depth }];
  const armL = rect(62, 180, 84, 248, C.arm);
  const armR = rect(172, 180, 194, 248, C.arm);
  return [
    { tag: 'back hair', paint: jagged(66, 190, 40, 176, 20, 4, C.backHair), depth: 158 },
    ...(split ? [{ tag: 'handwear-r', paint: armL, depth: 133 }] : []),
    { tag: 'topwear', paint: rect(84, 176, 172, 256, C.top), depth: 120 },
    { tag: 'neck', paint: rect(116, 150, 140, 186, C.skin), depth: 117 },
    ...(split ? [] : [{ tag: 'handwear', paint: union(armL, armR), depth: 112 }]),
    ...pair('ears', 110, ellipse(80, 104, 7, 12, C.ear), ellipse(176, 104, 7, 12, C.ear)),
    { tag: 'face', paint: ellipse(128, 100, 46, 56, C.skin), depth: 102 },
    ...pair('eyewhite', 99, ellipse(110, 104, 12, 7, C.white), ellipse(146, 104, 12, 7, C.white)),
    ...pair('irides', 98, ellipse(111, 105, 5, 6, C.iris), ellipse(145, 105, 5, 6, C.iris)),
    ...pair('eyelash', 97, rect(97, 95, 124, 98, C.lash), rect(132, 95, 159, 98, C.lash)),
    ...pair('eyebrow', 96, rect(98, 84, 122, 87, C.brow), rect(134, 84, 158, 87, C.brow)),
    { tag: 'nose', paint: ellipse(128, 118, 4, 3, C.nose), depth: 95 },
    { tag: 'mouth', paint: ellipse(128, 132, 10, 5, C.mouth), depth: 95 },
    ...(split ? [{ tag: 'handwear-l', paint: armR, depth: 92 }] : []),
    { tag: 'headwear', paint: ellipse(158, 46, 16, 9, C.hat), depth: 90 },
    { tag: 'front hair', paint: jagged(82, 174, 40, 92, 22, 4, C.frontHair), depth: 84 },
  ];
}

/** 彩色 PSD 的圖層樹（ag-psd 的格式） */
export function seeThroughColorPsd(parts: StPart[] = seeThroughParts()): TestPsd {
  return {
    width: ST_SIZE,
    height: ST_SIZE,
    children: parts.map((p) => layer(p.tag, ST_SIZE, ST_SIZE, p.paint)),
  };
}

/** 彩色 PSD 檔（8 位元 RGB） */
export function seeThroughColorBytes(parts: StPart[] = seeThroughParts()): Uint8Array {
  return writePsdUint8Array(seeThroughColorPsd(parts) as never, { generateThumbnail: false });
}

export interface GrayLayer {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  gray: Uint8Array;
  /** 沒有時全部 255 */
  alpha?: Uint8Array;
}

/** 深度 PSD 的圖層：彩色圖層的範圍，部件裡（透明度 > 0）是深度 ±1、外面 255 */
export function seeThroughDepthLayers(parts: StPart[] = seeThroughParts()): GrayLayer[] {
  const color = seeThroughColorPsd(parts);
  return color.children.map((l, i) => {
    const img = l.imageData as { width: number; height: number; data: Uint8ClampedArray };
    const gray = new Uint8Array(img.width * img.height).fill(255);
    const d = parts[i].depth;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const k = y * img.width + x;
        if (img.data[k * 4 + 3] > 0) gray[k] = d + (((x + y) % 3) - 1);
      }
    }
    return {
      name: l.name,
      left: l.left ?? 0,
      top: l.top ?? 0,
      width: img.width,
      height: img.height,
      gray,
    };
  });
}

/** 深度 PSD 檔（灰階 8 位元） */
export function seeThroughDepthBytes(parts: StPart[] = seeThroughParts()): Uint8Array {
  return writeGrayPsd(ST_SIZE, ST_SIZE, seeThroughDepthLayers(parts));
}

/** `.psd.json` 的內容 */
export function seeThroughJson(parts: StPart[] = seeThroughParts()) {
  const color = seeThroughColorPsd(parts);
  const out: Record<string, { xyxy: number[]; depth_median: number; tag: string }> = {};
  color.children.forEach((l, i) => {
    out[l.name] = {
      xyxy: [l.left ?? 0, l.top ?? 0, l.right ?? 0, l.bottom ?? 0],
      depth_median: parts[i].depth / 255,
      tag: l.name,
    };
  });
  return { parts: out, frame_size: [ST_SIZE, ST_SIZE] };
}

/* ---------- 灰階 PSD（ag-psd 只會寫 RGB） ---------- */

class Bytes {
  private a: number[] = [];
  u8(v: number) {
    this.a.push(v & 255);
  }
  u16(v: number) {
    this.u8(v >> 8);
    this.u8(v);
  }
  i16(v: number) {
    this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number) {
    this.u16(Math.floor(v / 0x10000));
    this.u16(v & 0xffff);
  }
  i32(v: number) {
    this.u32(v < 0 ? v + 0x100000000 : v);
  }
  ascii(s: string) {
    for (const ch of s) this.u8(ch.charCodeAt(0));
  }
  bytes(b: ArrayLike<number>) {
    for (let i = 0; i < b.length; i++) this.a.push(b[i]);
  }
  get length() {
    return this.a.length;
  }
  out() {
    return Uint8Array.from(this.a);
  }
}

/** PackBits（PSD 的 RLE）：一列 */
function packBits(row: Uint8Array): number[] {
  const out: number[] = [];
  const n = row.length;
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && j - i < 128 && row[j] === row[i]) j++;
    if (j - i >= 2) {
      out.push(257 - (j - i), row[i]);
      i = j;
      continue;
    }
    let k = i + 1;
    while (k < n && k - i < 128 && !(k + 1 < n && row[k] === row[k + 1])) k++;
    out.push(k - i - 1);
    for (let q = i; q < k; q++) out.push(row[q]);
    i = k;
  }
  return out;
}

/** 一個色版的 RLE 資料：每列的位元組數（16 位元）＋各列 */
function rleChannel(
  data: Uint8Array,
  w: number,
  h: number,
): { counts: number[]; rows: number[][] } {
  const rows: number[][] = [];
  for (let y = 0; y < h; y++) rows.push(packBits(data.subarray(y * w, (y + 1) * w)));
  return { counts: rows.map((r) => r.length), rows };
}

/**
 * 灰階 8 位元的 PSD（版本 1、RLE）：每個圖層有透明度（-1）與灰階（0）兩個色版，合成圖是白色。
 * 只用在測試（psd-tools 以 `PSDImage.new('L')`＋`create_pixel_layer` 寫的檔案也是這個結構）。
 */
export function writeGrayPsd(width: number, height: number, layers: GrayLayer[]): Uint8Array {
  const info = new Bytes();
  info.i16(layers.length);
  const channels = layers.map((l) =>
    [l.alpha ?? new Uint8Array(l.width * l.height).fill(255), l.gray].map((d) =>
      rleChannel(d, l.width, l.height),
    ),
  );
  const size = (c: { counts: number[] }) =>
    2 + c.counts.length * 2 + c.counts.reduce((a, b) => a + b, 0);
  layers.forEach((l, li) => {
    info.i32(l.top);
    info.i32(l.left);
    info.i32(l.top + l.height);
    info.i32(l.left + l.width);
    info.u16(2);
    [-1, 0].forEach((id, ci) => {
      info.i16(id);
      info.u32(size(channels[li][ci]));
    });
    info.ascii('8BIMnorm');
    info.u8(255); /* 不透明度 */
    info.u8(0); /* 剪裁 */
    info.u8(0); /* 旗標（看得到） */
    info.u8(0);
    const nameLen = Math.min(255, l.name.length);
    const namePad = (4 - ((nameLen + 1) % 4)) % 4;
    info.u32(4 + 4 + 1 + nameLen + namePad);
    info.u32(0); /* 圖層遮色片 */
    info.u32(0); /* 混合範圍 */
    info.u8(nameLen);
    info.ascii(l.name.slice(0, nameLen));
    for (let i = 0; i < namePad; i++) info.u8(0);
  });
  for (const chs of channels) {
    for (const c of chs) {
      info.u16(1); /* RLE */
      for (const n of c.counts) info.u16(n);
      for (const r of c.rows) info.bytes(r);
    }
  }
  if (info.length % 2) info.u8(0);
  const infoBytes = info.out();
  const b = new Bytes();
  b.ascii('8BPS');
  b.u16(1);
  for (let i = 0; i < 6; i++) b.u8(0);
  b.u16(1); /* 色版數 */
  b.u32(height);
  b.u32(width);
  b.u16(8);
  b.u16(1); /* 灰階 */
  b.u32(0); /* 色彩模式資料 */
  b.u32(0); /* 影像資源 */
  b.u32(4 + infoBytes.length + 4);
  b.u32(infoBytes.length);
  b.bytes(infoBytes);
  b.u32(0); /* 整體的遮色片 */
  const comp = rleChannel(new Uint8Array(width * height).fill(255), width, height);
  b.u16(1); /* 合成圖：RLE */
  for (const n of comp.counts) b.u16(n);
  for (const r of comp.rows) b.bytes(r);
  return b.out();
}
