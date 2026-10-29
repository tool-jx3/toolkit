/**
 * 預覽上的提示層（只在預覽，不會匯出）：
 * - 魔術棒、筆刷工具時：外框開口外面被藏起來的圖片淡淡地顯示（看得出還有哪些部分可以出框）、選取範圍上淡紅色；
 * - 選取範圍的外框（黑白斜紋，可以關掉）；
 * - 筆刷的圓圈（畫是綠、擦是紅）、魔術棒上次點的位置；
 * - 參考輪廓（剪影剪在開口裡、參考圖整張）與輔助線；
 * - 拖曳名字、徽章時可以吸附的位置。
 */
import { makeCanvas } from '@/core/image';
import type { Ctx2D } from './frames';
import { type OverlayKind, SNAPS } from './labels';
import type { Geom, ImageTransform, LabelStyle, Look } from './model';
import { drawGuides, drawRefShape, type Guides, type RefKind } from './reference';
import { clipToCutout, cutoutPath, type Drawable, withImageTransform } from './render';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface OverlayInput {
  N: number;
  geom: Geom;
  look: Look;
  transform: ImageTransform | null;
  size: { width: number; height: number } | null;
  image: Drawable | null;
  /** 選取範圍（遮罩 > 0 的地方不透明） */
  selection: Drawable | null;
  tool: 'move' | 'wand' | 'brush';
  showOutline: boolean;
  /** 魔術棒剛點過（淡紅色深一點） */
  wandActive: boolean;
  wandPoint: { x: number; y: number } | null;
  /** 筆刷的圓圈（棋子座標）；mode：畫或擦 */
  cursor: { x: number; y: number; r: number; erase: boolean } | null;
  /** 自訂遮罩（開口的形狀） */
  customMask?: Drawable | null;
  /** 參考輪廓與輔助線 */
  ref?: { kind: RefKind; image: Drawable | null; opacity: number; guides: Guides } | null;
  /** 正在拖曳名字或徽章：可以吸附的位置（R 為單位） */
  snap?: { which: OverlayKind; style: LabelStyle; at: [number, number] } | null;
}

const scratchMap = new Map<string, AnyCanvas>();
function scratch(name: string, N: number): { canvas: AnyCanvas; ctx: Ctx2D } {
  const key = `${name}:${N}`;
  let c = scratchMap.get(key);
  if (!c) {
    c = makeCanvas(N, N);
    scratchMap.set(key, c);
  }
  const ctx = c.getContext('2d') as Ctx2D;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, N, N);
  return { canvas: c, ctx };
}

let stripe: AnyCanvas | null = null;
function stripePattern(ctx: Ctx2D): CanvasPattern | null {
  if (!stripe) {
    const p = makeCanvas(16, 16);
    const x = p.getContext('2d') as Ctx2D;
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#111111';
    x.beginPath();
    x.moveTo(0, 8);
    x.lineTo(8, 0);
    x.lineTo(16, 0);
    x.lineTo(0, 16);
    x.closePath();
    x.fill();
    x.beginPath();
    x.moveTo(16, 8);
    x.lineTo(8, 16);
    x.lineTo(16, 16);
    x.closePath();
    x.fill();
    stripe = p;
  }
  return ctx.createPattern(stripe as CanvasImageSource, 'repeat');
}

export function drawOverlay(ctx: Ctx2D, o: OverlayInput): void {
  const { N, transform: t, size } = o;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, N, N);
  const editing = o.tool !== 'move';
  if (t && size && o.image && editing) {
    /* 被外框藏起來的部分：圖片淡淡地畫在開口外面 */
    const { ctx: g, canvas } = scratch('ghost', N);
    g.globalAlpha = 0.35;
    withImageTransform(g, t, size, () =>
      g.drawImage(o.image as Drawable, 0, 0, size.width, size.height),
    );
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out';
    if (o.customMask) {
      const { c, R } = o.geom;
      g.drawImage(o.customMask, c - R, c - R, 2 * R, 2 * R);
    } else {
      g.fillStyle = '#000';
      cutoutPath(g, o.look, o.geom);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(canvas, 0, 0);
  }
  const ref = o.ref;
  if (ref && ref.kind !== 'off') {
    const a = ref.opacity / 100;
    if (ref.kind === 'custom') {
      if (ref.image) {
        /* 參考圖整張蓋在棋子的範圍上（可能自己就有外框，不剪） */
        ctx.globalAlpha = a;
        ctx.drawImage(ref.image, 0, 0, N, N);
        ctx.globalAlpha = 1;
      }
    } else {
      const { ctx: r, canvas } = scratch('ref', N);
      drawRefShape(r, o.geom, ref.kind, a);
      clipToCutout(r, o.look, o.geom, o.customMask ?? null);
      ctx.drawImage(canvas, 0, 0);
    }
  }
  if (t && size && o.selection) {
    if (editing) {
      const { ctx: s, canvas } = scratch('tint', N);
      withImageTransform(s, t, size, () =>
        s.drawImage(o.selection as Drawable, 0, 0, size.width, size.height),
      );
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = '#ff2d55';
      s.fillRect(0, 0, N, N);
      s.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = o.wandActive ? 0.38 : 0.2;
      ctx.drawImage(canvas, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (o.showOutline) {
      /* 外框：選取範圍往八個方向錯開 → 扣掉本身＝一圈，填斜紋 */
      const { ctx: s, canvas } = scratch('outline', N);
      const lw = Math.max(1.6, N / 420) / t.scale;
      withImageTransform(s, t, size, () => {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [0.7, 0.7],
          [-0.7, 0.7],
          [0.7, -0.7],
          [-0.7, -0.7],
        ])
          s.drawImage(o.selection as Drawable, dx * lw, dy * lw, size.width, size.height);
      });
      s.globalCompositeOperation = 'destination-out';
      withImageTransform(s, t, size, () =>
        s.drawImage(o.selection as Drawable, 0, 0, size.width, size.height),
      );
      s.globalCompositeOperation = 'source-in';
      const pat = stripePattern(s);
      if (pat) s.fillStyle = pat;
      s.fillRect(0, 0, N, N);
      s.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = editing ? 1 : 0.7;
      ctx.drawImage(canvas, 0, 0);
      ctx.globalAlpha = 1;
    }
  }
  if (ref && ref.guides !== 'off') drawGuides(ctx, o.geom, ref.opacity / 100, ref.guides);
  if (o.snap) drawSnaps(ctx, o.geom, o.snap);
  if (o.wandPoint && o.tool === 'wand') {
    const r = N / 70;
    ctx.beginPath();
    ctx.arc(o.wandPoint.x, o.wandPoint.y, r, 0, Math.PI * 2);
    ctx.lineWidth = r * 0.5;
    ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.stroke();
    ctx.lineWidth = r * 0.25;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(o.wandPoint.x, o.wandPoint.y, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  if (o.cursor && o.tool === 'brush') {
    const c = o.cursor;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = c.erase ? 'rgba(255,69,58,.22)' : 'rgba(48,209,88,.22)';
    ctx.fill();
    ctx.lineWidth = Math.max(2, N / 400);
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.stroke();
    ctx.lineWidth = Math.max(1, N / 850);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
}

/** 拖曳名字、徽章時：可以吸附的位置（小圓圈）與目前的位置 */
function drawSnaps(ctx: Ctx2D, g: Geom, s: NonNullable<OverlayInput['snap']>): void {
  const u = g.N / 512;
  const pts: [number, number][] =
    s.which === 'label' && s.style === 'arc'
      ? Array.from({ length: 8 }, (_, i) => [
          Math.cos((i * Math.PI) / 4) * 0.8,
          Math.sin((i * Math.PI) / 4) * 0.8,
        ])
      : SNAPS[s.which];
  ctx.save();
  ctx.lineWidth = 1.5 * u;
  for (const [x, y] of pts) {
    const on = Math.abs(x - s.at[0]) < 1e-3 && Math.abs(y - s.at[1]) < 1e-3;
    ctx.beginPath();
    ctx.arc(g.c + x * g.R, g.c + y * g.R, (on ? 7 : 5) * u, 0, Math.PI * 2);
    ctx.fillStyle = on ? 'rgba(0,240,255,.9)' : 'rgba(0,0,0,.35)';
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
