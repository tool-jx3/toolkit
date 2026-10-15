/**
 * 場景（規格 3）：把設定排版成畫布、算好時間表，提供 render(ctx, t) 給預覽與匯出共用（AnimationSource）。
 * 2026-10：每個泡泡各自的樣式（兩側的預設＋單獨調整）、自由拖曳的位移、頁首與頁尾、卡片底（底色、背景圖、紋理）、
 * 卡片比例與最小高度。沒用到這些時，每一步的算法都和以前相同（輸出不變）。
 */
import { ensureFont, type FontValue, fontCss } from '@/core/fonts';
import { type AnimationSource, type Ctx2D, clamp01, hashSigned, timeSlot } from '@/core/timeline';
import { canvasMeasure, type MeasureFn } from '@/core/typeset/measure';
import { breakText } from '@/core/typeset/wrap';
import {
  type DrawEnv,
  deviceScale,
  drawBubble,
  FULL_TEXT,
  roundRectPath,
  type TextState,
} from './draw';
import {
  arrangeBubbles,
  type BubbleLayout,
  boldWeight,
  cachedUnit,
  type LayoutOptions,
  layoutBubble,
  planCanvas,
  visualBox,
} from './layout';
import {
  type Bubble,
  bubbleFmt,
  bubbleRich,
  type CardStyle,
  DEFAULT_FMT,
  type DividerId,
  hasContent,
  type SbData,
} from './model';
import { combine, enterPose, exitPose, idlePose, type Pose } from './motion';
import { textureCanvas } from './texture';
import {
  appearanceOrder,
  computeTiming,
  type ItemTiming,
  LINE_FADE,
  LINE_STEP,
  TEXT_FADE,
  type Timing,
  textDuration,
} from './timeline';

export interface SceneItem {
  index: number;
  bubble: Bubble;
  layout: BubbleLayout;
  /** 本體左上角在畫布上的位置 */
  x: number;
  y: number;
  rotate: number;
  timing: ItemTiming;
  seed: number;
  phase: number;
}

/** 頁首、頁尾的一行字（畫布座標） */
export interface NoteLine {
  text: string;
  x: number;
  cy: number;
}

export interface NoteBlock {
  font: string;
  color: string;
  lines: NoteLine[];
}

/** 泡泡區上下的分隔線（畫布座標） */
export interface DividerLine {
  x0: number;
  x1: number;
  y: number;
  style: Exclude<DividerId, 'none'>;
  color: string;
}

/**
 * 畫布的幾何（拖曳中要固定住的部分）：泡泡區的外接範圍（排好、加上位移之後；左上角相對於排列的原點）、
 * 泡泡區的大小、畫布大小與內容的位置。
 */
export interface SceneGeometry {
  bx0: number;
  by0: number;
  blockW: number;
  blockH: number;
  width: number;
  height: number;
  ox: number;
  oy: number;
}

export interface SceneOptions {
  /** 卡片的背景圖（已解碼；沒有就不畫） */
  image?: CanvasImageSource | null;
  /** 拖曳中：畫布大小與內容的位置固定住（放開之後才重新計算） */
  freeze?: SceneGeometry | null;
}

export interface Scene extends AnimationSource {
  width: number;
  height: number;
  duration: number;
  /** 全部出現完的時間（代表畫面） */
  ready: number;
  leave: number;
  stillTime: number;
  items: SceneItem[];
  /** 依出現順序（後出現的畫在上面） */
  drawOrder: SceneItem[];
  timing: Timing;
  /** 沒有任何內容 */
  empty: boolean;
  /** 自訂畫布放不下內容（會被裁掉）；自動、比例畫布超過 4096 */
  overflow: boolean;
  /** 要載入的字型（預覽與匯出前） */
  fontLoads: { family: string; weight: number; text: string }[];
  fontKey: string;
  /** 卡片底（沒開時 null） */
  card: CardStyle | null;
  image: CanvasImageSource | null;
  notes: NoteBlock[];
  dividers: DividerLine[];
  geometry: SceneGeometry;
}

/** 沒有內容時的畫布 */
export const EMPTY_SIZE = { width: 320, height: 180 };

/** 每個泡泡的亂數種子：只看清單位置（改字、換造型時外形不會跳） */
export const itemSeed = (index: number): number => 7919 * (index + 1) + 101;

/** 一個泡泡的排版設定：樣式沒設的字型、字級、行距沿用「版面」 */
export function layoutOptionsFor(d: SbData, b: Bubble): LayoutOptions {
  const f = bubbleFmt(b);
  const base = {
    font: d.font,
    fontSize: d.fontSize,
    lineHeight: d.lineHeight,
    wrapWidth: d.wrapWidth,
    shadow: d.shadow,
  };
  if (f === DEFAULT_FMT) return base;
  const font = f.font ?? d.font;
  return {
    ...base,
    font,
    fontSize: f.fontSize ?? d.fontSize,
    lineHeight: f.lineHeight ?? d.lineHeight,
    fmt: f,
    metaFont: f.metaFont ?? font,
  };
}

/** 頁首、頁尾與分隔線的排法（內容座標：泡泡區在 blockX, blockY） */
function layoutNotes(
  d: SbData,
  blockW: number,
  blockH: number,
  unit: (font: string, ch: string) => number,
): {
  width: number;
  height: number;
  blockX: number;
  blockY: number;
  notes: NoteBlock[];
  dividers: DividerLine[];
} | null {
  const c = d.card;
  const header = c.header.replace(/\s+$/, '');
  const footer = c.footer.replace(/\s+$/, '');
  const div = c.divider;
  if (!header && !footer && div === 'none') return null;
  const font = fontCss(c.noteFont ?? d.font, c.noteSize);
  const lh = c.noteSize * 1.5;
  const limit = Math.max(blockW, 160);
  const wrap = (text: string) =>
    text
      ? breakText(text, { limit, unit: (ch) => unit(font, ch), segment: 'grapheme' }).map(
          (chars) => ({ text: chars.join(''), w: chars.reduce((s, ch) => s + unit(font, ch), 0) }),
        )
      : [];
  const hdr = wrap(header);
  const ftr = wrap(footer);
  const width = Math.max(blockW, ...hdr.map((l) => l.w), ...ftr.map((l) => l.w));
  const gap = c.noteSize * 0.8;
  const thick = div === 'double' ? 4 : 1;
  const placeX = (w: number) =>
    c.noteAlign === 'center' ? (width - w) / 2 : c.noteAlign === 'right' ? width - w : 0;
  const notes: NoteBlock[] = [];
  const dividers: DividerLine[] = [];
  let y = 0;
  if (hdr.length) {
    notes.push({
      font,
      color: c.noteColor,
      lines: hdr.map((l, i) => ({ text: l.text, x: placeX(l.w), cy: y + i * lh + lh / 2 })),
    });
    y += hdr.length * lh + gap;
  }
  if (div !== 'none') {
    dividers.push({ x0: 0, x1: width, y, style: div, color: c.dividerColor });
    y += thick + gap;
  }
  const blockY = y;
  y += blockH;
  if (div !== 'none') {
    y += gap;
    dividers.push({ x0: 0, x1: width, y, style: div, color: c.dividerColor });
    y += thick;
  }
  if (ftr.length) {
    y += gap;
    notes.push({
      font,
      color: c.noteColor,
      lines: ftr.map((l, i) => ({ text: l.text, x: placeX(l.w), cy: y + i * lh + lh / 2 })),
    });
    y += ftr.length * lh;
  }
  return { width, height: y, blockX: (width - blockW) / 2, blockY, notes, dividers };
}

export function buildScene(
  d: SbData,
  measure: MeasureFn = canvasMeasure,
  opts: SceneOptions = {},
): Scene {
  const unit = cachedUnit(measure);
  const live = d.bubbles
    .map((bubble, index) => ({ bubble, index }))
    .filter((x) => hasContent(x.bubble));
  const layouts = live.map(({ bubble, index }) => ({
    index,
    layout: layoutBubble(bubble, layoutOptionsFor(d, bubble), unit),
  }));
  const allOrder = appearanceOrder(
    d.bubbles.map((_, i) => String(i)),
    d.order,
  );
  const order = allOrder.filter((i) => layouts.some((l) => l.index === i));
  const arranged = arrangeBubbles(layouts, d, order);

  /* 自由拖曳的位移：排好之後再移動；泡泡區的範圍重新算（有位移時才算） */
  const offsets = arranged.items.map((p) => {
    const b = d.bubbles[p.index];
    return { dx: b.dx ?? 0, dy: b.dy ?? 0 };
  });
  const moved = offsets.some((o) => o.dx || o.dy);
  let bx0 = 0;
  let by0 = 0;
  let blockW = arranged.width;
  let blockH = arranged.height;
  if (moved) {
    const boxes = arranged.items.map((p, i) => {
      const v = visualBox(p.layout, p.rotate);
      const x = p.x + offsets[i].dx;
      const y = p.y + offsets[i].dy;
      return { x0: x + v.x0, y0: y + v.y0, x1: x + v.x1, y1: y + v.y1 };
    });
    bx0 = Math.min(...boxes.map((b) => b.x0));
    by0 = Math.min(...boxes.map((b) => b.y0));
    blockW = Math.max(...boxes.map((b) => b.x1)) - bx0;
    blockH = Math.max(...boxes.map((b) => b.y1)) - by0;
  }

  /* 頁首、頁尾與分隔線；畫布 */
  const fz = opts.freeze ?? null;
  const notesLayout = layoutNotes(d, fz ? fz.blockW : blockW, fz ? fz.blockH : blockH, unit);
  const contentW = notesLayout ? notesLayout.width : blockW;
  const contentH = notesLayout ? notesLayout.height : blockH;
  const plan = planCanvas({ width: contentW, height: contentH }, d);
  const geometry: SceneGeometry = fz ?? {
    bx0,
    by0,
    blockW,
    blockH,
    width: plan.width,
    height: plan.height,
    ox: plan.ox,
    oy: plan.oy,
  };
  /* 泡泡的位置＝畫布上泡泡區的原點＋（排好的位置＋位移） */
  const baseX = geometry.ox + (notesLayout ? notesLayout.blockX : 0) - geometry.bx0;
  const baseY = geometry.oy + (notesLayout ? notesLayout.blockY : 0) - geometry.by0;
  const plain = !moved && !notesLayout && !fz;

  const timing = computeTiming(
    layouts.map(({ index, layout }) => ({
      index,
      textDur: textDuration(d, layout.chars, layout.lines.length),
    })),
    order,
    d,
  );
  const byIndex = new Map(timing.items.map((t) => [t.index, t]));
  const items: SceneItem[] = arranged.items.map((p, i) => {
    const tm = byIndex.get(p.index)!;
    return {
      index: p.index,
      bubble: d.bubbles[p.index],
      layout: p.layout,
      x: plain ? plan.ox + p.x : baseX + p.x + offsets[i].dx,
      y: plain ? plan.oy + p.y : baseY + p.y + offsets[i].dy,
      rotate: p.rotate,
      timing: tm,
      seed: itemSeed(p.index),
      phase: (tm.rank * 0.37) % 1,
    };
  });
  const drawOrder = [...items].sort((a, b) => a.timing.rank - b.timing.rank);
  const empty = items.length === 0;
  const width = empty ? EMPTY_SIZE.width : geometry.width;
  const height = empty ? EMPTY_SIZE.height : geometry.height;
  const duration = empty ? 1 : Math.max(0.05, timing.duration);

  const ox = geometry.ox;
  const oy = geometry.oy;
  const notes: NoteBlock[] =
    !empty && notesLayout
      ? notesLayout.notes.map((n) => ({
          ...n,
          lines: n.lines.map((l) => ({ ...l, x: ox + l.x, cy: oy + l.cy })),
        }))
      : [];
  const dividers: DividerLine[] =
    !empty && notesLayout
      ? notesLayout.dividers.map((v) => ({ ...v, x0: ox + v.x0, x1: ox + v.x1, y: oy + v.y }))
      : [];

  const fontLoads = sceneFontLoads(d, live);

  const scene: Scene = {
    width,
    height,
    duration,
    ready: timing.ready,
    leave: timing.leave,
    stillTime: empty ? 0 : Math.min(duration, timing.ready),
    segments: timing.segments,
    items,
    drawOrder,
    timing,
    empty,
    overflow: fz ? false : plan.overflow,
    fontLoads,
    fontKey: JSON.stringify(fontLoads),
    card: d.card.bg && !empty ? d.card : null,
    image: opts.image ?? null,
    notes,
    dividers,
    geometry,
    prepare: async () => {
      await loadSceneFonts(scene);
    },
    render: (ctx, t) => renderScene(ctx, scene, d, t),
  };
  return scene;
}

/**
 * 要載入的字型與用到的字：先放「版面」的字型（內文、粗體），沒用到新功能時和以前完全相同；
 * 泡泡自己的字型、說話者與日期、頁首頁尾的字型接在後面。
 */
function sceneFontLoads(
  d: SbData,
  live: readonly { bubble: Bubble }[],
): { family: string; weight: number; text: string }[] {
  const body = { family: d.font.family, weight: d.font.weight, text: '' };
  const bodyBold = { family: d.font.family, weight: boldWeight(d.font.weight), text: '' };
  const extra = new Map<string, { family: string; weight: number; text: string }>();
  const add = (font: Pick<FontValue, 'family' | 'weight'>, text: string) => {
    const k = `${font.family}\u0000${font.weight}`;
    const cur = extra.get(k);
    if (cur) cur.text += text;
    else extra.set(k, { family: font.family, weight: font.weight, text });
  };
  const bold = (f: Pick<FontValue, 'family' | 'weight'>) => ({
    family: f.family,
    weight: boldWeight(f.weight),
  });
  for (const { bubble: b } of live) {
    const f = bubbleFmt(b);
    /* 內文裡粗體的字（部分格式）也要載入粗體 */
    const boldText =
      bubbleRich(b)
        ?.lines.flatMap((l) => l.runs.filter((r) => r.bold).map((r) => r.text))
        .join('') ?? '';
    if (f.font) {
      add(f.font, b.text);
      add(bold(f.font), b.title + b.button + boldText);
    } else {
      body.text += b.text;
      bodyBold.text += b.title + b.button + boldText;
    }
    const speaker = (b.speaker ?? '').trim();
    const time = (b.time ?? '').trim();
    if (f.meta !== 'off' && (speaker || time)) {
      const mf = f.metaFont ?? f.font ?? d.font;
      if (speaker) add(bold(mf), speaker);
      if (time) add(mf, `${time}・`);
    }
  }
  const c = d.card;
  if (c.header.trim() || c.footer.trim()) add(c.noteFont ?? d.font, c.header + c.footer);
  return [body, bodyBold, ...extra.values()].map((x) => ({ ...x, text: x.text || '永' }));
}

export async function loadSceneFonts(scene: Pick<Scene, 'fontLoads'>): Promise<void> {
  await Promise.all(
    scene.fontLoads.map((f) => ensureFont(f.family, f.weight, f.text).catch(() => false)),
  );
}
/** 這個泡泡在 t 秒的文字狀態（規格 3.4） */
export function textStateAt(d: SbData, it: SceneItem, t: number): TextState {
  const tm = it.timing;
  const L = it.layout;
  switch (d.textAnim) {
    case 'with':
      return FULL_TEXT;
    case 'fade':
      return { ...FULL_TEXT, alpha: clamp01((t - tm.text0) / TEXT_FADE) };
    case 'line':
      return {
        ...FULL_TEXT,
        lines: L.lines.map((_, i) => {
          const p = clamp01((t - tm.text0 - i * LINE_STEP) / LINE_FADE);
          return { alpha: p, dy: (1 - (1 - (1 - p) ** 3)) * L.fs * 0.35 };
        }),
      };
    case 'type': {
      const visible = t < tm.text0 ? 0 : Math.floor((t - tm.text0) * d.typeSpeed + 1e-6);
      const typing = t < tm.text1;
      return {
        visible,
        alpha: 1,
        lines: null,
        cursor: d.cursor,
        cursorOn: typing || Math.floor((t - tm.text1) / 0.5 + 1e-6) % 2 === 0,
      };
    }
  }
}

/** 這個泡泡在 t 秒的姿勢（登場 × 停留 × 退場） */
export function poseAt(
  d: SbData,
  it: SceneItem,
  t: number,
  scene: Pick<Scene, 'items'>,
): Pose | null {
  const tm = it.timing;
  if (t < tm.enter0 || t >= tm.exit1) return null;
  const ctx = { fs: it.layout.fs, align: it.bubble.align, seed: it.seed, t };
  const enter = enterPose(d.enter, d.enterDur > 0 ? (t - tm.enter0) / d.enterDur : 1, ctx);
  const idle = idlePose(d.idle, t - tm.enter1, {
    fs: it.layout.fs,
    seed: it.seed,
    phase: it.phase,
  });
  let pose = combine(enter, idle);
  if (Number.isFinite(tm.exit0) && t >= tm.exit0) {
    /* 輪流時沒有退場動畫的中間泡泡用淡出讓位 */
    const kind = d.exit === 'none' ? 'fade' : d.exit;
    const len = tm.exit1 - tm.exit0;
    pose = combine(pose, exitPose(kind, len > 0 ? (t - tm.exit0) / len : 1, ctx));
  }
  void scene;
  return pose.alpha > 0.001 && pose.scale > 0.001 ? pose : null;
}

/* ---------- 故障效果用的暫存畫布 ---------- */

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
const pool: AnyCanvas[] = [];

function scratch(i: number, w: number, h: number): { c: AnyCanvas; x: Ctx2D } | null {
  if (!pool[i]) {
    if (typeof document !== 'undefined') pool[i] = document.createElement('canvas');
    else if (typeof OffscreenCanvas !== 'undefined') pool[i] = new OffscreenCanvas(1, 1);
    else return null;
  }
  const c = pool[i];
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  const x = c.getContext('2d') as Ctx2D | null;
  if (!x) return null;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, W, H);
  return { c, x };
}

/** 故障：先畫到暫存畫布，再切成橫條左右錯開，加上青色、洋紅的殘影 */
function drawGlitched(ctx: Ctx2D, it: SceneItem, env: DrawEnv, g: number, t: number): boolean {
  const L = it.layout;
  const s = Math.min(4, deviceScale(ctx));
  const ex = L.ext;
  const vw = L.w + ex.l + ex.r;
  const vh = L.h + ex.t + ex.b;
  const layer = scratch(0, vw * s, vh * s);
  if (!layer) return false;
  layer.x.setTransform(s, 0, 0, s, ex.l * s, ex.t * s);
  drawBubble(layer.x, L, it.bubble, env);
  const slot = timeSlot(t, 15);
  const fs = L.fs;
  /* 殘影 */
  const tint = scratch(1, vw * s, vh * s);
  if (tint) {
    for (const [col, k] of [
      ['#00e5ff', -1],
      ['#ff2bd6', 1],
    ] as const) {
      tint.x.setTransform(1, 0, 0, 1, 0, 0);
      tint.x.globalCompositeOperation = 'source-over';
      tint.x.clearRect(0, 0, tint.c.width, tint.c.height);
      tint.x.drawImage(layer.c, 0, 0);
      tint.x.globalCompositeOperation = 'source-in';
      tint.x.fillStyle = col;
      tint.x.fillRect(0, 0, tint.c.width, tint.c.height);
      ctx.save();
      ctx.globalAlpha *= 0.45 * g;
      ctx.drawImage(tint.c, -ex.l + k * fs * 0.22 * g, -ex.t, vw, vh);
      ctx.restore();
    }
  }
  /* 橫條錯開 */
  const bands = 7;
  let y = 0;
  for (let k = 0; k < bands; k++) {
    const hk =
      k === bands - 1 ? vh - y : vh * (0.08 + 0.12 * Math.abs(hashSigned(it.seed, slot, 60 + k)));
    const off =
      Math.abs(hashSigned(it.seed, slot, 80 + k)) > 0.45
        ? hashSigned(it.seed, slot, 90 + k) * fs * 0.7 * g
        : 0;
    const h = Math.max(0, Math.min(hk, vh - y));
    if (h > 0) ctx.drawImage(layer.c, 0, y * s, vw * s, h * s, -ex.l + off, -ex.t + y, vw, h);
    y += h;
    if (y >= vh) break;
  }
  return true;
}

/** 畫 t 秒的畫面（畫布已清空；原點在畫布左上角） */
/** 卡片的背景圖：蓋滿（裁掉多的）／完整（留邊）／重複（原尺寸鋪滿） */
function drawCardImage(
  ctx: Ctx2D,
  img: CanvasImageSource,
  c: CardStyle,
  W: number,
  H: number,
): void {
  const size = img as { width?: number; height?: number };
  const iw = Number(size.width) || 0;
  const ih = Number(size.height) || 0;
  if (!iw || !ih) return;
  ctx.save();
  ctx.globalAlpha *= c.imageOpacity / 100;
  if (c.imageFit === 'repeat') {
    const pat = ctx.createPattern(img, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    const k = c.imageFit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
    const dw = iw * k;
    const dh = ih * k;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  ctx.restore();
}

/** 卡片底：底色 → 背景圖 → 紋理（卡片有圓角時角落外透明） */
function drawCard(ctx: Ctx2D, scene: Scene): void {
  const c = scene.card;
  if (!c) return;
  const W = scene.width;
  const H = scene.height;
  ctx.save();
  ctx.beginPath();
  if (c.radius > 0) roundRectPath(ctx, 0, 0, W, H, c.radius);
  else ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.fillStyle = c.color;
  ctx.fillRect(0, 0, W, H);
  if (scene.image && c.image) drawCardImage(ctx, scene.image, c, W, H);
  const tile = textureCanvas(c);
  const pat = tile ? ctx.createPattern(tile as CanvasImageSource, 'repeat') : null;
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** 頁首、頁尾與分隔線（靜止，不跟著泡泡動） */
function drawNotes(ctx: Ctx2D, scene: Scene): void {
  if (!scene.notes.length && !scene.dividers.length) return;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const n of scene.notes) {
    ctx.font = n.font;
    ctx.fillStyle = n.color;
    for (const l of n.lines) ctx.fillText(l.text, l.x, l.cy);
  }
  for (const v of scene.dividers) {
    ctx.strokeStyle = v.color;
    ctx.lineWidth = 1;
    ctx.setLineDash(v.style === 'dashed' ? [6, 4] : []);
    const ys = v.style === 'double' ? [v.y + 0.5, v.y + 3.5] : [v.y + 0.5];
    ctx.beginPath();
    for (const y of ys) {
      ctx.moveTo(v.x0, y);
      ctx.lineTo(v.x1, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

export function renderScene(ctx: Ctx2D, scene: Scene, d: SbData, t: number): void {
  drawCard(ctx, scene);
  drawNotes(ctx, scene);
  for (const it of scene.drawOrder) {
    const pose = poseAt(d, it, t, scene);
    if (!pose) continue;
    const L = it.layout;
    const env: DrawEnv = {
      shadow: d.shadow,
      u: t - it.timing.enter1,
      seed: it.seed,
      text: textStateAt(d, it, t),
      shine: pose.shine,
      scan: pose.scan,
    };
    ctx.save();
    ctx.translate(it.x + L.w / 2 + pose.dx, it.y + L.h / 2 + pose.dy);
    ctx.rotate(((it.rotate + pose.rotate) * Math.PI) / 180);
    ctx.scale(pose.scale, pose.scale);
    ctx.translate(-L.w / 2, -L.h / 2);
    ctx.globalAlpha *= pose.alpha;
    if (pose.clipX || pose.clipY) {
      const x0 = -L.ext.l;
      const y0 = -L.ext.t;
      const vw = L.w + L.ext.l + L.ext.r;
      const vh = L.h + L.ext.t + L.ext.b;
      const [a, b] = pose.clipX ?? [0, 1];
      const [c, e] = pose.clipY ?? [0, 1];
      ctx.beginPath();
      ctx.rect(x0 + vw * a, y0 + vh * c, Math.max(0, vw * (b - a)), Math.max(0, vh * (e - c)));
      ctx.clip();
    }
    if (!(pose.glitch > 0.02 && drawGlitched(ctx, it, env, pose.glitch, t)))
      drawBubble(ctx, L, it.bubble, env);
    ctx.restore();
  }
}
