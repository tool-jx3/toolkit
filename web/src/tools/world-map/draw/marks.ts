/**
 * 森林的樹與山地的山（本站自己的畫法）。畫在原點、原尺寸；呼叫端依離邊界的距離縮放（model/relief.ts）。
 *
 * - 樹：三團圓的樹冠（左、右、上）＋短樹幹；外框、暗面（往右下）、亮面（往左上），雪原上樹冠上緣積雪。
 * - 山：一座主峰（左亮右暗、稜線、右側兩三道陰影線），一半的變體後面多一座小峰；山腳一圈淡淡的土色；
 *   雪原上山頂覆雪（越冷雪線越低）；靠近森林的山坡長出幾叢綠。
 */
import { type BuildColors, mix, type ReliefColors, SNOW_SHADE, SNOW_WHITE, tint } from './palette';

type Ctx = CanvasRenderingContext2D;

const circles = (ctx: Ctx, list: readonly (readonly [number, number, number])[]) => {
  ctx.beginPath();
  for (const [x, y, r] of list) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
};

/** 樹的基準半徑（原尺寸） */
export const treeRadius = (n: number): number => 10.9 * (0.84 + n * 0.28);

export function drawTree(ctx: Ctx, p: ReliefColors, n: number, snow = 0): void {
  const r = treeRadius(n);
  const leaf = tint(p.tree, (n - 0.5) * 14);
  const bark = mix('#6c5236', '#8e9c94', snow * 0.65);
  const lean = (n - 0.5) * 0.18;
  const lobes: [number, number, number][] = [
    [-0.46 * r + lean * r, 0.06 * r, 0.6 * r],
    [0.47 * r + lean * r, 0.02 * r, 0.58 * r],
    [lean * r * 0.5, -0.46 * r, 0.68 * r],
  ];
  /* 樹幹 */
  ctx.fillStyle = bark;
  ctx.beginPath();
  ctx.moveTo(-0.13 * r, 1.22 * r);
  ctx.lineTo(-0.08 * r, 0.3 * r);
  ctx.lineTo(0.1 * r, 0.3 * r);
  ctx.lineTo(0.16 * r, 1.22 * r);
  ctx.closePath();
  ctx.fill();
  /* 外框 */
  ctx.fillStyle = p.line;
  circles(
    ctx,
    lobes.map(([x, y, rr]) => [x, y, rr + 0.7] as const),
  );
  ctx.fill();
  /* 暗面 */
  ctx.fillStyle = mix(p.treeDark, '#718e87', snow * 0.5);
  circles(ctx, lobes);
  ctx.fill();
  /* 樹冠 */
  ctx.fillStyle = leaf;
  circles(
    ctx,
    lobes.map(([x, y, rr]) => [x - rr * 0.1, y - rr * 0.14, rr * 0.84] as const),
  );
  ctx.fill();
  /* 亮面 */
  ctx.globalAlpha *= 0.7;
  ctx.fillStyle = p.treeLight;
  circles(
    ctx,
    lobes.map(([x, y, rr]) => [x - rr * 0.32, y - rr * 0.36, rr * 0.38] as const),
  );
  ctx.fill();
  ctx.globalAlpha /= 0.7;
  if (snow > 0.001) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * snow;
    for (const [x, y, rr] of lobes) {
      const k = 0.45 + 0.4 * snow;
      ctx.fillStyle = SNOW_SHADE;
      ctx.beginPath();
      ctx.ellipse(x - rr * 0.05, y - rr * 0.42, rr * k, rr * (0.2 + 0.25 * snow), 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = SNOW_WHITE;
      ctx.beginPath();
      ctx.ellipse(
        x - rr * 0.1,
        y - rr * 0.5,
        rr * k * 0.92,
        rr * (0.15 + 0.22 * snow),
        0,
        Math.PI,
        0,
      );
      ctx.fill();
    }
    ctx.globalAlpha = a;
  }
}

/** 山的原尺寸（寬的一半、高） */
export const mountainSize = (n: number): { w: number; h: number } => ({
  w: 28 * (0.87 + n * 0.25),
  h: 47 * (0.78 + n * 0.35),
});

function peakShape(
  ctx: Ctx,
  p: ReliefColors,
  w: number,
  h: number,
  peak: number,
  snow: number,
  hatch: boolean,
) {
  /* 本體 */
  ctx.beginPath();
  ctx.moveTo(-w, 4);
  ctx.lineTo(-w * 0.62, -h * 0.3);
  ctx.lineTo(peak - w * 0.3, -h * 0.62);
  ctx.lineTo(peak, -h);
  ctx.lineTo(peak + w * 0.26, -h * 0.68);
  ctx.lineTo(w * 0.58, -h * 0.34);
  ctx.lineTo(w, 4);
  ctx.quadraticCurveTo(0, 9, -w, 4);
  ctx.closePath();
  ctx.fillStyle = p.rock;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = p.line;
  ctx.stroke();
  /* 暗面（稜線的右側） */
  ctx.beginPath();
  ctx.moveTo(peak, -h);
  ctx.lineTo(peak + w * 0.26, -h * 0.68);
  ctx.lineTo(w * 0.58, -h * 0.34);
  ctx.lineTo(w, 4);
  ctx.quadraticCurveTo(w * 0.4, 7.5, peak * 0.4 + w * 0.08, 6.5);
  ctx.lineTo(peak + w * 0.12, -h * 0.4);
  ctx.closePath();
  ctx.fillStyle = p.rockDark;
  ctx.fill();
  /* 亮面（左上的一條） */
  ctx.beginPath();
  ctx.moveTo(peak, -h);
  ctx.lineTo(peak - w * 0.3, -h * 0.62);
  ctx.lineTo(-w * 0.5, -h * 0.26);
  ctx.lineTo(peak - w * 0.16, -h * 0.55);
  ctx.closePath();
  ctx.fillStyle = p.rockLight;
  ctx.fill();
  if (snow > 0.001) {
    const lo = 0.66 - 0.36 * snow;
    ctx.beginPath();
    ctx.moveTo(peak, -h);
    ctx.lineTo(peak + w * 0.26, -h * 0.68);
    ctx.lineTo(peak + w * (0.26 + 0.25 * snow), -h * (lo + 0.02));
    ctx.lineTo(peak + w * 0.12, -h * (lo + 0.1));
    ctx.lineTo(peak, -h * lo);
    ctx.lineTo(peak - w * 0.14, -h * (lo + 0.12));
    ctx.lineTo(peak - w * (0.3 + 0.28 * snow), -h * lo);
    ctx.lineTo(peak - w * 0.3, -h * 0.62);
    ctx.closePath();
    ctx.globalAlpha *= 0.55 + 0.45 * snow;
    ctx.fillStyle = SNOW_WHITE;
    ctx.fill();
    ctx.globalAlpha /= 0.55 + 0.45 * snow;
  }
  if (hatch) {
    ctx.beginPath();
    ctx.moveTo(peak + w * 0.2, -h * 0.5);
    ctx.lineTo(peak + w * 0.34, -h * 0.28);
    ctx.moveTo(w * 0.48, -h * 0.22);
    ctx.lineTo(w * 0.62, -h * 0.06);
    ctx.moveTo(peak + w * 0.06, -h * 0.28);
    ctx.lineTo(peak + w * 0.14, -h * 0.1);
    ctx.globalAlpha *= 0.6;
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = p.line;
    ctx.stroke();
    ctx.globalAlpha /= 0.6;
  }
}

export function drawMountain(ctx: Ctx, base: ReliefColors, n: number, snow = 0, wood = 0): void {
  let p = base;
  if (wood) {
    const k = wood * (1 - snow * 0.8);
    p = {
      ...p,
      rock: mix(p.rock, p.tree, k * 0.7),
      rockDark: mix(p.rockDark, p.treeDark, k * 0.62),
      rockLight: mix(p.rockLight, p.treeLight, k * 0.4),
    };
  }
  p = { ...p, rock: tint(p.rock, (n - 0.5) * 16) };
  const { w, h } = mountainSize(n);
  const peak = (n - 0.5) * w * 0.5;
  /* 山腳 */
  ctx.globalAlpha *= 0.35;
  ctx.fillStyle = p.earth;
  ctx.beginPath();
  ctx.ellipse(0, 5, w * 1.25, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha /= 0.35;
  /* 後面的小峰 */
  if (n > 0.5) {
    const side = n > 0.75 ? 1 : -1;
    ctx.save();
    ctx.translate(side * w * 0.55, -1);
    peakShape(ctx, { ...p, rock: tint(p.rock, -10) }, w * 0.55, h * 0.58, 0, snow, false);
    ctx.restore();
  }
  peakShape(ctx, p, w, h, peak, snow, true);
  if (wood > 0.15) {
    const rr = w * (0.11 + 0.04 * wood);
    const spots: [number, number][] = [
      [-0.55, -0.12],
      [0.4, -0.18],
      [0.04, -0.03],
    ];
    ctx.globalAlpha *= 0.55 + wood * 0.45;
    ctx.fillStyle = mix(p.treeDark, '#9cb6ac', snow * 0.65);
    circles(
      ctx,
      spots.flatMap(([sx, sy]) => [
        [w * sx - rr * 0.5, h * sy, rr] as const,
        [w * sx + rr * 0.55, h * sy + 0.5, rr * 0.85] as const,
      ]),
    );
    ctx.fill();
    ctx.fillStyle = mix(p.treeLight, '#edf3e9', snow * 0.85);
    circles(
      ctx,
      spots.map(([sx, sy]) => [w * sx - rr * 0.65, h * sy - rr * 0.35, rr * 0.55] as const),
    );
    ctx.fill();
    ctx.globalAlpha /= 0.55 + wood * 0.45;
  }
}

/** 濕地的蘆葦叢（地圖上的濕地每 3 格一叢、素材「濕地」也用） */
export function drawReeds(ctx: Ctx, c: BuildColors, reed: string, snow = 0): void {
  ctx.fillStyle = mix('#6d7f8a', '#c9d6dc', snow * 0.6);
  ctx.globalAlpha *= 0.55;
  ctx.beginPath();
  ctx.ellipse(-6, 14, 15, 4.5, 0, 0, Math.PI * 2);
  ctx.ellipse(12, 17, 10, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha /= 0.55;
  ctx.strokeStyle = mix(reed, '#d8e2dc', snow * 0.7);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const stems: [number, number, number][] = [
    [-12, 12, -9],
    [-7, 12, -16],
    [-2, 13, -20],
    [3, 12, -14],
    [8, 14, -8],
    [13, 15, -11],
  ];
  for (const [x, y0, y1] of stems) {
    ctx.moveTo(x, y0);
    ctx.quadraticCurveTo(x + 1.5, (y0 + y1) / 2, x + 2.5, y1);
  }
  ctx.stroke();
  ctx.fillStyle = c.wood;
  ctx.beginPath();
  for (const [x, , y1] of stems.filter((_, i) => i % 2 === 1)) {
    ctx.ellipse(x + 2.5, y1 + 2, 1.6, 3.4, 0.2, 0, Math.PI * 2);
  }
  ctx.fill();
}
