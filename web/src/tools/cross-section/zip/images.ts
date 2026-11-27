/**
 * 房間 ZIP 的圖（瀏覽器；本站自己的設計）：
 * - 場景的前景：盤面大小的透明畫布，地圖本體畫在（左 2、上 2 格），地圖下面一塊寫作品名與場景名的小牌子。
 *   畫法和匯出 PNG 的「只有地圖本體」相同（公開差分用；祕密區域的東西剪在區域裡）。
 * - 場景的背景：1280 × 720，環境的顏色由上往下漸層＋點的格子＋四周暗下去。
 * - 遮罩（整塊不透明）：暗的鐵捲門（上面的捲門箱、一條一條的橫肋、下面的底樑與兩個把手）、
 *   濃霧（藍灰的底、一團一團的霧、四周暗）、禁止進入的牌子（暗的底、交叉的黃色封鎖帶，帶上寫「禁止進入」）；
 *   中間一塊淺色的牌子：編號（有名字時下面寫名字）。
 * - 祕密區域的偽裝：PL 用、白天・平常的地圖本體，照區域的範圍逐像素裁下來（每個場景的那個範圍都和這張相同）。
 * - KP 操作說明：1280 × 860，上面一條紫色的標題帶，左邊是步驟、右邊是螢幕面板的一覽。
 */
import { ensureFont } from '@/core/fonts';
import { canvasToBlob } from '@/core/image';
import { floodFor } from '../draw/export';
import { rng } from '../draw/kit';
import { alpha, paletteOf } from '../draw/palette';
import { drawDoc, type Plan } from '../draw/scene';
import { SANS } from '../draw/text';
import type { Rect } from '../model/layout';
import type { Audience, EnvId, SectionDoc } from '../model/types';
import { S } from '../strings';
import { type Board, GUIDE_PX, type MaskStyle, type Panel, type SceneDef } from './plan';

export const pngBytes = async (c: HTMLCanvasElement): Promise<Uint8Array> =>
  new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer());

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas');
  return { c, g };
}

/** 用到的字（遮罩、牌子、說明圖）先載好 */
export async function ensureZipFonts(text: string): Promise<void> {
  await Promise.all(
    [400, 700, 900].map((w) => ensureFont('Noto Sans TC', w, text, { timeoutMs: 5000 })),
  );
}

/* ---------- 場景 ---------- */

/** 盤面大小的畫布，地圖本體畫在（左 2、上 2 格）；其他地方透明 */
export function boardCanvas(
  doc: SectionDoc,
  plan: Plan,
  b: Board,
  env: EnvId,
  flood: boolean,
  audience: Audience,
): HTMLCanvasElement {
  const { c, g } = canvas(b.cols * b.cell, b.rows * b.cell);
  g.setTransform(
    b.cell,
    0,
    0,
    b.cell,
    (b.padL - b.world.x) * b.cell,
    (b.padT - b.world.y) * b.cell,
  );
  drawDoc(
    g,
    doc,
    { audience, env, flood: floodFor(doc, flood), crop: 'map', seal: audience === 'reveal' },
    plan,
  );
  return c;
}

/** 地圖下面的小牌子：作品名・場景名 */
export function drawScenePlate(
  c: HTMLCanvasElement,
  doc: SectionDoc,
  b: Board,
  scene: SceneDef,
): void {
  const g = c.getContext('2d');
  if (!g) return;
  const p = paletteOf(doc.style);
  const x = b.padL * b.cell;
  const y = (b.padT + b.world.h + 0.45) * b.cell;
  const size = Math.round(b.cell * 0.42);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = `700 ${size}px ${SANS}`;
  const text = `${doc.title}　·　${scene.name}`;
  const w = Math.min(g.measureText(text).width + size * 1.4, b.world.w * b.cell);
  g.fillStyle = alpha(p.paper, 0.92);
  g.strokeStyle = p.ink;
  g.lineWidth = Math.max(1, b.cell * 0.04);
  g.beginPath();
  g.roundRect(x, y, w, size * 1.9, size * 0.4);
  g.fill();
  g.stroke();
  g.fillStyle = p.ink;
  g.textBaseline = 'middle';
  g.fillText(text, x + size * 0.7, y + size * 0.97, w - size * 1.4);
  g.restore();
}

const WALL: Record<SceneDef['key'], [string, string]> = {
  day: ['#292645', '#1e1932'],
  night: ['#1a1838', '#0d0823'],
  blackout: ['#260a1e', '#11011a'],
  after: ['#341c12', '#181901'],
  flood: ['#122a49', '#070e29'],
};

/** 場景的背景（盤面外側） */
export async function wallpaperPng(key: SceneDef['key']): Promise<Uint8Array> {
  const { c, g } = canvas(1280, 720);
  const [top, bottom] = WALL[key];
  const grad = g.createLinearGradient(0, 0, 0, 720);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1280, 720);
  g.fillStyle = 'rgba(214, 208, 255, 0.07)';
  for (let y = 20; y < 720; y += 40)
    for (let x = 20; x < 1280; x += 40) {
      g.beginPath();
      g.arc(x, y, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  const v = g.createRadialGradient(640, 360, 200, 640, 360, 760);
  v.addColorStop(0, 'rgba(0, 0, 0, 0)');
  v.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  g.fillStyle = v;
  g.fillRect(0, 0, 1280, 720);
  return pngBytes(c);
}

/** 從盤面大小的畫布裁下一塊（逐像素；世界座標的範圍） */
export async function cropPng(src: HTMLCanvasElement, b: Board, r: Rect): Promise<Uint8Array> {
  const sx = Math.round((b.padL + r.x - b.world.x) * b.cell);
  const sy = Math.round((b.padT + r.y - b.world.y) * b.cell);
  const { c, g } = canvas(r.w * b.cell, r.h * b.cell);
  g.drawImage(src, sx, sy, c.width, c.height, 0, 0, c.width, c.height);
  return pngBytes(c);
}

/* ---------- 遮罩 ---------- */

function plate(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  cell: number,
  code: string,
  label: string,
) {
  const pw = Math.min(w - cell * 0.3, Math.max(cell * 2.4, w * 0.6));
  const ph = Math.min(h - cell * 0.3, cell * (label ? 1.6 : 1.15));
  const x = (w - pw) / 2;
  const y = (h - ph) / 2;
  g.save();
  g.fillStyle = '#fbe5ec';
  g.strokeStyle = '#7c4dff';
  g.lineWidth = Math.max(2, cell * 0.06);
  g.beginPath();
  g.roundRect(x, y, pw, ph, cell * 0.18);
  g.fill();
  g.stroke();
  g.fillStyle = '#262646';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (label) {
    g.font = `700 ${Math.round(cell * 0.32)}px ${SANS}`;
    g.fillText(code, w / 2, y + ph * 0.3, pw - cell * 0.3);
    const size = Math.min(cell * 0.46, (pw - cell * 0.3) / Math.max(3, [...label].length));
    g.font = `900 ${Math.round(Math.max(cell * 0.24, size))}px ${SANS}`;
    g.fillText(label, w / 2, y + ph * 0.68, pw - cell * 0.3);
  } else {
    g.font = `900 ${Math.round(cell * 0.5)}px ${SANS}`;
    g.fillText(code, w / 2, y + ph / 2, pw - cell * 0.3);
  }
  g.restore();
}

function shutter(g: CanvasRenderingContext2D, w: number, h: number, cell: number) {
  g.fillStyle = '#232542';
  g.fillRect(0, 0, w, h);
  const rib = cell * 0.28;
  for (let y = cell * 0.55; y < h - cell * 0.3; y += rib) {
    g.fillStyle = 'rgba(214, 216, 240, 0.12)';
    g.fillRect(0, y, w, Math.max(1, rib * 0.18));
    g.fillStyle = 'rgba(0, 0, 0, 0.28)';
    g.fillRect(0, y + rib * 0.7, w, Math.max(1, rib * 0.2));
  }
  g.fillStyle = '#343456';
  g.fillRect(0, 0, w, cell * 0.55);
  g.fillStyle = 'rgba(214, 216, 240, 0.35)';
  for (let x = cell * 0.4; x < w; x += cell * 1.2) {
    g.beginPath();
    g.arc(x, cell * 0.28, cell * 0.05, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#4a4266';
  g.fillRect(0, h - cell * 0.3, w, cell * 0.3);
  g.fillStyle = '#a7a9c4';
  for (const x of [w * 0.25, w * 0.75])
    g.fillRect(x - cell * 0.2, h - cell * 0.42, cell * 0.4, cell * 0.12);
}

function fog(g: CanvasRenderingContext2D, w: number, h: number, cell: number, seed: number) {
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#353c5c');
  base.addColorStop(1, '#282746');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  const n = Math.max(6, Math.round((w * h) / (cell * cell * 2)));
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = cell * (0.8 + r() * 1.8);
    const blob = g.createRadialGradient(x, y, 0, x, y, rad);
    blob.addColorStop(0, `rgba(226, 226, 246, ${(0.08 + r() * 0.12).toFixed(3)})`);
    blob.addColorStop(1, 'rgba(226, 226, 246, 0)');
    g.fillStyle = blob;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const v = g.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.2,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.7,
  );
  v.addColorStop(0, 'rgba(14, 4, 30, 0)');
  v.addColorStop(1, 'rgba(14, 4, 30, 0.5)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

function sign(g: CanvasRenderingContext2D, w: number, h: number, cell: number) {
  g.fillStyle = '#261c34';
  g.fillRect(0, 0, w, h);
  const band = cell * 0.55;
  const tape = (a: number) => {
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(a);
    const len = Math.hypot(w, h) + band;
    g.fillStyle = '#e8c33a';
    g.fillRect(-len / 2, -band / 2, len, band);
    g.fillStyle = '#1d1226';
    g.font = `900 ${Math.round(band * 0.6)}px ${SANS}`;
    g.textBaseline = 'middle';
    const step = band * 6;
    for (let x = -len / 2 + band * 0.4; x < len / 2; x += step) g.fillText(S.zip.signText, x, 0);
    g.restore();
  };
  const a = Math.atan2(h, w);
  tape(a);
  tape(-a);
}

/** 一個遮罩（區域的大小；整塊不透明） */
export async function maskPng(
  style: MaskStyle,
  r: Rect,
  cell: number,
  code: string,
  label: string,
  seed: number,
): Promise<Uint8Array> {
  const { c, g } = canvas(r.w * cell, r.h * cell);
  const w = c.width;
  const h = c.height;
  if (style === 'fog') fog(g, w, h, cell, seed);
  else if (style === 'sign') sign(g, w, h, cell);
  else shutter(g, w, h, cell);
  g.strokeStyle = 'rgba(214, 216, 240, 0.35)';
  g.lineWidth = Math.max(2, cell * 0.05);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
  plate(g, w, h, cell, code, label);
  return pngBytes(c);
}

/* ---------- KP 操作說明 ---------- */

export interface GuideInfo {
  title: string;
  board: Board;
  scenes: readonly string[];
  cutins: readonly string[];
  panels: readonly Panel[];
  /** 放進房間的那一張：祕密區域、無記名、不寫名字的房間不寫名字 */
  safe: boolean;
  /** 說明圖也在螢幕面板一覽裡 */
  inRoom: boolean;
}

function wrapPx(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW && line) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

export async function guidePng(o: GuideInfo): Promise<Uint8Array> {
  const { w: W, h: H } = GUIDE_PX;
  const { c, g } = canvas(W, H);
  const ink = '#262646';
  g.fillStyle = '#ffecfc';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#5b3fd1';
  g.fillRect(0, 0, W, 96);
  g.fillStyle = '#ffffff';
  g.font = `900 30px ${SANS}`;
  g.textBaseline = 'alphabetic';
  g.fillText(S.zip.guideTitle(o.title), 40, 52, W - 80);
  g.font = `400 16px ${SANS}`;
  g.fillStyle = 'rgba(255, 255, 255, 0.82)';
  g.fillText(S.zip.guideSub, 40, 80);
  /* 左：步驟 */
  const steps = S.zip.guideSteps;
  const b = o.board;
  const texts = [
    steps[0],
    steps[1](b.fieldWidth, b.fieldHeight, b.cell, b.scale === 2),
    steps[2],
    steps[3],
    steps[4](o.scenes.join('、')),
    steps[5](o.cutins.join('　')),
    steps[6],
  ];
  let y = 136;
  g.font = `400 17px ${SANS}`;
  texts.forEach((t, i) => {
    g.fillStyle = '#5b3fd1';
    g.beginPath();
    g.arc(52, y - 6, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `700 15px ${SANS}`;
    g.textAlign = 'center';
    g.fillText(String(i + 1), 52, y - 1);
    g.textAlign = 'left';
    g.font = `400 17px ${SANS}`;
    g.fillStyle = ink;
    for (const line of wrapPx(g, t, 520)) {
      g.fillText(line, 76, y);
      y += 26;
    }
    y += 12;
  });
  if (o.inRoom) {
    g.fillStyle = '#7d7da0';
    g.font = `400 14px ${SANS}`;
    g.fillText(S.zip.guideFoot, 40, H - 28);
  }
  /* 右：螢幕面板的一覽 */
  const rx = 640;
  g.fillStyle = ink;
  g.font = `700 20px ${SANS}`;
  g.fillText(`${S.zip.guideTable}（${o.panels.length}）`, rx, 136);
  g.fillStyle = '#ebe7fb';
  g.fillRect(rx, 152, 600, 30);
  g.fillStyle = ink;
  g.font = `700 14px ${SANS}`;
  const T = S.zip.table;
  g.fillText(T.code, rx + 10, 172);
  g.fillText(T.name, rx + 140, 172);
  g.fillText(T.start, rx + 520, 172);
  const max = 22;
  let ry = 206;
  o.panels.slice(0, max).forEach((p, i) => {
    if (i % 2) {
      g.fillStyle = '#f6eafd';
      g.fillRect(rx, ry - 20, 600, 28);
    }
    const hide = o.safe && (p.kind === 'camo' || p.memo === p.code);
    g.fillStyle = p.kind === 'camo' && !o.safe ? '#b0459e' : ink;
    g.font = `700 14px ${SANS}`;
    g.fillText(p.code, rx + 10, ry, 120);
    g.font = `400 14px ${SANS}`;
    g.fillText(hide ? S.zip.guideHidden : `${p.place}　${p.name}`, rx + 140, ry, 360);
    g.fillStyle = '#7d7da0';
    g.fillText(p.kind !== 'camo' && p.open ? T.open : T.covered, rx + 520, ry);
    ry += 28;
  });
  if (o.panels.length > max) {
    g.fillStyle = '#7d7da0';
    g.font = `400 14px ${SANS}`;
    g.fillText(S.zip.guideMore(o.panels.length - max), rx + 10, ry);
  }
  return pngBytes(c);
}

/** 房間 ZIP 用到的字（字型只載這些） */
export function zipText(panels: readonly Panel[], title: string): string {
  return [
    title,
    ...panels.flatMap((p) => [p.code, p.name, p.label, p.place]),
    S.zip.signText,
    ...S.zip.guideSteps.filter((s) => typeof s === 'string'),
    S.zip.guideSub,
    S.zip.guideTable,
    S.zip.guideHidden,
    S.zip.guideFoot,
    ...Object.values(S.zip.table).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))),
    ...Object.values(S.envs),
    ...Object.values(S.zip.cutins),
    '盤面格前景每px棋子建議～右邊與下面留給聊天立繪場景換不影響遮罩切入在打另外個看對照表CSV0123456789@×（）・、：。S-車FB',
  ].join('');
}
