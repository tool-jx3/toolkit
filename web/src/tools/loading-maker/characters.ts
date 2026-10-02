/**
 * 內建的 5 種向量小角色（F17；本工具自己畫的）：貓咪、骰子寶寶、蘑菇、企鵝、熱可可。
 * 每一種都在「高 100、寬約 108」的座標裡以中心為原點畫（呼叫端依角色大小縮放），
 * 約每 3.7 秒眨一次眼（約 0.22 秒），並各有一個小的待機動作。
 */
import { traceShape } from '@/core/shapes';
import type { Ctx2D } from '@/core/timeline';
import type { BuiltinCharacter } from './settings';

const TAU = Math.PI * 2;
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** 內建角色的寬高比（寬 ÷ 高） */
export const BUILTIN_ASPECT = 1.08;

/** 這一刻是不是在眨眼 */
export const isBlinking = (t: number): boolean => mod(t, 3.7) > 3.48;

function eyes(ctx: Ctx2D, x: number, y: number, blink: boolean, color: string, r = 3.2) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  if (blink) {
    ctx.beginPath();
    ctx.moveTo(-x - 4, y);
    ctx.lineTo(-x + 4, y);
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 4, y);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(-x, y, r, r * 1.35, 0, 0, TAU);
    ctx.ellipse(x, y, r, r * 1.35, 0, 0, TAU);
    ctx.fill();
    /* 眼睛的亮點 */
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-x + r * 0.35, y - r * 0.5, r * 0.36, 0, TAU);
    ctx.arc(x + r * 0.35, y - r * 0.5, r * 0.36, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function cheeks(ctx: Ctx2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(-x, y, 6.5, 3.4, 0, 0, TAU);
  ctx.ellipse(x, y, 6.5, 3.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 貓咪：圓滾滾的奶油色貓，尾巴左右甩 */
function drawCat(ctx: Ctx2D, t: number, blink: boolean) {
  const line = '#5b4352';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = line;
  ctx.lineWidth = 3.4;
  /* 尾巴（在身體後面） */
  const wag = Math.sin(t * 4.2) * 7;
  ctx.beginPath();
  ctx.moveTo(26, 30);
  ctx.bezierCurveTo(46, 32, 52, 14 + wag * 0.3, 44 + wag * 0.4, -2 + wag);
  ctx.lineWidth = 9;
  ctx.strokeStyle = line;
  ctx.stroke();
  ctx.lineWidth = 4.6;
  ctx.strokeStyle = '#ffe9cf';
  ctx.stroke();
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = line;
  /* 耳朵 */
  ctx.fillStyle = '#ffe9cf';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * 36, -12);
    ctx.lineTo(sx * 33, -47);
    ctx.lineTo(sx * 10, -30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.fillStyle = '#ffb3c6';
    ctx.beginPath();
    ctx.moveTo(sx * 30, -20);
    ctx.lineTo(sx * 29.5, -38);
    ctx.lineTo(sx * 17, -29);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  /* 身體 */
  ctx.beginPath();
  ctx.ellipse(0, 6, 40, 35, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  /* 額頭的花紋 */
  ctx.save();
  ctx.strokeStyle = '#f2b98a';
  ctx.lineWidth = 3;
  for (const dx of [-7, 0, 7]) {
    ctx.beginPath();
    ctx.moveTo(dx, -27);
    ctx.lineTo(dx * 0.8, -19);
    ctx.stroke();
  }
  ctx.restore();
  eyes(ctx, 14, 2, blink, line);
  /* ω 嘴 */
  ctx.beginPath();
  ctx.moveTo(-6, 12);
  ctx.quadraticCurveTo(-3, 16, 0, 12);
  ctx.quadraticCurveTo(3, 16, 6, 12);
  ctx.lineWidth = 2.6;
  ctx.stroke();
  /* 鬍鬚 */
  ctx.lineWidth = 1.8;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * 24, 9);
    ctx.lineTo(sx * 40, 6);
    ctx.moveTo(sx * 24, 13);
    ctx.lineTo(sx * 39, 15);
    ctx.stroke();
  }
  cheeks(ctx, 24, 18, 'rgba(255, 128, 160, 0.42)');
  /* 前腳 */
  ctx.fillStyle = '#ffe9cf';
  ctx.lineWidth = 3;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 14, 39, 9, 6, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

/** 骰子寶寶：二十面骰的正面，旁邊有一顆會閃的小星星 */
function drawDice(ctx: Ctx2D, t: number, blink: boolean) {
  const line = '#463a6b';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = line;
  ctx.lineWidth = 3.4;
  /* 外框：尖角朝上的六角形 */
  ctx.fillStyle = '#b9a6ff';
  traceShape(ctx, 'hexagon', 0, 2, 47);
  ctx.fill();
  ctx.stroke();
  /* 中央的三角面 */
  const top = { x: 0, y: -27 };
  const right = { x: 27, y: 19 };
  const left = { x: -27, y: 19 };
  ctx.fillStyle = '#ddd3ff';
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fill();
  /* 稜線：三角面的頂點連到六角形的頂點 */
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 6) * TAU;
    return { x: Math.cos(a) * 47, y: 2 + Math.sin(a) * 47 };
  });
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  const edges: [typeof top, (typeof hex)[number]][] = [
    [top, hex[0]],
    [top, hex[1]],
    [top, hex[5]],
    [right, hex[1]],
    [right, hex[2]],
    [right, hex[3]],
    [left, hex[3]],
    [left, hex[4]],
    [left, hex[5]],
  ];
  for (const [a, b] of edges) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.stroke();
  eyes(ctx, 8, 2, blink, line, 2.8);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 8, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  cheeks(ctx, 15, 11, 'rgba(255, 128, 170, 0.45)');
  /* 閃爍的小星星 */
  const k = 0.75 + 0.35 * Math.sin(t * 5);
  ctx.fillStyle = '#ffe680';
  traceShape(ctx, 'star', 40, -36, 7 * k, { points: 4, innerRatio: 0.36 });
  ctx.fill();
}

/** 蘑菇：紅帽白點，帽子底下冒出小孢子 */
function drawMushroom(ctx: Ctx2D, t: number, blink: boolean) {
  const line = '#5a3b3b';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = line;
  ctx.lineWidth = 3.4;
  /* 孢子（往上飄、淡出） */
  for (let i = 0; i < 3; i++) {
    const u = mod(t * 0.45 + i / 3, 1);
    ctx.save();
    ctx.globalAlpha *= Math.sin(u * Math.PI) * 0.8;
    ctx.fillStyle = '#ffe3a3';
    ctx.beginPath();
    ctx.arc(-38 + i * 34 + Math.sin(u * TAU + i) * 4, 4 - u * 46, 2.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  /* 菇柄 */
  ctx.fillStyle = '#fff2dc';
  ctx.beginPath();
  ctx.moveTo(-23, -2);
  ctx.bezierCurveTo(-27, 22, -25, 41, 0, 42);
  ctx.bezierCurveTo(25, 41, 27, 22, 23, -2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  eyes(ctx, 9, 16, blink, line, 2.9);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 23, 4, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  cheeks(ctx, 16, 25, 'rgba(255, 120, 140, 0.4)');
  /* 菇帽 */
  ctx.lineWidth = 3.4;
  ctx.fillStyle = '#ff7a86';
  ctx.beginPath();
  ctx.moveTo(-50, 2);
  ctx.bezierCurveTo(-52, -36, -24, -48, 0, -48);
  ctx.bezierCurveTo(24, -48, 52, -36, 50, 2);
  ctx.quadraticCurveTo(0, -8, -50, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  /* 白點 */
  ctx.fillStyle = '#fff7f0';
  for (const [x, y, r] of [
    [-27, -22, 7],
    [3, -35, 6],
    [26, -18, 8],
    [-6, -14, 4.5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

/** 企鵝：深藍身體、白肚子，翅膀上下拍 */
function drawPenguin(ctx: Ctx2D, t: number, blink: boolean) {
  const line = '#25304a';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = line;
  ctx.lineWidth = 3.4;
  /* 腳 */
  ctx.fillStyle = '#ffb347';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 14, 44, 10, 5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  /* 翅膀 */
  const flap = Math.sin(t * 6) * 0.28;
  ctx.fillStyle = '#3d4a6b';
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * 31, -4);
    ctx.rotate(-sx * (0.5 + flap));
    ctx.beginPath();
    ctx.ellipse(0, 17, 7.5, 19, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  /* 身體 */
  ctx.beginPath();
  ctx.ellipse(0, 2, 36, 44, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  /* 臉與肚子 */
  ctx.fillStyle = '#fbfcff';
  ctx.beginPath();
  ctx.ellipse(0, 14, 26, 30, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-11, -12, 13, 12, 0, 0, TAU);
  ctx.ellipse(11, -12, 13, 12, 0, 0, TAU);
  ctx.fill();
  eyes(ctx, 11, -12, blink, line, 3);
  /* 嘴 */
  ctx.fillStyle = '#ffb347';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -3);
  ctx.lineTo(6, -3);
  ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  cheeks(ctx, 21, -1, 'rgba(255, 130, 170, 0.45)');
}

/** 熱可可：圓杯子加棉花糖，上面冒熱氣 */
function drawCocoa(ctx: Ctx2D, t: number, blink: boolean) {
  const line = '#5b3a2e';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = line;
  ctx.lineWidth = 3.4;
  /* 熱氣 */
  for (let i = 0; i < 2; i++) {
    const u = mod(t * 0.6 + i * 0.5, 1);
    ctx.save();
    ctx.globalAlpha *= Math.sin(u * Math.PI) * 0.75;
    ctx.strokeStyle = '#d9c7d8';
    ctx.lineWidth = 3.2;
    const x = i ? 10 : -12;
    const y0 = -18 - u * 18;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.bezierCurveTo(x - 7, y0 - 8, x + 7, y0 - 14, x, y0 - 24);
    ctx.stroke();
    ctx.restore();
  }
  /* 把手 */
  ctx.beginPath();
  ctx.ellipse(36, 14, 13, 14, 0, -Math.PI * 0.55, Math.PI * 0.55);
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.lineWidth = 3.6;
  ctx.strokeStyle = '#ffd2bd';
  ctx.stroke();
  ctx.strokeStyle = line;
  ctx.lineWidth = 3.4;
  /* 杯身 */
  ctx.fillStyle = '#ffd2bd';
  ctx.beginPath();
  ctx.moveTo(-38, -10);
  ctx.lineTo(38, -10);
  ctx.bezierCurveTo(38, 26, 30, 42, 0, 42);
  ctx.bezierCurveTo(-30, 42, -38, 26, -38, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  /* 可可 */
  ctx.fillStyle = '#8a5a44';
  ctx.beginPath();
  ctx.ellipse(0, -10, 38, 8, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  /* 棉花糖 */
  ctx.fillStyle = '#fff7fb';
  ctx.lineWidth = 2.4;
  for (const [x, y, a] of [
    [-14, -14, -0.3],
    [6, -16, 0.2],
    [20, -12, -0.1],
  ] as const) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    traceShape(ctx, 'roundRect', 0, 0, 6, { width: 13, height: 10, radius: 3 });
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  eyes(ctx, 12, 14, blink, line, 3);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(0, 21, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  cheeks(ctx, 23, 23, 'rgba(255, 110, 140, 0.4)');
}

/** 畫內建角色（原點＝角色中心，單位＝角色高的 1/100） */
export function drawBuiltinCharacter(ctx: Ctx2D, kind: BuiltinCharacter, t: number): void {
  const blink = isBlinking(t);
  ctx.save();
  switch (kind) {
    case 'dice':
      drawDice(ctx, t, blink);
      break;
    case 'mushroom':
      drawMushroom(ctx, t, blink);
      break;
    case 'penguin':
      drawPenguin(ctx, t, blink);
      break;
    case 'cocoa':
      drawCocoa(ctx, t, blink);
      break;
    default:
      drawCat(ctx, t, blink);
      break;
  }
  ctx.restore();
}
