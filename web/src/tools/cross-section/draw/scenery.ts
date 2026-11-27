/**
 * 列車的外景（本站自己的圖形）與軌道：
 * - 夜行・星空與鐵軌：靛紫的夜空、十字的星、左上角的滿月與光暈、每一排後面鋸齒的山脈剪影。
 * - 暴風雪・雪原：淡灰的天空、圓的雪片與幾道橫風、遠處的針葉林、鐵軌邊的雪堆。
 * - 霧中高架橋：一團一團的霧、鋼的箱形梁與 X 形的斜撐、混凝土的橋墩（沒有道碴）。
 * - 隧道內（完全封閉）：混凝土的內壁（分段的接縫）、牆上的電纜架、綠與琥珀色的標示燈。
 * - 白天的田園：雲、田地的田畦、電線桿與垂下來的電線。
 * 軌道：道碴（碎石的點）、混凝土的枕木、鐵軌；電氣機關車時加架空線與電桿。
 * 環境：夜・雨、停電、事件後時外景蓋一層暗（隧道比較淡），夜・雨與停電時星空、高架橋、田園加雨絲。
 * 外景畫在車廂之前（暗的那一層不會蓋到車廂；床下的底盤整塊不透明，所以 PL 用的偽裝在每個場景都一樣）。
 */
import type { TrainLayout } from '../model/trainLayout';
import type { EnvId, Train } from '../model/types';
import { box, type Ctx, faded, type Kit, rng, seg, shape } from './kit';
import { alpha } from './palette';
import type { TrainColors } from './trainPalette';

const RAIN = '#e2e6ff';

const ENV_TINT: Record<Exclude<EnvId, 'day'>, { tint: string; a: number }> = {
  night: { tint: '#120f36', a: 0.45 },
  blackout: { tint: '#10011b', a: 0.62 },
  after: { tint: '#2a1408', a: 0.3 },
};

function sparkle(c: Ctx, x: number, y: number, r: number): void {
  c.moveTo(x - r, y);
  c.lineTo(x + r, y);
  c.moveTo(x, y - r);
  c.lineTo(x, y + r);
}

export function drawScenery(
  k: Kit,
  t: Train,
  T: TrainLayout,
  env: EnvId,
  seed: number,
  tc: TrainColors,
): void {
  const { c, p } = k;
  const w = T.world;
  const right = w.x + w.w;
  const [top, bottom] = tc.sky[t.scenery];
  const g = c.createLinearGradient(0, w.y, 0, w.y + w.h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(w.x, w.y, w.w, w.h);
  const r = rng(seed + 211);

  if (t.scenery === 'starlit') {
    c.beginPath();
    for (let i = 0; i < 70; i++)
      sparkle(c, w.x + r() * w.w, w.y + r() * w.h * 0.8, 0.05 + r() * 0.09);
    c.strokeStyle = alpha(tc.star, 0.75);
    c.lineWidth = 0.025;
    c.stroke();
    const mx = w.x + 4;
    const my = w.y + 1.6;
    const halo = c.createRadialGradient(mx, my, 0.5, mx, my, 2.4);
    halo.addColorStop(0, alpha(tc.moon, 0.35));
    halo.addColorStop(1, alpha(tc.moon, 0));
    c.fillStyle = halo;
    c.beginPath();
    c.arc(mx, my, 2.4, 0, Math.PI * 2);
    c.fill();
    shape(k, () => c.arc(mx, my, 0.72, 0, Math.PI * 2), tc.moon, 0);
    faded(k, 0.18, () => {
      shape(k, () => c.arc(mx - 0.2, my + 0.12, 0.16, 0, Math.PI * 2), p.ink, 0);
      shape(k, () => c.arc(mx + 0.25, my - 0.18, 0.1, 0, Math.PI * 2), p.ink, 0);
    });
    for (const row of T.rows) {
      const base = row.rail + 0.2;
      shape(
        k,
        () => {
          c.moveTo(w.x, base);
          let x = w.x;
          let up = true;
          while (x < right) {
            x += 1.2 + r() * 2.2;
            c.lineTo(x, base - (up ? 2.2 + r() * 2.4 : 0.8 + r() * 1.1));
            up = !up;
          }
          c.lineTo(right, base);
          c.closePath();
        },
        alpha(tc.far, 0.75),
        0,
      );
    }
  } else if (t.scenery === 'blizzard') {
    for (const row of T.rows) {
      const base = row.rail + 0.1;
      shape(
        k,
        () => {
          for (let x = w.x + 0.5; x < right; x += 1.4 + r() * 1.6) {
            const h = 1.2 + r() * 1.6;
            c.moveTo(x - 0.5, base);
            c.lineTo(x, base - h);
            c.lineTo(x + 0.5, base);
            c.closePath();
          }
        },
        alpha(tc.far, 0.22),
        0,
      );
    }
    c.beginPath();
    for (let i = 0; i < 18; i++) {
      const x = w.x + r() * w.w;
      const y = w.y + r() * w.h;
      c.moveTo(x, y);
      c.lineTo(x + 1.2 + r() * 1.6, y + 0.08);
    }
    c.strokeStyle = alpha('#ffffff', 0.55);
    c.lineWidth = 0.035;
    c.stroke();
  } else if (t.scenery === 'viaduct') {
    for (let i = 0; i < 14; i++) {
      const fx = w.x + r() * w.w;
      const fy = w.y + r() * w.h;
      const fr = 1.5 + r() * 2.5;
      const fog = c.createRadialGradient(fx, fy, 0, fx, fy, fr);
      fog.addColorStop(0, alpha('#ffffff', 0.32));
      fog.addColorStop(1, alpha('#ffffff', 0));
      c.fillStyle = fog;
      c.beginPath();
      c.ellipse(fx, fy, fr * 1.8, fr, 0, 0, Math.PI * 2);
      c.fill();
    }
    for (const row of T.rows) {
      const deck = row.rail + 0.3;
      const depth = 1.3;
      for (let x = w.x + 4; x < right; x += 10)
        box(k, x - 0.45, deck + depth, 0.9, row.rail + ROW_BOTTOM - deck - depth, tc.girder, 0.035);
      box(k, w.x, deck, w.w, depth, alpha(tc.girder, 0.9), 0.04);
      c.beginPath();
      for (let x = w.x; x < right; x += 1.3) {
        c.moveTo(x, deck + 0.12);
        c.lineTo(x + 1.3, deck + depth - 0.12);
        c.moveTo(x + 1.3, deck + 0.12);
        c.lineTo(x, deck + depth - 0.12);
      }
      c.strokeStyle = alpha(p.ink, 0.35);
      c.lineWidth = 0.025;
      c.stroke();
    }
  } else if (t.scenery === 'tunnel') {
    for (const row of T.rows) {
      const y0 = row.y - 0.6;
      const y1 = row.rail + 2.2;
      box(k, w.x, y0, w.w, y1 - y0, tc.lining, 0);
      c.beginPath();
      for (let x = w.x + 0.9; x < right; x += 1.8) {
        c.moveTo(x, y0);
        c.lineTo(x, y1);
      }
      c.moveTo(w.x, row.cabin + 2.6);
      c.lineTo(right, row.cabin + 2.6);
      c.strokeStyle = alpha(p.ink, 0.25);
      c.lineWidth = 0.025;
      c.stroke();
      for (const dy of [0.2, 0.42, 0.64])
        seg(k, w.x, row.y + dy, right, row.y + dy, 0.035, alpha(p.ink, 0.45));
      for (let x = w.x + 3, i = 0; x < right; x += 6, i++)
        shape(
          k,
          () => c.arc(x, row.cabin + 1.4, 0.1, 0, Math.PI * 2),
          i % 2 ? p.gilt : p.signal,
          0.02,
        );
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const cx = w.x + 2 + r() * (w.w - 4);
      const cy = w.y + 0.8 + r() * 1.6;
      shape(
        k,
        () => {
          for (const [dx, dy, rr] of [
            [0, 0, 0.55],
            [0.6, -0.2, 0.7],
            [1.3, 0, 0.5],
          ]) {
            c.moveTo(cx + dx + rr, cy + dy);
            c.arc(cx + dx, cy + dy, rr, 0, Math.PI * 2);
          }
        },
        alpha('#ffffff', 0.7),
        0,
      );
    }
    for (const row of T.rows) {
      const y0 = row.rail - 1.5;
      box(k, w.x, y0, w.w, row.rail - y0 + 0.2, alpha(tc.field, 0.85), 0);
      c.beginPath();
      for (let x = w.x - 2; x < right; x += 0.7) {
        c.moveTo(x, row.rail);
        c.lineTo(x + 0.9, y0);
      }
      c.strokeStyle = alpha(p.ink, 0.12);
      c.lineWidth = 0.02;
      c.stroke();
      const poleTop = row.y + 0.2;
      for (let x = w.x + 2; x < right; x += 9) {
        seg(k, x, poleTop, x, row.rail, 0.07, alpha(p.ink, 0.45));
        seg(k, x - 0.5, poleTop + 0.25, x + 0.5, poleTop + 0.25, 0.05, alpha(p.ink, 0.45));
        if (x + 9 < right + 9)
          for (const dx of [-0.42, 0.42])
            shape(
              k,
              () => {
                c.moveTo(x + dx, poleTop + 0.22);
                c.quadraticCurveTo(x + 4.5 + dx, poleTop + 0.75, x + 9 + dx, poleTop + 0.22);
              },
              null,
              0.018,
              alpha(p.ink, 0.4),
            );
      }
    }
  }

  for (const row of T.rows) drawTrack(k, t, w.x, right, row, tc);

  if (env !== 'day') {
    const { tint, a } = ENV_TINT[env];
    c.fillStyle = alpha(tint, t.scenery === 'tunnel' && env !== 'blackout' ? a * 0.55 : a);
    c.fillRect(w.x, w.y, w.w, w.h);
    if (
      (env === 'night' || env === 'blackout') &&
      (t.scenery === 'starlit' || t.scenery === 'viaduct' || t.scenery === 'meadow')
    ) {
      c.beginPath();
      const n = Math.round(w.w * 1.1);
      for (let i = 0; i < n; i++) {
        const x = w.x + r() * w.w;
        const y = w.y + r() * w.h;
        const len = 0.7 + r() * 1.1;
        c.moveTo(x, y);
        c.lineTo(x + len * 0.18, y + len);
      }
      c.strokeStyle = alpha(RAIN, 0.3);
      c.lineWidth = 0.028;
      c.stroke();
    }
  }
}

/** 一排的底下還有幾格（軌道之下；高架橋的橋墩畫到這裡） */
const ROW_BOTTOM = 2;

function drawTrack(
  k: Kit,
  t: Train,
  x0: number,
  x1: number,
  row: { rail: number; cabin: number; y: number },
  tc: TrainColors,
): void {
  const { c, p } = k;
  const y = row.rail;
  if (t.scenery !== 'viaduct') {
    shape(
      k,
      () => {
        c.moveTo(x0, y + 0.18);
        c.lineTo(x1, y + 0.18);
        c.lineTo(x1, y + 1.65);
        c.lineTo(x0, y + 1.65);
        c.closePath();
      },
      tc.ballast,
      0.03,
    );
    const r = rng(Math.round(y * 31) + 7);
    c.fillStyle = alpha(p.ink, 0.22);
    for (let i = 0; i < (x1 - x0) * 3; i++) {
      c.beginPath();
      c.arc(x0 + r() * (x1 - x0), y + 0.35 + r() * 1.2, 0.03 + r() * 0.04, 0, Math.PI * 2);
      c.fill();
    }
  }
  for (let x = x0 + 0.25; x < x1; x += 1.0) box(k, x, y + 0.1, 0.5, 0.2, tc.sleeper, 0.018);
  box(k, x0, y, x1 - x0, 0.15, tc.rail, 0.03);
  seg(k, x0, y + 0.05, x1, y + 0.05, 0.015, alpha('#ffffff', 0.45));
  if (t.loco === 'electric') {
    const wire = row.cabin - 1.7;
    for (let x = x0 + 6; x < x1; x += 12) {
      seg(k, x, y + 1.2, x, wire - 0.35, 0.08, tc.rail);
      seg(k, x, wire - 0.3, x + 1.1, wire, 0.035, tc.rail);
    }
    seg(k, x0, wire, x1, wire, 0.03, alpha(p.ink, 0.6));
    seg(k, x0, wire - 0.3, x1, wire - 0.3, 0.015, alpha(p.ink, 0.35));
  }
}
