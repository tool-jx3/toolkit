/**
 * 範本清單的縮圖：用目前的欄位、樣式、照片畫每一款的正面（證件）或整張票（票券），縮到方格裡。
 *
 * 重畫（規格 F02：快速打字不卡）由 `ThumbPainter` 管：
 * - 呼叫端（Panel）讓內容停下 THUMB_IDLE_MS 之後才換新的版本；
 * - 每一款先畫在自己的離屏畫布上，一個工作只畫一張（中間可以處理輸入），只畫看得到的（IntersectionObserver）；
 * - 頁面上的縮圖貼上離屏畫布：還沒畫好的先貼舊的，不會閃空白。
 */
import { makeCanvas } from '@/core/image';
import { requestFonts } from './fonts';
import { fontUses, rrect } from './kit';
import { CARD_RADIUS_U, cardUnits, type IdTicketState, type Kind } from './model';
import { type AnyCanvas, drawIdFace, drawTicket, ticketSize } from './render';
import { assets } from './store';
import { type IdTemplateId, idTemplate, type TicketTemplateId } from './templates';

/** 縮圖畫布的像素 */
export const THUMB = { w: 180, h: 160 } as const;
const MARGIN = 10;
/** 內容停下多久之後才重畫縮圖 */
export const THUMB_IDLE_MS = 350;

export function drawThumb(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  doc: IdTicketState,
  kind: Kind,
  value: string,
  idPhoto: CanvasImageSource | null,
  fonts?: Map<string, Set<string>>,
): void {
  ctx.clearRect(0, 0, THUMB.w, THUMB.h);
  ctx.save();
  if (kind === 'id') {
    const s: IdTicketState = { ...doc, idTemplate: value as IdTemplateId };
    const { w, h } = cardUnits(idTemplate(s.idTemplate).orientation);
    const k = Math.min((THUMB.w - MARGIN * 2) / w, (THUMB.h - MARGIN * 2) / h);
    ctx.translate((THUMB.w - w * k) / 2, (THUMB.h - h * k) / 2);
    ctx.scale(k, k);
    ctx.beginPath();
    rrect(ctx, 0, 0, w, h, CARD_RADIUS_U);
    ctx.clip();
    drawIdFace(ctx, s, 'front', { preview: false, photo: idPhoto, fonts });
  } else {
    const s: IdTicketState = { ...doc, ticketTemplate: value as TicketTemplateId };
    const { width, height } = ticketSize(s);
    const k = Math.min((THUMB.w - MARGIN * 2) / width, (THUMB.h - MARGIN * 2) / height);
    ctx.translate((THUMB.w - width * k) / 2, (THUMB.h - height * k) / 2);
    ctx.scale(k, k);
    const id = doc.ticketPhotos[s.ticketTemplate]?.image.id;
    drawTicket(ctx, s, { preview: false, photo: (id && assets.peekBitmap(id)) || null, fonts });
  }
  ctx.restore();
}

type Render = (
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  value: string,
) => void;

export class ThumbPainter {
  private readonly cache = new Map<string, { canvas: AnyCanvas; version: unknown }>();
  /** 每一款目前貼在頁面上的哪一張畫布 */
  private readonly targets = new Map<string, HTMLCanvasElement>();
  private readonly visible = new WeakMap<HTMLCanvasElement, boolean>();
  private readonly io: IntersectionObserver | null;
  private version: unknown = null;
  private render: Render | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            for (const e of entries)
              this.visible.set(e.target as HTMLCanvasElement, e.isIntersecting);
            this.schedule();
          });
  }

  /** 換新的版本與畫法（內容停下之後） */
  update(version: unknown, render: Render): void {
    this.version = version;
    this.render = render;
  }

  /** ThumbChoice 的 draw：貼上畫好的（可能是舊的），不是最新的就排隊重畫 */
  paint(ctx: CanvasRenderingContext2D, value: string): void {
    const c = ctx.canvas;
    if (this.targets.get(value) !== c) {
      this.targets.set(value, c);
      this.io?.observe(c);
    }
    const hit = this.cache.get(value);
    if (hit) ctx.drawImage(hit.canvas as CanvasImageSource, 0, 0);
    if (!hit || hit.version !== this.version) this.schedule();
  }

  dispose(): void {
    this.io?.disconnect();
    this.targets.clear();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.timer === null) this.timer = setTimeout(() => this.run(), 0);
  }

  /** 畫一張看得到、還不是最新的縮圖；還有就再排下一個工作 */
  private run(): void {
    this.timer = null;
    const render = this.render;
    if (!render) return;
    for (const [value, target] of this.targets) {
      if (!target.isConnected) {
        this.targets.delete(value);
        continue;
      }
      const hit = this.cache.get(value);
      if (hit && hit.version === this.version) continue;
      if (this.visible.get(target) === false) continue;
      const off = hit?.canvas ?? makeCanvas(THUMB.w, THUMB.h);
      const octx = off.getContext('2d') as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D;
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, THUMB.w, THUMB.h);
      render(octx, value);
      this.cache.set(value, { canvas: off, version: this.version });
      const tctx = target.getContext('2d');
      if (tctx) {
        tctx.setTransform(1, 0, 0, 1, 0, 0);
        tctx.clearRect(0, 0, target.width, target.height);
        tctx.drawImage(off as CanvasImageSource, 0, 0);
      }
      this.schedule();
      return;
    }
  }
}

/** 縮圖的畫法：畫一款，順便要求用到的字型 */
export function thumbRender(
  doc: IdTicketState,
  kind: Kind,
  idPhoto: CanvasImageSource | null,
): Render {
  return (ctx, value) => {
    const fonts = new Map<string, Set<string>>();
    drawThumb(ctx, doc, kind, value, idPhoto, fonts);
    requestFonts(fontUses(fonts));
  };
}
