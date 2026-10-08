/**
 * 2.5D 動態立繪（anime-rig）測試用的 PSD：用程式畫的簡單人形（不用任何原作素材）。
 *
 * 512 × 512 的畫布，圖層（由後到前）：後髮、脖子、上身、手臂、臉（含一點雜點）、耳飾、眼白（日文別名）、
 * 資料夾裡的瞳孔、睫毛（日文別名）、眉毛、張嘴（see-through 的「mouth」）、瀏海（下緣鋸齒，偵測得到髮束）、
 * 不認得的「ribbon」、空白圖層、隱藏的資料夾。沒有閉眼與閉嘴（用內建差分）。
 */
import { writePsdUint8Array } from 'ag-psd';

export interface TestLayer {
  name: string;
  hidden?: boolean;
  opacity?: number;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  imageData?: { width: number; height: number; data: Uint8ClampedArray };
  children?: TestLayer[];
  opened?: boolean;
}

export interface TestPsd {
  width: number;
  height: number;
  children: TestLayer[];
}

type Rgba = [number, number, number, number];

/** 整張畫布大小的圖層，用 paint(x, y) 決定每個像素（null＝透明），再裁到內容的範圍 */
function layer(
  name: string,
  W: number,
  H: number,
  paint: (x: number, y: number) => Rgba | null,
  extra: Partial<TestLayer> = {},
): TestLayer {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  const full = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = paint(x, y);
      if (!c?.[3]) continue;
      full.set(c, (y * W + x) * 4);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) {
    /* 空白圖層：1 × 1 的透明像素 */
    return {
      name,
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
      imageData: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      ...extra,
    };
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    data.set(full.subarray(((y + y0) * W + x0) * 4, ((y + y0) * W + x0 + w) * 4), y * w * 4);
  }
  return {
    name,
    left: x0,
    top: y0,
    right: x0 + w,
    bottom: y0 + h,
    imageData: { width: w, height: h, data },
    ...extra,
  };
}

/** 邊緣半透明的橢圓（看得出抗鋸齒） */
function ellipse(cx: number, cy: number, rx: number, ry: number, c: [number, number, number]) {
  return (x: number, y: number): Rgba | null => {
    const d = Math.sqrt(((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2);
    if (d > 1.04) return null;
    const a = d < 0.96 ? 255 : Math.round(((1.04 - d) / 0.08) * 255);
    return [c[0], c[1], c[2], a];
  };
}

const rect =
  (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) =>
  (x: number, y: number): Rgba | null =>
    x >= x0 && x < x1 && y >= y0 && y < y1 ? [c[0], c[1], c[2], 255] : null;

const union =
  (...fs: ((x: number, y: number) => Rgba | null)[]) =>
  (x: number, y: number): Rgba | null => {
    for (const f of fs) {
      const c = f(x, y);
      if (c) return c;
    }
    return null;
  };

export const TEST_PSD_SIZE = 512;

/** 測試用的 PSD 圖層樹（ag-psd 的格式） */
export function rigTestPsd(): TestPsd {
  const W = TEST_PSD_SIZE;
  const H = TEST_PSD_SIZE;
  const skin: [number, number, number] = [250, 220, 200];
  const hairC: [number, number, number] = [120, 70, 150];
  const L = (name: string, f: (x: number, y: number) => Rgba | null, extra?: Partial<TestLayer>) =>
    layer(name, W, H, f, extra);
  /* 瀏海：上半是一塊，下緣是 5 個尖端的鋸齒 */
  const bangs = (x: number, y: number): Rgba | null => {
    if (x < 150 || x >= 362 || y < 70) return null;
    const t = (x - 150) / 212;
    const tooth = Math.abs(((t * 5) % 1) - 0.5) * 2; /* 0＝尖端、1＝凹處 */
    const bottom = 175 - tooth * 45;
    return y <= bottom ? [hairC[0], hairC[1], hairC[2], 255] : null;
  };
  const dust = (x: number, y: number): Rgba | null =>
    (x === 30 && y === 30) || (x === 480 && y === 40) || (x === 31 && y === 30)
      ? [255, 0, 0, 200]
      : null;
  return {
    width: W,
    height: H,
    children: [
      L('back hair', union(rect(150, 90, 362, 330, [100, 55, 130]))),
      L('neck', rect(236, 290, 276, 360, skin)),
      L('topwear', rect(150, 340, 362, 512, [60, 90, 160])),
      L('handwear', union(rect(110, 360, 150, 500, skin), rect(362, 360, 402, 500, skin))),
      L('face', union(ellipse(256, 200, 90, 110, skin), dust)),
      L('earwear', ellipse(166, 240, 10, 18, [230, 200, 60])),
      L(
        '白目',
        union(
          ellipse(222, 200, 24, 14, [255, 255, 255]),
          ellipse(290, 200, 24, 14, [255, 255, 255]),
        ),
      ),
      {
        name: 'eyes',
        opened: true,
        children: [
          L(
            'irides',
            union(
              ellipse(224, 202, 11, 12, [40, 90, 200]),
              ellipse(288, 202, 11, 12, [40, 90, 200]),
            ),
          ),
        ],
      },
      L(
        'まつ毛',
        union(rect(196, 182, 250, 188, [40, 20, 30]), rect(262, 182, 316, 188, [40, 20, 30])),
      ),
      L(
        'eyebrow',
        union(rect(200, 160, 244, 166, [80, 40, 60]), rect(268, 160, 312, 166, [80, 40, 60])),
      ),
      L('mouth', ellipse(256, 262, 20, 10, [160, 40, 60])),
      L('front hair', bangs),
      L('ribbon', ellipse(330, 110, 22, 14, [230, 60, 90])),
      L('blank', () => null),
      {
        name: 'hidden folder',
        hidden: true,
        children: [L('hiddenstuff', rect(0, 0, 40, 40, [0, 0, 0]))],
      },
    ],
  };
}

/** 深拷貝（綁定會改圖層樹） */
export function clonePsd(psd: TestPsd): TestPsd {
  const copy = (l: TestLayer): TestLayer => ({
    ...l,
    imageData: l.imageData
      ? { ...l.imageData, data: new Uint8ClampedArray(l.imageData.data) }
      : undefined,
    children: l.children?.map(copy),
  });
  return { ...psd, children: psd.children.map(copy) };
}

/** 測試用的 PSD 檔（8 位元 RGB） */
export function rigTestPsdBytes(psd: TestPsd = rigTestPsd()): Uint8Array {
  return writePsdUint8Array(psd as never, { generateThumbnail: false });
}
