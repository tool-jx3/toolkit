/**
 * 家具畫法（2026-10 第三批）：鐵道・車站、車輛・船・飛機。全部是本站自己畫的。
 * 車輛的車頭朝下（y＝h，0° 時「背面在上」的規則下車尾靠牆）。
 */
import {
  block,
  type Ctx,
  disc,
  type FurnDraw,
  type FurnStyle,
  hatchRows,
  lw,
  paint,
  poly,
  rrect,
  seeded,
  seg,
  TAU,
  word,
} from './kit';
import { bolts, carBody, fan, hazard, inked, lightBar, type Pt, ring, thin, wheel } from './parts';

/* ---------- 鐵道・車站 ---------- */

/** 道碴（碎石的小點） */
function ballast(c: Ctx, S: FurnStyle, w: number, h: number, seed: number): void {
  c.save();
  c.fillStyle = S.tint;
  c.fillRect(0, 0, w, h);
  const rnd = seeded(seed);
  c.fillStyle = S.faint;
  const n = Math.round(w * h * 5);
  for (let i = 0; i < n; i++) {
    c.beginPath();
    c.arc(rnd() * w, rnd() * h, 0.025 + rnd() * 0.03, 0, TAU);
    c.fill();
  }
  c.restore();
}

/** 枕木：沿 y 每 step 一根（x0～x1） */
function ties(c: Ctx, S: FurnStyle, x0: number, x1: number, h: number, step = 0.6): void {
  for (let y = step / 2; y < h; y += step) block(c, S, x0, y - 0.1, x1 - x0, 0.2, 0.02, S.wood);
}

/** 一對鐵軌（軌距約 1.07 m＝2.14 格），中心 cx */
function rails(c: Ctx, S: FurnStyle, cx: number, y0: number, y1: number): void {
  lw(c, S, 2.2);
  inked(c, S.ink, () => {
    seg(c, cx - 1.07, y0, cx - 1.07, y1);
    seg(c, cx + 1.07, y0, cx + 1.07, y1);
  });
  lw(c, S);
}

const railTrack: FurnDraw = (c, S, w, h) => {
  ballast(c, S, w, h, 11);
  ties(c, S, w * 0.08, w * 0.92, h);
  rails(c, S, w / 2, 0, h);
};

const sleepers: FurnDraw = (c, S, w, h) => {
  ballast(c, S, w, h, 13);
  const rnd = seeded(29);
  for (let y = 0.3; y < h; y += 0.6) {
    if (rnd() < 0.15) continue;
    c.save();
    c.translate(w / 2, y);
    c.rotate((rnd() - 0.5) * 0.25);
    block(c, S, -w * 0.42, -0.1, w * 0.84, 0.2, 0.02, S.wood);
    c.restore();
  }
  /* 釘子的痕跡 */
  const pts: Pt[] = [];
  for (let y = 0.3; y < h; y += 1.2) pts.push([w / 2 - 1.07, y], [w / 2 + 1.07, y]);
  bolts(c, S, pts, 0.04);
};

const railSwitch: FurnDraw = (c, S, w, h) => {
  ballast(c, S, w, h, 17);
  ties(c, S, w * 0.04, w * 0.96, h, 0.6);
  const cx = w * 0.28;
  rails(c, S, cx, 0, h);
  /* 分岔的那一條：從下面往右上彎出去 */
  lw(c, S, 2.2);
  inked(c, S.ink, () => {
    for (const d of [-1.07, 1.07]) {
      c.beginPath();
      c.moveTo(cx + d, h);
      c.bezierCurveTo(cx + d, h * 0.45, w - 1.6 + d, h * 0.45, w - 1.6 + d, 0);
      c.stroke();
    }
  });
  lw(c, S);
  /* 轉轍器的箱子 */
  block(c, S, 0.1, h * 0.8, 0.7, 1, 0.04, S.gold);
  thin(c, S, 1, () => seg(c, 0.45, h * 0.8 + 0.5, cx - 1.07, h * 0.8 + 0.5));
};

const bufferStop: FurnDraw = (c, S, w, h) => {
  lw(c, S, 2.2);
  seg(c, w / 2 - 1.07, 0, w / 2 - 1.07, h * 0.5);
  seg(c, w / 2 + 1.07, 0, w / 2 + 1.07, h * 0.5);
  lw(c, S);
  block(c, S, w * 0.1, h * 0.2, w * 0.8, h * 0.3, 0.04, S.shade);
  hazard(c, 0.1, h * 0.5, w - 0.2, h * 0.32, S.gold, S.ink, 0.25);
  rrect(c, 0.1, h * 0.5, w - 0.2, h * 0.32);
  c.stroke();
  for (const x of [w * 0.25, w * 0.75]) {
    block(c, S, x - 0.22, h * 0.82, 0.44, h * 0.14, 0.04, S.tint);
    disc(c, S, x, h * 0.96, 0.18, S.paper);
  }
};

const platformEdge: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.7, 0, S.gold);
  c.save();
  c.fillStyle = S.ink;
  c.globalAlpha = 0.4;
  for (let x = 0.12; x < w; x += 0.2)
    for (let y = 0.12; y < h * 0.65; y += 0.2) {
      c.beginPath();
      c.arc(x, y, 0.035, 0, TAU);
      c.fill();
    }
  c.restore();
  block(c, S, 0, h * 0.7, w, h * 0.3, 0, S.paper);
  lw(c, S, 1.4);
  seg(c, 0, h, w, h);
  lw(c, S);
};

const ticketGate: FurnDraw = (c, S, w, h) => {
  const n = 4;
  const cw = 0.5;
  const gap = (w - cw * n) / (n - 1);
  for (let i = 0; i < n; i++) {
    const x = i * (cw + gap);
    block(c, S, x, 0, cw, h, 0.06, S.paper);
    block(c, S, x + 0.08, h * 0.12, cw - 0.16, h * 0.18, 0.02, S.screen);
    block(c, S, x + 0.1, h * 0.62, cw - 0.2, h * 0.12, 0.02, S.tint);
    if (i < n - 1) {
      /* 閘門的門板（從兩側伸出） */
      c.save();
      c.fillStyle = S.alert;
      rrect(c, x + cw, h * 0.47, gap * 0.38, 0.12, 0.05);
      c.fill();
      rrect(c, x + cw + gap * 0.62, h * 0.47, gap * 0.38, 0.12, 0.05);
      c.fill();
      c.restore();
      inked(c, S.leaf, () => {
        poly(c, [
          [x + cw + gap / 2, h * 0.92],
          [x + cw + gap / 2 - 0.15, h * 0.78],
          [x + cw + gap / 2 + 0.15, h * 0.78],
        ]);
        c.fill();
      });
    }
  }
};

const ticketMachine: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.tint);
  block(c, S, w * 0.12, h * 0.4, w * 0.5, h * 0.42, 0.03, S.screen);
  for (let i = 0; i < 3; i++)
    disc(c, S, w * 0.78, h * (0.35 + i * 0.2), h * 0.07, i ? S.paper : S.gold);
};

const stationBench: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.4, w, h * 0.2, 0.04, S.shade);
  const n = Math.max(2, Math.round(w / 0.95));
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    block(c, S, sw * i + 0.06, 0.04, sw - 0.12, h * 0.3, 0.1, S.screen);
    block(c, S, sw * i + 0.06, h * 0.3, sw - 0.12, h * 0.64, 0.12, S.screen);
  }
};

const stationSign: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.paper);
  c.save();
  c.fillStyle = S.screen;
  c.fillRect(0.06, h * 0.62, w - 0.12, h * 0.22);
  c.restore();
  word(c, S, '站', w / 2, h * 0.36, h * 0.5);
  for (const dir of [-1, 1]) {
    const x = w / 2 + dir * w * 0.36;
    poly(c, [
      [x + dir * 0.14, h * 0.36],
      [x - dir * 0.04, h * 0.2],
      [x - dir * 0.04, h * 0.52],
    ]);
    paint(c, S.ink, false);
  }
};

const kiosk: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.tint);
  /* 後面的架子與商品 */
  block(c, S, 0.1, 0.1, w - 0.2, h * 0.28, 0.02, S.paper);
  const rnd = seeded(5);
  const cols = [S.alert, S.gold, S.screen, S.leaf];
  for (let x = 0.18; x < w - 0.3; x += 0.28) {
    c.save();
    c.fillStyle = cols[Math.floor(rnd() * cols.length)];
    c.fillRect(x, 0.16, 0.2, h * 0.18);
    c.restore();
  }
  /* 前面的櫃台（L 型）＋收銀機 */
  block(c, S, 0.1, h * 0.66, w - 0.2, h * 0.28, 0.03, S.wood);
  block(c, S, w - 0.6, h * 0.38, 0.5, h * 0.3, 0.03, S.wood);
  block(c, S, w * 0.66, h * 0.7, w * 0.16, h * 0.18, 0.03, S.shade);
};

const trainCar: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.4, 0, w - 0.8, 0.5, 0.1, S.shade);
  block(c, S, 0.4, h - 0.5, w - 0.8, 0.5, 0.1, S.shade);
  block(c, S, 0, 0.3, w, h - 0.6, 0.6, S.paper);
  /* 車身的色帶（兩側） */
  c.save();
  c.fillStyle = S.screen;
  c.fillRect(0.06, 0.9, 0.22, h - 1.8);
  c.fillRect(w - 0.28, 0.9, 0.22, h - 1.8);
  c.restore();
  /* 車門（每側 4 扇） */
  c.save();
  c.fillStyle = S.ink;
  for (let i = 0; i < 4; i++) {
    const y = 0.3 + ((h - 0.6) * (i + 0.5)) / 4 - 0.7;
    c.fillRect(0, y, 0.14, 1.4);
    c.fillRect(w - 0.14, y, 0.14, 1.4);
  }
  c.restore();
  /* 車頂：空調、通風 */
  thin(c, S, 0.5, () => {
    seg(c, w * 0.3, 1, w * 0.3, h - 1);
    seg(c, w * 0.7, 1, w * 0.7, h - 1);
  });
  for (const f of [0.2, 0.5, 0.8]) {
    block(c, S, w * 0.25, h * f - 1.2, w * 0.5, 2.4, 0.15, S.tint);
    fan(c, S, w / 2, h * f, 0.7, 4);
  }
};

const locomotive: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.5, 0, w - 1, 0.5, 0.1, S.shade);
  block(c, S, 0.5, h - 0.5, w - 1, 0.5, 0.1, S.shade);
  block(c, S, 0, 0.3, w, h - 0.6, 0.5, S.alert);
  /* 駕駛室（車頭＝下）與擋風玻璃 */
  block(c, S, 0.25, h - 6, w - 0.5, 5, 0.3, S.paper);
  poly(c, [
    [0.6, h - 1.6],
    [w - 0.6, h - 1.6],
    [w - 0.9, h - 0.9],
    [0.9, h - 0.9],
  ]);
  paint(c, S.water);
  /* 引擎罩：散熱風扇、排氣口 */
  block(c, S, 0.7, 1, w - 1.4, h - 7.5, 0.3, S.tint);
  for (let y = 3; y < h - 8; y += 4) fan(c, S, w / 2, y, 1.1, 4);
  disc(c, S, w / 2, h - 7.8, 0.4, S.ink);
  thin(c, S, 0.6, () => hatchRows(c, 0.7, w - 0.7, h - 9, h - 8.2, 0.2));
};

/* ---------- 車輛（車頭朝下） ---------- */

const suv: FurnDraw = (c, S, w, h) => {
  const roof = carBody(c, S, w, h, { fill: S.shade, roof: S.tint });
  thin(c, S, 1.1, () => {
    seg(c, roof.x + 0.12, roof.y + 0.15, roof.x + 0.12, roof.y + roof.h - 0.15);
    seg(c, roof.x + roof.w - 0.12, roof.y + 0.15, roof.x + roof.w - 0.12, roof.y + roof.h - 0.15);
  });
  disc(c, S, w / 2, 0.3, 0.35, S.ink);
};

const van: FurnDraw = (c, S, w, h) => {
  const tw = Math.min(0.32, w * 0.09);
  for (const y of [h * 0.12, h * 0.72]) {
    wheel(c, S, 0, y, tw + 0.05, h * 0.12);
    wheel(c, S, w - tw - 0.05, y, tw + 0.05, h * 0.12);
  }
  block(c, S, tw * 0.5, 0, w - tw, h, 0.4, S.paper);
  /* 長長的車頂（到擋風玻璃） */
  block(c, S, w * 0.14, 0.25, w * 0.72, h * 0.66, 0.15, S.tint);
  thin(c, S, 0.5, () => hatchRows(c, w * 0.2, w * 0.8, 0.25, h * 0.66, 1));
  poly(c, [
    [w * 0.16, h * 0.82],
    [w * 0.84, h * 0.82],
    [w * 0.88, h * 0.93],
    [w * 0.12, h * 0.93],
  ]);
  paint(c, S.water);
};

/** 貨車類：前面的駕駛室＋後面的貨台（多軸） */
function lorry(
  c: Ctx,
  S: FurnStyle,
  w: number,
  h: number,
  cabLen: number,
  cabFill: string,
  axles: readonly number[],
): void {
  const tw = Math.min(0.36, w * 0.09);
  for (const f of axles) {
    wheel(c, S, 0, h * f, tw + 0.05, 1.1);
    wheel(c, S, w - tw - 0.05, h * f, tw + 0.05, 1.1);
  }
  block(c, S, tw * 0.5, h - cabLen, w - tw, cabLen, 0.45, cabFill);
  poly(c, [
    [w * 0.14, h - cabLen * 0.32],
    [w * 0.86, h - cabLen * 0.32],
    [w * 0.9, h - cabLen * 0.12],
    [w * 0.1, h - cabLen * 0.12],
  ]);
  paint(c, S.water);
  block(c, S, w * 0.16, h - cabLen + 0.2, w * 0.68, cabLen * 0.42, 0.12, S.paper);
}

const truck: FurnDraw = (c, S, w, h) => {
  lorry(c, S, w, h, 3.6, S.screen, [0.08, 0.2, 0.84]);
  block(c, S, 0.1, 0, w - 0.2, h - 3.8, 0.1, S.tint);
  thin(c, S, 0.5, () => hatchRows(c, 0.1, w - 0.1, 0, h - 3.8, 1.2));
};

const policeCar: FurnDraw = (c, S, w, h) => {
  const roof = carBody(c, S, w, h, { fill: S.ink, roof: S.paper });
  /* 車門是白的（兩側） */
  c.save();
  c.fillStyle = S.paper;
  c.fillRect(0.2, h * 0.36, 0.28, h * 0.34);
  c.fillRect(w - 0.48, h * 0.36, 0.28, h * 0.34);
  c.restore();
  lightBar(c, S, roof.x + 0.1, roof.y + roof.h * 0.42, roof.w - 0.2, 0.4);
};

const ambulance: FurnDraw = (c, S, w, h) => {
  lorry(c, S, w, h, 2.8, S.paper, [0.12, 0.8]);
  block(c, S, 0.12, 0, w - 0.24, h - 2.9, 0.15, S.paper);
  c.save();
  c.fillStyle = S.alert;
  c.fillRect(0.12, h * 0.3, 0.2, h * 0.4);
  c.fillRect(w - 0.32, h * 0.3, 0.2, h * 0.4);
  const cx = w / 2;
  const cy = (h - 2.9) / 2;
  c.fillRect(cx - 0.25, cy - 0.85, 0.5, 1.7);
  c.fillRect(cx - 0.85, cy - 0.25, 1.7, 0.5);
  c.restore();
  lightBar(c, S, w * 0.2, h - 3.2, w * 0.6, 0.4);
};

const fireTruck: FurnDraw = (c, S, w, h) => {
  lorry(c, S, w, h, 3.4, S.alert, [0.08, 0.2, 0.84]);
  block(c, S, 0.1, 0, w - 0.2, h - 3.5, 0.15, S.alert);
  /* 車頂的雲梯 */
  block(c, S, w * 0.3, 0.3, w * 0.4, h - 4.4, 0.05, S.tint);
  thin(c, S, 0.6, () => hatchRows(c, w * 0.3, w * 0.7, 0.3, h - 4.1, 0.45));
  disc(c, S, w / 2, h - 4.4, w * 0.2, S.shade);
  lightBar(c, S, w * 0.2, h - 3.3, w * 0.6, 0.4);
};

/** 履帶（兩條） */
function crawler(c: Ctx, S: FurnStyle, w: number, y0: number, y1: number, tw: number): void {
  for (const x of [0, w - tw]) {
    block(c, S, x, y0, tw, y1 - y0, 0.2, S.ink);
    thin(c, S, 0.6, () =>
      inked(c, S.shade, () => hatchRows(c, x + 0.08, x + tw - 0.08, y0, y1, 0.3)),
    );
  }
}

const excavator: FurnDraw = (c, S, w, h) => {
  crawler(c, S, w, 0, h * 0.62, w * 0.24);
  /* 上部的車身（轉了一點）＋駕駛室 */
  c.save();
  c.translate(w / 2, h * 0.32);
  c.rotate(-0.12);
  block(c, S, -w * 0.4, -h * 0.22, w * 0.8, h * 0.44, 0.3, S.gold);
  block(c, S, -w * 0.38, -h * 0.02, w * 0.3, h * 0.2, 0.1, S.water);
  block(c, S, -w * 0.3, -h * 0.22, w * 0.6, h * 0.1, 0.1, S.shade);
  /* 手臂與挖斗（往前＝下） */
  block(c, S, w * 0.02, 0, w * 0.18, h * 0.55, 0.1, S.gold);
  poly(c, [
    [-w * 0.04, h * 0.52],
    [w * 0.26, h * 0.52],
    [w * 0.22, h * 0.64],
    [0, h * 0.64],
  ]);
  paint(c, S.shade);
  c.restore();
};

const bulldozer: FurnDraw = (c, S, w, h) => {
  crawler(c, S, w, h * 0.04, h * 0.8, w * 0.22);
  block(c, S, w * 0.2, h * 0.08, w * 0.6, h * 0.66, 0.2, S.gold);
  block(c, S, w * 0.3, h * 0.12, w * 0.4, h * 0.32, 0.1, S.water);
  block(c, S, w * 0.33, h * 0.15, w * 0.34, h * 0.26, 0.08, S.paper);
  thin(c, S, 0.5, () => hatchRows(c, w * 0.24, w * 0.76, h * 0.48, h * 0.72, 0.3));
  /* 前面的鏟刀 */
  block(c, S, 0, h * 0.84, w, h * 0.14, 0.1, S.shade);
  thin(c, S, 1.2, () => {
    seg(c, w * 0.3, h * 0.74, w * 0.25, h * 0.84);
    seg(c, w * 0.7, h * 0.74, w * 0.75, h * 0.84);
  });
};

const craneTruck: FurnDraw = (c, S, w, h) => {
  lorry(c, S, w, h, 3, S.gold, [0.06, 0.16, 0.3, 0.72, 0.84]);
  block(c, S, 0.15, 0.2, w - 0.3, h - 3.3, 0.15, S.tint);
  /* 外伸支腳 */
  c.save();
  c.fillStyle = S.shade;
  for (const y of [1, h - 4.5])
    for (const x of [-0.25, w - 0.35]) {
      rrect(c, x, y, 0.6, 0.6, 0.08);
      c.fill();
      c.stroke();
    }
  c.restore();
  /* 吊臂（收起來沿著車身）＋吊鉤 */
  disc(c, S, w / 2, 2.2, 1.2, S.gold);
  block(c, S, w / 2 - 0.55, 2.2, 1.1, h - 4.4, 0.1, S.gold);
  thin(c, S, 0.5, () => hatchRows(c, w / 2 - 0.55, w / 2 + 0.55, 3, h - 2.4, 1));
  disc(c, S, w / 2, h - 2.4, 0.25, S.ink);
};

const forklift: FurnDraw = (c, S, w, h) => {
  /* 前面的貨叉 */
  c.save();
  c.fillStyle = S.shade;
  for (const x of [w * 0.22, w * 0.68]) {
    c.fillRect(x, h * 0.66, w * 0.1, h * 0.34);
    c.strokeRect(x, h * 0.66, w * 0.1, h * 0.34);
  }
  c.restore();
  block(c, S, w * 0.1, h * 0.6, w * 0.8, h * 0.08, 0.02, S.ink);
  for (const y of [h * 0.12, h * 0.46]) {
    wheel(c, S, 0, y, 0.3, h * 0.13);
    wheel(c, S, w - 0.3, y, 0.3, h * 0.13);
  }
  block(c, S, 0.15, 0, w - 0.3, h * 0.6, 0.25, S.gold);
  block(c, S, 0.2, 0.05, w - 0.4, h * 0.14, 0.12, S.shade);
  block(c, S, w * 0.25, h * 0.24, w * 0.5, h * 0.26, 0.1, S.paper);
  disc(c, S, w / 2, h * 0.36, w * 0.14, S.ink);
};

const airplane: FurnDraw = (c, S, w, h) => {
  const cx = w / 2;
  /* 主翼（橫）、水平尾翼（上） */
  block(c, S, 0, h * 0.5, w, h * 0.12, 0.6, S.paper);
  thin(c, S, 0.5, () => {
    seg(c, 1, h * 0.58, cx - 1.4, h * 0.58);
    seg(c, cx + 1.4, h * 0.58, w - 1, h * 0.58);
  });
  block(c, S, w * 0.3, h * 0.04, w * 0.4, h * 0.08, 0.4, S.paper);
  /* 機身（機頭朝下） */
  c.beginPath();
  c.moveTo(cx, 0);
  c.quadraticCurveTo(cx + 1.6, h * 0.4, cx + 1.4, h * 0.9);
  c.quadraticCurveTo(cx, h * 1.02, cx - 1.4, h * 0.9);
  c.quadraticCurveTo(cx - 1.6, h * 0.4, cx, 0);
  c.closePath();
  paint(c, S.paper);
  thin(c, S, 1.2, () => seg(c, cx, 0, cx, h * 0.08));
  /* 駕駛艙的窗 */
  poly(c, [
    [cx - 1.1, h * 0.7],
    [cx + 1.1, h * 0.7],
    [cx + 0.9, h * 0.78],
    [cx - 0.9, h * 0.78],
  ]);
  paint(c, S.water);
  c.save();
  c.fillStyle = S.alert;
  c.fillRect(1, h * 0.52, 1.2, h * 0.08);
  c.fillRect(w - 2.2, h * 0.52, 1.2, h * 0.08);
  c.restore();
  /* 螺旋槳 */
  thin(c, S, 1.8, () => seg(c, cx - 2.2, h * 0.985, cx + 2.2, h * 0.985));
  disc(c, S, cx, h * 0.97, 0.4, S.ink);
};

const helicopter: FurnDraw = (c, S, w, h) => {
  const cx = w / 2;
  const cy = h * 0.6;
  /* 起落架、尾桁、尾旋翼 */
  thin(c, S, 1.4, () => {
    seg(c, cx - 2.2, cy - 2.5, cx - 2.2, cy + 3);
    seg(c, cx + 2.2, cy - 2.5, cx + 2.2, cy + 3);
  });
  block(c, S, cx - 0.4, h * 0.06, 0.8, cy - h * 0.06, 0.3, S.tint);
  block(c, S, cx - 1.6, h * 0.08, 3.2, 0.6, 0.2, S.tint);
  thin(c, S, 1.2, () => seg(c, cx + 0.4, h * 0.05, cx + 0.4, h * 0.05 + 2));
  /* 機身 */
  c.beginPath();
  c.ellipse(cx, cy, 2, 3.4, 0, 0, TAU);
  paint(c, S.leaf);
  c.beginPath();
  c.ellipse(cx, cy + 1.9, 1.5, 1.4, 0, 0, Math.PI);
  paint(c, S.water);
  /* 主旋翼 */
  thin(c, S, 0.5, () => {
    c.setLineDash([S.lw * 3, S.lw * 3]);
    ring(c, cx, cy, Math.min(w, h) / 2 - 0.2);
  });
  c.save();
  c.fillStyle = S.shade;
  for (let i = 0; i < 4; i++) {
    c.save();
    c.translate(cx, cy);
    c.rotate((i / 4) * TAU + 0.4);
    rrect(c, 0, -0.22, Math.min(w, h) / 2 - 0.3, 0.44, 0.15);
    c.fill();
    c.stroke();
    c.restore();
  }
  c.restore();
  disc(c, S, cx, cy, 0.5, S.ink);
};

/** 船殼（兩頭尖）的路徑 */
function hull(c: Ctx, x: number, y: number, w: number, h: number): void {
  c.beginPath();
  c.moveTo(x + w / 2, y);
  c.quadraticCurveTo(x + w, y + h * 0.2, x + w, y + h * 0.5);
  c.quadraticCurveTo(x + w, y + h * 0.8, x + w / 2, y + h);
  c.quadraticCurveTo(x, y + h * 0.8, x, y + h * 0.5);
  c.quadraticCurveTo(x, y + h * 0.2, x + w / 2, y);
  c.closePath();
}

const lifeboat: FurnDraw = (c, S, w, h) => {
  hull(c, 0, 0, w, h);
  paint(c, S.fire);
  block(c, S, w * 0.18, h * 0.12, w * 0.64, h * 0.76, w * 0.3, S.paper);
  disc(c, S, w / 2, h * 0.25, w * 0.14, S.tint);
  disc(c, S, w / 2, h * 0.75, w * 0.14, S.tint);
  const pts: Pt[] = [];
  for (let y = h * 0.36; y < h * 0.66; y += 0.7) pts.push([w * 0.3, y], [w * 0.7, y]);
  c.save();
  c.fillStyle = S.water;
  for (const [x, y] of pts) {
    c.beginPath();
    c.arc(x, y, 0.13, 0, TAU);
    c.fill();
    c.stroke();
  }
  c.restore();
};

const liferaft: FurnDraw = (c, S, w, h) => {
  thin(c, S, 1.2, () => {
    seg(c, w * 0.1, h * 0.1, w * 0.1, h * 0.9);
    seg(c, w * 0.9, h * 0.1, w * 0.9, h * 0.9);
  });
  block(c, S, w * 0.14, 0.05, w * 0.72, h - 0.1, w * 0.36, S.paper);
  c.save();
  c.fillStyle = S.fire;
  for (const f of [0.3, 0.7]) c.fillRect(w * 0.14, h * f - 0.06, w * 0.72, 0.12);
  c.restore();
};

const anchor: FurnDraw = (c, S, w, h) => {
  const cx = w / 2;
  thin(c, S, 1.4, () => ring(c, cx, h * 0.1, w * 0.1));
  block(c, S, cx - 0.08, h * 0.18, 0.16, h * 0.68, 0.05, S.shade);
  block(c, S, w * 0.22, h * 0.26, w * 0.56, 0.14, 0.05, S.shade);
  c.beginPath();
  c.moveTo(w * 0.08, h * 0.62);
  c.quadraticCurveTo(w * 0.15, h * 0.95, cx, h * 0.95);
  c.quadraticCurveTo(w * 0.85, h * 0.95, w * 0.92, h * 0.62);
  lw(c, S, 2.4);
  c.stroke();
  lw(c, S);
  for (const x of [w * 0.08, w * 0.92]) {
    poly(c, [
      [x, h * 0.54],
      [x - 0.14, h * 0.7],
      [x + 0.14, h * 0.7],
    ]);
    paint(c, S.shade);
  }
};

const bollard: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.2, w, h * 0.6, 0.05, S.shade);
  for (const x of [w * 0.27, w * 0.73]) {
    disc(c, S, x, h / 2, Math.min(w * 0.2, h * 0.36), S.tint);
    disc(c, S, x, h / 2, Math.min(w * 0.1, h * 0.18), S.ink);
  }
};

const helm: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2;
  thin(c, S, 1.5, () => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      seg(c, w / 2, h / 2, w / 2 + Math.cos(a) * R * 0.96, h / 2 + Math.sin(a) * R * 0.96);
    }
  });
  c.save();
  c.strokeStyle = S.ink;
  lw(c, S, 3.2);
  ring(c, w / 2, h / 2, R * 0.66);
  c.strokeStyle = S.wood;
  lw(c, S, 1.6);
  ring(c, w / 2, h / 2, R * 0.66);
  c.restore();
  disc(c, S, w / 2, h / 2, R * 0.2, S.wood);
};

const radar: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.08, S.tint);
  const R = Math.min(w * 0.3, h * 0.42);
  disc(c, S, w * 0.38, h / 2, R, S.ink);
  c.save();
  c.fillStyle = S.leaf;
  c.globalAlpha = 0.8;
  c.beginPath();
  c.moveTo(w * 0.38, h / 2);
  c.arc(w * 0.38, h / 2, R * 0.92, -1.2, -0.4);
  c.closePath();
  c.fill();
  c.restore();
  thin(c, S, 0.4, () => inked(c, S.leaf, () => ring(c, w * 0.38, h / 2, R * 0.5)));
  for (let i = 0; i < 3; i++)
    disc(c, S, w * 0.82, h * (0.28 + i * 0.22), h * 0.07, i ? S.paper : S.gold);
};

const chartTable: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.wood);
  c.save();
  c.translate(w / 2, h / 2);
  c.rotate(0.06);
  block(c, S, -w * 0.4, -h * 0.36, w * 0.8, h * 0.72, 0, S.paper);
  thin(c, S, 0.4, () =>
    inked(c, S.water, () => {
      c.beginPath();
      c.moveTo(-w * 0.4, h * 0.1);
      c.quadraticCurveTo(0, -h * 0.2, w * 0.4, -h * 0.05);
      c.stroke();
    }),
  );
  thin(c, S, 0.8, () => {
    seg(c, -w * 0.3, h * 0.25, w * 0.2, -h * 0.15);
    seg(c, w * 0.05, -h * 0.25, -w * 0.05, h * 0.05);
    seg(c, w * 0.05, -h * 0.25, w * 0.15, h * 0.05);
  });
  c.restore();
};

const shipEngine: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.2, S.tint);
  /* 飛輪（後） */
  disc(c, S, w / 2, 1.2, 1, S.shade);
  thin(c, S, 0.5, () => ring(c, w / 2, 1.2, 0.6));
  /* 汽缸兩排 */
  for (let y = 3; y < h - 0.8; y += 1.4)
    for (const x of [w * 0.3, w * 0.7]) {
      disc(c, S, x, y, 0.55, S.paper);
      disc(c, S, x, y, 0.22, S.shade);
    }
  thin(c, S, 0.6, () => seg(c, w / 2, 2.4, w / 2, h - 0.4));
  /* 排氣管 */
  for (const x of [0.25, w - 0.25]) {
    thin(c, S, 1.8, () => inked(c, S.shade, () => seg(c, x, 2.6, x, h - 0.5)));
  }
};

const shipHatch: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.1, S.shade);
  block(c, S, 0.25, 0.25, w - 0.5, h - 0.5, 0.06, S.tint);
  thin(c, S, 0.5, () => {
    seg(c, w / 2, 0.25, w / 2, h - 0.25);
    seg(c, 0.25, h / 2, w - 0.25, h / 2);
  });
  const pts: Pt[] = [
    [0.12, h * 0.3],
    [0.12, h * 0.7],
    [w - 0.12, h * 0.3],
    [w - 0.12, h * 0.7],
    [w * 0.3, 0.12],
    [w * 0.7, 0.12],
    [w * 0.3, h - 0.12],
    [w * 0.7, h - 0.12],
  ];
  bolts(c, S, pts, 0.07);
  thin(c, S, 1.4, () => seg(c, w * 0.35, h * 0.78, w * 0.65, h * 0.78));
};

export const TRANSIT: Record<string, FurnDraw> = {
  rail_track: railTrack,
  sleepers,
  rail_switch: railSwitch,
  buffer_stop: bufferStop,
  platform_edge: platformEdge,
  ticket_gate: ticketGate,
  ticket_machine: ticketMachine,
  station_bench: stationBench,
  station_sign: stationSign,
  kiosk,
  train_car: trainCar,
  locomotive,
  suv,
  van,
  truck,
  police_car: policeCar,
  ambulance,
  fire_truck: fireTruck,
  excavator,
  bulldozer,
  crane_truck: craneTruck,
  forklift,
  airplane,
  helicopter,
  lifeboat,
  liferaft,
  anchor,
  bollard,
  helm,
  radar,
  chart_table: chartTable,
  ship_engine: shipEngine,
  ship_hatch: shipHatch,
};
