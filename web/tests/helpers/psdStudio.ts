/**
 * CCFOLIA & 圖片調色工作室（psd-studio）測試用的檔案：量測圖、APNG、PSD、房間 ZIP（全部現做，不用任何原作素材）。
 * 結構照規格附件 psd-studio.examples.json 的「量測條件」「APNG」「PSD」「房間ZIP」。
 */
import { writePsdUint8Array } from 'ag-psd';
import { ApngEncoder } from '../../src/core/encode/apng';
import { encodePng } from '../../src/core/encode/png';
import { bytesToHex, sha256Sync, zipFiles } from '../../src/core/files';

/** 附件「量測條件」的 256 × 32 量測圖 */
export function measureRgba(): Uint8ClampedArray<ArrayBuffer> {
  const W = 256;
  const px = new Uint8ClampedArray(W * 32 * 4);
  const put = (x: number, y: number, c: number[]) => px.set(c, (y * W + x) * 4);
  const blocks = [
    [0, 0, 0],
    [64, 64, 64],
    [128, 128, 128],
    [192, 192, 192],
    [255, 255, 255],
    [220, 40, 40],
    [40, 180, 60],
    [40, 70, 210],
    [230, 180, 150],
  ];
  const alphaSegs = [
    [200, 100, 50, 128],
    [0, 128, 255, 64],
    [0, 0, 0, 0],
    [128, 128, 128, 255],
  ];
  const pure = [
    [255, 0, 0],
    [255, 255, 0],
    [0, 255, 0],
    [0, 255, 255],
    [0, 0, 255],
    [255, 0, 255],
    [255, 128, 0],
    [128, 96, 64],
  ];
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < 8; y++) put(x, y, [x, x, x, 255]);
    for (let y = 8; y < 16; y++) put(x, y, [...blocks[Math.min(8, Math.floor(x / 28))], 255]);
    for (let y = 16; y < 24; y++) put(x, y, alphaSegs[Math.floor(x / 64)]);
    for (let y = 24; y < 32; y++) put(x, y, [...pure[Math.floor(x / 32)], 255]);
  }
  return px;
}

export const measurePng = async (): Promise<Uint8Array> => await encodePng(measureRgba(), 256, 32);

/** 單色（可半透明）的 PNG；inset 時只有中間一塊不透明 */
export async function solidPng(
  w: number,
  h: number,
  rgba: [number, number, number, number],
  inset = 0,
): Promise<Uint8Array> {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = inset; y < h - inset; y++) {
    for (let x = inset; x < w - inset; x++) px.set(rgba, (y * w + x) * 4);
  }
  return await encodePng(px, w, h);
}

/**
 * 附件「APNG」的 ball：64 × 48、6 格、延遲 100／0／50／200／100／100 ms、播放 3 次；
 * 灰色底上一顆橘色方塊從左往右移（第 2 格以後只更新一小塊）。
 */
export async function ballApng(plays = 3): Promise<Uint8Array> {
  const W = 64;
  const H = 48;
  const delays = [100, 0, 50, 200, 100, 100];
  const enc = new ApngEncoder({
    width: W,
    height: H,
    fps: 1000,
    plays,
    mergeIdentical: false,
    minTicks: 0,
  });
  for (let f = 0; f < 6; f++) {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 30; x++) px.set([128, 128, 128, 255], (y * W + x) * 4);
    }
    for (let y = 20; y < 30; y++) {
      for (let x = f * 10 + 2; x < f * 10 + 12; x++) px.set([230, 130, 40, 255], (y * W + x) * 4);
    }
    await enc.addFrame(px, delays[f]);
  }
  return (await enc.finish()).bytes;
}

/** loop0：32 × 32、3 格、無限循環 */
export async function loop0Apng(): Promise<Uint8Array> {
  const enc = new ApngEncoder({
    width: 32,
    height: 32,
    fps: 1000,
    plays: 0,
    mergeIdentical: false,
  });
  const colors = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
  ];
  for (const c of colors) {
    const px = new Uint8ClampedArray(32 * 32 * 4);
    for (let i = 0; i < 32 * 32; i++) px.set(c, i * 4);
    await enc.addFrame(px, 120);
  }
  return (await enc.finish()).bytes;
}

/** 附件「PSD」的測試檔（ag-psd 寫出；結構與 core-psd.test.ts 相同） */
export function testPsd(): Uint8Array {
  type Rgba = [number, number, number, number];
  const fill = (w: number, h: number, c: Rgba) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set(c, i * 4);
    return { width: w, height: h, data };
  };
  const layer = (
    name: string,
    l: number,
    t: number,
    r: number,
    b: number,
    c: Rgba,
    extra = {},
  ) => ({
    name,
    left: l,
    top: t,
    right: r,
    bottom: b,
    imageData: fill(r - l, b - t, c),
    ...extra,
  });
  const maskData = new Uint8ClampedArray(40 * 40 * 4);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const v = x < 20 ? 255 : 0;
      maskData.set([v, v, v, 255], (y * 40 + x) * 4);
    }
  }
  return writePsdUint8Array({
    width: 320,
    height: 240,
    children: [
      layer('底色', 0, 0, 320, 240, [240, 240, 240, 255]),
      {
        name: '人物',
        children: [
          layer('身體', 40, 50, 140, 200, [200, 100, 50, 255]),
          layer('群組內隱藏', 50, 60, 60, 70, [1, 2, 3, 255], { hidden: true }),
          layer('臉', 70, 30, 110, 70, [250, 220, 200, 255]),
        ],
      },
      layer('半透明', 200, 20, 280, 100, [0, 200, 0, 255], { opacity: 0.5 }),
      layer('色彩增值', 220, 120, 300, 200, [0, 0, 255, 255], { blendMode: 'multiply' }),
      layer('剪裁', 210, 130, 240, 160, [255, 0, 0, 255], { clipping: true }),
      layer('重複', 10, 10, 40, 40, [255, 255, 255, 255]),
      layer('重複', 20, 180, 50, 210, [0, 0, 0, 255]),
      layer('名稱/含:特殊*字元?', 150, 200, 190, 230, [9, 9, 9, 255]),
      {
        name: '隱藏群組',
        hidden: true,
        children: [layer('群組內可見', 0, 0, 10, 10, [5, 5, 5, 255])],
      },
      layer('超出畫布', -30, 200, 30, 260, [100, 100, 100, 255]),
      { name: '空白層' },
      layer('有遮色片', 150, 60, 190, 100, [10, 20, 30, 255], {
        mask: {
          left: 150,
          top: 60,
          right: 190,
          bottom: 100,
          defaultColor: 0,
          imageData: { width: 40, height: 40, data: maskData },
        },
      }),
      layer('最上層', 100, 100, 150, 150, [7, 8, 9, 128]),
    ],
  } as Parameters<typeof writePsdUint8Array>[0]);
}

export const sha = (b: Uint8Array): string => bytesToHex(sha256Sync(b));

export interface RoomFixture {
  zip: Uint8Array;
  names: Record<string, string>;
  token: string;
  json: Record<string, unknown>;
}

/**
 * 房間 ZIP（結構照 CCFOLIA 匯出：平面的 __data.json、.token、以 SHA-256 命名的圖片）。
 * bg 可以傳 JPEG（瀏覽器做好的位元組）；沒傳時用 PNG。
 */
export async function roomZip(bgJpeg?: Uint8Array, sub = ''): Promise<RoomFixture> {
  const imgs: Record<string, { data: Uint8Array; ext: string; type: string }> = {};
  const add = async (key: string, data: Uint8Array, ext = 'png', type = 'image/png') => {
    imgs[key] = { data, ext, type };
  };
  if (bgJpeg) await add('bg', bgJpeg, 'jpeg', 'image/jpeg');
  else await add('bg', await solidPng(96, 72, [40, 60, 90, 255]));
  await add('fg', await solidPng(96, 72, [250, 250, 250, 255], 0).then(frameFg));
  await add('marker', await solidPng(48, 48, [200, 40, 40, 255]));
  await add('item', await solidPng(48, 48, [40, 160, 60, 255]));
  await add('icon', await solidPng(40, 40, [220, 180, 40, 255]));
  await add('face', await solidPng(40, 40, [180, 80, 200, 255]));
  await add('scene', await solidPng(64, 48, [30, 30, 30, 255]));
  await add('effect', await solidPng(64, 32, [255, 255, 255, 255]));
  await add('apng', new Uint8Array(await ballApng()));
  await add('unused', await solidPng(24, 24, [10, 200, 200, 255]));
  const names: Record<string, string> = {};
  for (const [k, v] of Object.entries(imgs)) names[k] = `${sha(v.data)}.${v.ext}`;
  const json = {
    meta: { version: '1.1.0' },
    entities: {
      room: {
        name: '測試房間',
        backgroundUrl: names.bg,
        foregroundUrl: names.fg,
        fieldWidth: 16,
        fieldHeight: 12,
        markers: {
          m1: {
            x: -6,
            y: -4,
            z: 3,
            width: 2,
            height: 2,
            angle: 0,
            imageUrl: names.marker,
            text: '標記',
          },
        },
      },
      items: {
        i1: {
          x: 1,
          y: 1,
          z: 5,
          width: 3,
          height: 3,
          angle: 30,
          imageUrl: names.item,
          memo: '寶箱',
        },
        i2: { x: -2, y: 2, z: 6, width: 4, height: 3, angle: 0, imageUrl: names.apng },
      },
      characters: {
        c1: {
          name: '艾琳',
          iconUrl: names.icon,
          faces: [{ label: '笑', iconUrl: names.face }],
          x: 3,
          y: -3,
          z: 7,
          width: 2,
          height: 2,
          angle: 0,
        },
      },
      scenes: { s1: { name: '場景一', backgroundUrl: names.scene, foregroundUrl: null } },
      effects: { e1: { name: '切入', imageUrl: names.effect } },
    },
    resources: Object.fromEntries(
      Object.entries(imgs)
        .filter(([k]) => k !== 'unused')
        .map(([k, v]) => [names[k], { type: v.type }]),
    ),
  };
  const token = `0.${'ab'.repeat(32)}`;
  const entries = [
    ...(sub ? [{ name: `${sub}/`, data: new Uint8Array(0) }] : []),
    { name: `${sub ? `${sub}/room.json` : '__data.json'}`, data: JSON.stringify(json) },
    { name: '.token', data: token },
    ...Object.entries(imgs).map(([k, v]) => ({
      name: `${sub ? `${sub}/` : ''}${names[k]}`,
      data: v.data,
    })),
  ];
  return { zip: zipFiles(entries, { mtime: new Date(2026, 0, 1) }), names, token, json };
}

/** 前景：中間透明、四周白框 */
async function frameFg(_: Uint8Array): Promise<Uint8Array> {
  const W = 96;
  const H = 72;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < 8 || y < 8 || x >= W - 8 || y >= H - 8) px.set([250, 250, 250, 255], (y * W + x) * 4);
    }
  }
  return encodePng(px, W, H);
}
