/**
 * SF 證件：沒用到 2026-11-05 的新功能（看起來像的碼、另外 5 種晶片、日期格式、光暈／顆粒／掃描線、數位證件、名字產生器、預設集）時，
 * 5 款畫出來的指令和加入之前完全相同（指令相同＝像素相同＝匯出的 PNG 逐位元組相同）。
 *
 * 基準檔 `fixtures/id-ticket-sf-golden.json` 是**加入之前**的程式（commit 05ed1f9 的 sf/draw.ts）用這個檔案產生的：
 * 5 款 × 預設／QR code／裝飾全關／DNA 字母／深色配色 × 有沒有照片，每一組畫出來的 canvas 指令（tests/helpers/canvasRecorder；
 * 量字是固定寬度，和字型、環境無關）與可以點的範圍的 SHA-256。
 * 要刻意改變外觀時，用 `ID_TICKET_GOLDEN_WRITE=1 npx vitest run tests/unit/id-ticket-sf-golden.test.ts` 重新產生並在規格寫明。
 */
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Sync } from '@/core/files';
import { SF_BLANK_IDS, SF_SCHEMES } from '@/tools/id-ticket/sf/defs';
import { drawSf } from '@/tools/id-ticket/sf/draw';
import { initialSf, type SfState } from '@/tools/id-ticket/sf/model';
import { recordCanvas } from '../helpers/canvasRecorder';
import { nodeCanvas } from '../helpers/nodeCanvas';

/* 執照的圖示先畫在另一張畫布（makeCanvas → OffscreenCanvas）；記錄器只記下 drawImage 的呼叫 */
const canvasLib = await nodeCanvas();

const FS = 'node:fs';
const { existsSync, readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, enc: 'utf8') => string;
  writeFileSync: (p: string, data: string) => void;
};
const WRITE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .ID_TICKET_GOLDEN_WRITE === '1';
const FIXTURE = new URL('./fixtures/id-ticket-sf-golden.json', import.meta.url).pathname;

class M2 {
  constructor(
    readonly a: number,
    readonly b: number,
    readonly c: number,
    readonly d: number,
    readonly e: number,
    readonly f: number,
  ) {}
  multiply(n: { a: number; b: number; c: number; d: number; e: number; f: number }): M2 {
    return new M2(
      this.a * n.a + this.c * n.b,
      this.b * n.a + this.d * n.b,
      this.a * n.c + this.c * n.d,
      this.b * n.c + this.d * n.d,
      this.a * n.e + this.c * n.f + this.e,
      this.b * n.e + this.d * n.f + this.f,
    );
  }
  inverse(): M2 {
    const det = this.a * this.d - this.b * this.c;
    return new M2(
      this.d / det,
      -this.b / det,
      -this.c / det,
      this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det,
    );
  }
}

function recorder(width: number, height: number) {
  const rec = recordCanvas(width, height);
  const raw = rec.ctx as unknown as Record<string, unknown>;
  const ctx = new Proxy(raw, {
    get(t, key) {
      if (key === 'getTransform')
        return () => {
          const m = (t.getTransform as () => Record<string, number>)();
          return new M2(m.a, m.b, m.c, m.d, m.e, m.f);
        };
      return t[key as string];
    },
    set(t, key, v) {
      t[key as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log: rec.log };
}

const FAKE_PHOTO = { width: 400, height: 300 } as unknown as CanvasImageSource;
const PHOTO = {
  image: { id: 'p1', name: 'p.png', width: 400, height: 300 },
  place: { zoom: 1.3, x: 0.05, y: -0.02, turns: 0 },
};

const hash = (log: unknown[]) =>
  bytesToHex(sha256Sync(new TextEncoder().encode(JSON.stringify(log))));

type Variant = (s: SfState) => SfState;
const night = SF_SCHEMES[1];
const VARIANTS: Record<string, Variant> = {
  default: (s) => s,
  qr: (s) => ({ ...s, style: { ...s.style, code: 'qr' } }),
  plain: (s) => ({
    ...s,
    style: {
      ...s.style,
      stripes: false,
      slashes: false,
      barcode: false,
      edge: false,
      chip: false,
      dna: false,
      mrz: false,
    },
  }),
  dnaText: (s) => ({ ...s, style: { ...s.style, dnaText: true, frame: 'scope' } }),
  night: (s) => ({
    ...s,
    style: { ...s.style, card: night.card, ink: night.ink, accent: night.accent },
  }),
  /* 浮水印與裝飾圖（2026-11-05 改成和證件共用的畫法，SF 證件的指令照舊） */
  wmText: (s) => ({ ...s, watermark: { ...s.watermark, mode: 'text', rotate: 20, shift: 30 } }),
  wmImage: (s) => ({
    ...s,
    watermark: { ...s.watermark, mode: 'image', image: IMG('w1', 200, 100), overlap: 20 },
  }),
  wmImageOne: (s) => ({
    ...s,
    watermark: {
      ...s.watermark,
      mode: 'image',
      image: IMG('w1', 200, 100),
      tile: false,
      tint: false,
      invert: true,
      smart: false,
    },
  }),
  elements: (s) => ({
    ...s,
    style: { ...s.style, photoOverElements: true },
    elements: {
      ...s.elements,
      [s.blank]: [
        {
          id: 'el1',
          image: IMG('e1', 120, 80),
          x: 0.3,
          y: 0.4,
          size: 0.25,
          alpha: 80,
          tint: true,
          thr: 40,
          crop: { x: 0.1, y: 0, w: 0.8, h: 1 },
        },
        {
          id: 'el2',
          image: IMG('e1', 120, 80),
          x: 0.7,
          y: 0.6,
          size: 0.4,
          alpha: 100,
          tint: false,
          thr: 0,
          crop: { x: 0, y: 0, w: 1, h: 1 },
        },
      ],
    },
  }),
};

function IMG(id: string, width: number, height: number) {
  return { id, name: `${id}.png`, width, height };
}

/** 假的圖（node-canvas 的畫布，浮水印的染色與裝飾圖的單色印要真的畫） */
const images = new Map<string, CanvasImageSource>();
function imageOf(id: string): CanvasImageSource | null {
  if (!canvasLib) return null;
  if (!images.has(id)) {
    const c = canvasLib.createCanvas(id === 'w1' ? 200 : 120, id === 'w1' ? 100 : 80);
    const x = c.getContext('2d') as unknown as CanvasRenderingContext2D;
    x.fillStyle = '#336699';
    x.fillRect(10, 10, 60, 40);
    x.fillStyle = '#ffcc00';
    x.fillRect(40, 30, 50, 30);
    images.set(id, c as unknown as CanvasImageSource);
  }
  return images.get(id) ?? null;
}

function cases(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const blank of SF_BLANK_IDS)
    for (const [name, v] of Object.entries(VARIANTS))
      for (const withPhoto of [false, true]) {
        const s = v({ ...initialSf(), blank, photo: withPhoto ? PHOTO : null });
        const r = recorder(1600, 1600);
        const res = drawSf(r.ctx, s, 1, {
          preview: false,
          photo: withPhoto
            ? { bitmap: FAKE_PHOTO, width: 400, height: 300, place: PHOTO.place }
            : null,
          image: imageOf,
        });
        /* 晶片的點選範圍是 2026-11-05 加的（只在預覽上有用，不影響畫出來的像素） */
        const regions = res.regions.filter((x) => (x.kind as string) !== 'chip');
        out[`sf/${blank}/${name}/${withPhoto ? 'photo' : 'empty'}`] = hash([r.log, regions]);
      }
  return out;
}

describe.runIf(canvasLib)('id-ticket：SF 證件沒用到新功能時畫法不變', () => {
  it('畫出來的指令和加入新功能之前相同', () => {
    const got = cases();
    if (WRITE || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, `${JSON.stringify(got, null, 2)}\n`);
      if (!WRITE) throw new Error('基準檔不存在，已產生；請確認後再跑一次');
    }
    const want = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, string>;
    expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort());
    for (const k of Object.keys(want)) expect(got[k], k).toBe(want[k]);
  });
});
