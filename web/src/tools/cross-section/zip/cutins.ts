/**
 * 房間 ZIP 的切入（本站自己畫的動畫；透明背景的 APNG，640 × 320、2.6 秒、無限重播、1 MB 以下）：
 * 一條斜的帶子從左邊掃進來、大字從右邊滑進來，停留時各自的動作，最後往右縮掉；第一格與最後 0.25 秒是透明的
 * （和 2.6 秒的無聲 MP3 一起用時剛好播一次就結束，重播的接縫也看不到）。
 * - 停電：近黑的帶子、一顆燈泡閃了幾下熄掉、字跟著暗下去。
 * - 緊急照明：暗紅的帶子、兩道旋轉的紅光掃過、字是白的。
 * - 事件發生：黑的帶子、上下緣鋸齒、紅色的裂痕從中間裂開、字微微抖動。
 * - 淹水：深藍的帶子、上緣是起伏的波浪、氣泡往上冒、字是淡青色。
 */

import { EXPORT_TARGETS } from '@/ccfolia/targets';
import { createEncoder } from '@/core/encode';
import { SANS } from '../draw/text';
import { S } from '../strings';
import { type CutinKind, MUTE_CLIP } from './plan';

export const CUTIN_W = 640;
export const CUTIN_H = 320;
/** 切入的長度＝無聲 MP3 的長度（播一次剛好結束） */
export const CUTIN_SECONDS = MUTE_CLIP.seconds;
/** CCFOLIA 切入的容量上限 */
export const CUTIN_LIMIT = EXPORT_TARGETS['ccfolia-cutin'].maxBytes;

const BAND: Record<CutinKind, { fill: string; text: string; edge: string }> = {
  blackout: { fill: '#180c22', text: '#f6ebff', edge: '#8f86c9' },
  emergency: { fill: '#3a0710', text: '#ffffff', edge: '#ff4a5a' },
  incident: { fill: '#14021a', text: '#ff3b4f', edge: '#ff3b4f' },
  flood: { fill: '#0b2c55', text: '#b7e8ff', edge: '#62c8ff' },
};

const easeOut = (x: number) => 1 - (1 - x) ** 3;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 畫 t 秒的那一格（透明背景） */
export function drawCutin(g: CanvasRenderingContext2D, kind: CutinKind, t: number): void {
  const W = CUTIN_W;
  const H = CUTIN_H;
  g.clearRect(0, 0, W, H);
  const inP = easeOut(clamp01((t - 0.08) / 0.3));
  const outP = clamp01((t - 2.05) / 0.3);
  if (inP <= 0 || outP >= 1) return;
  const col = BAND[kind];
  const cy = H / 2;
  const bh = 128;
  const skew = 36;
  /* 帶子：進來時從左邊長出來，出去時從左邊縮掉 */
  const x0 = -skew + outP * (W + skew * 2);
  const x1 = -skew + inP * (W + skew * 2);
  g.save();
  g.beginPath();
  if (kind === 'flood') {
    g.moveTo(x0 + skew, cy + bh / 2);
    for (let x = x0 + skew; x <= x1; x += 8)
      g.lineTo(x, cy - bh / 2 + Math.sin(x / 26 + t * 7) * 7);
    g.lineTo(x1 - skew, cy + bh / 2);
  } else if (kind === 'incident') {
    g.moveTo(x0, cy - bh / 2);
    for (let x = x0; x <= x1; x += 22) g.lineTo(x + 11, cy - bh / 2 + ((x / 22) % 2 ? -9 : 7));
    g.lineTo(x1, cy + bh / 2);
    for (let x = x1; x >= x0; x -= 22) g.lineTo(x - 11, cy + bh / 2 + ((x / 22) % 2 ? 8 : -6));
  } else {
    g.moveTo(x0 + skew, cy - bh / 2);
    g.lineTo(x1 + skew, cy - bh / 2);
    g.lineTo(x1 - skew, cy + bh / 2);
    g.lineTo(x0 - skew, cy + bh / 2);
  }
  g.closePath();
  g.fillStyle = col.fill;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = col.edge;
  g.stroke();
  g.clip();
  const hold = clamp01((t - 0.38) / 1.67);
  if (kind === 'emergency') {
    for (const off of [0, Math.PI]) {
      const a = t * 5 + off;
      const lx = W * 0.18;
      const grad = g.createRadialGradient(lx, cy, 0, lx, cy, 520);
      grad.addColorStop(0, 'rgba(255, 68, 84, 0.55)');
      grad.addColorStop(1, 'rgba(255, 68, 84, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(lx, cy);
      g.arc(lx, cy, 520, a - 0.28, a + 0.28);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#ff4a5a';
    g.beginPath();
    g.arc(W * 0.18, cy, 16, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'blackout') {
    const lit = hold < 0.15 || (hold > 0.22 && hold < 0.3) || (hold > 0.36 && hold < 0.4);
    const bx = W * 0.17;
    if (lit) {
      const glow = g.createRadialGradient(bx, cy - 6, 0, bx, cy - 6, 90);
      glow.addColorStop(0, 'rgba(251, 238, 146, 0.6)');
      glow.addColorStop(1, 'rgba(251, 238, 146, 0)');
      g.fillStyle = glow;
      g.fillRect(bx - 90, cy - 96, 180, 180);
    }
    g.fillStyle = lit ? '#f9ed92' : '#3a3256';
    g.strokeStyle = '#8f86c9';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(bx, cy - 10, 26, Math.PI * 0.8, Math.PI * 2.2);
    g.lineTo(bx + 12, cy + 22);
    g.lineTo(bx - 12, cy + 22);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#8f86c9';
    g.fillRect(bx - 13, cy + 24, 26, 12);
  } else if (kind === 'incident') {
    g.strokeStyle = '#ff3b4f';
    g.lineWidth = 3;
    const spread = easeOut(clamp01(hold * 3));
    g.beginPath();
    for (const [dx, dy] of [
      [-1, -0.6],
      [-0.7, 0.8],
      [0.8, -0.7],
      [1, 0.5],
    ]) {
      g.moveTo(W / 2, cy);
      let x = W / 2;
      let y = cy;
      for (let k = 1; k <= 4; k++) {
        x += dx * 60 * spread + (k % 2 ? 10 : -10);
        y += dy * 18 * spread;
        g.lineTo(x, y);
      }
    }
    g.stroke();
  } else {
    g.fillStyle = 'rgba(183, 232, 255, 0.55)';
    for (let i = 0; i < 9; i++) {
      const bx = 40 + i * 70 + (i % 3) * 9;
      const by = cy + bh / 2 - ((t * 90 + i * 37) % (bh + 20));
      g.beginPath();
      g.arc(bx, by, 4 + (i % 3) * 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  /* 字：從右邊滑進來 */
  const word = S.zip.cutins[kind];
  const shake = kind === 'incident' && hold > 0 && hold < 1 ? Math.sin(t * 60) * 2.5 : 0;
  const tx = W / 2 + (1 - inP) * 220 - outP * 80 + shake + 40;
  let a = 1 - outP;
  if (kind === 'blackout') a *= hold < 0.45 ? 1 : 0.35 + 0.65 * (1 - clamp01((hold - 0.45) * 2));
  g.save();
  g.globalAlpha = a;
  g.font = `900 84px ${SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = kind === 'incident' ? '#ffffff' : 'rgba(0, 0, 0, 0.55)';
  g.lineJoin = 'round';
  g.strokeText(word, tx, cy + 4);
  g.fillStyle = BAND[kind].text;
  g.fillText(word, tx, cy + 4);
  g.restore();
}

/** 編一個切入（容量超過上限時依序降：256 色 → 128 色 → 10 fps 64 色） */
export async function encodeCutin(kind: CutinKind, signal?: AbortSignal): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = CUTIN_W;
  c.height = CUTIN_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('canvas');
  const ladder = [
    { fps: 20, colors: 256 },
    { fps: 20, colors: 128 },
    { fps: 10, colors: 64 },
  ];
  let last: Uint8Array | null = null;
  for (const step of ladder) {
    const enc = createEncoder({
      format: 'apng',
      options: {
        width: CUTIN_W,
        height: CUTIN_H,
        fps: 1000,
        plays: 0,
        quantize: true,
        maxColors: step.colors,
        paletteMethod: 'pca',
      },
    });
    try {
      const n = Math.round(CUTIN_SECONDS * step.fps);
      const ms = 1000 / step.fps;
      for (let i = 0; i < n; i++) {
        if (signal?.aborted) throw new DOMException(S.zip.busy, 'AbortError');
        drawCutin(g, kind, i / step.fps);
        await enc.addFrame(
          g.getImageData(0, 0, CUTIN_W, CUTIN_H).data,
          Math.round((i + 1) * ms) - Math.round(i * ms),
        );
      }
      last = (await enc.finish()).bytes;
    } catch (e) {
      enc.abort();
      throw e;
    }
    if (last.byteLength <= CUTIN_LIMIT) return last;
  }
  if (!last) throw new Error('cutin');
  return last;
}
