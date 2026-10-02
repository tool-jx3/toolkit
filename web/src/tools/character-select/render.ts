/**
 * 畫面的畫法（規格 3.5）：背景、標題、主格、小清單的格子、游標、頁尾狀態、參考線。
 *
 * 呼叫前畫布的變換只能是縮放（預覽、匯出都是 setTransform(k, 0, 0, k, 0, 0)）；所有座標用畫布的原始尺寸。
 * 濾鏡、遮罩、色調、閃光先畫在離屏圖層（以實際像素的大小），再貼回來——只作用在圖片不透明的地方，放大也不會模糊。
 */
import { fontFamilyCss } from '@/core/fonts';
import { clamp } from '@/core/timeline';
import { type Box, compositionRects, mainPanelRects, scaleBox, tileRects } from './layout';
import {
  type Character,
  IDLE_CONTRAST,
  type NormCrop,
  playerLabel,
  SELECTED_CONTRAST,
  type Settings,
} from './model';
import { easeOutBack, mainPanelSelections, playbackPlayers, type Scene, sceneAt } from './motion';

export type Ctx = CanvasRenderingContext2D;

/** 可以畫的圖（ImageBitmap、canvas、img） */
export type Drawable = CanvasImageSource & { width: number; height: number };

export interface RenderAssets {
  /** 第 i 個角色的圖（還沒讀到時 null） */
  character: (index: number) => Drawable | null;
  background: Drawable | null;
}

/** 畫面上的固定字樣（規格 5. D4：繁中） */
export interface RenderText {
  complete: string;
  locking: string;
  ready: string;
  selecting: string;
  guide: string;
}

export interface RenderOptions {
  guides?: boolean;
  text: RenderText;
}

const sizeOf = (img: Drawable) => ({
  w: (img as HTMLImageElement).naturalWidth || img.width,
  h: (img as HTMLImageElement).naturalHeight || img.height,
});

/* ---------- 形狀 ---------- */

export function roundedRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = clamp(radius, 0, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 虛線：沿周長均分，每段約 3 倍線寬的實線＋2 倍線寬的空白 */
export function dashPattern(width: number, height: number, radius: number, lineWidth: number) {
  const perimeter = 2 * (width + height - 4 * radius) + 2 * Math.PI * radius;
  const count = Math.max(
    4,
    Math.round(perimeter / (Math.max(3, lineWidth * 3) + Math.max(2, lineWidth * 2))),
  );
  const step = perimeter / count;
  return { perimeter, dash: step * 0.6, gap: step * 0.4 };
}

/** 四個角的線段長度 */
export const cornerLength = (width: number, height: number) =>
  Math.min(Math.min(width, height) * 0.22, 48);

/** 依外框樣式描邊（線寬、顏色、光暈由呼叫端設定） */
export function strokeStyledBorder(
  ctx: Ctx,
  rect: Box,
  radius: number,
  style: Settings['layout']['borderStyle'],
) {
  const { x, y, width, height } = rect;
  const lineWidth = ctx.lineWidth;
  if (
    ![x, y, width, height, lineWidth].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    lineWidth <= 0
  )
    return;
  const side = Math.min(width, height);
  const r = clamp(Number(radius) || 0, 0, side / 2);
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.lineCap = 'butt';
  if (style === 'corners') {
    const len = cornerLength(width, height);
    const cr = Math.min(r, len / 2);
    ctx.beginPath();
    ctx.moveTo(x + len, y);
    ctx.lineTo(x + cr, y);
    ctx.arcTo(x, y, x, y + cr, cr);
    ctx.lineTo(x, y + len);
    ctx.moveTo(x + width - len, y);
    ctx.lineTo(x + width - cr, y);
    ctx.arcTo(x + width, y, x + width, y + cr, cr);
    ctx.lineTo(x + width, y + len);
    ctx.moveTo(x, y + height - len);
    ctx.lineTo(x, y + height - cr);
    ctx.arcTo(x, y + height, x + cr, y + height, cr);
    ctx.lineTo(x + len, y + height);
    ctx.moveTo(x + width, y + height - len);
    ctx.lineTo(x + width, y + height - cr);
    ctx.arcTo(x + width, y + height, x + width - cr, y + height, cr);
    ctx.lineTo(x + width - len, y + height);
    ctx.stroke();
  } else if (style === 'double') {
    ctx.lineWidth = lineWidth / 2;
    roundedRectPath(ctx, x, y, width, height, r);
    ctx.stroke();
    const inset = Math.max(2, lineWidth * 1.5);
    if (width > inset * 2 && height > inset * 2) {
      roundedRectPath(
        ctx,
        x + inset,
        y + inset,
        width - inset * 2,
        height - inset * 2,
        Math.max(0, r - inset),
      );
      ctx.stroke();
    }
  } else {
    if (style === 'dashed') {
      const d = dashPattern(width, height, r, lineWidth);
      ctx.setLineDash([d.dash, d.gap]);
    }
    roundedRectPath(ctx, x, y, width, height, r);
    ctx.stroke();
  }
  ctx.restore();
}

/** 太長的文字結尾加「…」縮短到放得下 */
export function fitLabel(ctx: Ctx, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  if (ctx.measureText('…').width > maxWidth) return '';
  const chars = Array.from(text);
  while (chars.length && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

/* ---------- 圖片 ---------- */

/** 用原圖的某一塊（比例）依 cover／contain 放進 rect（超出 rect 的部分裁掉） */
export function drawCropped(
  ctx: Ctx,
  image: Drawable,
  rect: Box,
  crop: NormCrop | null,
  fit: 'cover' | 'contain',
) {
  const region = crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const { w: iw, h: ih } = sizeOf(image);
  if (!iw || !ih) return;
  const sw = region.width * iw;
  const sh = region.height * ih;
  const ratio =
    fit === 'cover'
      ? Math.max(rect.width / sw, rect.height / sh)
      : Math.min(rect.width / sw, rect.height / sh);
  const dw = sw * ratio;
  const dh = sh * ratio;
  const dx = rect.x + (rect.width - dw) / 2;
  const dy = rect.y + (rect.height - dh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    dx - region.x * iw * ratio,
    dy - region.y * ih * ratio,
    iw * ratio,
    ih * ratio,
  );
  ctx.restore();
}

/** 小清單的格子：依縮放方式放進格子，再乘上角色的縮放、加上位置偏移 */
export function drawListImage(
  ctx: Ctx,
  image: Drawable,
  rect: Box,
  c: Character,
  fit: 'cover' | 'contain',
) {
  const { w, h } = sizeOf(image);
  if (!w || !h) return;
  const crop = c.listCrop;
  const imageRatio = (w * (crop?.width ?? 1)) / (h * (crop?.height ?? 1));
  const rectRatio = rect.width / rect.height;
  let dw: number;
  let dh: number;
  if (
    (fit === 'cover' && imageRatio > rectRatio) ||
    (fit === 'contain' && imageRatio < rectRatio)
  ) {
    dh = rect.height;
    dw = dh * imageRatio;
  } else {
    dw = rect.width;
    dh = dw / imageRatio;
  }
  dw *= c.scale;
  dh *= c.scale;
  const x = rect.x + (rect.width - dw) / 2 + (c.offsetX / 100) * rect.width;
  const y = rect.y + (rect.height - dh) / 2 + (c.offsetY / 100) * rect.height;
  if (crop) drawCropped(ctx, image, { x, y, width: dw, height: dh }, crop, 'cover');
  else {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, x, y, dw, dh);
    ctx.restore();
  }
}

export function idleFilter(s: Settings): string {
  const mode =
    s.idle.mode === 'grayscale'
      ? `grayscale(${s.idle.amount}%)`
      : s.idle.mode === 'sepia'
        ? `sepia(${s.idle.amount}%)`
        : '';
  return `${mode} brightness(${s.idle.brightness}%) saturate(${s.idle.saturation}%) contrast(${IDLE_CONTRAST}%)`.trim();
}

export function selectedFilter(s: Settings): string {
  return `brightness(${s.selected.brightness}%) saturate(${s.selected.saturation}%) contrast(${SELECTED_CONTRAST}%)`;
}

/** 選取時的色調（只還原時 null） */
export function tintColor(s: Settings, player: number): string | null {
  if (s.selected.tintMode === 'none') return null;
  if (s.selected.tintMode === 'fixed') return s.selected.tint;
  return s.players.colors[player] || s.selected.tint;
}

/* ---------- 離屏圖層 ---------- */

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}
let layers: { image: Layer; main: Layer; tint: Layer } | null = null;

function makeLayer(): Layer {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  return { canvas, ctx };
}
function getLayers() {
  layers ??= { image: makeLayer(), main: makeLayer(), tint: makeLayer() };
  return layers;
}

export interface ImageEffects {
  idleOverlay?: number;
  tint?: string | null;
  tintAlpha?: number;
  flash?: number;
}

/** 在圖層上（只在不透明的地方）疊暗色遮罩、色調、白色閃光 */
export function applyImageEffects(ctx: CanvasRenderingContext2D, fx: ImageEffects) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-atop';
  if ((fx.idleOverlay ?? 0) > 0) {
    ctx.fillStyle = `rgba(4, 7, 14, ${fx.idleOverlay})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (fx.tint && (fx.tintAlpha ?? 0) > 0) {
    const t = getLayers().tint;
    if (t.canvas.width < width || t.canvas.height < height) {
      t.canvas.width = Math.max(t.canvas.width, width);
      t.canvas.height = Math.max(t.canvas.height, height);
    }
    t.ctx.save();
    t.ctx.setTransform(1, 0, 0, 1, 0, 0);
    t.ctx.globalCompositeOperation = 'source-over';
    t.ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
    t.ctx.drawImage(ctx.canvas, 0, 0);
    t.ctx.globalCompositeOperation = 'color';
    t.ctx.fillStyle = fx.tint;
    t.ctx.fillRect(0, 0, width, height);
    t.ctx.restore();
    ctx.globalAlpha = fx.tintAlpha ?? 0;
    ctx.drawImage(t.canvas, 0, 0, width, height, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }
  if ((fx.flash ?? 0) > 0) {
    ctx.fillStyle = `rgba(255,255,255,${fx.flash})`;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

/**
 * 以實際像素畫在圖層上（濾鏡＋效果），再貼回 ctx。圖層的大小以「最大可能的放大」保留，換格子時不必重新配置。
 */
function drawStyled(
  ctx: Ctx,
  layer: Layer,
  rect: Box,
  base: Box,
  maxScale: number,
  filter: string,
  draw: (lctx: CanvasRenderingContext2D) => void,
  fx: ImageEffects,
) {
  const m = ctx.getTransform();
  const sx = Math.hypot(m.a, m.b) || 1;
  const sy = Math.hypot(m.c, m.d) || 1;
  const w = Math.ceil(base.width * maxScale * sx) + 2;
  const h = Math.ceil(base.height * maxScale * sy) + 2;
  if (layer.canvas.width !== w || layer.canvas.height !== h) {
    layer.canvas.width = w;
    layer.canvas.height = h;
  }
  const ox = Math.floor(rect.x * sx);
  const oy = Math.floor(rect.y * sy);
  const l = layer.ctx;
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.clearRect(0, 0, w, h);
  l.save();
  l.setTransform(sx, 0, 0, sy, -ox, -oy);
  l.filter = filter || 'none';
  draw(l);
  l.restore();
  applyImageEffects(l, fx);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(layer.canvas, ox / sx, oy / sy, w / sx, h / sy);
  ctx.restore();
}

/* ---------- 各部分 ---------- */

const familyOf = (s: Settings) => fontFamilyCss(s.font.family);

function drawBackground(ctx: Ctx, s: Settings, bg: Drawable | null) {
  const { width, height } = s.canvas;
  const b = s.background;
  if (b.type !== 'transparent') {
    if (b.type === 'image' && bg) {
      const { w, h } = sizeOf(bg);
      const ir = w / h;
      const rr = width / height;
      let dw: number;
      let dh: number;
      if (ir > rr) {
        dh = height;
        dw = dh * ir;
      } else {
        dw = width;
        dh = dw / ir;
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bg, (width - dw) / 2, (height - dh) / 2, dw, dh);
      ctx.restore();
      if (b.imageDim > 0) {
        ctx.fillStyle = `rgba(3, 6, 13, ${b.imageDim / 100})`;
        ctx.fillRect(0, 0, width, height);
      }
    } else if (b.type === 'solid') {
      ctx.fillStyle = b.colorA;
      ctx.fillRect(0, 0, width, height);
    } else if (b.type === 'gradient' || b.type === 'image') {
      const angle = (b.angle * Math.PI) / 180;
      const cx = width / 2;
      const cy = height / 2;
      const length = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
      const g = ctx.createLinearGradient(
        cx - (Math.cos(angle) * length) / 2,
        cy - (Math.sin(angle) * length) / 2,
        cx + (Math.cos(angle) * length) / 2,
        cy + (Math.sin(angle) * length) / 2,
      );
      g.addColorStop(0, b.colorA);
      g.addColorStop(1, b.colorB);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
  }
  if (b.pattern) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    const step = Math.max(24, Math.min(width, height) / 18);
    for (let x = -height; x < width + height; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (b.vignette > 0) {
    const g = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.18,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${b.vignette / 100})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
}

/** 標題的位置（互動 HTML 也用） */
export function titleGeometry(s: Settings) {
  const align = s.text.align;
  return {
    x:
      align === 'left'
        ? s.layout.x
        : align === 'right'
          ? s.layout.x + s.layout.width
          : s.canvas.width / 2,
    titleY: Math.max(14, s.layout.y - s.text.titleSize - 48),
    subtitleY: Math.max(42, s.layout.y - 33),
    subtitleSize: Math.max(9, s.text.titleSize * 0.36),
  };
}

function drawTitle(ctx: Ctx, s: Settings) {
  if (!s.text.showTitle) return;
  const g = titleGeometry(s);
  const family = familyOf(s);
  ctx.save();
  ctx.textAlign = s.text.align;
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  ctx.font = `900 ${s.text.titleSize}px ${family}`;
  ctx.fillText(s.text.title || '', g.x, g.titleY);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(218,228,247,.68)';
  ctx.font = `700 ${g.subtitleSize}px ${family}`;
  ctx.fillText(s.text.subtitle || '', g.x, g.subtitleY);
  ctx.restore();
}

/** 確定中的脈動與彈跳（倍率） */
export function confirmScale(q: number): number {
  if (q <= 0) return 1;
  const pulse = Math.sin(q * Math.PI * 4) * (1 - q) * 0.035;
  const entrance = 1 + (easeOutBack(Math.min(1, q * 1.8)) - 1) * 0.6;
  return (1 + pulse) * entrance;
}

/** 確定中的閃光（不透明度） */
export const confirmFlash = (q: number) => (q > 0 ? Math.max(0, 1 - q * 2.2) * 0.34 : 0);

function drawMainPanel(ctx: Ctx, s: Settings, scene: Scene, assets: RenderAssets) {
  const rects = mainPanelRects(s);
  if (!rects.length) return;
  const selections = mainPanelSelections(s, scene);
  const family = familyOf(s);
  rects.forEach((rect, slot) => {
    const sel = selections[slot];
    const character = sel ? s.characters[sel.target] : undefined;
    const image = sel && character ? assets.character(sel.target) : null;
    const filled = !!character;
    const color = sel ? s.players.colors[sel.player] || s.selected.tint : 'rgba(235,245,255,.3)';
    const effects = filled && s.mainPanel.effects;
    const active = !!sel && scene.activePlayer === sel.player && scene.hoverIndex === sel.target;
    const q = effects && active ? scene.confirmProgress : 0;
    const k = effects ? s.selected.scale * confirmScale(q) : 1;
    const drawRect = scaleBox(rect, k);
    const radius = s.layout.radius * k;
    ctx.save();
    roundedRectPath(ctx, drawRect.x, drawRect.y, drawRect.width, drawRect.height, radius);
    ctx.clip();
    if (filled && sel && character) {
      if (image) {
        if (effects) {
          drawStyled(
            ctx,
            getLayers().main,
            drawRect,
            rect,
            Math.max(1, s.selected.scale * 1.2),
            selectedFilter(s),
            (l) => drawCropped(l, image, drawRect, character.mainCrop, s.mainPanel.fit),
            {
              tint: tintColor(s, sel.player),
              tintAlpha: s.selected.tintAlpha / 100,
              flash: confirmFlash(q),
            },
          );
        } else {
          ctx.save();
          ctx.filter = selectedFilter(s);
          drawCropped(ctx, image, drawRect, character.mainCrop, s.mainPanel.fit);
          ctx.restore();
        }
      }
      if (s.mainPanel.showName) {
        const nameHeight = Math.min(70 * k, drawRect.height * 0.22);
        const shade = ctx.createLinearGradient(
          0,
          drawRect.y + drawRect.height - nameHeight,
          0,
          drawRect.y + drawRect.height,
        );
        shade.addColorStop(0, 'rgba(3,5,10,0)');
        shade.addColorStop(1, 'rgba(3,5,10,.88)');
        ctx.fillStyle = shade;
        ctx.fillRect(
          drawRect.x,
          drawRect.y + drawRect.height - nameHeight,
          drawRect.width,
          nameHeight,
        );
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `850 ${Math.max(10 * k, Math.min(26 * k, drawRect.width * 0.04, nameHeight * 0.46))}px ${family}`;
        ctx.fillText(
          `${playerLabel(s, sel.player)} · ${character.name}`,
          drawRect.x + drawRect.width / 2,
          drawRect.y + drawRect.height - nameHeight * 0.38,
          Math.max(1, drawRect.width - 32 * k),
        );
      }
    } else if (s.mainPanel.placeholder) {
      ctx.fillStyle = 'rgba(230,241,250,.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `650 ${Math.max(10, Math.min(22, rect.width * 0.038))}px ${family}`;
      ctx.fillText(
        s.mainPanel.placeholder,
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        Math.max(1, rect.width - 40),
      );
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = color;
    const borderWidth = effects
      ? s.selected.borderWidth
      : filled
        ? Math.max(2, s.layout.borderWidth)
        : 2;
    if (effects) {
      ctx.shadowColor = color;
      ctx.shadowBlur = s.selected.glow * (q > 0 ? 1.25 : 1);
    }
    if (!filled) ctx.setLineDash([8, 8]);
    if (borderWidth > 0) {
      ctx.lineWidth = borderWidth;
      if (filled) strokeStyledBorder(ctx, drawRect, radius, s.layout.borderStyle);
      else {
        roundedRectPath(ctx, drawRect.x, drawRect.y, drawRect.width, drawRect.height, radius);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

function drawTile(
  ctx: Ctx,
  s: Settings,
  rect: Box,
  index: number,
  scene: Scene,
  assets: RenderAssets,
) {
  const character = s.characters[index];
  const lockedPlayers = scene.locked.filter((l) => l.target === index).map((l) => l.player);
  const hovered = scene.hoverIndex === index;
  const selected = lockedPlayers.length > 0 || hovered;
  const focusPlayer = hovered ? scene.activePlayer : (lockedPlayers.at(-1) ?? -1);
  const q = hovered ? scene.confirmProgress : 0;
  const k = selected ? s.selected.scale * confirmScale(q) : 1;
  const drawRect = scaleBox(rect, k);
  const radius = s.layout.radius * k;
  const family = familyOf(s);

  ctx.save();
  roundedRectPath(ctx, drawRect.x, drawRect.y, drawRect.width, drawRect.height, radius);
  ctx.clip();
  const image = assets.character(index);
  if (image)
    drawStyled(
      ctx,
      getLayers().image,
      drawRect,
      rect,
      Math.max(1, s.selected.scale * 1.2),
      selected ? selectedFilter(s) : idleFilter(s),
      (l) => drawListImage(l, image, drawRect, character, s.layout.fit),
      {
        idleOverlay: selected ? 0 : s.idle.overlayAlpha / 100,
        tint: selected ? tintColor(s, focusPlayer) : null,
        tintAlpha: s.selected.tintAlpha / 100,
        flash: confirmFlash(q),
      },
    );
  if (s.labels.show && s.labels.height > 0) {
    const lh = Math.min(drawRect.height * 0.42, s.labels.height * k);
    const g = ctx.createLinearGradient(
      0,
      drawRect.y + drawRect.height - lh * 1.5,
      0,
      drawRect.y + drawRect.height,
    );
    g.addColorStop(0, 'rgba(4,6,12,0)');
    g.addColorStop(0.45, 'rgba(4,6,12,.62)');
    g.addColorStop(1, 'rgba(4,6,12,.9)');
    ctx.fillStyle = g;
    ctx.fillRect(drawRect.x, drawRect.y + drawRect.height - lh * 1.55, drawRect.width, lh * 1.55);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `850 ${Math.max(8, s.labels.fontSize * k)}px ${family}`;
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur = 5;
    const name = Array.from(String(character.name || `角色 ${index + 1}`))
      .slice(0, 28)
      .join('');
    ctx.fillText(
      name,
      drawRect.x + drawRect.width / 2,
      drawRect.y + drawRect.height - lh * 0.46,
      drawRect.width - 18,
    );
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  ctx.save();
  const stroke = selected
    ? s.players.colors[focusPlayer] || s.selected.tint
    : 'rgba(255,255,255,.2)';
  ctx.strokeStyle = stroke;
  const bw = selected ? s.selected.borderWidth : s.layout.borderWidth;
  if (selected) {
    ctx.shadowColor = stroke;
    ctx.shadowBlur = s.selected.glow * (scene.confirmProgress > 0 ? 1.25 : 1);
  }
  if (bw > 0) {
    ctx.lineWidth = bw;
    strokeStyledBorder(ctx, drawRect, radius, s.layout.borderStyle);
  }
  ctx.restore();

  if (lockedPlayers.length) {
    const bh = clamp(drawRect.height * 0.12, 18, 30);
    const available = Math.max(1, drawRect.width - 16 - (hovered ? drawRect.width * 0.5 : 0));
    const slots = Math.max(1, Math.floor((available + 5) / (bh * 1.5 + 5)));
    const badges = lockedPlayers
      .slice(0, lockedPlayers.length > slots ? slots - 1 : slots)
      .map((p) => ({ text: playerLabel(s, p), color: s.players.colors[p] }));
    if (badges.length < lockedPlayers.length)
      badges.push({ text: `+${lockedPlayers.length - badges.length}`, color: '#d9e2f3' });
    const maxW = Math.max(1, (available - 5 * (badges.length - 1)) / badges.length);
    let x = drawRect.x + 8;
    for (const { text, color } of badges) {
      const y = drawRect.y + 8;
      ctx.save();
      ctx.font = `950 ${bh * 0.48}px ${family}`;
      const bw2 = Math.min(maxW, Math.max(bh * 1.65, ctx.measureText(text).width + 14));
      roundedRectPath(ctx, x, y, bw2, bh, bh / 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fill();
      /* 名牌的字也帶著同色的光暈（與舊版相同） */
      ctx.fillStyle = '#071019';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitLabel(ctx, text, bw2 - 10), x + bw2 / 2, y + bh / 2 + 0.5);
      ctx.restore();
      x += bw2 + 5;
    }
  }
}

function drawCursor(ctx: Ctx, s: Settings, scene: Scene) {
  if (!scene.cursorRect || scene.activePlayer < 0) return;
  const color = s.players.colors[scene.activePlayer] || s.selected.tint;
  const rect = scaleBox(scene.cursorRect, s.selected.scale + 0.012);
  const pulse =
    scene.confirmProgress > 0 ? 1 + Math.sin(scene.confirmProgress * Math.PI * 5) * 0.12 : 1;
  const family = familyOf(s);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, s.selected.borderWidth * 0.62 * pulse);
  ctx.shadowColor = color;
  ctx.shadowBlur = s.selected.glow * 1.25;
  strokeStyledBorder(ctx, rect, s.layout.radius * (s.selected.scale + 0.012), s.layout.borderStyle);
  const th = clamp(rect.height * 0.13, 19, 32);
  const text = playerLabel(s, scene.activePlayer);
  ctx.font = `950 ${th * 0.5}px ${family}`;
  const shares = scene.locked.some((l) => l.target === scene.hoverIndex);
  const maxW = Math.max(1, shares ? rect.width * 0.48 : rect.width - 16);
  const tw = Math.min(maxW, Math.max(th * 1.82, ctx.measureText(text).width + 16));
  const tx = rect.x + rect.width - tw - 8;
  const ty = rect.y + 8;
  roundedRectPath(ctx, tx, ty, tw, th, th / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#061017';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitLabel(ctx, text, tw - 10), tx + tw / 2, ty + th / 2 + 0.5);
  ctx.restore();
}

function drawFooter(ctx: Ctx, s: Settings, scene: Scene, text: RenderText) {
  const W = s.canvas.width;
  const H = s.canvas.height;
  const y = Math.min(H - 18, s.layout.y + s.layout.height + 27);
  const players = playbackPlayers(s);
  const dot = Math.max(3.5, Math.min(W, H) * 0.007);
  const compact = players.length > 8;
  const progressWidth = compact ? Math.max(48, W * 0.09) : players.length * dot * 3;
  const family = familyOf(s);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.max(10, Math.min(W, H) * 0.021)}px ${family}`;
  if (scene.final) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.fillText(text.complete, W / 2, y);
  } else if (scene.activePlayer >= 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = s.players.colors[scene.activePlayer];
    const available = Math.max(1, W - s.layout.x * 2 - progressWidth - 12);
    const name = fitLabel(ctx, playerLabel(s, scene.activePlayer), available * 0.55);
    const statusX = s.layout.x + Math.max(28, W * 0.038, ctx.measureText(name).width + 8);
    ctx.fillText(name, s.layout.x, y);
    ctx.fillStyle = 'rgba(226,235,250,.72)';
    ctx.font = `700 ${Math.max(8, Math.min(W, H) * 0.015)}px ${family}`;
    const status = `  ${scene.confirmProgress > 0 ? text.locking : scene.waiting ? text.ready : text.selecting}`;
    ctx.fillText(fitLabel(ctx, status, available - (statusX - s.layout.x)), statusX, y);
  }
  if (compact) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(226,235,250,.82)';
    ctx.font = `800 ${Math.max(10, Math.min(W, H) * 0.021)}px ${family}`;
    ctx.fillText(`${scene.locked.length} / ${players.length}`, W - s.layout.x, y, progressWidth);
  } else {
    const x0 = W - s.layout.x - progressWidth;
    players.forEach((p, i) => {
      const on = scene.locked.some((l) => l.player === p) || scene.activePlayer === p;
      ctx.beginPath();
      ctx.arc(x0 + i * dot * 3, y, dot, 0, Math.PI * 2);
      ctx.fillStyle = on ? s.players.colors[p] : 'rgba(255,255,255,.22)';
      ctx.fill();
    });
  }
  ctx.restore();
}

function drawGuides(ctx: Ctx, s: Settings, text: RenderText) {
  const grid = compositionRects(s).grid;
  ctx.save();
  ctx.strokeStyle = 'rgba(118,228,255,.62)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(grid.x - 0.5, grid.y - 0.5, grid.width + 1, grid.height + 1);
  ctx.setLineDash([]);
  ctx.font = `700 10px ${familyOf(s)}`;
  const w = ctx.measureText(text.guide).width + 12;
  ctx.fillStyle = 'rgba(7,13,22,.72)';
  ctx.fillRect(grid.x, Math.max(0, grid.y - 20), w, 17);
  ctx.fillStyle = 'rgba(149,233,255,.92)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.guide, grid.x + 6, Math.max(8.5, grid.y - 11.5));
  ctx.restore();
}

/** 畫出 t 毫秒時的畫面（呼叫端先清空畫布並設好縮放） */
export function renderScene(
  ctx: Ctx,
  s: Settings,
  t: number,
  assets: RenderAssets,
  options: RenderOptions,
): Scene {
  drawBackground(ctx, s, assets.background);
  drawTitle(ctx, s);
  const scene = sceneAt(s, t);
  drawMainPanel(ctx, s, scene, assets);
  const rects = tileRects(s);
  for (const r of rects) drawTile(ctx, s, r, r.index, scene, assets);
  drawCursor(ctx, s, scene);
  drawFooter(ctx, s, scene, options.text);
  if (options.guides) drawGuides(ctx, s, options.text);
  return scene;
}

/** 清空畫布、依畫布大小縮放後畫出畫面 */
export function renderToCanvas(
  canvas: HTMLCanvasElement,
  s: Settings,
  t: number,
  assets: RenderAssets,
  options: RenderOptions,
): Scene {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(canvas.width / s.canvas.width, canvas.height / s.canvas.height);
  const scene = renderScene(ctx, s, t, assets, options);
  ctx.restore();
  return scene;
}
