/**
 * 畫鎖定畫面（預覽與匯出同一段程式，規格 3.2、3.3）：
 * - 手機畫面：桌布（照片或預設的夜景）＋變暗 → 狀態列 → 鎖頭 → 時間、日期 → 通知卡片（模糊的桌布＋半透明底）→ 底部的橫條；
 *   以畫面單位（390 × 845）畫、整個乘上「輸出寬 ÷ 390」。
 * - 完整構圖（1200 × 1200）：外框背景（照片或預設的漸層）＋變暗＋漸層 → 手機（陰影、機身、側鍵）→ 手機畫面 → 前鏡頭。
 * 桌布、模糊的桌布、外框背景、手機機身各自先畫成一張快取，播放時每一格只要疊起來。
 */
import { FALLBACK_STACK } from '@/core/fonts';
import { drawPlaced, makeCanvas, roundRectPath } from '@/core/image';
import { blurCanvas } from '@/core/scene';
import { createRandom } from '@/core/timeline';
import {
  CARD,
  type CardDraw,
  cardDraws,
  cardHeight,
  dateLabel,
  ellipsize,
  FULL_OUT,
  gradientLine,
  type ImageRef,
  type LockScreenState,
  type Measure,
  type Outer,
  type PhoneSide,
  phoneBox,
  receivedLabel,
  SCREEN_H,
  SCREEN_OUT,
  SCREEN_W,
  wrapBody,
} from './model';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

const ctx2d = (c: AnyCanvas): Ctx => {
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

/* ---------- 字型（D3：思源黑體；時間用細字重） ---------- */

export const FONT_FAMILY = 'Noto Sans TC';
export const WEIGHT = { clock: 200, regular: 400, medium: 500, bold: 600 } as const;

const REST_STACK = FALLBACK_STACK.split(',')
  .map((s) => s.trim())
  .filter((s) => s.replace(/['"]/g, '') !== FONT_FAMILY)
  .join(', ');

export const fontOf = (weight: number, size: number): string =>
  `${weight} ${size}px "${FONT_FAMILY}", ${REST_STACK}`;

/** 畫面用到的字（字型只下載這些字需要的部分） */
export function fontLoads(s: LockScreenState): { family: string; weight: number; text: string }[] {
  const texts = s.messages.map((m) => `${m.body}${receivedLabel(m)}`).join('');
  return [
    { family: FONT_FAMILY, weight: WEIGHT.clock, text: `${s.time}0123456789:` },
    {
      family: FONT_FAMILY,
      weight: WEIGHT.regular,
      text: `${dateLabel(s.date)}${s.appName}${texts}…`,
    },
    { family: FONT_FAMILY, weight: WEIGHT.medium, text: '100%' },
    {
      family: FONT_FAMILY,
      weight: WEIGHT.bold,
      text: `${s.messages.map((m) => m.sender).join('')}…`,
    },
  ];
}

/* ---------- 量字 ---------- */

let measureCtx: Ctx | null = null;
function measurer(font: string): Measure {
  measureCtx ??= ctx2d(makeCanvas(1, 1));
  const c = measureCtx;
  return (text: string) => {
    c.font = font;
    return c.measureText(text).width;
  };
}

/** 一張卡片的內容（已依寬度省略、斷行） */
export interface CardLayout {
  appName: string;
  sender: string;
  time: string;
  lines: string[];
  /** 內容超過 4 行、被省略了 */
  clipped: boolean;
  height: number;
}

/** 依目前的字型排好每一則的卡片（第一則在前） */
export function layoutCards(s: LockScreenState): CardLayout[] {
  const small = measurer(fontOf(WEIGHT.regular, 11));
  const bold = measurer(fontOf(WEIGHT.bold, 15));
  const body = measurer(fontOf(WEIGHT.regular, 15));
  return s.messages.map((m) => {
    const time = ellipsize(receivedLabel(m), 170, small);
    const appRoom = Math.max(40, CARD.width - 37 - 13 - small(time) - 10);
    const wrapped = wrapBody(m.body, body);
    return {
      appName: ellipsize(s.appName, appRoom, small),
      sender: ellipsize(m.sender || ' ', CARD.textWidth, bold),
      time,
      lines: wrapped.lines,
      clipped: wrapped.clipped,
      height: cardHeight(wrapped.lines.length),
    };
  });
}

/* ---------- 桌布 ---------- */

/** 預設桌布（D4，本站自己畫）：夜空、月亮、星星、山丘與山丘上的洋館 */
function paintDefaultWallpaper(ctx: Ctx): void {
  const W = SCREEN_OUT.width;
  const H = SCREEN_OUT.height;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b1026');
  sky.addColorStop(0.42, '#1d2b55');
  sky.addColorStop(0.72, '#3d3b74');
  sky.addColorStop(1, '#6a5688');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  /* 月光 */
  const glow = ctx.createRadialGradient(800, 1290, 90, 800, 1290, 560);
  glow.addColorStop(0, 'rgba(255,240,205,0.32)');
  glow.addColorStop(1, 'rgba(255,240,205,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  /* 星星（固定的亂數，每次一樣） */
  const rnd = createRandom('lock-screen-stars');
  for (let i = 0; i < 90; i++) {
    const x = rnd.next() * W;
    const y = rnd.next() * 1450;
    const r = 1.2 + rnd.next() * 2.2;
    const a = 0.35 + rnd.next() * 0.55;
    if (Math.hypot(x - 800, y - 1290) < 190) continue;
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  /* 月亮 */
  const moon = ctx.createRadialGradient(780, 1270, 10, 800, 1290, 96);
  moon.addColorStop(0, '#fbf5e3');
  moon.addColorStop(1, '#e9dcb8');
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(800, 1290, 96, 0, Math.PI * 2);
  ctx.fill();
  /* 遠山 */
  ctx.fillStyle = '#26254d';
  ctx.beginPath();
  ctx.moveTo(0, 1790);
  ctx.bezierCurveTo(260, 1650, 520, 1840, 760, 1745);
  ctx.bezierCurveTo(900, 1690, 1000, 1700, W, 1725);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  /* 洋館的剪影（主屋、尖塔、三扇亮著的窗） */
  ctx.fillStyle = '#17163a';
  ctx.beginPath();
  ctx.moveTo(250, 1745);
  ctx.lineTo(250, 1650);
  ctx.lineTo(335, 1595);
  ctx.lineTo(420, 1650);
  ctx.lineTo(420, 1745);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(392, 1560, 44, 120);
  ctx.beginPath();
  ctx.moveTo(386, 1562);
  ctx.lineTo(414, 1500);
  ctx.lineTo(442, 1562);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f5c46b';
  for (const [x, y] of [
    [282, 1680],
    [356, 1680],
    [407, 1595],
  ] as const)
    ctx.fillRect(x, y, 14, 20);
  /* 近山 */
  ctx.fillStyle = '#13132c';
  ctx.beginPath();
  ctx.moveTo(0, 1995);
  ctx.bezierCurveTo(300, 1880, 640, 2060, W, 1935);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
}

/** 桌布（1080 × 2340）：照片依位置蓋滿，或預設桌布；再蓋一層黑色（變暗 %） */
export function buildWallpaper(
  img: CanvasImageSource | null,
  ref: ImageRef | null,
  photo: LockScreenState['wallpaper'],
): AnyCanvas {
  const c = makeCanvas(SCREEN_OUT.width, SCREEN_OUT.height);
  const ctx = ctx2d(c);
  if (img && ref) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    drawPlaced(ctx, img, ref, { x: 0, y: 0, width: c.width, height: c.height }, photo.place);
  } else paintDefaultWallpaper(ctx);
  if (photo.dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${photo.dim / 100})`;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

/** 模糊的桌布（通知卡片底下用）：模糊半徑以畫面單位計；邊緣墊一層沒有模糊的桌布（不會透明） */
export function buildBlurred(wallpaper: AnyCanvas, blur: number): AnyCanvas | null {
  if (!(blur > 0)) return null;
  const copy = makeCanvas(wallpaper.width, wallpaper.height);
  ctx2d(copy).drawImage(wallpaper, 0, 0);
  blurCanvas(copy, (blur * wallpaper.width) / SCREEN_W);
  const out = makeCanvas(wallpaper.width, wallpaper.height);
  const ctx = ctx2d(out);
  ctx.drawImage(wallpaper, 0, 0);
  ctx.drawImage(copy, 0, 0);
  return out;
}

/* ---------- 手機畫面上的圖示（本站自己畫的通用樣式，D5） ---------- */

const WHITE = 'rgba(255,255,255,0.93)';

function fillRound(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

/** 狀態列：左邊訊號（四格）與 Wi-Fi；右邊電量與電池 */
function drawStatusBar(ctx: Ctx): void {
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const h = 4 + i * 2;
    fillRound(ctx, 21 + i * 4.4, 24 - h, 3, h, 0.8, WHITE);
  }
  ctx.strokeStyle = WHITE;
  ctx.fillStyle = WHITE;
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6;
  for (const r of [5.2, 8.6]) {
    ctx.beginPath();
    ctx.arc(48, 24.5, r, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(48, 23.2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = fontOf(WEIGHT.medium, 11);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('100%', 339, 23.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  roundRectPath(ctx, 344, 13.5, 25, 11.5, 3.2);
  ctx.stroke();
  fillRound(ctx, 346.2, 15.7, 20.6, 7.1, 1.8, WHITE);
  fillRound(ctx, 370.4, 17.2, 2, 4.2, 1, WHITE);
  ctx.restore();
}

/** 鎖頭 */
function drawLock(ctx: Ctx): void {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(190.4, 59);
  ctx.lineTo(190.4, 52.6);
  ctx.arc(195, 52.6, 4.6, Math.PI, 0);
  ctx.lineTo(199.6, 59);
  ctx.stroke();
  fillRound(ctx, 187, 56.5, 16, 12.5, 3, '#ffffff');
  ctx.restore();
}

/** 通知的 App 圖示：紫色圓角方塊裡一個白色對話框（框裡三個點） */
export function drawAppIcon(ctx: Ctx, x: number, y: number): void {
  const g = ctx.createLinearGradient(x, y, x, y + 20);
  g.addColorStop(0, '#9483f4');
  g.addColorStop(1, '#5d4bd6');
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  roundRectPath(ctx, x, y, 20, 20, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  roundRectPath(ctx, x + 4, y + 4.8, 12, 8.8, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 6.4, y + 13);
  ctx.lineTo(x + 5.6, y + 16.4);
  ctx.lineTo(x + 9.6, y + 13.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6b58dc';
  for (const dx of [7.2, 10, 12.8]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + 9.2, 0.95, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

/** 卡片的顏色（不透明度另外乘） */
export const CARD_COLORS = {
  fill: [246, 246, 250],
  header: 0.2,
  app: '#3d3f47',
  time: '#62636b',
  sender: '#15161a',
  body: '#26272d',
} as const;

function drawCard(
  ctx: Ctx,
  s: LockScreenState,
  blurred: AnyCanvas | null,
  c: CardLayout,
  d: CardDraw,
): void {
  const x = CARD.x;
  const w = CARD.width;
  const h = c.height;
  const y = d.y;
  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.translate(SCREEN_W / 2, y + h / 2);
  ctx.scale(d.scale, d.scale);
  ctx.translate(-SCREEN_W / 2, -(y + h / 2));
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, CARD.radius);
  ctx.clip();
  if (blurred && s.blur > 0) ctx.drawImage(blurred, 0, 0, SCREEN_W, SCREEN_H);
  const a = s.opacity / 100;
  const [r, g, b] = CARD_COLORS.fill;
  ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = `rgba(255,255,255,${a * CARD_COLORS.header})`;
  ctx.fillRect(x, y, w, CARD.header);
  ctx.restore();
  drawAppIcon(ctx, x + 11, y + 7);
  text(ctx, c.appName, x + 37, y + 22, fontOf(WEIGHT.regular, 11), CARD_COLORS.app);
  text(ctx, c.time, x + w - 13, y + 22, fontOf(WEIGHT.regular, 11), CARD_COLORS.time, 'right');
  text(ctx, c.sender, x + CARD.textX, y + 55, fontOf(WEIGHT.bold, 15), CARD_COLORS.sender);
  c.lines.forEach((line, i) => {
    text(
      ctx,
      line,
      x + CARD.textX,
      y + 74 + i * CARD.lineHeight,
      fontOf(WEIGHT.regular, 15),
      CARD_COLORS.body,
    );
  });
  ctx.restore();
}

/** 手機畫面上要用的快取 */
export interface ScreenLayers {
  wallpaper: AnyCanvas;
  blurred: AnyCanvas | null;
}

/**
 * 畫一張手機畫面（width × height，比例 9：19.5）。t：時間（秒），Infinity＝全部的訊息都出現了（靜態）。
 */
export function drawScreen(
  ctx: Ctx,
  width: number,
  height: number,
  s: LockScreenState,
  layers: ScreenLayers,
  cards: readonly CardLayout[],
  t: number,
): void {
  ctx.save();
  ctx.setTransform(width / SCREEN_W, 0, 0, height / SCREEN_H, 0, 0);
  ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(layers.wallpaper, 0, 0, SCREEN_W, SCREEN_H);
  if (s.showStatus) drawStatusBar(ctx);
  drawLock(ctx);
  text(ctx, s.time, SCREEN_W / 2, 156, fontOf(WEIGHT.clock, 84), '#ffffff', 'center');
  const dateFont = fontOf(WEIGHT.regular, 18);
  text(
    ctx,
    ellipsize(dateLabel(s.date), 360, measurer(dateFont)),
    SCREEN_W / 2,
    187,
    dateFont,
    '#ffffff',
    'center',
  );
  for (const d of cardDraws(
    cards.map((c) => c.height),
    t,
    s.interval,
  ))
    drawCard(ctx, s, layers.blurred, cards[d.index], d);
  fillRound(ctx, 138, 827.7, 114, 5, 2.5, 'rgba(255,255,255,0.92)');
  ctx.restore();
}

/* ---------- 完整構圖 ---------- */

/** 預設的外框背景（D4，本站自己的）：灰藍色的斜向漸層 */
function paintDefaultOuter(ctx: Ctx): void {
  const g = ctx.createLinearGradient(0, 0, FULL_OUT, FULL_OUT);
  g.addColorStop(0, '#4a5570');
  g.addColorStop(1, '#a9b3c4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FULL_OUT, FULL_OUT);
}

/** 外框背景（1200 × 1200）：照片依位置蓋滿或預設漸層 → 變暗 → 漸層（從透明到指定顏色） */
export function buildOuter(
  img: CanvasImageSource | null,
  ref: ImageRef | null,
  o: Outer,
): AnyCanvas {
  const c = makeCanvas(FULL_OUT, FULL_OUT);
  const ctx = ctx2d(c);
  if (img && ref) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, FULL_OUT, FULL_OUT);
    drawPlaced(ctx, img, ref, { x: 0, y: 0, width: FULL_OUT, height: FULL_OUT }, o.place);
  } else paintDefaultOuter(ctx);
  if (o.dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${o.dim / 100})`;
    ctx.fillRect(0, 0, FULL_OUT, FULL_OUT);
  }
  if (o.gradient.on && o.gradient.length > 0) {
    const g = ctx.createLinearGradient(...gradientLine(o.gradient.direction, o.gradient.length));
    g.addColorStop(0, `${o.gradient.color}00`);
    g.addColorStop(1, `${o.gradient.color}ff`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FULL_OUT, FULL_OUT);
  }
  return c;
}

/** 手機機身（1200 × 1200 的透明畫布）：陰影、機身、金屬邊、側鍵、畫面的黑底 */
export function buildPhoneFrame(side: PhoneSide): AnyCanvas {
  const c = makeCanvas(FULL_OUT, FULL_OUT);
  const ctx = ctx2d(c);
  const p = phoneBox(side);
  const { body, k } = p;
  /* 側鍵：右邊電源鍵、左邊兩個音量鍵 */
  const key = (x: number, y: number, h: number) =>
    fillRound(ctx, x, body.y + y * k, 9 * k, h * k, 4 * k, '#2b2d33');
  key(body.x + body.width - 3 * k, 560, 210);
  key(body.x - 6 * k, 470, 150);
  key(body.x - 6 * k, 650, 150);
  /* 陰影＋機身 */
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.38)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 18;
  fillRound(ctx, body.x, body.y, body.width, body.height, 144 * k, '#0e0f12');
  ctx.restore();
  /* 金屬邊 */
  const rim = ctx.createLinearGradient(body.x, body.y, body.x + body.width, body.y + body.height);
  rim.addColorStop(0, '#5a5d66');
  rim.addColorStop(0.5, '#25272c');
  rim.addColorStop(1, '#4a4d55');
  ctx.strokeStyle = rim;
  ctx.lineWidth = 6 * k;
  ctx.beginPath();
  roundRectPath(
    ctx,
    body.x + 3 * k,
    body.y + 3 * k,
    body.width - 6 * k,
    body.height - 6 * k,
    141 * k,
  );
  ctx.stroke();
  const sc = p.screen;
  fillRound(ctx, sc.x, sc.y, sc.width, sc.height, sc.radius, '#000000');
  return c;
}

/** 疊出完整構圖：外框背景 → 機身 → 手機畫面（圓角裁切）→ 前鏡頭 */
export function drawComposition(
  ctx: Ctx,
  outer: AnyCanvas,
  frame: AnyCanvas,
  screen: CanvasImageSource,
  side: PhoneSide,
): void {
  const p = phoneBox(side);
  const sc = p.screen;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, FULL_OUT, FULL_OUT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(outer, 0, 0);
  ctx.drawImage(frame, 0, 0);
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, sc.x, sc.y, sc.width, sc.height, sc.radius);
  ctx.clip();
  ctx.drawImage(screen, sc.x, sc.y, sc.width, sc.height);
  ctx.restore();
  /* 前鏡頭：畫面上方正中央的小圓孔 */
  const cx = sc.x + sc.width / 2;
  const cy = sc.y + 36 * p.k;
  ctx.fillStyle = '#050607';
  ctx.beginPath();
  ctx.arc(cx, cy, 15 * p.k, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}
