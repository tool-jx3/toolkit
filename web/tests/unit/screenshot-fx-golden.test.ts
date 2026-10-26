/**
 * 截圖演出產生器：共用引擎（core/imagefx）抽出前後，畫出來的每一格逐像素相同。
 *
 * 基準檔 `fixtures/screenshot-fx-golden.json` 是**抽出之前**的程式（commit 83ece3d 的 screenshot-fx）在 node-canvas 上
 * 畫的：每個場景、每個時間（含運鏡、圖層、逐步公開）的 RGBA 的 SHA-256。之後引擎改了、screenshot-fx 的輸出跟著變，
 * 這個測試就會失敗——要刻意改變外觀時，用 `UPDATE_GOLDEN=1 npx vitest run tests/unit/screenshot-fx-golden.test.ts` 重新產生並在規格寫明。
 * 場景涵蓋三種背景、四種放大框樣式、七種螢光筆、三種塗黑 × 三種動作 × 兩種方向、邊界演出、聚光、透明截圖、依序／同時、運鏡。
 * 沒有出處文字（字型因機器而異）。沒有 node-canvas 時跳過。
 */
import { describe, expect, it } from 'vitest';
import {
  cameraView,
  computeLayout,
  type Frame,
  type FxState,
  initialState,
  type LayerId,
  stepFrames,
  stepProgress,
  timelineOf,
} from '@/tools/screenshot-fx/model';
import { RenderCache, type RenderOptions, renderToCanvas } from '@/tools/screenshot-fx/render';
import { nodeCanvas } from '../helpers/nodeCanvas';

const nc = await nodeCanvas();

type Img = OffscreenCanvas;
type G = OffscreenCanvasRenderingContext2D;

interface NodeFs {
  readFileSync(p: string, enc: 'utf8'): string;
  writeFileSync(p: string, s: string): void;
  existsSync(p: string): boolean;
}
const dyn = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>;
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const GOLDEN = new URL('./fixtures/screenshot-fx-golden.json', import.meta.url).pathname;

/** 測試圖：漸層＋細條紋＋色塊＋一塊透明（480 × 300） */
function testImage(): Img {
  const c = nc?.createCanvas(480, 300) as Img;
  const g = c.getContext('2d') as G;
  const lg = g.createLinearGradient(0, 0, 480, 300);
  lg.addColorStop(0, '#f4efe2');
  lg.addColorStop(1, '#5a7da8');
  g.fillStyle = lg;
  g.fillRect(0, 0, 480, 300);
  const cols = ['#d33', '#3a3', '#33d', '#111', '#fff'];
  for (let x = 0; x < 480; x += 6) {
    g.fillStyle = cols[(x / 6) % cols.length];
    g.fillRect(x, 40, 3, 60);
  }
  for (let y = 120; y < 280; y += 10) {
    g.fillStyle = y % 20 ? '#222' : '#e8e8e8';
    g.fillRect(30, y, 240, 4);
  }
  g.fillStyle = '#ffcc00';
  g.fillRect(300, 150, 120, 90);
  g.clearRect(400, 10, 70, 60);
  return c;
}

let seq = 0;
const id = () => `g${++seq}`;
const zoom = (o: Partial<Frame> & Record<string, unknown>): Frame =>
  ({
    id: id(),
    kind: 'zoom',
    x: 20,
    y: 30,
    w: 160,
    h: 90,
    scale: 1.25,
    style: 'card',
    border: 4,
    ...o,
  }) as Frame;
const marker = (o: Record<string, unknown>): Frame =>
  ({
    id: id(),
    kind: 'marker',
    x: 40,
    y: 50,
    w: 140,
    h: 30,
    style: 'yellow',
    dir: 'h',
    ...o,
  }) as Frame;
const redact = (o: Record<string, unknown>): Frame =>
  ({
    id: id(),
    kind: 'redact',
    x: 300,
    y: 150,
    w: 120,
    h: 90,
    style: 'black',
    mode: 'reveal',
    dir: 'h',
    density: 100,
    grain: 12,
    edge: 'glow',
    glow: 70,
    ...o,
  }) as Frame;

function base(): FxState {
  const s = initialState();
  s.canvas = 'original';
  s.image = { id: 'img', name: 'golden.png', width: 480, height: 300 };
  return s;
}

/** 場景（名稱 → 狀態） */
function scenes(): Record<string, FxState> {
  seq = 0;
  const out: Record<string, FxState> = {};

  /* A：模糊背景、所有螢光筆、三種塗黑、跟放大框重疊 */
  const a = base();
  a.frames = [
    zoom({ x: 20, y: 30, w: 200, h: 100 }),
    marker({ x: 30, y: 45, w: 150, h: 30, style: 'yellow', dir: 'h' }),
    marker({ x: 200, y: 120, w: 40, h: 120, style: 'pink', dir: 'v' }),
    marker({ x: 250, y: 30, w: 80, h: 24, style: 'green' }),
    marker({ x: 250, y: 60, w: 80, h: 24, style: 'blue', dir: 'v' }),
    marker({ x: 40, y: 140, w: 160, h: 40, style: 'redBox' }),
    marker({ x: 40, y: 190, w: 160, h: 30, style: 'redBox', dir: 'v' }),
    marker({ x: 40, y: 230, w: 160, h: 20, style: 'redLine' }),
    marker({ x: 220, y: 230, w: 30, h: 60, style: 'redLine', dir: 'v' }),
    marker({ x: 40, y: 260, w: 160, h: 24, style: 'redStrike' }),
    marker({ x: 260, y: 200, w: 30, h: 90, style: 'redStrike', dir: 'v' }),
    redact({
      x: 100,
      y: 60,
      w: 100,
      h: 40,
      style: 'black',
      mode: 'reveal',
      dir: 'h',
      edge: 'glow',
    }),
    redact({ x: 300, y: 150, w: 120, h: 90, style: 'mosaic', mode: 'static', grain: 10 }),
    redact({
      x: 330,
      y: 20,
      w: 60,
      h: 100,
      style: 'frost',
      mode: 'conceal',
      dir: 'v',
      edge: 'scan',
    }),
    redact({
      x: 360,
      y: 250,
      w: 100,
      h: 40,
      style: 'black',
      mode: 'conceal',
      density: 60,
      edge: 'none',
    }),
    redact({ x: 150, y: 10, w: 60, h: 60, style: 'mosaic', mode: 'reveal', dir: 'v', glow: 100 }),
    redact({ x: 250, y: 100, w: 40, h: 40, style: 'frost', mode: 'static', density: 40 }),
  ];
  out.A = a;

  /* B：透明背景、四種放大框樣式、聚光、透明截圖處 */
  const b = base();
  b.bg.mode = 'transparent';
  b.shot.spotlight = 70;
  b.frames = [
    zoom({ x: 10, y: 10, w: 120, h: 80, style: 'card', border: 2 }),
    zoom({ x: 140, y: 30, w: 120, h: 80, style: 'torn', border: 6, scale: 1.5 }),
    zoom({ x: 380, y: 0, w: 100, h: 90, style: 'cyber', border: 4, scale: 1.1 }),
    zoom({ x: 280, y: 180, w: 150, h: 100, style: 'shadow', scale: 1.65 }),
    marker({ x: 300, y: 200, w: 90, h: 30, style: 'yellow' }),
    redact({ x: 160, y: 50, w: 60, h: 30, style: 'black', mode: 'reveal' }),
  ];
  out.B = b;

  /* C：單色背景、直的畫面、同時、圓角與陰影 */
  const c = base();
  c.canvas = '1080x1920';
  c.bg = { mode: 'solid', blur: 24, brightness: 40, color: '#e6e0ff' };
  c.shot = { scale: 70, radius: 30, shadow: 64, spotlight: 0 };
  c.timing = { ...c.timing, order: 'simultaneous', action: 2 };
  c.frames = [
    zoom({ x: 200, y: 100, w: 200, h: 150, style: 'torn' }),
    marker({ x: 220, y: 120, w: 120, h: 30, style: 'redBox' }),
    redact({ x: 260, y: 160, w: 100, h: 60, style: 'frost', mode: 'reveal', dir: 'v' }),
  ];
  out.C = c;

  /* D：1920 × 1080 模糊背景（亮度、半徑不同）、運鏡（起點） */
  const d = base();
  d.canvas = '1920x1080';
  d.bg = { mode: 'blur', blur: 6, brightness: 75, color: '#10131a' };
  d.camera = { mode: 'pullback', target: 'auto', focus: 'start', zoom: 3, duration: 2.5 };
  d.frames = [
    zoom({ x: 20, y: 30, w: 220, h: 120, style: 'cyber' }),
    marker({ x: 40, y: 50, w: 150, h: 30, style: 'yellow' }),
    redact({ x: 300, y: 150, w: 120, h: 90, style: 'mosaic', mode: 'reveal', grain: 24 }),
  ];
  out.D = d;

  /* E：運鏡（中心、指定對象、直向），沒有放大框 */
  const e = base();
  e.canvas = '1200x900';
  e.frames = [
    marker({ x: 60, y: 60, w: 30, h: 160, style: 'blue', dir: 'v' }),
    redact({
      x: 200,
      y: 100,
      w: 200,
      h: 100,
      style: 'black',
      mode: 'conceal',
      dir: 'v',
      edge: 'scan',
      glow: 40,
    }),
  ];
  e.camera = {
    mode: 'pullback',
    target: e.frames[1].id,
    focus: 'center',
    zoom: 2.2,
    duration: 1.5,
  };
  out.E = e;
  return out;
}

interface Job {
  key: string;
  state: FxState;
  t: number;
  opts?: RenderOptions & { camera?: boolean };
}

function jobs(): Job[] {
  const list: Job[] = [];
  for (const [name, s] of Object.entries(scenes())) {
    const tl = timelineOf(s);
    const times = new Set<number>([0, tl.total]);
    const { intro, popup, action } = tl.phases;
    times.add((popup.start + popup.end) / 2);
    times.add(popup.end);
    for (let i = 1; i <= 7; i++) times.add(action.start + ((action.end - action.start) * i) / 8);
    times.add(intro.end * 0.5);
    for (const t of [...times].sort((x, y) => x - y)) {
      const r = Math.round(t * 1e4) / 1e4;
      list.push({ key: `${name}@${r}`, state: s, t });
      if (s.camera.mode === 'pullback')
        list.push({ key: `${name}@${r}:camera`, state: s, t, opts: { camera: true } });
    }
    for (const layer of ['background', 'cutouts', 'markers', 'final'] as LayerId[])
      list.push({ key: `${name}:layer:${layer}`, state: s, t: tl.total, opts: { layer } });
    const n = stepFrames(s.frames).length + 1;
    for (let k = 0; k < n; k++)
      list.push({
        key: `${name}:step:${k}`,
        state: s,
        t: 0,
        opts: { progress: stepProgress(s.frames, k) },
      });
  }
  return list;
}

async function sha(data: Uint8ClampedArray): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe.runIf(nc)('screenshot-fx 的輸出與共用引擎抽出之前逐像素相同', () => {
  it('每個場景、每個時間、運鏡、圖層、逐步公開的 RGBA 都和基準相同', async () => {
    const img = testImage();
    const got: Record<string, string> = {};
    for (const j of jobs()) {
      const s = j.state;
      const opts: RenderOptions = { ...j.opts };
      if (j.opts?.camera) opts.view = cameraView(s, computeLayout(s, img), timelineOf(s), j.t);
      const c = renderToCanvas({ state: s, image: img }, j.t, new RenderCache(), opts) as Img;
      const g = c.getContext('2d') as G;
      got[j.key] =
        `${c.width}x${c.height}:${await sha(g.getImageData(0, 0, c.width, c.height).data)}`;
    }
    const fs = await dyn<NodeFs>('node:fs');
    if (env?.UPDATE_GOLDEN) fs.writeFileSync(GOLDEN, `${JSON.stringify(got, null, 1)}\n`);
    const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Record<string, string>;
    expect(Object.keys(got).length).toBeGreaterThan(120);
    expect(got).toEqual(want);
  }, 120_000);
});
