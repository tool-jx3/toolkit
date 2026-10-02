/**
 * 互動 HTML（規格 3.11）：一段 `<div>`＋`<style>`＋`<script>` 的程式碼與包著它的獨立 HTML。
 *
 * - `bakeHtmlImages`（瀏覽器）：每個角色的未選取圖、每位玩家的選取圖（與主格圖）事先套好濾鏡、色調、遮罩，存成 PNG data URL。
 * - `buildInteractiveHtml`（純函式）：組出程式碼；可以在 Node 測試。
 */
import { findGoogleFont, fontFamilyCss, googleFontCssUrl } from '@/core/fonts';
import { escapeHtml, escapeHtmlAttr } from '@/core/html';
import { clamp } from '@/core/timeline';
import {
  type Box,
  compositionRects,
  effectiveRows,
  mainPanelRects,
  tileRects,
  visibleCount,
} from './layout';
import { playerLabel, type Settings } from './model';
import { automaticStart, playbackPlayers } from './motion';
import {
  applyImageEffects,
  confirmScale,
  cornerLength,
  type Drawable,
  dashPattern,
  drawCropped,
  idleFilter,
  type RenderAssets,
  selectedFilter,
  tintColor,
  titleGeometry,
} from './render';
import { S } from './strings';

export interface BakedCharacter {
  name: string;
  /** 未選取圖（images 的索引） */
  idle: number;
  /** 每位播放的玩家的選取圖 */
  selected: number[];
  /** 每位播放的玩家的主格圖（大主格模式才有） */
  main?: number[];
}

export interface BakedImages {
  images: string[];
  characters: BakedCharacter[];
  /** 背景圖的 data URL（背景方式是圖片時） */
  background: string | null;
}

export interface HtmlFont {
  /** 加在 <style> 開頭的字型樣式（@import 或 @font-face） */
  css: string;
  /** font-family 值 */
  family: string;
}

/* ---------- 圖片（瀏覽器） ---------- */

function sizeOf(img: Drawable) {
  return {
    w: (img as HTMLImageElement).naturalWidth || img.width,
    h: (img as HTMLImageElement).naturalHeight || img.height,
  };
}

/** 套好濾鏡與效果的圖（原圖或指定範圍的大小），存成 PNG data URL */
export async function bakeHtmlImages(
  s: Settings,
  assets: RenderAssets,
  readBackground: () => Promise<string | null>,
): Promise<BakedImages> {
  const images: string[] = [];
  const ids = new Map<string, number>();
  const add = (url: string) => {
    let i = ids.get(url);
    if (i === undefined) {
      i = images.length;
      ids.set(url, i);
      images.push(url);
    }
    return i;
  };
  const players = playbackPlayers(s);
  const hasMain = s.mainPanel.enabled;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  const bake = (
    image: Drawable,
    crop: Settings['characters'][number]['listCrop'],
    filter: string,
    fx: Parameters<typeof applyImageEffects>[1],
  ) => {
    const { w, h } = sizeOf(image);
    const r = crop ?? { x: 0, y: 0, width: 1, height: 1 };
    canvas.width = Math.max(1, Math.round(r.width * w));
    canvas.height = Math.max(1, Math.round(r.height * h));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.filter = filter || 'none';
    drawCropped(
      ctx,
      image,
      { x: 0, y: 0, width: canvas.width, height: canvas.height },
      crop,
      'cover',
    );
    ctx.restore();
    applyImageEffects(ctx, fx);
    return add(canvas.toDataURL('image/png'));
  };
  const characters: BakedCharacter[] = [];
  const n = visibleCount(s);
  for (let i = 0; i < n; i++) {
    const c = s.characters[i];
    const image = assets.character(i);
    if (!image) throw new Error(`「${c.name}」的圖片還沒讀好，請稍後再試。`);
    const variants = new Map<string, number>();
    const variant = (
      filter: string,
      fx: Parameters<typeof applyImageEffects>[1],
      crop: typeof c.listCrop,
    ) => {
      const key = JSON.stringify([filter, fx, crop]);
      let v = variants.get(key);
      if (v === undefined) {
        v = bake(image, crop, filter, fx);
        variants.set(key, v);
      }
      return v;
    };
    const idle = variant(idleFilter(s), { idleOverlay: s.idle.overlayAlpha / 100 }, c.listCrop);
    const selected = players.map((p) =>
      variant(
        selectedFilter(s),
        {
          tint: tintColor(s, p),
          tintAlpha: s.selected.tintMode === 'none' ? 0 : s.selected.tintAlpha / 100,
        },
        c.listCrop,
      ),
    );
    const main = hasMain
      ? players.map((p) =>
          variant(
            selectedFilter(s),
            {
              tint: s.mainPanel.effects ? tintColor(s, p) : null,
              tintAlpha: s.selected.tintAlpha / 100,
            },
            c.mainCrop,
          ),
        )
      : undefined;
    characters.push({ name: c.name, idle, selected, ...(main ? { main } : {}) });
    await new Promise((r) => setTimeout(r, 0));
  }
  canvas.width = 0;
  canvas.height = 0;
  const background =
    s.background.type === 'image' && s.background.image ? await readBackground() : null;
  return { images, characters, background };
}

/* ---------- 程式碼（純函式） ---------- */

const n3 = (v: number) => String(Math.round(v * 1000) / 1000);
const pct = (v: number, total: number) => `${n3((v / total) * 100)}%`;

/** 外框的 SVG（viewBox＝格子大小；stroke 跟著 currentColor） */
export function borderGroup(
  rect: Pick<Box, 'width' | 'height'>,
  lineWidth: number,
  radius: number,
  style: Settings['layout']['borderStyle'],
  className: string,
): string {
  if (lineWidth <= 0) return '';
  const { width: w, height: h } = rect;
  const r = clamp(radius, 0, Math.min(w, h) / 2);
  let shape: string;
  if (style === 'corners') {
    const len = cornerLength(w, h);
    const cr = Math.min(r, len / 2);
    const d = [
      `M${n3(len)} 0H${n3(cr)}A${n3(cr)} ${n3(cr)} 0 0 0 0 ${n3(cr)}V${n3(len)}`,
      `M${n3(w - len)} 0H${n3(w - cr)}A${n3(cr)} ${n3(cr)} 0 0 1 ${n3(w)} ${n3(cr)}V${n3(len)}`,
      `M0 ${n3(h - len)}V${n3(h - cr)}A${n3(cr)} ${n3(cr)} 0 0 0 ${n3(cr)} ${n3(h)}H${n3(len)}`,
      `M${n3(w)} ${n3(h - len)}V${n3(h - cr)}A${n3(cr)} ${n3(cr)} 0 0 1 ${n3(w - cr)} ${n3(h)}H${n3(w - len)}`,
    ].join(' ');
    shape = `<path d="${d}"/>`;
  } else {
    const dash = style === 'dashed' ? dashPattern(w, h, r, lineWidth) : null;
    shape = `<rect width="${n3(w)}" height="${n3(h)}" rx="${n3(r)}"${dash ? ` stroke-dasharray="${n3(dash.dash)} ${n3(dash.gap)}"` : ''}/>`;
    if (style === 'double') {
      const inset = Math.max(2, lineWidth * 1.5);
      if (w > inset * 2 && h > inset * 2)
        shape += `<rect x="${n3(inset)}" y="${n3(inset)}" width="${n3(w - inset * 2)}" height="${n3(h - inset * 2)}" rx="${n3(Math.max(0, r - inset))}"/>`;
    }
  }
  return `<g class="${className}" stroke-width="${n3(style === 'double' ? lineWidth / 2 : lineWidth)}">${shape}</g>`;
}

/** CSS 的背景（漸層的角度＝畫布角度 + 90°，規格 5. D14） */
export function cssBackground(s: Settings, backgroundUrl: string | null): string {
  const b = s.background;
  if (b.type === 'transparent') return 'transparent';
  if (b.type === 'solid') return b.colorA;
  if (b.type === 'image' && backgroundUrl) {
    const dim = clamp(b.imageDim / 100, 0, 0.95);
    const url = backgroundUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `linear-gradient(rgba(3,6,13,${dim}),rgba(3,6,13,${dim})),url("${url}") center/cover no-repeat`;
  }
  return `linear-gradient(${n3((b.angle + 90) % 360)}deg,${b.colorA},${b.colorB})`;
}

/** 字型的樣式與 font-family（上傳字型：嵌入 data URL；Google 字型：@import；電腦字型：名稱） */
export function htmlFont(
  s: Settings,
  uploaded: { dataUrl: string; format: string } | null,
): HtmlFont {
  const fam = s.font.family;
  const family = fontFamilyCss(fam);
  const quoted = `"${fam.replace(/["\\]/g, '')}"`;
  if (s.font.source === 'upload' && uploaded)
    return {
      css: `@font-face{font-family:${quoted};src:url("${uploaded.dataUrl}") format("${uploaded.format}");font-display:block}`,
      family,
    };
  const g = findGoogleFont(fam);
  if (g) return { css: `@import url("${googleFontCssUrl(g.family)}");`, family };
  return { css: '', family };
}

/** 隨機的元件 id */
export const widgetId = () => `csx-${Math.random().toString(36).slice(2, 10)}`;

/**
 * 組出互動 HTML。baked＝bakeHtmlImages 的結果；id＝元件的 id（測試時固定）。
 */
export function buildInteractiveHtml(
  s: Settings,
  baked: BakedImages,
  font: HtmlFont,
  id: string,
): { snippet: string; standalone: string } {
  const W = s.canvas.width;
  const H = s.canvas.height;
  const players = playbackPlayers(s);
  const visible = visibleCount(s);
  const { grid } = compositionRects(s);
  const mains = s.mainPanel.enabled ? mainPanelRects(s) : [];
  const tiles = tileRects(s);
  const rows = effectiveRows(s);
  const sel = s.selected;
  const radius = s.layout.radius;
  const config = {
    players: players.length,
    labels: players.map((p) => playerLabel(s, p)),
    colors: players.map((p) => s.players.colors[p]),
    starts: players.map((p) =>
      automaticStart(s, p, clamp(s.players.targets[p] || 0, 0, Math.max(0, visible - 1)), visible),
    ),
    columns: s.layout.columns,
    duplicate: s.players.allowDuplicate,
    badgeLimit: clamp(Math.floor(((tiles[0]?.height ?? 40) - 14) / 26), 1, 3),
    main: mains.length
      ? {
          count: mains.length,
          effects: s.mainPanel.effects,
          reveal: s.mainPanel.reveal,
          placeholder: s.mainPanel.placeholder,
        }
      : null,
    confirmMs: Math.max(1, s.animation.confirmDuration),
    text: {
      selecting: S.widget.selecting('{name}'),
      complete: S.widget.complete,
      completeOne: S.widget.completeOne('{name}'),
    },
    characters: baked.characters,
    images: baked.images,
  };
  const json = JSON.stringify(config).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
  const hasBg = s.background.type !== 'transparent';
  const t = titleGeometry(s);
  const titleShift =
    s.text.align === 'center'
      ? 'translateX(-50%)'
      : s.text.align === 'right'
        ? 'translateX(-100%)'
        : 'none';
  const footerY = Math.min(H - 18, s.layout.y + s.layout.height + 27);
  const K = 'var(--csk)';
  const px = (v: number) => `calc(${n3(v)}px * ${K})`;
  const svg = (rect: Box, groups: string) =>
    `<svg class="csx-border" viewBox="0 0 ${n3(rect.width)} ${n3(rect.height)}" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-linecap="butt" aria-hidden="true" focusable="false">${groups}</svg>`;

  const tileMarkup = baked.characters
    .map((c, i) => {
      const ch = s.characters[i];
      const rect = tiles[i];
      const borders =
        borderGroup(rect, s.layout.borderWidth, radius, s.layout.borderStyle, 'csx-b-idle') +
        borderGroup(rect, sel.borderWidth, radius, s.layout.borderStyle, 'csx-b-pick');
      return `
    <button class="csx-tile" type="button" data-i="${i}" aria-label="${escapeHtmlAttr(c.name)}" aria-pressed="false" style="--z:${n3(ch.scale)};--ox:${n3(ch.offsetX)}%;--oy:${n3(ch.offsetY)}%">
      <span class="csx-media"><img alt=""></span>${svg(rect, borders)}${s.labels.show && s.labels.height > 0 ? `<span class="csx-name">${escapeHtml(c.name)}</span>` : ''}
      <span class="csx-badges" aria-hidden="true"></span>
    </button>`;
    })
    .join('');

  const mainMarkup = mains
    .map((rect, slot) => {
      const side = Math.min(rect.width, rect.height);
      const vars = [
        `--ph:${n3(Math.max(mains.length === 1 ? 12 : 8, Math.min(20, side * 0.07)))}px`,
        `--nm:${n3(Math.max(mains.length === 1 ? 14 : 10, Math.min(28, side * 0.075)))}px`,
        `--in:${n3(Math.max(3, Math.min(16, side * 0.08)))}px`,
        `--bt:${n3(Math.max(3, Math.min(12, side * 0.06)))}px`,
        `--pd:${n3(Math.max(4, Math.min(18, side * 0.09)))}px`,
      ].join(';');
      const bw = s.mainPanel.effects ? sel.borderWidth : Math.max(2, s.layout.borderWidth);
      return `
  <div class="csx-main is-empty" role="group" aria-label="${escapeHtmlAttr(s.mainPanel.placeholder)}" data-slot="${slot}" style="left:${pct(rect.x, W)};top:${pct(rect.y, H)};width:${pct(rect.width, W)};height:${pct(rect.height, H)};${vars}">
    <span class="csx-main-media"><img alt="" hidden></span>${svg(rect, borderGroup(rect, bw, radius, s.layout.borderStyle, 'csx-b-main'))}
    <span class="csx-ph">${escapeHtml(s.mainPanel.placeholder)}</span>${s.mainPanel.showName ? '<span class="csx-mname" aria-live="polite" hidden></span>' : ''}
  </div>`;
    })
    .join('');

  const confirmFrames = Array.from({ length: 21 }, (_, i) => {
    const q = i / 20;
    return `${i * 5}%{transform:scale(${n3(sel.scale * confirmScale(q))})}`;
  }).join('');
  const sid = `#${id}`;
  const css = [
    font.css,
    `${sid}{--csk:1;--act:${config.colors[0] ?? '#66ddff'};position:relative;box-sizing:border-box;width:min(100%,${W}px);aspect-ratio:${W}/${H};overflow:hidden;margin:1.2em auto;border-radius:${px(16)};background:${cssBackground(s, baked.background)};color:#fff;isolation:isolate;box-shadow:${hasBg ? `0 ${px(18)} ${px(54)} rgba(0,0,0,.36)` : 'none'};font-family:${font.family};outline:none;user-select:none;-webkit-tap-highlight-color:transparent}`,
    `${sid}:focus-visible{box-shadow:0 0 0 3px var(--act)${hasBg ? `,0 ${px(18)} ${px(54)} rgba(0,0,0,.36)` : ''}}`,
    hasBg && s.background.pattern
      ? `${sid}::before{content:"";position:absolute;inset:-40%;background:repeating-linear-gradient(45deg,rgba(255,255,255,.045) 0 1px,transparent 1px ${px(28)});pointer-events:none}`
      : '',
    hasBg && s.background.vignette > 0
      ? `${sid}::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at center,transparent 30%,rgba(0,0,0,${s.background.vignette / 100}) 100%);pointer-events:none}`
      : '',
    `${sid} .csx-title{position:absolute;z-index:4;left:${pct(t.x, W)};top:${pct(t.titleY, H)};transform:${titleShift};text-align:${s.text.align};white-space:nowrap;text-shadow:0 2px 12px rgba(0,0,0,.45)}`,
    `${sid} .csx-title strong{display:block;font-size:${px(s.text.titleSize)};font-weight:900;line-height:1.05;letter-spacing:.02em}`,
    `${sid} .csx-title span{display:block;margin-top:${px(5)};font-size:${px(t.subtitleSize)};font-weight:700;color:rgba(232,239,252,.68);letter-spacing:.12em}`,
    `${sid} .csx-grid{position:absolute;z-index:3;left:${pct(grid.x, W)};top:${pct(grid.y, H)};width:${pct(grid.width, W)};height:${pct(grid.height, H)};display:grid;grid-template-columns:repeat(${s.layout.columns},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr));gap:${px(s.layout.gap)}}`,
    `${sid} .csx-tile{--pick:var(--act);position:relative;min-width:0;min-height:0;margin:0;padding:0;overflow:visible;border:0;border-radius:${px(radius)};background:transparent;color:#fff;font:inherit;cursor:pointer;transition:transform .18s cubic-bezier(.2,.8,.2,1);outline:none}`,
    `${sid} .csx-border{position:absolute;z-index:4;inset:0;display:block;width:100%;height:100%;overflow:visible;pointer-events:none;color:rgba(255,255,255,.2)}`,
    `${sid} .csx-b-pick{display:none}`,
    `${sid} .csx-tile.is-cursor .csx-b-idle,${sid} .csx-tile.is-picked .csx-b-idle{display:none}`,
    `${sid} .csx-tile.is-cursor .csx-b-pick,${sid} .csx-tile.is-picked .csx-b-pick{display:inline}`,
    `${sid} .csx-media{position:absolute;inset:0;overflow:hidden;border-radius:inherit}`,
    `${sid} .csx-media img{width:100%;height:100%;display:block;object-fit:${s.layout.fit};transform:translate(var(--ox),var(--oy)) scale(var(--z));transition:transform .18s ease;pointer-events:none}`,
    `${sid} .csx-tile.is-cursor,${sid} .csx-tile.is-picked{transform:scale(${n3(sel.scale)});z-index:5}`,
    `${sid} .csx-tile.is-cursor>.csx-border,${sid} .csx-tile.is-picked>.csx-border{color:var(--pick);filter:drop-shadow(0 0 ${px(sel.glow / 2)} var(--pick))}`,
    `${sid} .csx-tile.is-cursor>.csx-border{animation:${id}-blink .7s ease-in-out infinite alternate}`,
    `@keyframes ${id}-blink{to{filter:drop-shadow(0 0 ${px(sel.glow * 0.675)} var(--act))}}`,
    `${sid} .csx-name{position:absolute;z-index:3;left:0;right:0;bottom:0;min-height:${px(s.labels.height)};display:flex;align-items:flex-end;justify-content:center;box-sizing:border-box;padding:${px(6)};border-radius:0 0 ${px(radius)} ${px(radius)};background:linear-gradient(transparent,rgba(3,5,10,.9));font-size:${px(s.labels.fontSize)};font-weight:900;text-align:center;text-shadow:0 2px 6px #000;pointer-events:none}`,
    `${sid} .csx-badges{position:absolute;z-index:6;left:${px(7)};right:${px(7)};top:${px(7)};display:flex;flex-wrap:wrap;align-content:flex-start;gap:${px(4)};max-height:calc(100% - 14px * ${K});overflow:hidden;pointer-events:none}`,
    `${sid} .csx-badge{box-sizing:border-box;min-width:min(100%,${px(35)});max-width:100%;height:${px(22)};line-height:${px(22)};padding:0 ${px(6)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-radius:999px;background:var(--bc);color:#061018;font-size:${px(11)};font-weight:900;box-shadow:0 0 ${px(12)} var(--bc)}`,
    `${sid} .csx-foot{position:absolute;z-index:5;left:${pct(s.layout.x, W)};right:${pct(W - s.layout.x - s.layout.width, W)};top:${pct(footerY, H)};display:flex;align-items:center;justify-content:space-between;gap:${px(10)};min-width:0;font-size:${px(11)};font-weight:800;color:rgba(231,238,251,.72)}`,
    `${sid} .csx-status{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--act);font-size:${px(13)};font-weight:900}`,
    `${sid} .csx-help{flex:0 1 auto;min-width:0;max-width:48%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:${px(9)};font-weight:700}`,
    `${sid} .csx-reset{position:absolute;z-index:7;right:${px(10)};bottom:${px(10)};min-height:${px(26)};padding:0 ${px(9)};border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(5,8,14,.68);color:rgba(255,255,255,.78);font:inherit;font-size:${px(10)};font-weight:800;cursor:pointer}`,
    `${sid} .csx-reset:hover,${sid} .csx-reset:focus-visible{color:#fff;border-color:var(--act);outline:none}`,
    mains.length
      ? [
          `${sid} .csx-main{position:absolute;z-index:3;box-sizing:border-box;border-radius:${px(radius)};isolation:isolate;pointer-events:none}`,
          `${sid} .csx-main.is-empty{border:${px(1)} dashed rgba(231,238,251,.26)}`,
          `${sid} .csx-main.is-empty>.csx-border{display:none}`,
          `${sid} .csx-main-media{position:absolute;inset:0;overflow:hidden;border-radius:inherit}`,
          `${sid} .csx-main-media img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:${s.mainPanel.fit}}`,
          `${sid} .csx-main>.csx-border{color:var(--mc,transparent)}`,
          `${sid} .csx-ph{position:absolute;inset:0;display:grid;place-items:center;box-sizing:border-box;padding:calc(var(--pd) * ${K});color:rgba(231,238,251,.5);font-size:calc(var(--ph) * ${K});font-weight:700;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere}`,
          `${sid} .csx-mname{position:absolute;left:calc(var(--in) * ${K});right:calc(var(--in) * ${K});bottom:calc(var(--bt) * ${K});color:var(--mc,#fff);font-size:calc(var(--nm) * ${K});font-weight:900;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 ${px(2)} ${px(8)} rgba(0,0,0,.7)}`,
          `${sid} .csx-main [hidden]{display:none}`,
          s.mainPanel.effects
            ? [
                `${sid} .csx-main.is-filled{transform:scale(${n3(sel.scale)})}`,
                `${sid} .csx-main.is-filled>.csx-border{filter:drop-shadow(0 0 ${px(sel.glow / 2)} var(--mc))}`,
                `${sid} .csx-main.is-filled.is-confirming{animation:${id}-pop ${config.confirmMs}ms linear}`,
                `${sid} .csx-main.is-filled.is-confirming>.csx-border{filter:drop-shadow(0 0 ${px(sel.glow * 0.625)} var(--mc))}`,
                `${sid} .csx-main.is-confirming .csx-main-media img{animation:${id}-flash ${config.confirmMs}ms linear}`,
                `@keyframes ${id}-pop{${confirmFrames}}`,
                `@keyframes ${id}-flash{0%{filter:brightness(1.34)}45.45%,100%{filter:brightness(1)}}`,
              ].join('\n')
            : '',
        ].join('\n')
      : '',
    `@media (max-width:520px){${sid} .csx-help{display:none}}`,
    `@media (prefers-reduced-motion:reduce){${sid} .csx-tile,${sid} .csx-tile>.csx-border,${sid} .csx-media img,${sid} .csx-main{animation:none!important;transition:none!important}${sid} .csx-main-media img{animation:none!important}}`,
  ]
    .filter(Boolean)
    .join('\n');

  /* 函式形式的取代：資料裡的「$&」之類不會被當成特殊字樣 */
  const script = WIDGET_SCRIPT.replace('__ID__', () => JSON.stringify(id))
    .replace('__WIDTH__', () => String(W))
    .replace('__CONFIG__', () => json);

  const snippet = `<!-- 選角畫面產生器：互動 HTML 開始 -->
<div id="${id}" class="csx" tabindex="0" role="application" aria-label="${escapeHtmlAttr(S.widget.aria)}">
  ${s.text.showTitle ? `<div class="csx-title"><strong>${escapeHtml(s.text.title)}</strong><span>${escapeHtml(s.text.subtitle)}</span></div>` : ''}${mainMarkup}
  <div class="csx-grid">${tileMarkup}
  </div>
  <div class="csx-foot"><span class="csx-status" aria-live="polite"></span><span class="csx-help">${escapeHtml(S.widget.help)}</span></div>
  <button class="csx-reset" type="button">${escapeHtml(S.widget.reset)}</button>
</div>
<style>
${css.replace(/<\//g, '<\\/')}
</style>
<script>
${script}
</script>
<!-- 選角畫面產生器：互動 HTML 結束 -->`;

  const standalone = `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(s.text.title || '角色選擇')}</title>
<style>html,body{min-height:100%;margin:0}body{display:grid;place-items:center;padding:16px;box-sizing:border-box;background:${hasBg ? '#080b13' : 'transparent'}}</style>
</head>
<body>
${snippet}
</body>
</html>
`;
  return { snippet, standalone };
}

/**
 * 元件的腳本（不用樣板字串，避免和外面的字串衝突）。__ID__、__WIDTH__、__CONFIG__ 由 buildInteractiveHtml 換掉。
 */
const WIDGET_SCRIPT = `(function () {
  var root = document.getElementById(__ID__);
  if (!root || root.getAttribute('data-ready') === '1') return;
  root.setAttribute('data-ready', '1');
  var cfg = __CONFIG__;
  var tiles = Array.prototype.slice.call(root.querySelectorAll('.csx-tile'));
  var status = root.querySelector('.csx-status');
  var resetButton = root.querySelector('.csx-reset');
  var mains = Array.prototype.slice.call(root.querySelectorAll('.csx-main')).map(function (el) {
    return { el: el, img: el.querySelector('.csx-main-media img'), name: el.querySelector('.csx-mname'), ph: el.querySelector('.csx-ph'), timer: 0 };
  });
  var picked = [];
  for (var i = 0; i < cfg.players; i++) picked.push(-1);
  var mainSel = [];
  for (var j = 0; j < (cfg.main ? cfg.main.count : 0); j++) mainSel.push(null);
  var player = 0;
  var cursor = -1;
  function label(p) { return cfg.labels[p] || (p + 1) + 'P'; }
  function fill(text, name) { return text.replace('{name}', name); }
  function done() { return player >= cfg.players; }
  function unavailable(k) { return !cfg.duplicate && picked.indexOf(k) >= 0; }
  function nextAvailable(start, step) {
    if (done()) return -1;
    var k = start;
    for (var n = 0; n < tiles.length; n++) {
      k = (((k + step) % tiles.length) + tiles.length) % tiles.length;
      if (!unavailable(k)) return k;
    }
    return start;
  }
  function startFor(p, fallback) {
    var c = Number(cfg.starts[p]);
    var k = c >= 0 && c < tiles.length && Math.floor(c) === c ? c : nextAvailable(fallback, 1);
    if (k >= 0 && unavailable(k)) k = nextAvailable(k - 1, 1);
    return k >= 0 ? k : 0;
  }
  function stopConfirm(slot) {
    var m = mains[slot];
    if (!m) return;
    clearTimeout(m.timer);
    m.timer = 0;
    m.el.classList.remove('is-confirming');
  }
  function stopAll() { for (var k = 0; k < mains.length; k++) stopConfirm(k); }
  function confirmMain(slot) {
    if (!cfg.main || !cfg.main.effects || !mains[slot]) return;
    stopAll();
    var m = mains[slot];
    void m.el.offsetWidth;
    m.el.classList.add('is-confirming');
    m.timer = setTimeout(function () { stopConfirm(slot); }, cfg.confirmMs);
  }
  function updateMain() {
    mains.forEach(function (m, slot) {
      var sel = mainSel[slot];
      var empty = sel === null;
      m.el.classList.toggle('is-empty', empty);
      m.el.classList.toggle('is-filled', !empty);
      m.img.hidden = empty;
      m.ph.hidden = !empty;
      if (m.name) m.name.hidden = empty;
      if (empty) {
        stopConfirm(slot);
        m.img.removeAttribute('src');
        m.img.removeAttribute('data-src');
        m.el.style.removeProperty('--mc');
        m.el.setAttribute('aria-label', cfg.main.placeholder);
        if (m.name) m.name.textContent = '';
        return;
      }
      var c = cfg.characters[sel.index];
      var text = label(sel.player) + ' · ' + c.name;
      m.el.style.setProperty('--mc', cfg.colors[sel.player]);
      m.el.setAttribute('aria-label', text);
      var id = c.main ? c.main[sel.player] : c.selected[sel.player];
      if (m.img.getAttribute('data-src') !== String(id)) {
        m.img.setAttribute('data-src', String(id));
        m.img.src = cfg.images[id];
      }
      m.img.alt = c.name;
      if (m.name) m.name.textContent = text;
    });
  }
  function update() {
    var complete = done();
    var color = cfg.colors[Math.min(player, cfg.colors.length - 1)] || '#66ddff';
    root.style.setProperty('--act', color);
    tiles.forEach(function (tile, k) {
      var isCursor = !complete && k === cursor;
      var owners = [];
      picked.forEach(function (v, p) { if (v === k) owners.push(p); });
      tile.classList.toggle('is-cursor', isCursor);
      tile.classList.toggle('is-picked', owners.length > 0);
      tile.setAttribute('aria-pressed', owners.length ? 'true' : 'false');
      var limit = Math.max(1, cfg.badgeLimit || 3);
      var shown = owners.length > limit ? owners.slice(0, limit - 1) : owners;
      var badges = tile.querySelector('.csx-badges');
      while (badges.firstChild) badges.removeChild(badges.firstChild);
      shown.forEach(function (p) {
        var b = document.createElement('span');
        b.className = 'csx-badge';
        b.style.setProperty('--bc', cfg.colors[p]);
        b.textContent = label(p);
        b.title = label(p);
        badges.appendChild(b);
      });
      if (owners.length > limit) {
        var rest = owners.slice(shown.length);
        var more = document.createElement('span');
        more.className = 'csx-badge';
        more.style.setProperty('--bc', cfg.colors[rest[rest.length - 1]]);
        more.textContent = '+' + rest.length;
        more.title = rest.map(label).join(', ');
        badges.appendChild(more);
      }
      var who = isCursor ? player : owners.length ? owners[owners.length - 1] : Math.min(player, cfg.players - 1);
      tile.style.setProperty('--pick', cfg.colors[who]);
      var c = cfg.characters[k];
      tile.setAttribute('aria-label', c.name + (owners.length ? ' · ' + owners.map(label).join(', ') : ''));
      var id = isCursor || owners.length ? c.selected[who] : c.idle;
      var img = tile.querySelector('.csx-media img');
      if (img.getAttribute('data-src') !== String(id)) {
        img.setAttribute('data-src', String(id));
        img.src = cfg.images[id];
      }
    });
    status.textContent = complete
      ? (cfg.players === 1 ? fill(cfg.text.completeOne, label(0)) : cfg.text.complete)
      : fill(cfg.text.selecting, label(player));
    status.style.color = complete ? 'rgba(255,255,255,.9)' : color;
    updateMain();
  }
  function setCursor(k) {
    if (done() || k < 0 || k >= tiles.length || unavailable(k)) return;
    stopAll();
    cursor = k;
    if (cfg.main && cfg.main.reveal === 'hover') mainSel[player % cfg.main.count] = { index: k, player: player };
    update();
  }
  function pick(k) {
    if (k === undefined) k = cursor;
    if (done() || k < 0 || k >= tiles.length || unavailable(k)) return;
    var slot = cfg.main ? player % cfg.main.count : -1;
    if (slot >= 0) mainSel[slot] = { index: k, player: player };
    picked[player] = k;
    player++;
    if (player < cfg.players) cursor = startFor(player, k);
    update();
    if (slot >= 0) confirmMain(slot);
  }
  function resetAll() {
    stopAll();
    for (var p = 0; p < picked.length; p++) picked[p] = -1;
    for (var s = 0; s < mainSel.length; s++) mainSel[s] = null;
    player = 0;
    cursor = startFor(0, -1);
    update();
    root.focus({ preventScroll: true });
  }
  tiles.forEach(function (tile, k) {
    tile.addEventListener('pointerenter', function () { setCursor(k); });
    tile.addEventListener('click', function (e) {
      e.preventDefault();
      root.focus({ preventScroll: true });
      setCursor(k);
      pick(k);
    });
  });
  root.addEventListener('keydown', function (e) {
    var key = e.key;
    var lower = key.length === 1 ? key.toLowerCase() : key;
    if (done() && lower !== 'r') return;
    var handled = true;
    if (key === 'ArrowRight') setCursor(nextAvailable(cursor, 1));
    else if (key === 'ArrowLeft') setCursor(nextAvailable(cursor, -1));
    else if (key === 'ArrowDown') setCursor(nextAvailable(cursor, cfg.columns));
    else if (key === 'ArrowUp') setCursor(nextAvailable(cursor, -cfg.columns));
    else if (key === 'Enter' || key === ' ') pick();
    else if (lower === 'r') resetAll();
    else handled = false;
    if (handled) { e.preventDefault(); update(); }
  });
  resetButton.addEventListener('click', function (e) { e.stopPropagation(); resetAll(); });
  root.addEventListener('pointerdown', function () { root.focus({ preventScroll: true }); });
  function scale() { root.style.setProperty('--csk', String(root.clientWidth / __WIDTH__)); }
  if (window.ResizeObserver) new ResizeObserver(scale).observe(root);
  else window.addEventListener('resize', scale);
  scale();
  cursor = startFor(0, -1);
  update();
})();`;
