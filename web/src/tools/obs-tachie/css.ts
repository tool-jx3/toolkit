/**
 * 輸出 CSS（貼到 OBS 瀏覽器來源的「自訂 CSS」，網址是 Streamkit 的語音小工具）。效果見規格 3.4：
 *
 * - 立繪：把 #root 整個換成立繪圖片（`content: url(…)` 讓元素本身變成一張圖），固定在指定位置。
 *   Streamkit 的頭像、名字都在 #root 裡面，所以一起不顯示；它們仍在 DOM 裡，可以用 :has() 判斷
 *   這個人在不在頻道、有沒有在說話。量得到圖片尺寸時寬高寫死；量不到時以圖片本身的大小繪製。
 * - 位置：左／右／上／下錨點用 left、right、top、bottom；中央用左右（上下）兩邊的距離＋自動外距置中，
 *   不用位移，所以彈跳的位移不會蓋掉置中。
 * - 說話：`#root:has(說話中的頭像)` 播放一組 keyframes（彈跳＝位移、外框光暈＝濾鏡、閃爍＝不透明度），
 *   每半段先慢後快再慢（ease-in-out）。外框光暈＝一層柔和光暈（模糊半徑 w → 4w → w）＋往四個斜角各錯開 w 的實心外框。
 * - 安靜時變暗、不在頻道時隱藏：用 `:not(:has(…))`，較舊的 OBS 不認得 :has() 時整條規則失效，
 *   立繪照常常駐顯示（不會因此永遠消失）。
 * - 名字：body::after，位置相對於立繪（3.4.6）；不跟著彈跳、不變暗。
 */
import { STREAMKIT, streamkitUserAvatar, streamkitUserSpeaking } from '@/ccfolia';
import {
  type CssDecls,
  createCssSheet,
  cssComment,
  cssFontWeight,
  cssString,
  cssUrl,
  fallbackKind,
  fallbackStack,
  fontFamilyList,
  fontStack,
  googleFontUrls,
  localFontNames,
  num,
  px,
  safeCssColor,
  strokeShadow8,
  withOpacity,
} from '@/core/css';
import type { FontValue } from '@/core/fonts';
import { alignLost, type Geometry, geometry, glowW, nameText, type Size } from './logic';
import {
  axesOf,
  type NameLabel,
  type Preset,
  SOURCE_SIZE,
  type TachieUser,
  userLabel,
} from './model';
import { S } from './strings';

export interface TachieCssInput {
  user: TachieUser | null;
  preset: Preset;
  /** 圖片（data URI 或網址）；沒有時 null */
  image: string | null;
  /** 量到的圖片實際尺寸；量不到時 null */
  natural: Size | null;
  /** 預設集名稱的顯示（註解用；空白時「未命名」） */
  presetLabel?: string;
  /** 預覽用：名字換成這個（例如暫定的「名字」） */
  nameOverride?: string | null;
}

/** 說話效果的 keyframes 名稱 */
export const TALK_ANIMATION = 'tk-tachie-talk';

/** 外框光暈的濾鏡：柔和光暈（模糊半徑 r）＋往右下、左上、左下、右上各錯開 w 的實心外框 */
export function glowFilter(color: string, w: number, r: number): string {
  const c = safeCssColor(color);
  const d = num(w, 2);
  const n = num(-w, 2);
  return [
    `drop-shadow(0 0 ${px(r)} ${c})`,
    `drop-shadow(${d}px ${d}px 0 ${c})`,
    `drop-shadow(${n}px ${n}px 0 ${c})`,
    `drop-shadow(${n}px ${d}px 0 ${c})`,
    `drop-shadow(${d}px ${n}px 0 ${c})`,
  ].join(' ');
}

/** 名字的 font-family：空白＝沿用頁面字型（null）；電腦字型可以用逗號列多個 */
export function labelFontFamily(font: FontValue): string | null {
  const family = font.family.trim();
  if (!family) return null;
  if (font.source !== 'google' && family.includes(',')) {
    const list = fontFamilyList(family);
    return list ? `${list}, ${fallbackStack(fallbackKind({ source: 'local', family: '' }))}` : null;
  }
  return fontStack(font);
}

/** 名字實際輸出的字重（粗體 700、一般 400；Google 字型換成最接近的實有字重） */
export const labelWeight = (l: Pick<NameLabel, 'bold' | 'font'>): number =>
  cssFontWeight(l.font, l.bold ? 700 : 400);

/* ---------- 位置 ---------- */

/** 立繪的位置（3.4.2）：中央用兩邊距離＋自動外距置中 */
function portraitPosition(p: Preset): CssDecls {
  const { x, y } = axesOf(p.anchor);
  const hx = p.offsetX;
  const vy = p.offsetY;
  const h: CssDecls =
    x === 'left'
      ? { left: px(hx), right: 'auto', 'margin-left': 0, 'margin-right': 0 }
      : x === 'right'
        ? { left: 'auto', right: px(hx), 'margin-left': 0, 'margin-right': 0 }
        : { left: px(hx), right: px(-hx), 'margin-left': 'auto', 'margin-right': 'auto' };
  const v: CssDecls =
    y === 'bottom'
      ? { top: 'auto', bottom: px(vy), 'margin-top': 0, 'margin-bottom': 0 }
      : y === 'top'
        ? { top: px(vy), bottom: 'auto', 'margin-top': 0, 'margin-bottom': 0 }
        : { top: px(-vy), bottom: px(vy), 'margin-top': 'auto', 'margin-bottom': 'auto' };
  return { ...h, ...v };
}

/** calc(基準 ± 偏移)：calcPx('50%', -150) → 'calc(50% - 150px)' */
export function calcPx(base: string, offset: number): string {
  return offset < 0 ? `calc(${base} - ${px(-offset)})` : `calc(${base} + ${px(offset)})`;
}

type From = 'left' | 'right' | 'center';
type Edge = 'start' | 'middle' | 'end';

/**
 * 名字框的水平位置：參考點（距左緣 offset、距右緣 offset、中央＋offset）上放名字框的左緣／中心／右緣。
 * 回傳 left／right 與水平位移。
 */
function horizontal(from: From, offset: number, edge: Edge): { decls: CssDecls; tx: string } {
  const at = (k: From, o: number): string =>
    k === 'left' ? px(o) : k === 'right' ? calcPx('100%', -o) : calcPx('50%', o);
  if (edge === 'end') {
    /* 右緣對齊參考點：用 right 表示（距右緣時就是 offset 本身） */
    const right =
      from === 'right'
        ? px(offset)
        : from === 'left'
          ? calcPx('100%', -offset)
          : calcPx('50%', -offset);
    return { decls: { left: 'auto', right }, tx: '0' };
  }
  return { decls: { left: at(from, offset), right: 'auto' }, tx: edge === 'middle' ? '-50%' : '0' };
}

/** 名字框的位置與寬度（3.4.6） */
function labelPlacement(p: Preset, g: Geometry): CssDecls {
  const l = p.label;
  const { x, y } = axesOf(p.anchor);
  const hx = p.offsetX;
  const vy = p.offsetY;
  const dx = l.x;
  const W = g.baseW;
  let box: { decls: CssDecls; tx: string };
  let width: string = 'max-content';
  let textAlign: string = 'left';
  if (W !== null && (!l.bar || l.barWidth === 'fill')) {
    /* 名字框寬＝W，與立繪同一個水平位置再加水平偏移；文字在框內對齊 */
    width = px(W);
    textAlign = l.align;
    box =
      x === 'left'
        ? horizontal('left', hx + dx, 'start')
        : x === 'right'
          ? horizontal('right', hx - dx, 'end')
          : horizontal('center', hx + dx - W / 2, 'start');
  } else if (W !== null) {
    /* 字幕條配合文字：字幕條的左緣／中心／右緣對齊立繪框的左緣／中心／右緣 */
    const edge: Edge = l.align === 'left' ? 'start' : l.align === 'right' ? 'end' : 'middle';
    const k = l.align === 'left' ? 0 : l.align === 'right' ? 1 : 0.5;
    box =
      x === 'left'
        ? horizontal('left', hx + k * W + dx, edge)
        : x === 'right'
          ? horizontal('right', hx + (1 - k) * W - dx, edge)
          : horizontal('center', hx + (k - 0.5) * W + dx, edge);
  } else {
    /* 不知道寬度：縮成文字寬，對齊錨點那一側 */
    box =
      x === 'left'
        ? horizontal('left', hx + dx, 'start')
        : x === 'right'
          ? horizontal('right', hx - dx, 'end')
          : horizontal('center', hx + dx, 'middle');
  }
  let ty = '0';
  const v: CssDecls =
    y === 'bottom'
      ? { top: 'auto', bottom: px(vy + l.y) }
      : y === 'top'
        ? { top: px(vy - l.y), bottom: 'auto' }
        : { top: calcPx('50%', -(vy + l.y)), bottom: 'auto' };
  if (y === 'center') ty = '-50%';
  const transform = box.tx === '0' && ty === '0' ? 'none' : `translate(${box.tx}, ${ty})`;
  return { ...box.decls, ...v, width, 'text-align': textAlign, transform };
}

/** 字幕條的底色：色碼是 3 或 6 位時才套不透明度 */
export function barBackground(l: Pick<NameLabel, 'barColor' | 'barOpacity'>): string {
  const c = safeCssColor(l.barColor);
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)
    ? withOpacity(c, Math.min(100, Math.max(0, l.barOpacity)))
    : c;
}

function labelDecls(p: Preset, g: Geometry, text: string): CssDecls {
  const l = p.label;
  const family = labelFontFamily(l.font);
  const pad = l.bar && (l.barPadX > 0 || l.barPadY > 0) ? `${px(l.barPadY)} ${px(l.barPadX)}` : 0;
  return {
    content: cssString(text),
    display: 'block',
    position: 'fixed',
    'z-index': 2,
    margin: 0,
    'box-sizing': 'border-box',
    'white-space': 'pre',
    'pointer-events': 'none',
    ...labelPlacement(p, g),
    'font-family': family,
    'font-size': px(Math.max(1, l.size)),
    'font-weight': labelWeight(l),
    'font-style': 'normal',
    'line-height': 1.2,
    'letter-spacing': 'normal',
    color: safeCssColor(l.color),
    'text-shadow':
      l.stroke && l.strokeWidth > 0
        ? strokeShadow8(l.strokeWidth, safeCssColor(l.strokeColor))
        : 'none',
    'background-color': l.bar ? barBackground(l) : 'transparent',
    padding: pad,
    'border-radius': l.bar && l.barRadius > 0 ? px(l.barRadius) : 0,
  };
}

/** 一組「人 × 預設集」的 CSS */
export function buildTachieCss(input: TachieCssInput): string {
  const { user, preset: p } = input;
  if (!user) return `${cssComment(S.css.noUser)}\n`;

  const g = geometry(p, input.image ? input.natural : null);
  const who = userLabel(user);
  const text = input.nameOverride ?? nameText(user);
  const showName = p.label.show && !!text;
  const fx = {
    bounce: p.bounce && p.bounceHeight > 0,
    glow: p.glow,
    blink: p.blink,
  };
  const anyFx = fx.bounce || fx.glow || fx.blink;
  const avatar = streamkitUserAvatar(user.id);
  const speaking = streamkitUserSpeaking(user.id);
  const font = { ...p.label.font, weight: labelWeight(p.label) };

  const css = createCssSheet({ animated: ['transform', 'filter', 'opacity'] });
  const fxList = [
    fx.bounce ? S.css.bounce(p.bounceHeight) : null,
    fx.glow ? S.css.glow(glowW(p)) : null,
    fx.blink ? S.css.blink : null,
  ].filter((v): v is string => !!v);
  const obsFeatures = [
    anyFx ? '說話偵測' : null,
    p.dim ? '安靜時變暗' : null,
    p.hideAway ? '不在頻道時隱藏' : null,
  ].filter((v): v is string => !!v);
  css.header({
    title: S.css.title(who, input.presetLabel ?? (p.name.trim() || '未命名')),
    toolName: S.toolName,
    exampleUrl: S.css.exampleUrl,
    urlNote: S.css.urlNote,
    size: { ...SOURCE_SIZE, note: S.css.sizeNote },
    obs: obsFeatures.length ? { version: 31, features: obsFeatures } : null,
    localFonts: showName ? localFontNames([font]) : [],
    notes: [S.css.oneSource],
  });
  if (showName) for (const u of googleFontUrls([font])) css.import(u);

  css.rule('html, body', {
    margin: 0,
    padding: 0,
    background: 'transparent',
    overflow: 'hidden',
  });
  css.comment(S.css.hideStreamkit);
  css.rule(STREAMKIT.container, { display: 'none' });

  /* ---- 立繪 ---- */
  if (input.image) {
    css.comment([
      S.css.layer(who),
      g.sized && g.drawW !== null && g.drawH !== null
        ? S.css.drawSize(Number(num(g.drawW, 2)), g.drawH)
        : S.css.drawFallback,
    ]);
    css.rule('#root', {
      content: cssUrl(input.image),
      display: 'block',
      position: 'fixed',
      'z-index': 1,
      'box-sizing': 'content-box',
      width: g.drawW !== null ? px(g.drawW) : 'auto',
      height: g.drawH !== null ? px(g.drawH) : 'auto',
      'min-width': 0,
      'min-height': 0,
      'max-width': 'none',
      'max-height': 'none',
      padding: 0,
      border: 0,
      background: 'none',
      'box-shadow': 'none',
      'object-fit': 'fill',
      visibility: 'visible',
      ...portraitPosition(p),
    });
  } else {
    css.comment(S.css.noImage);
    css.rule('#root', { display: 'none' });
  }

  /* ---- 說話效果 ---- */
  if (input.image && anyFx) {
    const w = glowW(p);
    const rest: CssDecls = {
      transform: fx.bounce ? 'translateY(0)' : undefined,
      filter: fx.glow ? glowFilter(p.glowColor, w, w) : undefined,
      opacity: fx.blink ? 1 : undefined,
    };
    const peak: CssDecls = {
      transform: fx.bounce ? `translateY(${px(-p.bounceHeight)})` : undefined,
      filter: fx.glow ? glowFilter(p.glowColor, w, 4 * w) : undefined,
      opacity: fx.blink ? 0.35 : undefined,
    };
    css.comment(S.css.effects(fxList.join('、'), Math.round(p.period)));
    const name = css.keyframes(TALK_ANIMATION, { '0%, 100%': rest, '50%': peak });
    css.rule(`#root:has(${speaking})`, {
      animation: `${name} ${num(Math.max(1, p.period), 0)}ms ease-in-out infinite`,
    });
  }

  /* ---- 安靜時變暗 ---- */
  if (input.image && p.dim) {
    css.comment(S.css.dim);
    css.rule(`#root:not(:has(${speaking}))`, { filter: 'brightness(0.5)' });
  }

  /* ---- 不在頻道時隱藏 ---- */
  if (p.hideAway) {
    css.comment(showName ? S.css.hideWithName : S.css.hide);
    const sels = [
      input.image ? `#root:not(:has(${avatar}))` : null,
      showName ? `body:not(:has(${avatar}))::after` : null,
    ].filter((v): v is string => !!v);
    if (sels.length) css.rule(sels, { display: 'none' });
  }

  /* ---- 名字 ---- */
  if (showName) {
    css.comment(
      [
        S.css.name(text),
        g.baseW !== null
          ? g.baseFromActual
            ? S.css.nameBaseActual(Number(num(g.baseW, 2)))
            : S.css.nameBase(Number(num(g.baseW, 2)))
          : null,
      ].filter((v): v is string => !!v),
    );
    /* 不提高權重：「不在頻道時隱藏」的規則要蓋得過這條（名字沒有動畫，位移不必讓給動畫） */
    css.rule('body::after', labelDecls(p, g, text), { noBoost: true });
  }
  return css.toString();
}

/** 對齊有沒有寫進輸出（F59 的警告用） */
export function cssAlignLost(p: Preset, image: string | null, natural: Size | null): boolean {
  return alignLost(p, geometry(p, image ? natural : null));
}
