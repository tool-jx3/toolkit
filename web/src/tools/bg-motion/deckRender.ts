/**
 * 「圖片切換」模式畫一格（規格 3.11.4、3.11.6）：預覽、匯出、對話框縮圖共用。
 *
 * 畫面構成：先塗背景色（透明背景不塗）；停住＝該張的畫面（圖片依放法放進輸出畫面，含背景）；
 * 切換＝A、B 兩個畫面依 `transitionOps` 畫在一張透明的暫存畫面上，再疊到塗好背景色的畫面上。
 * 畫布可以小於輸出尺寸（預覽）：座標與模糊半徑依 畫布寬 ÷ 輸出寬 縮小，所以預覽就是輸出畫面的等比縮圖。
 */
import { makeCanvas } from '@/core/image';
import type { Ctx2D } from '@/core/motion';
import type { DeckEasing, DeckFit } from './deck';
import { type DeckSeg, easeAt, findSeg } from './deckPlan';
import { drawFx, supportsCanvasFilter, transitionOps } from './switchFx';

type Canvas = ReturnType<typeof makeCanvas>;

export interface DeckScene {
  /** 每張圖的解碼結果（和清單同順序；讀不到的是 null：畫成空白畫面） */
  images: readonly (ImageBitmap | null)[];
  segs: readonly DeckSeg[];
  fit: DeckFit;
  bg: string;
  transparent: boolean;
  easing: DeckEasing;
}

const ctxOf = (c: Canvas): Ctx2D => {
  const ctx = c.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

export class DeckPainter {
  /** 每張圖放進畫面的結果（同一張圖、同一組尺寸與設定只畫一次） */
  private fits = new WeakMap<ImageBitmap, Map<string, Canvas>>();
  private blanks = new Map<string, Canvas>();
  private scratch: Canvas | null = null;

  private key(cw: number, ch: number, s: DeckScene, withFit: boolean): string {
    return [cw, ch, withFit ? s.fit : '', s.transparent ? 't' : s.bg].join('|');
  }

  /** 空白畫面（背景色，透明時全透明） */
  blank(cw: number, ch: number, s: DeckScene): Canvas {
    const key = this.key(cw, ch, s, false);
    let c = this.blanks.get(key);
    if (!c) {
      if (this.blanks.size > 8) this.blanks.clear();
      c = makeCanvas(cw, ch);
      if (!s.transparent) {
        const x = ctxOf(c);
        x.fillStyle = s.bg;
        x.fillRect(0, 0, cw, ch);
      }
      this.blanks.set(key, c);
    }
    return c;
  }

  /** 一張圖放進輸出畫面（3.11.4）；沒有圖時是空白畫面 */
  fitted(img: ImageBitmap | null, cw: number, ch: number, s: DeckScene): Canvas {
    if (!img) return this.blank(cw, ch, s);
    const key = this.key(cw, ch, s, true);
    let perImage = this.fits.get(img);
    if (!perImage) {
      perImage = new Map();
      this.fits.set(img, perImage);
    }
    let c = perImage.get(key);
    if (!c) {
      if (perImage.size > 6) perImage.clear();
      c = makeCanvas(cw, ch);
      const x = ctxOf(c);
      if (!s.transparent) {
        x.fillStyle = s.bg;
        x.fillRect(0, 0, cw, ch);
      }
      let dw = cw;
      let dh = ch;
      if (s.fit !== 'stretch') {
        const r =
          s.fit === 'cover'
            ? Math.max(cw / img.width, ch / img.height)
            : Math.min(cw / img.width, ch / img.height);
        dw = img.width * r;
        dh = img.height * r;
      }
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      perImage.set(key, c);
    }
    return c;
  }

  /**
   * 畫時間軸上 t 秒的那一格。ctx 的畫布像素尺寸＝輸出尺寸 × 縮小倍率（匯出為 1）；W、H＝輸出尺寸。
   */
  paint(ctx: Ctx2D, scene: DeckScene, W: number, H: number, t: number): void {
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cw, ch);
    if (!scene.transparent) {
      ctx.fillStyle = scene.bg;
      ctx.fillRect(0, 0, cw, ch);
    }
    const seg = findSeg(scene.segs, t);
    if (!seg) {
      ctx.restore();
      return;
    }
    const pic = (k: number) =>
      k < 0 ? this.blank(cw, ch, scene) : this.fitted(scene.images[k] ?? null, cw, ch, scene);
    if (seg.type === 'hold') {
      ctx.drawImage(pic(seg.i), 0, 0);
      ctx.restore();
      return;
    }
    if (!this.scratch || this.scratch.width !== cw || this.scratch.height !== ch) {
      this.scratch = makeCanvas(cw, ch);
    }
    const sx = ctxOf(this.scratch);
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.globalAlpha = 1;
    sx.globalCompositeOperation = 'source-over';
    sx.filter = 'none';
    sx.clearRect(0, 0, cw, ch);
    const p = easeAt(scene.easing, (t - seg.start) / seg.dur);
    const ops = transitionOps(seg.kind ?? 'fade', p, W, H, supportsCanvasFilter(sx));
    drawFx(sx, ops, pic(seg.i), pic(seg.j ?? -1), W, H);
    ctx.drawImage(this.scratch, 0, 0);
    ctx.restore();
  }
}
