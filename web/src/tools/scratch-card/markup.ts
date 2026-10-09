/**
 * 卡片的 HTML 與樣式（規格 3.1～3.3）：預覽、分享連結的畫面、互動 HTML 都用這一份（純函式）。
 * 圖片的網址由呼叫端解析（預覽是物件網址、互動 HTML 是 data URL 或網址）。使用者的文字一律跳脫。
 */
import { cssUrl } from '@/core/css';
import { escapeHtml, escapeHtmlAttr } from '@/core/html';
import type { Card } from './card';
import type { ScratchConfig } from './engine';
import { iconSvg, SCRATCH_ICONS } from './icons';
import type { Anchor, ImageRef } from './model';
import { S } from './strings';

/** 卡片的字型（預覽與互動 HTML 相同；不載入字型） */
export const CARD_FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
/** 卡片外框的寬 */
export const CARD_BORDER = 2;

const px = (n: number) => `${+n.toFixed(2)}px`;

export interface MarkupOptions {
  /** 圖片的網址（trim：要不要去掉透明留白） */
  src: (image: ImageRef, trim: boolean) => string;
  /** 結果加上彈出動畫的標記 */
  pop: boolean;
}

const JUSTIFY: Record<string, string> = { l: 'flex-start', c: 'center', r: 'flex-end' };
const ALIGN: Record<string, string> = { t: 'flex-start', m: 'center', b: 'flex-end' };
const TEXT_ALIGN: Record<string, string> = { l: 'left', c: 'center', r: 'right' };

/** 標題位置 → 排法 */
export function titlePlacement(pos: Anchor): {
  justify: string;
  align: string;
  textAlign: string;
} {
  return { justify: JUSTIFY[pos[1]], align: ALIGN[pos[0]], textAlign: TEXT_ALIGN[pos[1]] };
}

function attr(name: string, value: string): string {
  return ` ${name}="${escapeHtmlAttr(value)}"`;
}

/** 卡片元素（`.scx-card`，含結果層、標題層、塗層與粉屑畫布） */
export function cardHtml(card: Card, o: MarkupOptions): string {
  const { zone } = card;
  const popAttr = o.pop ? ' data-scx-pop' : '';
  const delay = (i: number) => (o.pop && i > 0 ? `animation-delay:${+(i * 0.1).toFixed(1)}s;` : '');
  const at = (b: { x: number; y: number; w: number; h: number }) =>
    `left:${px(b.x - zone.x)};top:${px(b.y - zone.y)};width:${px(b.w)};height:${px(b.h)};`;

  const r = card.result;
  let items = '';
  switch (r.kind) {
    case 'icons':
      items = r.items
        .map(
          (it, i) =>
            `<span class="scx-item scx-icon"${popAttr} role="img"${attr('aria-label', SCRATCH_ICONS[it.icon]?.name ?? '')} style="${at(it.box)}${delay(i)}">${iconSvg(it.icon)}</span>`,
        )
        .join('');
      break;
    case 'images':
      items = r.items
        .map(
          (it, i) =>
            `<img class="scx-item scx-img scx-img-${r.style}"${popAttr}${attr('src', o.src(it.image, r.trim))} alt="" draggable="false" style="${at(it.box)}${delay(i)}">`,
        )
        .join('');
      break;
    case 'sentence':
      items = `<div class="scx-text"${popAttr} style="font-size:${px(r.size)};color:${r.color}">${escapeHtml(r.text)}</div>`;
      break;
    case 'full':
      items = `<img class="scx-full"${popAttr}${attr('src', o.src(r.image, false))} alt="" draggable="false" style="border-radius:${px(r.radius)}">`;
      break;
    case 'empty':
      items = `<div class="scx-empty"${popAttr}>${escapeHtml(r.text)}</div>`;
      break;
  }
  const zoneStyle = `left:${px(zone.x)};top:${px(zone.y)};width:${px(zone.w)};height:${px(zone.h)};`;
  const resultLayer = `<div class="scx-result${card.stripes ? ' scx-stripes' : ''}" data-scx="result" aria-hidden="true" style="${zoneStyle}">${items}</div>`;

  let titleLayer = '';
  if (card.title) {
    const t = card.title;
    const p = titlePlacement(t.pos);
    titleLayer = `<div class="scx-title" style="${zoneStyle}justify-content:${p.justify};align-items:${p.align}"><div style="color:${t.color};font-size:${px(t.size)};text-align:${p.textAlign}">${escapeHtml(t.text)}</div></div>`;
  }

  const bg = card.background;
  const bgStyle = [
    `width:${px(card.width)}`,
    `height:${px(card.height)}`,
    `background-color:${bg.color}`,
    bg.image ? `background-image:${cssUrl(o.src(bg.image, false))}` : '',
    bg.image ? `background-size:${bg.fit}` : '',
  ]
    .filter(Boolean)
    .join(';');

  return `<div class="scx-card" data-scx="card" role="group"${attr('aria-label', S.cardLabel)}${attr('style', bgStyle)}>${resultLayer}${titleLayer}<canvas class="scx-cover" data-scx="cover" width="${card.width}" height="${card.height}" role="img"${attr('aria-label', S.coverLabel)}></canvas><canvas class="scx-dust" data-scx="dust" width="${card.width}" height="${card.height}" aria-hidden="true"></canvas></div>`;
}

/** 卡片的樣式（scope：外層的選擇器，例如 `#scx-ab12cd34`；pop：彈出動畫的 class 名稱） */
export function cardCss(scope: string, pop: string): string {
  const s = scope;
  const shadow = 'drop-shadow(0 4px 3px rgba(0,0,0,.07)) drop-shadow(0 2px 2px rgba(0,0,0,.06))';
  return [
    `${s} .scx-card{position:relative;box-sizing:content-box;margin:0;padding:0;border:${CARD_BORDER}px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,.1);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;background-position:center;background-repeat:no-repeat;font-family:${CARD_FONT};font-size:16px;line-height:1.5;color:#1f2937;text-align:left}`,
    `${s} .scx-result{position:absolute;z-index:1;box-sizing:border-box;margin:0;padding:20px;display:flex;align-items:center;justify-content:center;text-align:center}`,
    `${s} .scx-stripes{background:repeating-linear-gradient(45deg,#f9fafb,#f9fafb 10px,#ffffff 10px,#ffffff 20px)}`,
    `${s} .scx-item{position:absolute;display:block;box-sizing:border-box;margin:0;padding:0;border:0;border-radius:0;box-shadow:none;max-width:none;max-height:none}`,
    `${s} .scx-icon{filter:${shadow}}`,
    `${s} .scx-icon svg{display:block;width:100%;height:100%}`,
    `${s} .scx-img{object-fit:cover;object-position:center}`,
    `${s} .scx-img-rounded{border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,.1)}`,
    `${s} .scx-img-circle{border-radius:50%;box-shadow:0 4px 6px rgba(0,0,0,.1)}`,
    `${s} .scx-img-circle-flat{border-radius:50%}`,
    `${s} .scx-img-contain{object-fit:contain}`,
    `${s} .scx-text{max-width:100%;margin:0;font-weight:900;line-height:1.5;overflow-wrap:anywhere;word-break:normal;line-break:strict;white-space:normal;filter:drop-shadow(0 1px 1px rgba(0,0,0,.05))}`,
    `${s} .scx-full{position:absolute;left:0;top:0;display:block;width:100%;height:100%;margin:0;padding:0;border:0;max-width:none;max-height:none;object-fit:cover;object-position:center}`,
    `${s} .scx-empty{margin:0;padding:16px;color:#9ca3af;font-weight:700}`,
    `${s} .scx-title{position:absolute;z-index:2;box-sizing:border-box;margin:0;padding:16px;display:flex;pointer-events:none}`,
    `${s} .scx-title>div{max-width:100%;font-weight:900;line-height:1.5;overflow-wrap:anywhere;word-break:normal;line-break:strict;filter:${shadow}}`,
    `${s} .scx-cover,${s} .scx-dust{position:absolute;left:0;top:0;display:block;width:100%;height:100%;margin:0;padding:0;border:0;max-width:none}`,
    `${s} .scx-cover{z-index:3;cursor:pointer;touch-action:none}`,
    `${s} .scx-dust{z-index:4;pointer-events:none}`,
    `${s} .${pop}{animation:${pop} .5s ease forwards}`,
    `@keyframes ${pop}{0%{opacity:0;transform:scale(.5)}70%{opacity:1;transform:scale(1.1)}100%{opacity:1;transform:scale(1)}}`,
    `@media (prefers-reduced-motion:reduce){${s} .${pop}{animation:none}}`,
  ].join('\n');
}

/** 塗層程式的設定 */
export function engineConfig(
  card: Card,
  o: { popClass: string | null; confetti: boolean; fit: boolean },
): ScratchConfig {
  return {
    width: card.width,
    height: card.height,
    zone: { ...card.zone },
    color: card.cover.color,
    text: card.cover.text,
    brush: card.cover.brush,
    font: CARD_FONT,
    pieces: card.cover.pieces.map((p) => ({ ...p })),
    popClass: o.popClass,
    confetti: o.confetti,
    fit: o.fit,
  };
}
