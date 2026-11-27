/**
 * 地上的天空與天候（晴、黃昏、雨、暴風雨與落雷）、地下的地層。
 * 地層不受環境（夜、停電、事件後）與淹水影響；天空在夜與停電時，晴天改畫成雨夜（原作同）。
 * 樹林的剪影、雲、雨絲、地層的顆粒依地圖的種子排列（「換污漬的配置」也會換）。
 */
import type { Layout } from '../model/layout';
import type { EnvId, SectionDoc, SkyId } from '../model/types';
import { box, type Ctx, faded, type Kit, rng, seg, shape } from './kit';
import { alpha } from './palette';

/** 這個環境實際畫的天候 */
export const skyFor = (sky: SkyId, env: EnvId): SkyId =>
  (env === 'night' || env === 'blackout') && sky === 'clear' ? 'rain' : sky;

export function drawSky(k: Kit, doc: SectionDoc, L: Layout, env: EnvId): void {
  const { c, p } = k;
  const w = L.world;
  const h = L.glY - w.y;
  if (h <= 0.05) return;
  const sky = skyFor(doc.sky, env);
  const [top, bottom] = env === 'blackout' && p.id === 'color' ? p.sky.blackout : p.sky[sky];
  const g = c.createLinearGradient(0, w.y, 0, L.glY);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(w.x, w.y, w.w, h);
  const r = rng(doc.seed + 17);

  /* 遠處的樹林（圓頂的樹冠一排） */
  shape(
    k,
    () => {
      c.moveTo(w.x, L.glY);
      let x = w.x;
      while (x < w.x + w.w + 1) {
        const rad = 0.45 + r() * 0.55;
        const hgt = 0.3 + r() * 0.9;
        c.lineTo(x, L.glY - hgt);
        c.arc(x + rad, L.glY - hgt, rad, Math.PI, 0);
        x += rad * 2 - 0.15;
      }
      c.lineTo(w.x + w.w, L.glY);
      c.closePath();
    },
    alpha(p.ink, p.dark ? 0.15 : 0.11),
    0,
  );

  if (sky === 'clear' || sky === 'dusk') {
    const cloud =
      p.id === 'color' ? alpha('#ffffff', sky === 'dusk' ? 0.28 : 0.45) : alpha(p.ink, 0.08);
    for (let i = 0; i < 4; i++) {
      const cx = w.x + 3 + (i * w.w) / 4 + r() * 3;
      const cy = w.y + 1.1 + r() * Math.max(0.6, h * 0.3);
      shape(
        k,
        () => {
          c.ellipse(cx, cy, 1.9, 0.32, 0, 0, Math.PI * 2);
          c.moveTo(cx + 0.9, cy - 0.2);
          c.ellipse(cx + 0.2, cy - 0.22, 0.9, 0.32, 0, 0, Math.PI * 2);
        },
        cloud,
        0,
      );
    }
  }
  if (sky === 'rain' || sky === 'storm') {
    const n = sky === 'storm' ? 75 : 46;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const x = w.x + r() * w.w;
      const y = w.y + r() * h;
      const len = 0.8 + r() * 1.3;
      c.moveTo(x, y);
      c.lineTo(x - len * 0.26, y + len);
    }
    c.strokeStyle = p.dark || p.id === 'color' ? alpha('#bcd5de', 0.34) : alpha(p.ink, 0.3);
    c.lineWidth = 0.03;
    c.stroke();
  }
  if (sky === 'storm') {
    const x = w.x + w.w - 5;
    const y = w.y + 0.6;
    const bolt = [
      x,
      y,
      x - 0.7,
      y + 1.7,
      x + 0.15,
      y + 1.85,
      x - 0.9,
      y + 4.1,
      x - 0.1,
      y + 4.25,
      x - 1.1,
      Math.min(L.glY - 0.4, y + 6.6),
    ];
    const path = () => {
      c.moveTo(bolt[0], bolt[1]);
      for (let i = 2; i < bolt.length; i += 2) c.lineTo(bolt[i], bolt[i + 1]);
    };
    shape(k, () => c.ellipse(x, y, 2.2, 0.5, 0, 0, Math.PI * 2), alpha('#a2d8ff', 0.2), 0);
    c.lineCap = 'round';
    shape(k, path, null, 0.22, alpha('#a2d8ff', 0.34));
    shape(k, path, null, 0.07, alpha('#f6fbff', 0.9));
    c.lineCap = 'butt';
  }
}

export function drawEarth(k: Kit, doc: SectionDoc, L: Layout): void {
  const { c, p } = k;
  const w = L.world;
  const y0 = L.glY;
  const bottom = w.y + w.h;
  const h = bottom - y0;
  if (h <= 0.05) return;
  const [topSoil, midSoil, deep] = p.earth;
  c.fillStyle = deep;
  c.fillRect(w.x, y0, w.w, h);
  /* 表土與中層：起伏的邊界 */
  const band = (depth: number, amp: number, phase: number, fill: string) =>
    shape(
      k,
      () => {
        c.moveTo(w.x, y0);
        c.lineTo(w.x + w.w, y0);
        for (let x = w.x + w.w; x >= w.x - 0.01; x -= 1.5) {
          const yy =
            y0 +
            depth +
            Math.sin(x * 0.23 + phase) * amp +
            Math.sin(x * 0.61 + phase * 2) * amp * 0.35;
          c.lineTo(x, Math.min(bottom, yy));
        }
        c.closePath();
      },
      fill,
      0,
    );
  if (h > 3.2) band(Math.min(h, 9.5), 0.42, 1.3, midSoil);
  band(Math.min(h, 3.2), 0.24, 0.5, topSoil);
  c.save();
  c.beginPath();
  c.rect(w.x, y0, w.w, h);
  c.clip();
  /* 岩層的斜線 */
  c.beginPath();
  for (let x = w.x - h; x < w.x + w.w; x += 1.2) {
    c.moveTo(x, bottom);
    c.lineTo(x + h * 0.78, y0);
  }
  c.strokeStyle = alpha(p.ink, 0.12);
  c.lineWidth = 0.03;
  c.stroke();
  /* 地層的線 */
  for (let y = y0 + 2.3; y < bottom - 0.7; y += 3.1) {
    c.beginPath();
    c.moveTo(w.x, y);
    for (let x = w.x + 1.5; x <= w.x + w.w + 0.01; x += 1.5)
      c.lineTo(x, y + Math.sin(x * 0.27 + y) * 0.2);
    c.strokeStyle = alpha(p.ink, 0.18);
    c.lineWidth = 0.025;
    c.stroke();
  }
  /* 砂礫 */
  const r = rng(doc.seed + 503);
  const n = Math.min(340, Math.round(w.w * h * 0.22));
  for (let i = 0; i < n; i++) {
    const x = w.x + r() * w.w;
    const y = y0 + 0.4 + r() * Math.max(0.5, h - 0.8);
    const rad = 0.04 + r() * 0.1;
    const a = 0.1 + r() * 0.14;
    faded(k, a, () => {
      c.beginPath();
      c.arc(x, y, rad, 0, Math.PI * 2);
      c.fillStyle = p.ink;
      c.fill();
    });
  }
  c.restore();
  /* 地面 */
  box(k, w.x, y0 - 0.06, w.w, 0.2, p.structure, 0.035);
  seg(k, w.x, y0, w.x + w.w, y0, 0.06);
}

/** 結構的斜線（樓板、牆、通道的壁） */
export function hatchRect(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  line: string,
): void {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.beginPath();
  /* 斜線是 x＋y＝常數的一族線，相鄰的矩形接得起來 */
  const step = 0.45;
  for (let n = Math.ceil((x + y) / step); n * step <= x + w + y + h; n++) {
    const s = n * step;
    c.moveTo(s - y - h, y + h);
    c.lineTo(s - y, y);
  }
  c.strokeStyle = line;
  c.lineWidth = 0.06;
  c.stroke();
  c.restore();
}
