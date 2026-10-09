/**
 * 畫排行榜（預覽與下載同一段程式，規格第 3 節）：底色 → 頁首（標題字、人數標籤、三行標題、分隔線）→
 * 右欄（排名者照片或裝飾）→ 名次列 → 下一位的卡片 → 頁尾（出場順序）；完成後可以在下方附上沒出場的角色。
 * 擺放模式的虛線框與控點、名次的點選區都在預覽的操作層（DOM），不畫進圖。
 */
import { ensureFont, FALLBACK_STACK } from '@/core/fonts';
import { canvasToBlob, makeCanvas, roundRectPath } from '@/core/image';
import {
  buildLayout,
  cardBox,
  fitText,
  type Layout,
  LINE_HEIGHT,
  type Measure,
  missingAppendixHeight,
  missingCell,
  type RankRow,
  rowParts,
} from './layout';
import {
  appearanceOrder,
  CANVAS_W,
  type Config,
  canvasHeight,
  characterById,
  chars,
  displayCharId,
  EXPORT_MAX_PIXELS,
  filledCount,
  missingCharacters,
  portraitRect,
  type RankCharacter,
  type Run,
  type ThemeColors,
  themeColors,
  titleParts,
} from './model';
import { RENDER } from './strings';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 圖上所有文字用的字型（思源黑體；字重 500～900） */
export const FONT_FAMILY = 'Noto Sans TC';
export const FONT_WEIGHTS = [500, 600, 700, 800, 900] as const;
const fontCss = (size: number, weight: number) => `${weight} ${size}px ${FALLBACK_STACK}`;

export interface SceneInput {
  config: Config;
  run: Run | null;
  /** 抽選中輪流出現的角色 */
  spinId: string | null;
  /** 角色的裁切圖（還沒讀到或沒有照片時 null，畫成名字卡） */
  thumb: (ch: RankCharacter) => CanvasImageSource | null;
  /** 排名者的照片（解碼後） */
  portrait: CanvasImageSource | null;
}

export const ctxMeasure =
  (ctx: Ctx): Measure =>
  (text, size, weight) => {
    ctx.font = fontCss(size, weight);
    return ctx.measureText(text).width;
  };

function rounded(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  roundRectPath(g, x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

function box(
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | null,
  stroke: string | null = null,
  lw = 1,
) {
  rounded(g, x, y, w, h, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}

function text(
  g: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 600,
  align: CanvasTextAlign = 'left',
) {
  g.font = fontCss(size, weight);
  g.textBaseline = 'top';
  g.fillStyle = color;
  g.textAlign = align;
  g.fillText(s, x, y);
  g.textAlign = 'left';
}

/** 自動縮小並畫出（align center 時 x～x＋width 置中） */
function fitted(
  g: Ctx,
  s: string,
  x: number,
  y: number,
  width: number,
  maxSize: number,
  minSize: number,
  maxLines: number,
  color: string,
  weight = 700,
  align: 'left' | 'center' = 'left',
) {
  const f = fitText(ctxMeasure(g), s, width, maxSize, minSize, maxLines, weight);
  f.lines.forEach((line, i) => {
    text(
      g,
      line,
      align === 'center' ? x + width / 2 : x,
      y + i * f.size * LINE_HEIGHT,
      f.size,
      color,
      weight,
      align,
    );
  });
  return f;
}

function drawLock(g: Ctx, x: number, y: number, size: number, color: string) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.5, size * 0.09);
  g.beginPath();
  g.arc(x + size * 0.5, y + size * 0.38, size * 0.22, Math.PI, 0);
  g.stroke();
  box(
    g,
    x + size * 0.15,
    y + size * 0.38,
    size * 0.7,
    size * 0.53,
    size * 0.1,
    null,
    color,
    g.lineWidth,
  );
  g.restore();
}

/** 八角星（四個長角、四個短角） */
function drawStar(g: Ctx, x: number, y: number, r: number, color: string, rotation = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rotation);
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.3 : r;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.restore();
}

/** 沒有照片的角色：灰色的名字卡（所有角色同一組灰色，名字取前兩個字） */
export function drawPlaceholder(g: Ctx, name: string, x: number, y: number, s: number) {
  g.save();
  rounded(g, x, y, s, s, Math.max(5, s * 0.08));
  g.clip();
  g.fillStyle = '#dddddd';
  g.fillRect(x, y, s, s);
  g.fillStyle = '#c9c9c9';
  g.beginPath();
  g.arc(x + s * 0.83, y + s * 0.18, s * 0.47, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#eeeeee';
  g.save();
  g.translate(x + s * 0.17, y + s * 0.85);
  g.rotate(-0.35);
  g.fillRect(-s * 0.4, -s * 0.22, s * 0.95, s * 0.45);
  g.restore();
  const initials = chars(name.trim() || '?')
    .slice(0, 2)
    .join('');
  text(
    g,
    initials,
    x + s / 2,
    y + s * 0.32,
    s * (chars(initials).length > 1 ? 0.3 : 0.43),
    '#505050',
    900,
    'center',
  );
  g.restore();
}

function drawCharacter(
  g: Ctx,
  input: SceneInput,
  ch: RankCharacter,
  x: number,
  y: number,
  s: number,
  radius: number,
) {
  const img = ch.thumb ? input.thumb(ch) : null;
  if (!img) {
    drawPlaceholder(g, ch.name, x, y, s);
    return;
  }
  g.save();
  rounded(g, x, y, s, s, radius);
  g.clip();
  g.drawImage(img, x, y, s, s);
  g.restore();
}

function imageSize(img: CanvasImageSource): { width: number; height: number } {
  const a = img as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  return { width: a.naturalWidth || a.width || 1, height: a.naturalHeight || a.height || 1 };
}

function drawPortrait(g: Ctx, input: SceneInput, l: Layout, t: ThemeColors) {
  const r = l.right;
  const c = input.config;
  const img = c.portrait.photo ? input.portrait : null;
  box(g, r.x, r.y, r.width, r.height, 28, t.photo);
  g.save();
  rounded(g, r.x, r.y, r.width, r.height, 28);
  g.clip();
  if (img) {
    const p = portraitRect(r, imageSize(img), c.portrait);
    g.drawImage(img, p.x, p.y, p.width, p.height);
    const grad = g.createLinearGradient(0, r.y + r.height - 190, 0, r.y + r.height);
    grad.addColorStop(0, '#18221b00');
    grad.addColorStop(1, '#18221bab');
    g.fillStyle = grad;
    g.fillRect(r.x, r.y + r.height - 190, r.width, 190);
  } else {
    g.strokeStyle = t.line;
    g.lineWidth = 2;
    g.globalAlpha = 0.55;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(r.x + r.width * 0.94, r.y + r.height * 0.58, 160 + k * 65, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    drawStar(g, r.x + 65, r.y + 64, 15, t.accent, 0.25);
    drawStar(g, r.x + r.width - 55, r.y + 150, 9, t.muted, 0.2);
    text(g, RENDER.noSpoilers, r.x + r.width / 2, r.y + 43, 16, t.tagInk, 800, 'center');
  }
  const color = img ? '#ffffff' : t.ink;
  const sub = img ? '#e6e8e1' : t.muted;
  fitted(
    g,
    c.name.trim() || RENDER.me,
    r.x + 28,
    r.y + r.height - 91,
    r.width - 56,
    37,
    18,
    1,
    color,
    900,
    'center',
  );
  text(
    g,
    RENDER.portraitSub(input.run?.phase === 'complete'),
    r.x + r.width / 2,
    r.y + r.height - 42,
    16,
    sub,
    600,
    'center',
  );
  g.restore();
}

function drawCard(g: Ctx, input: SceneInput, l: Layout, t: ThemeColors) {
  const c = input.config;
  const run = input.run;
  const b = cardBox(l, c);
  const ch = characterById(c, displayCharId(run, input.spinId));
  const phase = run?.phase ?? null;
  const spinning = phase === 'spinning';
  g.save();
  g.shadowColor = '#17241324';
  g.shadowBlur = 25;
  g.shadowOffsetY = 10;
  box(g, b.x - 8, b.y - 8, b.s + 16, b.h + 16, 20, t.paper);
  g.restore();
  if (ch) drawCharacter(g, input, ch, b.x, b.y, b.s, 12);
  else {
    box(g, b.x, b.y, b.s, b.s, 12, t.soft);
    drawStar(g, b.x + b.s * 0.18, b.y + b.s * 0.22, b.s * 0.046, t.muted, 0.2);
    text(
      g,
      RENDER.cardMark(spinning),
      b.x + b.s / 2,
      b.y + b.s * 0.17,
      b.s * 0.5,
      t.accent,
      700,
      'center',
    );
    text(g, RENDER.cardFoot, b.x + b.s / 2, b.y + b.s * 0.78, b.s * 0.068, t.muted, 800, 'center');
  }
  const label = ch ? ch.name : RENDER.cardLabel(spinning);
  fitted(
    g,
    label,
    b.x + 8,
    b.y + b.s + 10,
    b.s - 16,
    Math.min(29, Math.max(12, b.s * 0.1)),
    10,
    2,
    t.ink,
    800,
    'center',
  );
  const cw = Math.min(b.s + 22, 246);
  box(g, b.x + b.s / 2 - cw / 2, b.y - 26, cw, 35, 17, t.accent);
  fitted(
    g,
    RENDER.cue(phase),
    b.x + b.s / 2 - cw / 2 + 8,
    b.y - 18,
    cw - 16,
    15,
    10,
    1,
    c.theme === 'midnight' ? '#253b2b' : '#ffffff',
    800,
    'center',
  );
}

function drawRankRow(g: Ctx, input: SceneInput, row: RankRow, t: ThemeColors) {
  const run = input.run;
  const entry = run?.ranks[row.index] ?? null;
  const ch = entry ? characterById(input.config, entry.id) : null;
  const active = run?.phase === 'revealed' && !entry;
  const selected = active && run?.pending === row.index;
  box(
    g,
    row.x,
    row.y,
    row.width,
    row.height,
    Math.min(17, row.height * 0.17),
    selected ? t.accentSoft : t.paper,
    selected ? t.accent : t.line,
    selected ? 3 : 1.5,
  );
  const p = rowParts(row);
  text(
    g,
    String(row.index + 1).padStart(2, '0'),
    row.x + p.numW / 2 + 2,
    row.y + (row.height - p.numSize) / 2 - 1,
    p.numSize,
    row.index === 0 ? t.accent : t.muted,
    900,
    'center',
  );
  const r = Math.min(10, p.s * 0.12);
  if (ch) drawCharacter(g, input, ch, p.imageX, row.y + p.pad, p.s, r);
  else {
    g.save();
    g.setLineDash([4, 4]);
    box(g, p.imageX, row.y + p.pad, p.s, p.s, r, t.soft, t.line, 1.5);
    g.restore();
    text(
      g,
      active ? '+' : '—',
      p.imageX + p.s / 2,
      row.y + p.pad + p.s * 0.27,
      p.s * 0.37,
      t.muted,
      500,
      'center',
    );
  }
  if (ch) {
    const f = fitText(
      ctxMeasure(g),
      ch.name,
      p.tw,
      Math.min(28, row.height * 0.36),
      11,
      row.height > 57 ? 2 : 1,
      800,
    );
    f.lines.forEach((line, i) => {
      text(
        g,
        line,
        p.tx,
        row.y + (row.height - f.height) / 2 + i * f.size * LINE_HEIGHT,
        f.size,
        t.ink,
        800,
      );
    });
    drawLock(g, row.x + row.width - 25, row.y + row.height / 2 - 9, 17, t.muted);
  } else {
    const label = selected ? RENDER.rowSelected : active ? RENDER.rowActive : RENDER.rowEmpty;
    const weight = selected ? 800 : 500;
    const f = fitText(ctxMeasure(g), label, p.tw, Math.min(23, row.height * 0.32), 10, 1, weight);
    text(
      g,
      f.lines[0],
      p.tx,
      row.y + (row.height - f.size) / 2,
      f.size,
      selected ? t.accent : t.muted,
      weight,
    );
  }
}

function drawMissingAppendix(g: Ctx, input: SceneInput, l: Layout, t: ThemeColors) {
  const list = missingCharacters(input.config, input.run);
  if (!list.length) return;
  g.fillStyle = t.bg;
  g.fillRect(0, l.H, CANVAS_W, missingAppendixHeight(list.length));
  text(g, RENDER.missingTitle(list.length), 50, l.H + 25, 27, t.ink, 800);
  text(g, RENDER.missingSub, 50, l.H + 68, 16, t.muted, 500);
  list.forEach((ch, i) => {
    const cell = missingCell(l.H, i);
    drawCharacter(g, input, ch, cell.x + 5, cell.y, 103, 12);
    fitted(g, ch.name, cell.x, cell.y + 113, 113, 18, 13, 2, t.ink, 700, 'center');
  });
}

/** 畫整張圖（ctx 的大小＝1080 × 圖高，附錄另外加高） */
export function renderScene(
  g: Ctx,
  input: SceneInput,
  { includeMissing = false }: { includeMissing?: boolean } = {},
): Layout {
  const c = input.config;
  const run = input.run;
  const l = buildLayout(c, ctxMeasure(g));
  const t = themeColors(c);
  g.save();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.fillStyle = t.bg;
  g.fillRect(0, 0, l.W, l.H);
  text(g, RENDER.brand, 52, 35, 20, t.ink, 900);
  const top =
    run?.phase === 'complete' ? RENDER.pillDone : RENDER.pill(c.characters.length, c.slots);
  box(g, 810, 27, 218, 36, 18, t.tag);
  text(g, top, 919, 36, 15, t.tagInk, 800, 'center');
  const lines: [typeof l.first, number, string][] = [
    [l.first, l.firstY, t.ink],
    [l.second, l.secondY, t.ink],
    [l.third, l.thirdY, t.accent],
  ];
  for (const [f, y, col] of lines)
    f.lines.forEach((line, i) => {
      text(g, line, 50, y + i * f.size * LINE_HEIGHT, f.size, col, f.weight);
    });
  g.strokeStyle = t.line;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(50, l.headerBottom);
  g.lineTo(1030, l.headerBottom);
  g.stroke();
  text(g, RENDER.myRanking, 50, l.headerBottom + 18, 16, t.muted, 800);
  const progress = run ? RENDER.progress(filledCount(run), c.slots) : RENDER.slots(c.slots);
  text(g, progress, 490, l.headerBottom + 18, 14, t.muted, 700, 'right');
  text(
    g,
    c.portrait.photo ? RENDER.ranker : RENDER.nextPick,
    518,
    l.headerBottom + 18,
    16,
    t.muted,
    800,
  );
  drawPortrait(g, input, l, t);
  for (const r of l.rows) drawRankRow(g, input, r, t);
  drawCard(g, input, l, t);
  const last = l.rows[l.rows.length - 1];
  const spare = l.bodyY + l.bodyH - (last.y + last.height);
  if (spare > 145) {
    text(g, RENDER.takeBacks, l.rank.x + 12, last.y + last.height + 44, 28, t.muted, 800);
    text(g, RENDER.takeBacksSub, l.rank.x + 12, last.y + last.height + 88, 17, t.muted, 500);
  }
  g.strokeStyle = t.line;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(50, l.H - 60);
  g.lineTo(1030, l.H - 60);
  g.stroke();
  const order = appearanceOrder(c, run);
  const bottom = order.length
    ? RENDER.order(order.map((ch) => ch.name))
    : run?.phase === 'complete'
      ? RENDER.footDone
      : RENDER.footIdle;
  fitted(g, bottom, 50, l.H - 41, 750, 15, 10, 1, t.muted, 600);
  if (includeMissing && run?.phase === 'complete') drawMissingAppendix(g, input, l, t);
  g.restore();
  return l;
}

/** 圖上會用到的所有文字（載入字型時只下載用到的字） */
export function sceneText(c: Config): string {
  const p = titleParts(c);
  const fixed = [
    RENDER.brand,
    RENDER.pill(c.characters.length, c.slots),
    RENDER.pillDone,
    RENDER.myRanking,
    RENDER.ranker,
    RENDER.nextPick,
    RENDER.noSpoilers,
    RENDER.me,
    RENDER.portraitSub(true),
    RENDER.portraitSub(false),
    ...(['complete', 'spinning', 'revealed', 'between', null] as const).map(RENDER.cue),
    RENDER.cardFoot,
    RENDER.cardLabel(true),
    RENDER.cardLabel(false),
    RENDER.rowSelected,
    RENDER.rowActive,
    RENDER.rowEmpty,
    RENDER.takeBacks,
    RENDER.takeBacksSub,
    RENDER.order([]),
    RENDER.footDone,
    RENDER.footIdle,
    RENDER.missingTitle(0),
    RENDER.missingSub,
    '0123456789/ >·?…—+',
  ];
  const names = c.characters.map((ch) => ch.name);
  return [...new Set(chars([p.first, p.second, p.third, ...fixed, ...names].join('')))].join('');
}

/** 載入圖上用的字型（每種字重只下載用到的字）；回傳是否都載入了 */
export async function ensureSceneFonts(c: Config): Promise<boolean> {
  const t = sceneText(c);
  const r = await Promise.all(FONT_WEIGHTS.map((w) => ensureFont(FONT_FAMILY, w, t)));
  return r.every(Boolean);
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  ext: 'png' | 'webp';
}

export class ExportSizeError extends Error {}

/** 匯出的大小（附錄加在下方；倍率 1 或 2） */
export function exportSize(c: Config, run: Run | null, scale: number, includeMissing: boolean) {
  const base = canvasHeight(c);
  const extra = includeMissing ? missingAppendixHeight(missingCharacters(c, run).length) : 0;
  return { width: CANVAS_W * scale, height: (base + extra) * scale };
}

/** 下載用的圖片（等字型載好再畫）；WebP 不支援時瀏覽器給 PNG，副檔名跟著實際的格式 */
export async function renderImage(
  input: SceneInput,
  {
    scale,
    includeMissing,
    type,
  }: { scale: 1 | 2; includeMissing: boolean; type: 'image/png' | 'image/webp' },
): Promise<ExportResult> {
  await ensureSceneFonts(input.config);
  const size = exportSize(input.config, input.run, scale, includeMissing);
  if (size.width * size.height > EXPORT_MAX_PIXELS) throw new ExportSizeError('size');
  const canvas = makeCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('canvas');
  ctx.scale(scale, scale);
  renderScene(ctx, input, { includeMissing });
  const blob = await canvasToBlob(canvas, type, 0.98);
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';
  return { blob, width: size.width, height: size.height, ext };
}

/** 角色的名字卡縮圖（清單用；同一個名字只畫一次） */
const placeholderCache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
export function placeholderThumb(name: string): HTMLCanvasElement | OffscreenCanvas {
  const key = name.trim();
  const hit = placeholderCache.get(key);
  if (hit) return hit;
  const c = makeCanvas(160, 160);
  const ctx = c.getContext('2d') as Ctx | null;
  if (ctx) drawPlaceholder(ctx, key, 0, 0, 160);
  placeholderCache.set(key, c);
  if (placeholderCache.size > 300) {
    const first = placeholderCache.keys().next().value;
    if (first !== undefined) placeholderCache.delete(first);
  }
  return c;
}
