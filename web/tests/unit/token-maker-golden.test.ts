/**
 * VTT 棋子產生器：沒用到 2026-11-05 加的功能（漸層的色彩平衡 50%、沒有去光暈）時，畫出來的棋子與嵌進 PNG 的設定
 * 和加入之前完全相同（規格 F86、F83 與 3.8 的「逐位元組相同」）。
 *
 * 基準檔 `fixtures/token-maker-golden.json` 是**加入之前**的程式（commit 05ed1f9 的 render.ts、embed.ts、model.ts）
 * 用這個檔案產生的：外框（浮雕環、霓虹）× 單色／漸層 × 有沒有圖片與出框、自訂外框的漸層、光暈、質感、色彩調整與效果，
 * node-canvas 畫出來的像素的 SHA-256；以及 embedJson 的 SHA-256。
 * 要刻意改變外觀時，用 `TOKEN_MAKER_GOLDEN_WRITE=1 npx vitest run tests/unit/token-maker-golden.test.ts` 重新產生並在規格寫明。
 */
import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Sync } from '@/core/files';
import { makeCanvas } from '../../src/core/image';
import { embedJson } from '../../src/tools/token-maker/embed';
import { DEFAULT_LOOK, defaultAdjust, type Look } from '../../src/tools/token-maker/model';
import { renderTokenCanvas } from '../../src/tools/token-maker/render';
import { nodeCanvas } from '../helpers/nodeCanvas';

const FS = 'node:fs';
const { existsSync, readFileSync, writeFileSync } = (await import(/* @vite-ignore */ FS)) as {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, enc: 'utf8') => string;
  writeFileSync: (p: string, data: string) => void;
};
const WRITE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .TOKEN_MAKER_GOLDEN_WRITE === '1';
const FIXTURE = new URL('./fixtures/token-maker-golden.json', import.meta.url).pathname;

const canvasLib = await nodeCanvas();

type Ctx = CanvasRenderingContext2D;

function canvasOf(w: number, h: number, fn: (x: number, y: number) => number[]) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d') as Ctx;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data.set(fn(x, y), (y * w + x) * 4);
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 測試用的外觀：DEFAULT_LOOK 加上 patch（加入之前的程式沒有 gMid，新的程式 gMid 是 50） */
const look = (patch: Partial<Look> = {}): Look => ({ ...DEFAULT_LOOK, ...patch });

interface Case {
  name: string;
  look: Look;
  image: boolean;
  mask: boolean;
  texture?: boolean;
  customFrame?: boolean;
  adjust?: boolean;
}

const CASES: Case[] = [
  { name: '單純・金・沒有圖片', look: look(), image: false, mask: false },
  { name: '單純・金・圖片＋出框', look: look(), image: true, mask: true },
  {
    name: '齒輪・漸層・圖片＋出框',
    look: look({ frame: 'gear', count: 24, depth: 55, colorMode: 'gradient', colorKey: 'lava' }),
    image: true,
    mask: true,
  },
  {
    name: '鉚釘・漸層 90°・陰影',
    look: look({
      frame: 'studs',
      count: 16,
      colorMode: 'gradient',
      g1: '#3ddc84',
      g2: '#0b4f3a',
      gAngle: 90,
      shadow: 40,
    }),
    image: true,
    mask: true,
  },
  {
    name: '細環・霓虹・光暈全部',
    look: look({ frame: 'ring', color: '#00f0ff', lightStrength: 0, glow: 'all', width: 8 }),
    image: true,
    mask: true,
  },
  {
    name: '六角・漸層・配色細節',
    look: look({ frame: 'hex', colorMode: 'gradient', accentOn: true, glow: 'outer' }),
    image: true,
    mask: false,
  },
  {
    name: '花邊・石材質感',
    look: look({ frame: 'scallop', texture: 'stone', texAmount: 85 }),
    image: true,
    mask: true,
    texture: true,
  },
  {
    name: '自訂外框・漸層',
    look: look({ frame: 'custom', colorMode: 'gradient', customInner: 80 }),
    image: true,
    mask: true,
    customFrame: true,
  },
  {
    name: '色彩調整＋效果',
    look: look({ fx: { ...DEFAULT_LOOK.fx, on: true, tone: 'mono', grain: true, vig: true } }),
    image: true,
    mask: true,
    adjust: true,
  },
];

function hashCase(c: Case): string {
  const N = 192;
  const image = c.image
    ? canvasOf(120, 160, (x, y) => [
        (x * 2) & 255,
        (y * 3) & 255,
        ((x + y) * 5) & 255,
        (x - 60) ** 2 + (y - 70) ** 2 < 55 ** 2 ? 255 : 0,
      ])
    : null;
  /* 軟的遮罩：上半部，邊緣漸漸變淡 */
  const mask = c.mask
    ? canvasOf(120, 160, (_x, y) => [255, 255, 255, Math.max(0, Math.min(255, (70 - y) * 12))])
    : null;
  const texture = c.texture
    ? canvasOf(64, 64, (x, y) => [((x * 37) ^ (y * 11)) & 255, (x * y) & 255, 128, 255])
    : null;
  const customFrame = c.customFrame
    ? canvasOf(100, 100, (x, y) => {
        const d = Math.hypot(x - 49.5, y - 49.5);
        return d > 38 && d < 49 ? [255, 255, 255, 255] : [0, 0, 0, 0];
      })
    : null;
  const canvas = renderTokenCanvas(
    {
      N,
      pad: 0.12,
      look: c.look,
      token: {
        id: 't1',
        view: { x: 0.05, y: -0.1, zoom: 1.2, rotate: 8, flip: false },
        popOn: true,
        name: '',
        badge: '',
        adjust: c.adjust ? { bright: 120, contrast: 90, sat: 140, hue: 20 } : defaultAdjust(),
      },
      cacheFrame: false,
    },
    {
      image,
      size: image ? { width: 120, height: 160 } : null,
      popMask: mask,
      texture,
      customFrame,
      customFrameId: customFrame ? 'cf' : null,
      customMask: null,
    },
  );
  const px = (canvas.getContext('2d') as Ctx).getImageData(0, 0, N, N).data;
  return bytesToHex(sha256Sync(new Uint8Array(px.buffer, px.byteOffset, px.byteLength)));
}

function hashEmbed(): string {
  const json = embedJson({
    look: look({ frame: 'gear', colorMode: 'gradient', labelOn: true }),
    token: {
      name: '哥布林',
      badge: '2',
      view: { x: 0.1, y: -0.2, zoom: 1.5, rotate: 10, flip: true },
      popOn: true,
      adjust: { bright: 120, contrast: 90, sat: 100, hue: 5 },
    },
    image: { name: 'goblin.png', type: 'image/png', bytes: Uint8Array.from([1, 2, 3]) },
    mask: { width: 3, height: 4, bytes: Uint8Array.from([9, 8, 7]) },
  });
  return bytesToHex(sha256Sync(new TextEncoder().encode(json)));
}

describe.runIf(!!canvasLib)('沒用新功能時和加入之前相同', () => {
  it('畫出來的像素與嵌入的設定', () => {
    const got: Record<string, string> = {};
    for (const c of CASES) got[c.name] = hashCase(c);
    got.embedJson = hashEmbed();
    if (WRITE || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, `${JSON.stringify(got, null, 2)}\n`);
      if (!WRITE) throw new Error('基準檔不存在，已產生；請確認是加入之前的程式產生的');
      return;
    }
    expect(got).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  });
});
