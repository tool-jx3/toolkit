/**
 * 差分標籤的圖示（F60）：以 (x, y) 為中心、半徑 r 內的線稿／剪影；「自訂圖片」等比縮進圖示範圍。
 * 線寬 0.14 r、圓端點。圖示依原作（MIT）的造型改寫。
 */
import type { IconId } from './model';

const TAU = Math.PI * 2;
type Ctx = CanvasRenderingContext2D;

export function roundRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const circle = (c: Ctx, x: number, y: number, r: number) => {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
};

function rays(
  c: Ctx,
  x: number,
  y: number,
  from: number,
  to: number,
  a0: number,
  a1: number,
  n: number,
) {
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? a0 : a0 + ((a1 - a0) * i) / (n - 1);
    c.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from);
    c.lineTo(x + Math.cos(a) * to, y + Math.sin(a) * to);
  }
  c.stroke();
}

function fourStar(c: Ctx, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x, y, x + s, y);
  c.quadraticCurveTo(x, y, x, y + s);
  c.quadraticCurveTo(x, y, x - s, y);
  c.quadraticCurveTo(x, y, x, y - s);
  c.fill();
}

function cloudShape(c: Ctx, x: number, y: number, r: number) {
  for (const [dx, dy, rr] of [
    [-0.42, 0.12, 0.36],
    [0.02, -0.12, 0.5],
    [0.46, 0.16, 0.32],
  ]) {
    circle(c, x + dx * r, y + dy * r, rr * r);
  }
  c.beginPath();
  roundRectPath(c, x - r * 0.78, y + r * 0.1, r * 1.56, r * 0.38, r * 0.19);
  c.fill();
}

type DrawIcon = (c: Ctx, x: number, y: number, r: number) => void;

const ICONS: Partial<Record<IconId, DrawIcon>> = {
  sun(c, x, y, r) {
    circle(c, x, y, r * 0.42);
    rays(c, x, y, r * 0.64, r * 0.94, 0, (TAU * 7) / 8, 8);
  },
  sunrise(c, x, y, r) {
    horizonSun(c, x, y, r, true);
  },
  sunset(c, x, y, r) {
    horizonSun(c, x, y, r, false);
  },
  moon(c, x, y, r) {
    c.save();
    c.beginPath();
    c.rect(x - r * 2, y - r * 2, r * 4, r * 4);
    c.arc(x + r * 0.36, y - r * 0.26, r * 0.56, 0, TAU);
    c.clip('evenodd');
    circle(c, x - r * 0.05, y, r * 0.72);
    c.restore();
    fourStar(c, x + r * 0.62, y + r * 0.42, r * 0.2);
  },
  star(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r * 0.38 : r * 0.9;
      c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
    c.fill();
  },
  cloud(c, x, y, r) {
    cloudShape(c, x, y, r * 0.97);
  },
  rain(c, x, y, r) {
    cloudShape(c, x, y - r * 0.28, r * 0.8);
    c.beginPath();
    for (const dx of [-0.42, 0, 0.42]) {
      c.moveTo(x + dx * r, y + r * 0.38);
      c.lineTo(x + dx * r - r * 0.14, y + r * 0.88);
    }
    c.stroke();
  },
  snow(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      c.moveTo(x, y);
      c.lineTo(x + ux * r * 0.92, y + uy * r * 0.92);
      const bx = x + ux * r * 0.55;
      const by = y + uy * r * 0.55;
      for (const t of [0.75, -0.75]) {
        c.moveTo(bx, by);
        c.lineTo(bx + Math.cos(a + t) * r * 0.3, by + Math.sin(a + t) * r * 0.3);
      }
    }
    c.stroke();
  },
  fog(c, x, y, r) {
    c.beginPath();
    for (const [dy, w] of [
      [-0.45, 0.8],
      [0, 0.95],
      [0.45, 0.7],
    ]) {
      const yy = y + dy * r;
      c.moveTo(x - w * r, yy);
      c.bezierCurveTo(
        x - w * r * 0.4,
        yy - r * 0.18,
        x + w * r * 0.1,
        yy + r * 0.18,
        x + w * r,
        yy,
      );
    }
    c.stroke();
  },
  bolt(c, x, y, r) {
    c.beginPath();
    c.moveTo(x + r * 0.2, y - r);
    c.lineTo(x - r * 0.55, y + r * 0.12);
    c.lineTo(x - r * 0.02, y + r * 0.12);
    c.lineTo(x - r * 0.25, y + r);
    c.lineTo(x + r * 0.58, y - r * 0.2);
    c.lineTo(x + r * 0.05, y - r * 0.2);
    c.closePath();
    c.fill();
  },
  flower(c, x, y, r) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5;
      circle(c, x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52, r * 0.3);
    }
    circle(c, x, y, r * 0.14);
  },
  leaf(c, x, y, r) {
    c.save();
    c.translate(x, y);
    c.rotate(-Math.PI / 4);
    c.beginPath();
    c.moveTo(0, r);
    c.bezierCurveTo(-r * 0.85, r * 0.3, -r * 0.7, -r * 0.6, 0, -r);
    c.bezierCurveTo(r * 0.7, -r * 0.6, r * 0.85, r * 0.3, 0, r);
    c.moveTo(0, r * 1.05);
    c.lineTo(0, -r * 0.55);
    c.stroke();
    c.restore();
  },
  heart(c, x, y, r) {
    c.beginPath();
    c.moveTo(x, y + r * 0.85);
    c.bezierCurveTo(x - r * 1.25, y - r * 0.05, x - r * 0.55, y - r * 1.05, x, y - r * 0.4);
    c.bezierCurveTo(x + r * 0.55, y - r * 1.05, x + r * 1.25, y - r * 0.05, x, y + r * 0.85);
    c.fill();
  },
  search(c, x, y, r) {
    c.beginPath();
    c.arc(x - r * 0.15, y - r * 0.15, r * 0.55, 0, TAU);
    c.moveTo(x + r * 0.25, y + r * 0.25);
    c.lineTo(x + r * 0.85, y + r * 0.85);
    c.stroke();
  },
  swords(c, x, y, r) {
    c.beginPath();
    for (const s of [1, -1]) {
      const sx = x - s * r * 0.8;
      const sy = y + r * 0.8;
      c.moveTo(sx, sy);
      c.lineTo(x + s * r * 0.78, y - r * 0.78);
      const gx = sx + s * r * 0.32;
      const gy = sy - r * 0.32;
      const px = r * 0.24;
      const py = s * r * 0.24;
      c.moveTo(gx - px, gy - py);
      c.lineTo(gx + px, gy + py);
    }
    c.stroke();
  },
  alert(c, x, y, r) {
    c.beginPath();
    c.moveTo(x, y - r * 0.9);
    c.lineTo(x + r * 0.95, y + r * 0.75);
    c.lineTo(x - r * 0.95, y + r * 0.75);
    c.closePath();
    c.moveTo(x, y - r * 0.3);
    c.lineTo(x, y + r * 0.2);
    c.stroke();
    circle(c, x, y + r * 0.48, r * 0.09);
  },
  eye(c, x, y, r) {
    c.beginPath();
    c.moveTo(x - r * 0.95, y);
    c.quadraticCurveTo(x, y - r * 0.95, x + r * 0.95, y);
    c.quadraticCurveTo(x, y + r * 0.95, x - r * 0.95, y);
    c.stroke();
    circle(c, x, y, r * 0.3);
  },
  skull(c, x, y, r) {
    c.beginPath();
    c.arc(x, y - r * 0.15, r * 0.72, Math.PI * 0.78, Math.PI * 2.22);
    c.lineTo(x + r * 0.42, y + r * 0.85);
    c.lineTo(x - r * 0.42, y + r * 0.85);
    c.closePath();
    c.stroke();
    for (const dx of [-0.3, 0.3]) circle(c, x + dx * r, y - r * 0.1, r * 0.17);
    c.beginPath();
    c.moveTo(x, y + r * 0.2);
    c.lineTo(x - r * 0.1, y + r * 0.42);
    c.lineTo(x + r * 0.1, y + r * 0.42);
    c.fill();
  },
  clock(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, r * 0.85, 0, TAU);
    c.moveTo(x, y);
    c.lineTo(x, y - r * 0.5);
    c.moveTo(x, y);
    c.lineTo(x + r * 0.38, y + r * 0.1);
    c.stroke();
  },
  book(c, x, y, r) {
    c.beginPath();
    c.moveTo(x, y - r * 0.55);
    c.quadraticCurveTo(x - r * 0.45, y - r * 0.8, x - r * 0.95, y - r * 0.6);
    c.lineTo(x - r * 0.95, y + r * 0.65);
    c.quadraticCurveTo(x - r * 0.45, y + r * 0.45, x, y + r * 0.7);
    c.quadraticCurveTo(x + r * 0.45, y + r * 0.45, x + r * 0.95, y + r * 0.65);
    c.lineTo(x + r * 0.95, y - r * 0.6);
    c.quadraticCurveTo(x + r * 0.45, y - r * 0.8, x, y - r * 0.55);
    c.lineTo(x, y + r * 0.7);
    c.stroke();
  },
};

/** 地平線上的太陽：日出有光芒、夕陽下方兩道水平線 */
function horizonSun(c: Ctx, x: number, y: number, r: number, rising: boolean) {
  const horizon = y + r * 0.25;
  c.save();
  c.beginPath();
  c.rect(x - r * 1.5, y - r * 1.5, r * 3, horizon - (y - r * 1.5));
  c.clip();
  circle(c, x, horizon, r * 0.5);
  if (rising) rays(c, x, horizon, r * 0.7, r * 0.98, Math.PI * 1.1, Math.PI * 1.9, 5);
  c.restore();
  c.beginPath();
  c.moveTo(x - r * 0.95, horizon);
  c.lineTo(x + r * 0.95, horizon);
  if (!rising) {
    c.moveTo(x - r * 0.55, horizon + r * 0.32);
    c.lineTo(x + r * 0.55, horizon + r * 0.32);
    c.moveTo(x - r * 0.25, horizon + r * 0.62);
    c.lineTo(x + r * 0.25, horizon + r * 0.62);
  } else {
    c.moveTo(x - r * 0.28, horizon + r * 0.62);
    c.lineTo(x, horizon + r * 0.38);
    c.lineTo(x + r * 0.28, horizon + r * 0.62);
  }
  c.stroke();
}

/** 畫一個圖示（custom 時畫 image，等比縮進直徑 2r 的範圍） */
export function drawIcon(
  ctx: Ctx,
  kind: IconId,
  x: number,
  y: number,
  r: number,
  color: string,
  image?: CanvasImageSource,
): void {
  if (kind === 'none') return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.14;
  if (kind === 'custom') {
    const s = image as { width?: number; height?: number } | undefined;
    if (image && s?.width && s.height) {
      const sc = Math.min((r * 2) / s.width, (r * 2) / s.height);
      const w = s.width * sc;
      const h = s.height * sc;
      ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
    }
  } else {
    ICONS[kind]?.(ctx, x, y, r);
  }
  ctx.restore();
}
