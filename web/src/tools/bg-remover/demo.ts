/**
 * 範例圖：在瀏覽器裡用 canvas 現畫的 Q 版角色（本專案自己畫的簡單造型，不是任何作品的素材）。
 * 兩張：白底（立繪委託常見）、淺綠的純色底。角色身上有和白底同色的地方（白領子、眼睛的亮點、白鞋帶），
 * 用來示範「只去掉和圖邊相連的背景」。
 */

type Ctx = CanvasRenderingContext2D;

export const DEMO_SIZE = { width: 480, height: 640 } as const;

const COLORS = {
  hair: '#4a3b5c',
  hairShade: '#3a2d49',
  skin: '#f2c4a2',
  stocking: '#3d3346',
  blush: '#f6a7a4',
  eye: '#3b5bb5',
  dress: '#5b6ee1',
  dressShade: '#4757c4',
  ribbon: '#e2557a',
  white: '#ffffff',
  outline: '#2e2638',
  shoe: '#6b4a3a',
};

function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, fill: string) {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

/** 角色（中心 cx、頭頂 top）：雙馬尾、圓臉、洋裝、白領子、緞帶、鞋子 */
export function drawCharacter(g: Ctx, cx: number, top: number) {
  const C = COLORS;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  /* 雙馬尾（在身體後面） */
  for (const side of [-1, 1]) {
    g.fillStyle = C.hair;
    g.beginPath();
    g.moveTo(cx + side * 70, top + 70);
    g.bezierCurveTo(
      cx + side * 190,
      top + 90,
      cx + side * 200,
      top + 260,
      cx + side * 130,
      top + 360,
    );
    g.bezierCurveTo(
      cx + side * 150,
      top + 250,
      cx + side * 120,
      top + 150,
      cx + side * 60,
      top + 120,
    );
    g.closePath();
    g.fill();
  }
  /* 腳與鞋 */
  for (const side of [-1, 1]) {
    g.fillStyle = C.stocking;
    g.fillRect(cx + side * 34 - 14, top + 420, 28, 90);
    g.fillStyle = C.shoe;
    g.beginPath();
    g.roundRect(cx + side * 34 - 22, top + 500, 44, 26, 12);
    g.fill();
    /* 白鞋帶（不碰到外框） */
    g.strokeStyle = C.white;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx + side * 34 - 8, top + 510);
    g.lineTo(cx + side * 34 + 8, top + 510);
    g.stroke();
  }
  /* 洋裝（梯形裙襬） */
  g.fillStyle = C.dress;
  g.beginPath();
  g.moveTo(cx - 52, top + 190);
  g.lineTo(cx + 52, top + 190);
  g.quadraticCurveTo(cx + 95, top + 330, cx + 118, top + 432);
  g.quadraticCurveTo(cx, top + 450, cx - 118, top + 432);
  g.quadraticCurveTo(cx - 95, top + 330, cx - 52, top + 190);
  g.closePath();
  g.fill();
  g.fillStyle = C.dressShade;
  g.beginPath();
  g.moveTo(cx - 8, top + 250);
  g.lineTo(cx + 8, top + 250);
  g.lineTo(cx + 22, top + 440);
  g.lineTo(cx - 22, top + 440);
  g.closePath();
  g.fill();
  /* 手臂 */
  for (const side of [-1, 1]) {
    g.strokeStyle = C.dress;
    g.lineWidth = 30;
    g.beginPath();
    g.moveTo(cx + side * 52, top + 205);
    g.quadraticCurveTo(cx + side * 92, top + 260, cx + side * 96, top + 318);
    g.stroke();
    ellipse(g, cx + side * 97, top + 330, 15, 15, C.skin);
  }
  /* 白領子（在洋裝裡面，沒有碰到背景） */
  g.fillStyle = C.white;
  g.beginPath();
  g.moveTo(cx - 44, top + 192);
  g.quadraticCurveTo(cx - 30, top + 236, cx, top + 222);
  g.quadraticCurveTo(cx + 30, top + 236, cx + 44, top + 192);
  g.closePath();
  g.fill();
  /* 緞帶 */
  g.fillStyle = C.ribbon;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx, top + 214);
    g.lineTo(cx + side * 24, top + 202);
    g.lineTo(cx + side * 24, top + 228);
    g.closePath();
    g.fill();
  }
  ellipse(g, cx, top + 215, 7, 7, C.ribbon);
  /* 頭 */
  ellipse(g, cx, top + 110, 92, 96, C.hair);
  ellipse(g, cx, top + 128, 76, 72, C.skin);
  /* 瀏海 */
  g.fillStyle = C.hair;
  g.beginPath();
  g.moveTo(cx - 86, top + 120);
  g.quadraticCurveTo(cx - 70, top + 30, cx, top + 26);
  g.quadraticCurveTo(cx + 70, top + 30, cx + 86, top + 120);
  g.quadraticCurveTo(cx + 60, top + 84, cx + 34, top + 92);
  g.quadraticCurveTo(cx + 10, top + 70, cx - 4, top + 98);
  g.quadraticCurveTo(cx - 30, top + 72, cx - 52, top + 96);
  g.quadraticCurveTo(cx - 70, top + 90, cx - 86, top + 120);
  g.closePath();
  g.fill();
  /* 眼睛與亮點 */
  for (const side of [-1, 1]) {
    ellipse(g, cx + side * 30, top + 140, 13, 17, C.outline);
    ellipse(g, cx + side * 30, top + 143, 10, 13, C.eye);
    ellipse(g, cx + side * 30 - 4, top + 134, 4.5, 5.5, C.white);
    ellipse(g, cx + side * 48, top + 168, 11, 6, C.blush);
  }
  /* 嘴 */
  g.strokeStyle = C.outline;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, top + 170, 8, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  /* 髮飾 */
  ellipse(g, cx + 62, top + 52, 14, 14, C.ribbon);
  ellipse(g, cx - 62, top + 52, 14, 14, C.ribbon);
}

/** 畫一張範例圖：背景色＋角色 */
export function drawDemo(g: Ctx, background: string) {
  const { width, height } = DEMO_SIZE;
  g.fillStyle = background;
  g.fillRect(0, 0, width, height);
  drawCharacter(g, width / 2, 70);
}

export const DEMO_BACKGROUNDS = ['#ffffff', '#a9dcbb'] as const;

/** 兩張範例圖（PNG） */
export async function demoFiles(names: readonly string[]): Promise<File[]> {
  const out: File[] = [];
  for (let i = 0; i < DEMO_BACKGROUNDS.length; i++) {
    const c = document.createElement('canvas');
    c.width = DEMO_SIZE.width;
    c.height = DEMO_SIZE.height;
    const g = c.getContext('2d');
    if (!g) throw new Error('canvas');
    drawDemo(g, DEMO_BACKGROUNDS[i]);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error('encode');
    out.push(new File([blob], names[i] ?? `demo-${i + 1}.png`, { type: 'image/png' }));
  }
  return out;
}
