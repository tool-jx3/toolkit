/**
 * 幾種設備共用的小零件：火焰、蠟燭、水滴、手印、手寫的線。
 */
import { type Kit, shape } from '../kit';
import { alpha } from '../palette';

/** 火焰（底部的中間是 (x, y)）：外圈與內圈兩層 */
export function flame(k: Kit, x: number, y: number, w: number, h: number): void {
  const { c, p } = k;
  const tongue = (s: number, fill: string) =>
    shape(
      k,
      () => {
        c.moveTo(x, y);
        c.bezierCurveTo(x - w * s, y, x - w * 0.55 * s, y - h * 0.55 * s, x, y - h * s);
        c.bezierCurveTo(x + w * 0.2 * s, y - h * 0.62 * s, x + w * s, y - h * 0.2 * s, x, y);
      },
      fill,
      0,
    );
  tongue(1, p.flame);
  tongue(0.55, alpha(p.amber, 0.95));
}

/** 蠟燭：燭身＋燭芯＋小火焰 */
export function candle(k: Kit, x: number, h: number, w = 0.1): void {
  const { p } = k;
  shape(k, () => k.c.rect(x - w / 2, -h, w, h), p.fill, 0.02);
  shape(
    k,
    () => {
      k.c.moveTo(x, -h);
      k.c.lineTo(x, -h - 0.05);
    },
    null,
    0.015,
  );
  flame(k, x, -h - 0.04, 0.07, 0.2);
  /* 燭淚 */
  shape(k, () => k.c.ellipse(x + w * 0.3, -h + 0.06, w * 0.18, 0.05, 0, 0, Math.PI * 2), p.tint, 0);
}

/** 水滴（尖的一端朝上） */
export function drop(k: Kit, x: number, y: number, r: number, fill: string): void {
  shape(
    k,
    () => {
      k.c.moveTo(x, y - r * 2.2);
      k.c.quadraticCurveTo(x + r * 1.1, y - r * 0.6, x, y + r);
      k.c.quadraticCurveTo(x - r * 1.1, y - r * 0.6, x, y - r * 2.2);
    },
    fill,
    0,
  );
}

/** 手印（手掌在 (x, y)，手指朝上；s＝大小） */
export function handprint(k: Kit, x: number, y: number, s: number, fill: string): void {
  const { c } = k;
  shape(k, () => c.ellipse(x, y, 0.17 * s, 0.21 * s, 0, 0, Math.PI * 2), fill, 0);
  const fingers: [number, number, number][] = [
    [-0.13, -0.15, -0.35],
    [-0.05, -0.2, -0.1],
    [0.04, -0.21, 0.06],
    [0.12, -0.17, 0.25],
  ];
  for (const [dx, dy, a] of fingers)
    shape(
      k,
      () => c.ellipse(x + dx * s, y + dy * s - 0.12 * s, 0.045 * s, 0.13 * s, a, 0, Math.PI * 2),
      fill,
      0,
    );
  shape(
    k,
    () => c.ellipse(x - 0.22 * s, y + 0.02 * s, 0.05 * s, 0.12 * s, -1.0, 0, Math.PI * 2),
    fill,
    0,
  );
}

/** 手寫的波浪線（從 (x0, y0) 到 (x1, y1)） */
export function scrawl(
  k: Kit,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  amp: number,
  waves: number,
  lw: number,
  color: string,
): void {
  const { c } = k;
  shape(
    k,
    () => {
      const n = waves * 8;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t;
        const y =
          y0 + (y1 - y0) * t + Math.sin(t * waves * Math.PI * 2) * amp * (i % 3 === 0 ? 1.4 : 1);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
    },
    null,
    lw,
    color,
  );
}
