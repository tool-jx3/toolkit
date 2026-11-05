/**
 * SF 證件的「數位證件」模式（規格 F91）：卡片像是從裝置無線傳過來的數位文件——背後一片矩陣（落下的字、格線、
 * 透視的地板、光點），卡片四周的光暈與全像角框，左下角的發射器讀數、右下角傳完的連線紀錄。預覽＝匯出：開著時 PNG 是整個場景
 * （不透明、比卡片大）。場景依編號決定（每次畫的一樣）；顏色跟著卡片的強調色或墨色（在背景上看得清楚時），否則青色／近黑。
 * 做法與數值照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/digital.js 改寫；字改成本站的（繁中）。
 */
import { seededRandom } from '../colors';
import { type Ctx, type DrawEnv, fontString, recordFont } from '../kit';
import type { Rect } from './geom';

/** 背景的預設：夜色（'auto'）＋5 個暗色、8 個亮色的色票（照原作） */
export const DIGITAL_SWATCHES: readonly string[] = [
  '#1a0b2e',
  '#001a1f',
  '#1f0510',
  '#0b1f0b',
  '#0d1530',
  '#ff6b6b',
  '#feca57',
  '#1dd1a1',
  '#00d2d3',
  '#54a0ff',
  '#a29bfe',
  '#ff9ff3',
  '#e8e4d8',
];

/** 場景四周的留白（場景單位；1 單位＝卡片短邊 ÷ 640） */
export const DIGITAL_MARGIN = { side: 150, top: 130, bottom: 210 } as const;

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF';
const CYAN = '#00f0ff';
const NIGHT: [string, string] = ['#0a0d16', '#030307'];

const rgbOf = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luma = ([r, g, b]: readonly number[]) => 0.299 * r + 0.587 * g + 0.114 * b;
const hexOf = (c: readonly number[]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const isHex = (s: string | null | undefined): s is string => !!s && /^#[0-9a-f]{6}$/i.test(s);

/** 背景的漸層：[中央, 四周]（夜色，或自己的顏色往暗 45%） */
export function digitalBackdrop(bg: string | null): [string, string] {
  if (!isHex(bg)) return NIGHT;
  return [bg, hexOf(rgbOf(bg).map((v) => v * 0.45))];
}

/** 場景的顏色（"r,g,b"）：強調色、其次墨色，比背景亮（暗背景）或暗（亮背景）得夠多才用；否則青色／近黑 */
export function digitalTint(bg: string | null, accent: string, ink: string): string {
  const bl = luma(rgbOf(digitalBackdrop(bg)[0]));
  const dark = bl < 128;
  const ok = (h: string) =>
    isHex(h) && (dark ? luma(rgbOf(h)) >= Math.max(70, bl + 60) : luma(rgbOf(h)) <= bl - 70);
  const c = [accent, ink].find(ok) ?? (dark ? CYAN : '#0a0d16');
  return rgbOf(c).join(',');
}

export interface DigitalLayout {
  /** 整張（原生像素） */
  w: number;
  h: number;
  /** 卡片的畫布放在哪（原生像素） */
  x: number;
  y: number;
  /** 場景單位（原生像素） */
  u: number;
}

/** 場景的大小與卡片的位置（卡片畫布 cw × ch，原生像素） */
export function digitalLayout(cw: number, ch: number): DigitalLayout {
  const u = Math.min(cw, ch) / 640;
  const M = DIGITAL_MARGIN;
  return { w: cw + 2 * M.side * u, h: ch + (M.top + M.bottom) * u, x: M.side * u, y: M.top * u, u };
}

/** 連線紀錄與讀數的字 */
export interface DigitalTexts {
  readout: readonly [string, string];
  log: readonly string[];
}

interface Scene {
  ctx: Ctx;
  W: number;
  H: number;
  u: number;
  rgb: string;
  cols: { x: number; y: number; n: number; g: string[] }[];
  motes: { x: number; y: number; s: number; a: number }[];
}

const col = (sc: Scene, a: number) => `rgba(${sc.rgb},${a})`;

function scene(ctx: Ctx, W: number, H: number, u: number, rgb: string, seed: string): Scene {
  const rand = seededRandom(seed || 'sinforge');
  const r = (a: number, b: number) => a + rand() * (b - a);
  const cols: Scene['cols'] = [];
  for (let x = 6 * u; x < W + 40 * u; x += 18 * u)
    cols.push({
      x,
      y: r(-0.2, 1.2) * H,
      n: 6 + Math.floor(r(0, 10)),
      g: [...Array(16)].map(() => GLYPHS[Math.floor(r(0, GLYPHS.length))]),
    });
  const motes = [...Array(Math.round((W * H) / (14000 * u * u)))].map(() => ({
    x: r(0, W),
    y: r(0, H),
    s: r(1, 2.6),
    a: r(0.25, 0.6),
  }));
  return { ctx, W, H, u, rgb, cols, motes };
}

function drawRain(sc: Scene, env: DrawEnv | null) {
  const { ctx, H, u } = sc;
  const pitch = 16 * u;
  ctx.font = fontString('mono', 13 * u, 400);
  if (env) recordFont(env, 'mono', 400, GLYPHS);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const c of sc.cols)
    for (let i = 0; i < c.n; i++) {
      const y = c.y - i * pitch;
      if (y < -pitch || y > H + pitch) continue;
      ctx.fillStyle = col(sc, i ? 0.22 * (1 - i / c.n) : 0.55);
      ctx.fillText(c.g[i & 15], c.x, y);
    }
  ctx.textAlign = 'left';
}

function drawGrid(sc: Scene) {
  const { ctx, W, H, u } = sc;
  const step = 46 * u;
  ctx.strokeStyle = col(sc, 0.07);
  ctx.lineWidth = u;
  ctx.beginPath();
  for (let x = -step; x < W + step; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
  }
  for (let y = -step; y < H + step; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.stroke();
  ctx.fillStyle = col(sc, 0.22);
  for (let x = -step; x < W + step; x += step)
    for (let y = -step; y < H + step; y += step) ctx.fillRect(x - u, y - u, 2 * u, 2 * u);
}

/** 從地平線往下的透視地板＋地平線的光 */
function drawFloor(sc: Scene) {
  const { ctx, W, H, u } = sc;
  const hz = H * 0.62;
  const vx = W / 2;
  const g = ctx.createLinearGradient(0, hz, 0, H);
  g.addColorStop(0, col(sc, 0));
  g.addColorStop(1, col(sc, 0.35));
  ctx.strokeStyle = g;
  ctx.lineWidth = u;
  ctx.beginPath();
  for (let i = -14; i <= 14; i++) {
    ctx.moveTo(vx + i * 6 * u, hz);
    ctx.lineTo(vx + i * W * 0.16, H + 40 * u);
  }
  for (let i = 0; i < 14; i++) {
    const z = (i + 0.5) / 14;
    const y = hz + (H - hz) * z * z;
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  const hg = ctx.createLinearGradient(0, hz - 30 * u, 0, hz + 6 * u);
  hg.addColorStop(0, col(sc, 0));
  hg.addColorStop(1, col(sc, 0.12));
  ctx.fillStyle = hg;
  ctx.fillRect(0, hz - 30 * u, W, 36 * u);
}

function drawMotes(sc: Scene) {
  const { ctx, u } = sc;
  for (const m of sc.motes) {
    ctx.fillStyle = col(sc, m.a);
    ctx.fillRect(m.x, m.y, m.s * u, m.s * u);
  }
}

/** 卡片外形四周的全像角框（b：外形的範圍）與下方兩角的讀數、紀錄 */
function drawOverlay(sc: Scene, b: Rect, texts: DigitalTexts, env: DrawEnv | null) {
  const { ctx, W, H, u } = sc;
  const o = 12 * u;
  const l = 28 * u;
  const th = 3 * u;
  const x0 = b.x;
  const y0 = b.y;
  const x1 = b.x + b.w;
  const y1 = b.y + b.h;
  ctx.fillStyle = col(sc, 0.8);
  for (const [x, y, sx, sy] of [
    [x0 - o, y0 - o, 1, 1],
    [x1 + o, y0 - o, -1, 1],
    [x0 - o, y1 + o, 1, -1],
    [x1 + o, y1 + o, -1, -1],
  ]) {
    ctx.fillRect(sx > 0 ? x : x - l, sy > 0 ? y : y - th, l, th);
    ctx.fillRect(sx > 0 ? x : x - th, sy > 0 ? y : y - l, th, l);
  }
  const fs = 15 * u;
  const lh = fs * 1.45;
  const pad = 22 * u;
  const base = H - pad;
  ctx.save();
  ctx.shadowColor = col(sc, 0.5);
  ctx.shadowBlur = 6 * u;
  /* 發射器：天線的弧＋一點，旁邊是讀數 */
  const ax = pad + 18 * u;
  const ay = base - 8 * u;
  ctx.strokeStyle = col(sc, 0.85);
  ctx.lineWidth = 2.5 * u;
  for (const r of [7, 13, 19]) {
    ctx.beginPath();
    ctx.arc(ax, ay, r * u, -Math.PI * 0.82, -Math.PI * 0.18);
    ctx.stroke();
  }
  ctx.fillStyle = col(sc, 0.85);
  ctx.beginPath();
  ctx.arc(ax, ay, 2.2 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = fontString('mono', fs, 400);
  const lines = texts.log.map((s) => `> ${s}`);
  if (env) recordFont(env, 'mono', 400, [...texts.readout, ...lines].join(''));
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(texts.readout[0], ax + 30 * u, base - lh);
  ctx.fillText(texts.readout[1], ax + 30 * u, base);
  ctx.textAlign = 'right';
  lines.forEach((s, i) => {
    ctx.fillText(s, W - pad, base - (lines.length - 1 - i) * lh);
  });
  ctx.textAlign = 'left';
  ctx.restore();
}

export interface DigitalPaint {
  /** 卡片的畫布（已經畫好；k 倍） */
  card: CanvasImageSource & { width: number; height: number };
  /** 每個原生像素幾個畫布像素 */
  k: number;
  layout: DigitalLayout;
  /** 卡片外形的範圍（原生像素、卡片畫布的座標） */
  shape: Rect;
  bg: string | null;
  accent: string;
  ink: string;
  seed: string;
  texts: DigitalTexts;
  /** 記字型用（預覽） */
  env?: DrawEnv | null;
}

/** 卡片的畫布在場景裡的位置（整數像素，卡片才不會糊） */
export const digitalCardOffset = (layout: DigitalLayout, k: number) => ({
  x: Math.round(layout.x * k),
  y: Math.round(layout.y * k),
});

/** 畫整個場景到 ctx（ctx 是 round(layout.w × k) × round(layout.h × k) 的畫布，沒有變換） */
export function paintDigital(ctx: Ctx, p: DigitalPaint): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const u = p.layout.u * p.k;
  const env = p.env ?? null;
  const rgb = digitalTint(p.bg, p.accent, p.ink);
  const [bg0, bg1] = digitalBackdrop(p.bg);
  ctx.save();
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.hypot(W, H) * 0.5);
  g.addColorStop(0, bg0);
  g.addColorStop(1, bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const sc = scene(ctx, W, H, u, rgb, p.seed);
  drawRain(sc, env);
  drawGrid(sc);
  drawFloor(sc);
  drawMotes(sc);
  /* 卡片的光暈：只畫影子（卡片畫在畫布外面、影子移回來），再把卡片畫上去 */
  const { x: cx, y: cy } = digitalCardOffset(p.layout, p.k);
  const cw = p.card.width;
  for (const [blur, a] of [
    [10, 0.45],
    [28, 0.18],
  ] as const) {
    ctx.save();
    ctx.shadowColor = col(sc, a);
    ctx.shadowBlur = blur * u;
    ctx.shadowOffsetX = W + cw;
    ctx.drawImage(p.card, cx - W - cw, cy);
    ctx.restore();
  }
  ctx.drawImage(p.card, cx, cy);
  const s = p.shape;
  drawOverlay(
    sc,
    { x: cx + s.x * p.k, y: cy + s.y * p.k, w: s.w * p.k, h: s.h * p.k },
    p.texts,
    env,
  );
  ctx.restore();
}
