/**
 * 狀態條的 CSS 產生：設定＋預覽對象（範例或角色）→ 貼進 OBS 瀏覽器來源「自訂 CSS」欄的 CSS。
 *
 * 做法（外觀依規格 3.3；選擇器一律來自 @/ccfolia）：
 * - #root 縮成剛好包住內容（width: max-content），外距＝外側留白＋整體外框伸出的量；量測與 OBS 來源大小一致。
 * - 外層 div 是背景面板與名稱的容器（flex），一個角色的列放頭像與條群，條群（div[variant="bar"]）依排列方向排。
 * - 每一條是 CSS grid：文字層 display: contents，讓標籤、數值與條本體、符號／道具（::before／::after）一起排欄。
 * - 條本體不裁切（陰影、外圈光暈、危急脈動用 filter: drop-shadow 畫在它上面）；底槽、填充、覆蓋層（::before）各自用
 *   同一個以 px 座標寫成的輪廓 path() 裁切，所以填充的右端是被輪廓切的，不是另一個小膠囊。
 * - 危急、歸零、裂痕、道具用「填充 style 的寬度字串」判斷（:has()，OBS 31 以上）；階段規則用 :where() 讓權重一致，
 *   門檻由高到低排列、後面的蓋過前面。損壞階段的閃光每一階段用不同的動畫名稱，階段一變就重播。
 */
import {
  barHasFill,
  barPartPath,
  barPartSelector,
  barSelector,
  barsAfterSelector,
  CHARACTER_PAGE,
  exampleCharacterUrl,
  FILL_ZERO,
  fillBelowWhere,
  OBS,
} from '@/ccfolia';
import {
  type CssDecls,
  type CssFont,
  type CssSheet,
  cornerBrackets,
  createCssSheet,
  cssComment,
  cssFontWeight,
  cssPropName,
  cssString,
  darken,
  em,
  fontStack,
  googleFontUrls,
  lighten,
  localFontNames,
  noiseDataUri,
  num,
  px,
  rgba,
  sec,
  singleLine,
  textOutline,
  texture,
  textureDecls,
} from '@/core/css';
import {
  crackImpacts,
  ITEM_STATES,
  impactSvg,
  itemSpriteSvg,
  outlineSvg,
  rgbaAlpha,
  solidHex,
  svgUri,
  symbolSvg,
} from './art';
import {
  type BarGeometry,
  type Box,
  barGeometry,
  frameBoxInset,
  groupBox,
  itemsActive,
  nameShown,
  rootMargin,
  rowContentBox,
  segmentWidth,
  shapePath,
  symbolsActive,
} from './geometry';
import { type FillKind, MAX_BARS, type Settings } from './settings';

/** 預覽／匯出的對象 */
export interface CssTarget {
  /** 名稱（範例名稱或角色名稱；空白時不顯示） */
  name: string;
  /** 角色顏色（範例時傳名稱強調色） */
  color: string;
  /** 瀏覽器來源網址；沒有時 null（開頭說明寫範例網址） */
  url: string | null;
  /** 是不是範例（開頭說明的來源大小附註「名稱最多 10 個字」） */
  example: boolean;
}

export interface CssBuildOptions {
  /** 來源大小（寫進開頭說明；預覽用的 CSS 不寫） */
  size?: Box | null;
  /** 最後套用的範本名稱 */
  templateName?: string | null;
}

/** 會被 keyframes 改動的屬性：不加 !important（否則動畫失效），改以提高權重蓋過 CCFOLIA 的樣式 */
export const ANIMATED_PROPS = ['filter', 'opacity', 'transform', 'background-position'] as const;

const P = CHARACTER_PAGE;
const BAR = barSelector();

const ANIMATED = new Set<string>(ANIMATED_PROPS);

/**
 * 加一條規則，但把「會被動畫改動的屬性」拆成另一條：建構器會替含這些屬性的規則提高權重（多一個 ID），
 * 如果和其他屬性放在一起，整條規則都變高權重，比它更精確的規則（每一條、危急、階段）反而蓋不過它。
 */
function rule(css: CssSheet, selector: string | readonly string[], decls: CssDecls): void {
  const plain: Record<string, CssDecls[string]> = {};
  const animated: Record<string, CssDecls[string]> = {};
  for (const [k, v] of Object.entries(decls))
    (ANIMATED.has(cssPropName(k)) ? animated : plain)[k] = v;
  if (Object.keys(plain).length) css.rule(selector, plain);
  if (Object.keys(animated).length) css.rule(selector, animated);
}
const rel = barPartPath;
const part = barPartSelector;

/** 有用到需要 OBS 31（:has()）的演出 */
export function effectsNeedingObs31(s: Settings): string[] {
  const out: string[] = [];
  if (s.critical.on && s.bars.slice(0, s.barCount).some((b) => b.critical)) out.push('危急演出');
  if (s.zero.on) out.push('歸零演出');
  if (s.cracks.on) out.push('裂痕');
  if (s.items.on) out.push('道具');
  return out;
}

/** 這份 CSS 會用到的字型（只算實際顯示的部分；F107） */
export function usedFonts(s: Settings, target: Pick<CssTarget, 'name'>): CssFont[] {
  const t = s.text;
  const fonts: CssFont[] = [];
  const labelShown = t.showLabel && !(s.textPos === 'inside' && s.insideAlign === 'value');
  if (labelShown) fonts.push({ ...t.labelFont, weight: t.weight });
  if (t.valueMode !== 'none' || (s.avatar.show && s.initiative.show))
    fonts.push({ ...t.valueFont, weight: t.weight });
  if (nameShown(s, singleLine(target.name))) fonts.push({ ...s.name.font, weight: s.name.weight });
  return fonts;
}

/* ---------- 填色 ---------- */

/** 填色方式 → 填充的背景宣告（顏色 1＝c1、顏色 2＝c2；規格 3.3.4） */
export function fillDecls(kind: FillKind, c1: string, c2: string, bodyLen: number): CssDecls {
  switch (kind) {
    case 'solid':
      return { 'background-color': c1, 'background-image': 'none' };
    case 'hgrad':
      return {
        'background-color': c2,
        'background-image': `linear-gradient(to right, ${c2}, ${c1})`,
        'background-size': `${px(bodyLen)} 100%`,
        'background-repeat': 'no-repeat',
      };
    case 'gloss':
      return {
        'background-color': c2,
        'background-image': `linear-gradient(to bottom, ${lighten(c1, 0.4)} 0%, ${c1} 50%, ${c2} 50%, ${c2} 100%)`,
      };
    case 'stripe':
      return {
        'background-color': c1,
        'background-image': `linear-gradient(45deg, ${c1} 25%, ${c2} 25%, ${c2} 50%, ${c1} 50%, ${c1} 75%, ${c2} 75%)`,
        'background-size': '24px 24px',
        'background-repeat': 'repeat',
      };
    case 'neon':
      return {
        'background-color': c1,
        'background-image': `linear-gradient(to bottom, ${c2} 0%, ${c1} 30%, ${lighten(c1, 0.65)} 50%, ${c1} 70%, ${c2} 100%)`,
      };
    default:
      return {
        'background-color': c2,
        'background-image': `linear-gradient(to bottom, ${c1}, ${c2})`,
      };
  }
}

/** 條本體的 filter：陰影＋外圈光暈（沒有時 []） */
function trackFilters(s: Settings, glowColor: string | null): string[] {
  const out: string[] = [];
  if (s.shadow > 0) out.push(`drop-shadow(0 2px 2.5px ${rgba('#000000', s.shadow / 100)})`);
  if (s.glow.on && glowColor)
    out.push(`drop-shadow(0 0 ${px(s.glow.spread / 2)} ${rgba(glowColor, s.glow.strength / 100)})`);
  return out;
}

/* ---------- 一條之內的格線 ---------- */

interface GridPlan {
  columns: string;
  rows: string;
  col: (key: string) => number;
  textRow: number;
  bodyRow: number;
}

function gridPlan(s: Settings, g: BarGeometry): GridPlan {
  const cols: { key: string; w: number }[] = [];
  if (symbolsActive(s)) cols.push({ key: 'lead', w: g.symCol });
  else if (itemsActive(s) && s.items.side === 'left') cols.push({ key: 'lead', w: g.itemsCol });
  if (s.textPos === 'three' || s.textPos === 'two')
    cols.push({ key: 'lab', w: s.labelWidth }, { key: 'g1', w: s.textGap });
  cols.push({ key: 'body', w: g.bodyLen });
  if (s.textPos === 'three')
    cols.push({ key: 'g2', w: s.textGap }, { key: 'val', w: s.valueWidth });
  if (itemsActive(s) && s.items.side === 'right') cols.push({ key: 'trail', w: g.itemsCol });
  let rows = [g.rowH];
  let textRow = 1;
  let bodyRow = 1;
  if ((s.textPos === 'top' || s.textPos === 'bottom') && g.lineH > 0) {
    rows = s.textPos === 'top' ? [g.lineH, s.textGap, g.bodyH] : [g.bodyH, s.textGap, g.lineH];
    textRow = s.textPos === 'top' ? 1 : 3;
    bodyRow = s.textPos === 'top' ? 3 : 1;
  }
  return {
    columns: cols.map((c) => px(c.w)).join(' '),
    rows: rows.map((r) => px(r)).join(' '),
    col: (key) => cols.findIndex((c) => c.key === key) + 1,
    textRow,
    bodyRow,
  };
}

/* ---------- 主函式 ---------- */

export function buildStatusBarCss(
  s: Settings,
  target: CssTarget,
  opts: CssBuildOptions = {},
): string {
  const css = createCssSheet({ animated: ANIMATED_PROPS });
  const g = barGeometry(s);
  const name = singleLine(target.name);
  const showName = nameShown(s, name);
  const count = s.barCount;
  const fonts = usedFonts(s, target);
  const effects = effectsNeedingObs31(s);

  /* F105 開頭說明 */
  css.header({
    title: '狀態條（OBS 瀏覽器來源的自訂 CSS）',
    toolName: '狀態條產生器',
    template: opts.templateName ?? null,
    url: target.url,
    exampleUrl: exampleCharacterUrl(),
    size: opts.size
      ? { ...opts.size, note: target.example ? '名稱最多 10 個字' : undefined }
      : undefined,
    obs: effects.length ? { version: OBS.minVersionForHas, features: effects } : null,
    localFonts: localFontNames(fonts),
    notes: [`CCFOLIA 角色「狀態」由上而下的順序對應第 1、2…條（這份 CSS 設定了 ${count} 條）。`],
  });
  /* F107 字型匯入 */
  for (const u of googleFontUrls(fonts)) css.import(u);

  /* F106 名稱與角色顏色集中在開頭 */
  /* raw：放在 @import 之後（comment() 在第一條規則之前會被當成開頭說明、排到 @import 前面） */
  css.raw(
    cssComment([
      '換角色時只要改下面這兩個值：',
      '--tk-name 是顯示的名稱（前後保留半形雙引號），--tk-color 是角色顏色。',
    ]),
  );
  rule(css, ':root', {
    '--tk-name': cssString(name),
    '--tk-color': solidHex(target.color),
  });

  pageRules(css, s);
  frameRules(css, s);
  if (showName) nameRules(css, s, g);
  avatarRules(css, s);
  groupRules(css, s, g);
  barRules(css, s, g);
  const upto = s.hideExtra ? count : MAX_BARS;
  for (let n = 1; n <= upto; n++) perBarRules(css, s, g, n);
  if (s.hideExtra) rule(css, barsAfterSelector(count), { display: 'none' });
  redRules(css, s);
  criticalRules(css, s, g);
  zeroRules(css, s);
  crackRules(css, s, g);
  itemRules(css, s, g);
  bracketRules(css, s);
  return css.toString();
}

/* ---------- F108 頁面清理、整體 ---------- */

function pageRules(css: CssSheet, s: Settings): void {
  rule(css, 'html, body', {
    'background-color': 'transparent',
    'background-image': 'none',
    overflow: 'hidden',
    height: 'auto',
    'min-height': 0,
    margin: 0,
    padding: 0,
  });
  rule(css, P.snackbar, { display: 'none' });
  rule(css, P.root, {
    position: 'relative',
    display: 'block',
    width: 'max-content',
    height: 'auto',
    'min-height': 0,
    margin: px(rootMargin(s)),
    padding: 0,
  });
  /* 外層：背景面板＋名稱的容器 */
  const left = nameLeft(s);
  const wrap: Record<string, string | number> = {
    display: 'flex',
    'flex-direction': left ? 'row' : 'column',
    'align-items': left ? 'center' : 'stretch',
    position: 'relative',
    'box-sizing': 'content-box',
    margin: 0,
  };
  const pn = s.panel;
  if (pn.on) {
    const p = pn.padding;
    Object.assign(wrap, {
      padding: `${px(p)} ${px(p)} ${px(p)} ${px(p + (pn.strip ? 4 : 0))}`,
      'background-color': rgba(pn.color),
      'background-image': 'none',
      border:
        pn.borderWidth > 0
          ? `${px(pn.borderWidth)} solid ${rgba(pn.borderColor, pn.borderOpacity / 100)}`
          : 0,
      'border-radius': px(pn.radius),
      'box-shadow': pn.strip ? 'inset 4px 0 0 var(--tk-color)' : 'none',
    });
    const tex =
      pn.texture === 'paper'
        ? texture('paper', { vignette: 0.3 })
        : pn.texture === 'grain'
          ? texture('grain', { grain: 0.4 })
          : null;
    Object.assign(wrap, textureDecls(tex));
  } else {
    Object.assign(wrap, {
      padding: 0,
      'background-color': 'transparent',
      'background-image': 'none',
      border: 0,
      'border-radius': 0,
      'box-shadow': 'none',
    });
  }
  rule(css, P.wrapper, wrap);
}

const nameLeft = (s: Settings) => s.name.pos === 'left';

/* ---------- F76 整體外框 ---------- */

function frameRules(css: CssSheet, s: Settings): void {
  const f = s.frame;
  if (!f.on) return;
  const color = f.useChar ? 'var(--tk-color)' : solidHex(f.color);
  const w = f.width;
  const decls: Record<string, string | number> = {
    content: '""',
    position: 'absolute',
    inset: px(-(f.gap + frameBoxInset(s))),
    'box-sizing': 'border-box',
    'pointer-events': 'none',
    'z-index': 5,
    opacity: num(f.opacity / 100, 2),
  };
  const radius = px(f.radius);
  switch (f.kind) {
    case 'double':
      Object.assign(decls, {
        border: `${px(Math.max(3, 3 * w))} double ${color}`,
        'border-radius': radius,
      });
      break;
    case 'dashed':
      Object.assign(decls, { border: `${px(w)} dashed ${color}`, 'border-radius': radius });
      break;
    case 'glow':
      Object.assign(decls, {
        border: `${px(w)} solid ${color}`,
        'border-radius': radius,
        'box-shadow': `0 0 ${px(5 * w)} ${color}, inset 0 0 ${px(4 * w)} ${color}`,
      });
      break;
    case 'corners':
      Object.assign(decls, {
        background: cornerBrackets({ length: f.corner, thickness: w, color }),
      });
      break;
    case 'thin':
      Object.assign(decls, {
        border: `${px(w / 2)} solid ${color}`,
        background: cornerBrackets({ length: f.corner, thickness: 2 * w, color }),
      });
      break;
    default:
      Object.assign(decls, { border: `${px(w)} solid ${color}`, 'border-radius': radius });
  }
  rule(css, `${P.root}::before`, decls);
}

/* ---------- F53～F61 角色名稱 ---------- */

function nameRules(css: CssSheet, s: Settings, g: BarGeometry): void {
  const n = s.name;
  const accent = n.accentUseChar ? 'var(--tk-color)' : solidHex(n.accent);
  const outline = textOutline(s.text.outline, s.text.outlineColor, {
    width: s.text.outlineWidth,
  });
  const softDown = s.text.outline === 'none' ? 'none' : `0 1px 2px ${rgba('#000000', 0.45)}`;
  const base: Record<string, string | number> = {
    content: 'var(--tk-name)',
    display: 'block',
    'box-sizing': 'border-box',
    'font-family': fontStack(n.font),
    'font-weight': cssFontWeight({ ...n.font, weight: n.weight }),
    'font-size': px(n.size),
    'font-style': 'normal',
    'line-height': 1.3,
    'letter-spacing': '0.04em',
    'font-feature-settings': '"palt"',
    color: n.color,
    margin: 0,
    flex: 'none',
    'text-align': n.align,
  };
  /* 外觀（規格 3.3.7） */
  const bw = s.border.width;
  const plateBorder =
    bw > 0
      ? `${px(s.border.double ? Math.max(3, 3 * bw) : bw)} ${s.border.double ? 'double' : 'solid'} ${rgba(s.border.color)}`
      : 0;
  const plateRadius =
    s.shape === 'pill' ? '999px' : s.shape === 'round' ? px(Math.min(12, s.radius)) : 0;
  const look: Record<string, string | number> = {};
  switch (n.look) {
    case 'plate':
      Object.assign(look, {
        'background-color': rgba(n.background),
        padding: '0.4em 0.7em',
        border: plateBorder,
        'border-radius': plateRadius,
        'text-shadow': softDown,
      });
      break;
    case 'text':
      Object.assign(look, { 'text-shadow': outline, padding: 0 });
      break;
    case 'underline':
      Object.assign(look, {
        padding: '0 0.1em 0.25em',
        'border-bottom': `2px solid ${accent}`,
        'text-shadow': outline,
      });
      break;
    case 'side':
      Object.assign(look, {
        'background-color': rgba(n.background),
        'border-left': `4px solid ${accent}`,
        padding: '0.35em 0.7em',
        'text-shadow': softDown,
      });
      break;
    case 'tab':
      Object.assign(look, {
        'background-color': accent,
        'border-radius': '0.45em 0.45em 0 0',
        padding: '0.3em 0.9em',
        'text-shadow': softDown,
      });
      break;
    case 'badge':
      Object.assign(look, {
        'background-color': accent,
        'border-radius': '999px',
        padding: '0.25em 0.9em',
        'text-shadow': softDown,
      });
      break;
  }
  const hug = n.look === 'tab' || n.look === 'badge';
  const selfAlign =
    n.align === 'center' ? 'center' : n.align === 'right' ? 'flex-end' : 'flex-start';

  if (n.pos === 'avatar') {
    const t = s.avatar.borderWidth;
    const r = Math.max(0, s.avatar.radius - t);
    const fade =
      n.look === 'text' || n.look === 'underline'
        ? {
            'background-color': 'transparent',
            'background-image': `linear-gradient(to bottom, ${rgba(n.background, 0)}, ${rgba(solidHex(n.background), Math.max(0.6, rgbaAlpha(n.background)))})`,
            'padding-top': '0.9em',
          }
        : {};
    rule(css, `${P.avatar}::after`, {
      ...base,
      ...look,
      ...fade,
      position: 'absolute',
      left: px(t),
      right: px(t),
      bottom: px(t),
      'z-index': 2,
      'text-align': 'center',
      'border-radius': `0 0 ${px(r)} ${px(r)}`,
      ...(n.overflow === 'wrap'
        ? { 'white-space': 'normal', 'word-break': 'break-all', 'overflow-wrap': 'anywhere' }
        : {
            'white-space': 'nowrap',
            overflow: 'hidden',
            'text-overflow': n.overflow === 'ellipsis' ? 'ellipsis' : 'clip',
          }),
    });
    return;
  }

  if (n.pos === 'left') {
    const contentH = rowContentBox(s, null, g).height;
    const vertical = n.vertical
      ? {
          'writing-mode': 'vertical-rl',
          'text-orientation': 'mixed',
          /* 直書時高度是行的方向：依內容（換行時最多 max-height），寬度＝行數 */
          height: 'max-content',
          width: 'auto',
          /* 直書用直排的比例字寬 */
          'font-feature-settings': '"vpal"',
          ...(n.verticalWrap
            ? {
                'max-height': px(Math.max(contentH, 3 * n.size)),
                'white-space': 'normal',
                'word-break': 'break-all',
                'overflow-wrap': 'anywhere',
              }
            : { 'white-space': 'nowrap' }),
        }
      : { 'white-space': 'nowrap' };
    rule(css, `${P.wrapper}::before`, {
      ...base,
      ...look,
      ...vertical,
      'margin-right': px(n.gap),
      'align-self': 'center',
    });
    return;
  }

  /* 最上方／最下方／條群上方 */
  const sel =
    n.pos === 'bottom'
      ? `${P.wrapper}::after`
      : n.pos === 'group'
        ? `${P.column}::before`
        : `${P.wrapper}::before`;
  const limit = n.pos === 'group' ? groupBox(s, g).width : rowContentBox(s, null, g).width;
  let size: Record<string, string | number>;
  if (hug)
    size = {
      'align-self': selfAlign,
      width: 'max-content',
      'max-width': n.overflow === 'grow' ? 'none' : px(limit),
    };
  else
    size =
      n.overflow === 'grow'
        ? { 'align-self': 'stretch', width: 'max-content', 'min-width': '100%' }
        : { 'align-self': 'stretch', width: 0, 'min-width': '100%' };
  const wrap =
    n.overflow === 'wrap'
      ? { 'white-space': 'normal', 'word-break': 'break-all', 'overflow-wrap': 'anywhere' }
      : n.overflow === 'ellipsis'
        ? { 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }
        : { 'white-space': 'nowrap' };
  const gap = n.pos === 'bottom' ? { 'margin-top': px(n.gap) } : { 'margin-bottom': px(n.gap) };
  rule(css, sel, { ...base, ...look, ...size, ...wrap, ...gap });
}

/* ---------- F17～F25 頭像與先攻 ---------- */

function avatarRules(css: CssSheet, s: Settings): void {
  const a = s.avatar;
  if (!a.show) {
    rule(css, P.badgeRoot, { display: 'none' });
    return;
  }
  rule(css, P.badgeRoot, {
    display: 'block',
    position: 'relative',
    flex: 'none',
    width: px(a.width),
    height: px(a.height),
    margin: 0,
    padding: 0,
  });
  const t = a.borderWidth;
  rule(css, P.avatar, {
    display: 'block',
    position: 'relative',
    'box-sizing': 'border-box',
    width: px(a.width),
    height: px(a.height),
    margin: 0,
    padding: px(t),
    border: 0,
    'border-radius': px(a.radius),
    'background-color': rgba(a.background),
    overflow: 'hidden',
  });
  if (t > 0)
    rule(css, `${P.avatar}::before`, {
      content: '""',
      position: 'absolute',
      inset: 0,
      'box-sizing': 'border-box',
      border: `${px(t)} solid ${a.borderUseChar ? 'var(--tk-color)' : solidHex(a.borderColor)}`,
      'border-radius': 'inherit',
      opacity: num(rgbaAlpha(a.borderColor), 3),
      'pointer-events': 'none',
      'z-index': 1,
    });
  rule(css, P.avatarMiddle, {
    width: '100%',
    height: '100%',
    margin: 0,
    padding: 0,
    'border-radius': px(Math.max(0, a.radius - t)),
    overflow: 'hidden',
    'background-color': 'transparent',
  });
  rule(css, P.avatarInner, {
    display: 'block',
    width: '100%',
    height: '100%',
    margin: 0,
    'border-radius': 0,
    'background-color': 'transparent',
  });
  rule(css, P.avatarImg, {
    display: 'block',
    width: '100%',
    height: '100%',
    'object-fit': a.fit === 'contain' ? 'contain' : 'cover',
    'object-position': a.fit === 'top' ? 'center top' : 'center center',
  });
  /* 先攻值徽章（規格 3.3.6） */
  const ini = s.initiative;
  if (!ini.show) {
    rule(css, P.badge, { display: 'none' });
    return;
  }
  const S = ini.size;
  const out = px(-0.3 * S);
  const v = ini.corner[0] === 't' ? { top: out, bottom: 'auto' } : { bottom: out, top: 'auto' };
  const h = ini.corner[1] === 'l' ? { left: out, right: 'auto' } : { right: out, left: 'auto' };
  rule(css, P.badge, {
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    position: 'absolute',
    ...v,
    ...h,
    'box-sizing': 'border-box',
    height: px(S),
    'min-width': px(S),
    padding: `0 ${px(0.25 * S)}`,
    'border-radius': px(S / 2),
    'font-family': fontStack(s.text.valueFont),
    'font-weight': cssFontWeight({ ...s.text.valueFont, weight: s.text.weight }),
    'font-size': px(0.58 * S),
    'line-height': 1,
    'font-variant-numeric': 'tabular-nums',
    'white-space': 'nowrap',
    color: ini.color,
    'background-color': ini.background,
    'box-shadow': `0 1px 3px ${rgba('#000000', 0.45)}`,
    transform: 'none',
    transition: 'none',
    'z-index': 3,
  });
  rule(css, `${P.badge}.${P.badgeInvisibleClass}`, { display: 'none' });
}

/* ---------- 列、欄、條群 ---------- */

function groupRules(css: CssSheet, s: Settings, g: BarGeometry): void {
  const a = s.avatar;
  rule(css, P.row, {
    display: 'flex',
    'flex-direction': !a.show
      ? 'row'
      : a.pos === 'top'
        ? 'column'
        : a.pos === 'right'
          ? 'row-reverse'
          : 'row',
    'align-items': a.show && a.pos !== 'top' ? 'center' : 'flex-start',
    'justify-content': a.show && a.pos === 'right' ? 'flex-end' : 'flex-start',
    gap: a.show ? px(a.gap) : 0,
    margin: 0,
    padding: 0,
  });
  rule(css, P.column, {
    display: 'flex',
    'flex-direction': 'column',
    'align-items': 'flex-start',
    flex: 'none',
    'min-width': 0,
    margin: 0,
    padding: 0,
  });
  const common = { margin: 0, padding: 0, 'max-width': 'none', width: 'auto' };
  if (s.direction === 'grid') {
    const c = Math.max(1, Math.min(s.columns, s.barCount));
    rule(css, P.bars, {
      ...common,
      display: 'grid',
      'grid-template-columns': `repeat(${c}, ${px(g.rowW)})`,
      'grid-auto-rows': px(g.rowH),
      gap: px(s.barGap),
    });
  } else {
    rule(css, P.bars, {
      ...common,
      display: 'flex',
      'flex-direction': s.direction === 'horizontal' ? 'row' : 'column',
      'flex-wrap': 'nowrap',
      'align-items': 'flex-start',
      gap: px(s.barGap),
    });
  }
}

/* ---------- 一條（所有條共用的部分） ---------- */

function clipDecls(s: Settings, g: BarGeometry): Record<string, string> {
  const path = shapePath(s.shape, g.bodyLen, g.bodyH, s);
  const segW = segmentWidth(g.bodyLen, s.segments, s.segmentGap);
  const mask =
    segW !== null
      ? `repeating-linear-gradient(to right, #000 0px, #000 ${px(segW, 3)}, transparent ${px(segW, 3)}, transparent ${px(segW + s.segmentGap, 3)})`
      : 'none';
  return { 'clip-path': `path('${path}')`, '-webkit-mask-image': mask, 'mask-image': mask };
}

function barRules(css: CssSheet, s: Settings, g: BarGeometry): void {
  const plan = gridPlan(s, g);
  const t = s.text;
  rule(css, BAR, {
    position: 'relative',
    display: 'grid',
    'box-sizing': 'border-box',
    width: px(g.rowW),
    height: px(g.rowH),
    margin: 0,
    padding: 0,
    flex: 'none',
    'grid-template-columns': plan.columns,
    'grid-template-rows': plan.rows,
    'align-content': 'center',
    'align-items': 'center',
    'justify-items': 'start',
    overflow: 'visible',
  });
  rule(css, part('text'), { display: 'contents' });

  /* 標籤與數值（規格 3.3.2） */
  const shadow = textOutline(t.outline, t.outlineColor, { width: t.outlineWidth });
  const labelShown = t.showLabel && !(s.textPos === 'inside' && s.insideAlign === 'value');
  const textBase = {
    position: 'relative',
    'z-index': 2,
    margin: 0,
    padding: 0,
    'line-height': 1,
    'font-style': 'normal',
    'white-space': 'nowrap',
    overflow: 'visible',
    'text-overflow': 'clip',
    'max-width': 'none',
    'min-width': 0,
    'text-shadow': shadow,
    'letter-spacing': em(t.spacing, 3),
  };
  const body = plan.col('body');
  let labelPlace: Record<string, string | number>;
  let valuePlace: Record<string, string | number>;
  switch (s.textPos) {
    case 'top':
    case 'bottom': {
      const align = s.textPos === 'top' ? 'end' : 'start';
      labelPlace = {
        'grid-column': body,
        'grid-row': plan.textRow,
        'justify-self': 'start',
        'align-self': align,
      };
      valuePlace = {
        'grid-column': body,
        'grid-row': plan.textRow,
        'justify-self': 'end',
        'align-self': align,
      };
      break;
    }
    case 'three':
      labelPlace = {
        'grid-column': plan.col('lab'),
        'grid-row': 1,
        'justify-self': 'start',
        'align-self': 'center',
      };
      valuePlace = {
        'grid-column': plan.col('val'),
        'grid-row': 1,
        'justify-self': 'end',
        'align-self': 'center',
      };
      break;
    case 'two':
      labelPlace = {
        'grid-column': plan.col('lab'),
        'grid-row': 1,
        'justify-self': 'start',
        'align-self': 'center',
      };
      valuePlace = {
        'grid-column': body,
        'grid-row': 1,
        'justify-self': 'end',
        'align-self': 'center',
        'margin-right': px(s.textInset),
      };
      break;
    default:
      labelPlace = {
        'grid-column': body,
        'grid-row': 1,
        'justify-self': 'start',
        'align-self': 'center',
        'margin-left': px(s.textInset),
      };
      valuePlace =
        s.insideAlign === 'split'
          ? {
              'grid-column': body,
              'grid-row': 1,
              'justify-self': 'end',
              'align-self': 'center',
              'margin-right': px(s.textInset),
            }
          : {
              'grid-column': body,
              'grid-row': 1,
              'justify-self': 'center',
              'align-self': 'center',
            };
  }
  rule(css, part('label'), {
    ...textBase,
    ...labelPlace,
    display: labelShown ? 'block' : 'none',
    'font-family': fontStack(t.labelFont),
    'font-weight': cssFontWeight({ ...t.labelFont, weight: t.weight }),
    'font-size': px(t.labelSize),
    color: t.color,
  });
  rule(css, part('value'), {
    ...textBase,
    ...valuePlace,
    display: t.valueMode === 'none' ? 'none' : 'block',
    'font-family': fontStack(t.valueFont),
    'font-weight': cssFontWeight({ ...t.valueFont, weight: t.weight }),
    'font-size': px(t.valueMode === 'both' ? t.maxSize : 0),
    'font-variant-numeric': 'tabular-nums',
    color: rgba(t.maxColor),
  });
  rule(css, part('current'), {
    'font-size': px(t.currentSize),
    'letter-spacing': em(t.spacing, 3),
    'margin-right': t.valueMode === 'both' ? '0.12em' : 0,
    color: t.color,
  });

  /* 條本體：陰影、外圈光暈、危急脈動畫在這一層（不裁切） */
  const filters = trackFilters(s, null);
  rule(css, part('track'), {
    position: 'relative',
    'z-index': 0,
    display: 'block',
    'box-sizing': 'border-box',
    width: px(g.bodyLen),
    height: px(g.bodyH),
    margin: 0,
    padding: 0,
    border: 0,
    'border-radius': 0,
    'background-color': 'transparent',
    'background-image': 'none',
    overflow: 'visible',
    'grid-column': body,
    'grid-row': plan.bodyRow,
    'justify-self': 'start',
    'align-self': 'center',
    filter: filters.length ? filters.join(' ') : 'none',
  });
  const clip = clipDecls(s, g);
  const tr = s.trough;
  rule(css, part('trough'), {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    margin: 0,
    padding: 0,
    border: 0,
    'border-radius': 0,
    opacity: 1,
    ...clip,
    'background-color': tr.kind === 'none' ? 'transparent' : rgba(tr.color),
    'background-image': 'none',
  });
  const stripe = stripeAnimation(css, s);
  rule(css, part('fill'), {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    'min-width': 0,
    'max-width': 'none',
    margin: 0,
    padding: 0,
    border: 0,
    'border-radius': 0,
    overflow: 'hidden',
    ...clip,
    transition: s.speed > 0 ? `width ${sec(s.speed, 2)} cubic-bezier(0, 0, 0.2, 1)` : 'none',
    'background-size': 'auto',
    'background-repeat': 'repeat',
    'background-position': '0 0',
    opacity: 1,
    animation: stripe ? `${stripe} 0.9s linear infinite` : 'none',
  });

  /* 覆蓋層（外框、光澤、掃描線、刻度、顆粒；裂痕另見 crackRules） */
  const layers = overlayLayers(s, g, 0);
  if (layers.images.length || s.cracks.on)
    rule(css, `${part('track')}::before`, {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      'z-index': 1,
      'pointer-events': 'none',
      ...clip,
      ...layerDecls(layers),
    });

  /* F79 前端光線 */
  if (s.lead.on)
    rule(css, `${part('fill')}::after`, {
      content: '""',
      position: 'absolute',
      top: 0,
      right: 0,
      width: '3px',
      height: '100%',
      'background-color': rgba('#ffffff', s.lead.strength / 100),
      'pointer-events': 'none',
    });
  /* F80 流動光線 */
  if (s.sweep.on) {
    const W = Math.max(40, 0.4 * g.bodyLen);
    const kf = css.keyframes('tk-sweep', {
      '0%': { transform: `translateX(${px(-W)})`, 'animation-timing-function': 'ease-in-out' },
      '40%': { transform: `translateX(${px(g.bodyLen)})` },
      '100%': { transform: `translateX(${px(g.bodyLen)})` },
    });
    const a = s.sweep.strength / 100;
    rule(css, `${part('fill')}::before`, {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      width: px(W),
      height: '100%',
      'background-image': `linear-gradient(105deg, ${rgba('#ffffff', 0)} 0%, ${rgba('#ffffff', a)} 50%, ${rgba('#ffffff', 0)} 100%)`,
      transform: `translateX(${px(-W)})`,
      animation: `${kf} ${sec(s.sweep.interval, 2)} linear infinite`,
      'pointer-events': 'none',
    });
  }

  /* F40 符號欄 */
  if (symbolsActive(s))
    rule(css, `${BAR}::before`, {
      content: '""',
      display: 'block',
      width: px(s.symbols.size),
      height: px(s.symbols.size),
      'grid-column': plan.col('lead'),
      'grid-row': '1 / -1',
      'align-self': 'center',
      'justify-self': 'start',
      'background-color': 'transparent',
      '-webkit-mask-image': 'none',
      'mask-image': 'none',
      '-webkit-mask-size': 'contain',
      'mask-size': 'contain',
      '-webkit-mask-repeat': 'no-repeat',
      'mask-repeat': 'no-repeat',
      '-webkit-mask-position': 'center',
      'mask-position': 'center',
      'pointer-events': 'none',
    });
}

function stripeAnimation(css: CssSheet, s: Settings): string | null {
  if (s.fill !== 'stripe' || !s.stripeFlow) return null;
  return css.keyframes('tk-stripe', {
    from: { 'background-position': '0 0' },
    to: { 'background-position': '24px 0' },
  });
}

/* ---------- 覆蓋層的背景圖層（由上而下：外框、裂痕、光澤、掃描線、刻度、顆粒） ---------- */

interface Layers {
  images: string[];
  sizes: string[];
  repeats: string[];
  positions: string[];
}

function overlayLayers(s: Settings, g: BarGeometry, stage: number): Layers {
  const L: Layers = { images: [], sizes: [], repeats: [], positions: [] };
  const add = (img: string, size = '100% 100%', repeat = 'no-repeat', pos = '0 0') => {
    L.images.push(img);
    L.sizes.push(size);
    L.repeats.push(repeat);
    L.positions.push(pos);
  };
  const w = g.bodyLen;
  const h = g.bodyH;
  if (s.border.width > 0) {
    const path = shapePath(s.shape, w, h, s);
    add(
      `url("${svgUri(outlineSvg(path, w, h, s.border.width, s.border.color, s.border.double))}")`,
    );
  }
  for (let k = stage; k >= 1; k--) add(`var(--tk-k${k})`);
  if (s.gloss.on) {
    const a = s.gloss.strength / 100;
    add(
      `linear-gradient(to bottom, ${rgba('#ffffff', a)} 0%, ${rgba('#ffffff', a * 0.35)} 46%, ${rgba('#ffffff', 0)} 50%)`,
    );
  }
  if (s.scanlines.on) {
    const c = rgba('#000000', s.scanlines.strength / 100);
    add(
      `repeating-linear-gradient(to bottom, ${c} 0px, ${c} 1px, transparent 1px, transparent ${px(s.scanlines.period)})`,
    );
  }
  if (s.ticks.on) {
    const p = w / s.ticks.count;
    const c = rgba(s.ticks.color, s.ticks.strength / 100);
    add(
      `repeating-linear-gradient(to right, transparent 0px, transparent ${px(p - 1, 3)}, ${c} ${px(p - 1, 3)}, ${c} ${px(p, 3)})`,
      '100% 40%',
      'no-repeat',
      'left bottom',
    );
  }
  if (s.grain.on)
    add(
      `url("${noiseDataUri({ tile: 100, opacity: s.grain.strength / 100, seed: 3, frequency: 0.9 })}")`,
      '100px 100px',
      'repeat',
    );
  return L;
}

function layerDecls(L: Layers): Record<string, string> {
  if (!L.images.length) return { 'background-image': 'none' };
  return {
    'background-image': L.images.join(', '),
    'background-size': L.sizes.join(', '),
    'background-repeat': L.repeats.join(', '),
    'background-position': L.positions.join(', '),
  };
}

/* ---------- 每一條自己的顏色、符號、名稱覆寫 ---------- */

function perBarRules(css: CssSheet, s: Settings, g: BarGeometry, n: number): void {
  const b = s.bars[n - 1];
  const c1 = b.color1;
  const c2 = b.color2;
  rule(css, part('fill', n), fillDecls(s.fill, c1, c2, g.bodyLen));
  if (s.trough.kind === 'mix') {
    const m = rgba(c1, s.trough.mix / 100);
    rule(css, part('trough', n), { 'background-image': `linear-gradient(${m}, ${m})` });
  }
  if (s.glow.on) rule(css, part('track', n), { filter: trackFilters(s, c1).join(' ') });
  if (s.lead.on)
    rule(css, `${part('fill', n)}::after`, {
      'box-shadow': `-2px 0 6px ${rgba(lighten(c1, 0.5), s.lead.strength / 100)}`,
    });
  if (s.text.labelBarColor) rule(css, part('label', n), { color: c1 });
  if (symbolsActive(s) && b.symbol !== 'none') {
    const url = `url("${svgUri(symbolSvg(b.symbol))}")`;
    rule(css, `${barSelector(n)}::before`, {
      'background-color': c1,
      '-webkit-mask-image': url,
      'mask-image': url,
    });
  }
  if (n <= s.barCount && b.label.trim()) {
    rule(css, part('label', n), { 'font-size': 0, 'letter-spacing': 0 });
    rule(css, `${part('label', n)}::before`, {
      content: cssString(singleLine(b.label)),
      'font-size': px(s.text.labelSize),
      'letter-spacing': em(s.text.spacing, 3),
    });
  }
}

/* ---------- F62 紅字 ---------- */

const BLINK = { '0%': { opacity: 1 }, '50%': { opacity: 0.25 }, '100%': { opacity: 0.25 } };

function redRules(css: CssSheet, s: Settings): void {
  if (!s.red.on) return;
  const sel = `${part('current')}[${P.currentColorAttr}="${P.redAttrValue}"]`;
  const decls: Record<string, string> = { color: s.red.color };
  if (s.red.blink) decls.animation = `${css.keyframes('tk-blink', BLINK)} 1.2s step-end infinite`;
  rule(css, sel, decls);
}

/* ---------- F63～F69 危急 ---------- */

/** 條數以內、勾了危急的條 → `:nth-child(…)` 片段；沒有時 null */
function criticalNth(s: Settings): { nth: string; list: number[] } | null {
  const list: number[] = [];
  for (let n = 1; n <= s.barCount; n++) if (s.bars[n - 1].critical) list.push(n);
  if (!list.length) return null;
  const nth =
    list.length === s.barCount
      ? `:nth-child(-n + ${s.barCount})`
      : list.length === 1
        ? `:nth-child(${list[0]})`
        : `:is(${list.map((n) => `:nth-child(${n})`).join(', ')})`;
  return { nth, list };
}

function criticalRules(css: CssSheet, s: Settings, g: BarGeometry): void {
  const c = s.critical;
  if (!c.on) return;
  const target = criticalNth(s);
  const cond = fillBelowWhere(c.threshold);
  if (!target || !cond) return;
  const has = barHasFill(cond);
  const cb = `${BAR}${target.nth}${has}`;
  const crit = c.color;
  const critDark = darken(crit, 0.45);

  if (c.barColor) {
    rule(css, `${cb} ${rel('fill')}`, fillDecls(s.fill, crit, critDark, g.bodyLen));
    if (s.trough.kind === 'mix') {
      const m = rgba(crit, s.trough.mix / 100);
      rule(css, `${cb} ${rel('trough')}`, { 'background-image': `linear-gradient(${m}, ${m})` });
    }
    if (symbolsActive(s)) rule(css, `${cb}::before`, { 'background-color': crit });
    if (s.text.labelBarColor) rule(css, `${cb} ${rel('label')}`, { color: crit });
    if (s.glow.on) rule(css, `${cb} ${rel('track')}`, { filter: trackFilters(s, crit).join(' ') });
    if (s.lead.on)
      rule(css, `${cb} ${rel('fill')}::after`, {
        'box-shadow': `-2px 0 6px ${rgba(lighten(crit, 0.5), s.lead.strength / 100)}`,
      });
  }
  if (c.valueColor)
    rule(css, [`${cb} ${rel('value')}`, `${cb} ${rel('current')}`], { color: crit });

  /* F65 脈動發光：兩端是平常的樣子（陰影、外圈光暈照樣在），中點加上危急色光暈並變亮 */
  if (c.pulse) {
    const groups = new Map<string, number[]>();
    for (const n of target.list) {
      const glowColor = s.glow.on ? (c.barColor ? crit : s.bars[n - 1].color1) : null;
      const base = trackFilters(s, glowColor);
      const name = css.keyframes('tk-pulse', {
        '0%, 100%': {
          filter: [...base, `drop-shadow(0 0 0 ${rgba(crit, 0)})`, 'brightness(1)'].join(' '),
        },
        '50%': {
          filter: [...base, `drop-shadow(0 0 6px ${rgba(crit, 0.95)})`, 'brightness(1.3)'].join(
            ' ',
          ),
        },
      });
      groups.set(name, [...(groups.get(name) ?? []), n]);
    }
    for (const [name, list] of groups) {
      const nth =
        list.length === target.list.length
          ? target.nth
          : list.length === 1
            ? `:nth-child(${list[0]})`
            : `:is(${list.map((n) => `:nth-child(${n})`).join(', ')})`;
      rule(css, `${BAR}${nth}${has} ${rel('track')}`, {
        animation: `${name} 1.1s ease-in-out infinite`,
      });
    }
  }
  /* F66 填充閃爍（斜紋流動照常） */
  if (c.blink) {
    const blink = css.keyframes('tk-blink', BLINK);
    const stripe = stripeAnimation(css, s);
    rule(css, `${cb} ${rel('fill')}`, {
      animation: `${stripe ? `${stripe} 0.9s linear infinite, ` : ''}${blink} 0.9s step-end infinite`,
    });
  }
  /* F67 震動 */
  if (c.shake) {
    const shake = css.keyframes('tk-shake', {
      '0%': { transform: 'translate(0, 0)' },
      '25%': { transform: 'translate(-1.5px, 0.5px)' },
      '50%': { transform: 'translate(1.5px, -0.5px)' },
      '75%': { transform: 'translate(-1px, -0.5px)' },
      '100%': { transform: 'translate(0, 0)' },
    });
    rule(css, cb, { animation: `${shake} 0.35s linear infinite` });
  }
}

/* ---------- F70 歸零 ---------- */

const withinCount = (s: Settings) => `${BAR}:nth-child(-n + ${s.barCount})`;

function zeroRules(css: CssSheet, s: Settings): void {
  const z = s.zero;
  if (!z.on || (!z.gray && !z.blink)) return;
  const zb = `${withinCount(s)}${barHasFill(`:where(${FILL_ZERO})`)}`;
  if (z.gray) rule(css, zb, { filter: 'grayscale(1) brightness(0.8)' });
  if (z.blink) {
    const blink = css.keyframes('tk-blink', BLINK);
    rule(css, [`${zb} ${rel('label')}`, `${zb} ${rel('value')}`], {
      animation: `${blink} 1s step-end infinite`,
    });
  }
}

/* ---------- F71 裂痕、F74 損壞瞬間發光 ---------- */

/** 裂痕的階段：剩餘比例 < 75%、< 50%、< 25%、＝ 0% */
export const CRACK_STAGES = [75, 50, 25, 0] as const;

const HIT = {
  from: { filter: `brightness(1.6) drop-shadow(0 0 3px ${rgba('#ffffff', 0.9)})` },
  to: { filter: 'none' },
};

function crackRules(css: CssSheet, s: Settings, g: BarGeometry): void {
  if (!s.cracks.on) return;
  const w = g.bodyLen;
  const h = g.bodyH;
  for (let n = 1; n <= s.barCount; n++) {
    const impacts = crackImpacts(n, w, h);
    const decls: Record<string, string> = {};
    impacts.forEach((im, i) => {
      decls[`--tk-k${i + 1}`] =
        `url("${svgUri(impactSvg(im, w, h, s.cracks.color, s.cracks.opacity, i === 3))}")`;
    });
    rule(css, barSelector(n), decls);
  }
  const flash = s.damageFlash;
  const bars = withinCount(s);
  const overlay = `${rel('track')}::before`;
  if (flash)
    rule(css, `${bars} ${overlay}`, {
      animation: `${css.keyframes('tk-hit-0', HIT)} 0.6s cubic-bezier(0, 0, 0.2, 1) both`,
    });
  CRACK_STAGES.forEach((t, i) => {
    const stage = i + 1;
    const cond = t === 0 ? `:where(${FILL_ZERO})` : fillBelowWhere(t);
    if (!cond) return;
    const decls: Record<string, string> = layerDecls(overlayLayers(s, g, stage));
    if (flash)
      decls.animation = `${css.keyframes(`tk-hit-${stage}`, HIT)} 0.6s cubic-bezier(0, 0, 0.2, 1) both`;
    rule(css, `${bars}${barHasFill(cond)} ${overlay}`, decls);
  });
}

/* ---------- F72、F73 道具 ---------- */

/**
 * 道具的損壞階段：剩下的「四分之一段」數 q（0～4n）。由左數第 j 個道具（1 起算）負責剩餘比例 (j−1)/n～j/n，
 * 段內剩 r＝clamp(q − 4(j−1), 0, 4) 個四分之一：4 完好、3～1 損壞 1～3 級、0 毀壞。
 * q＝k 的條件：剩餘比例 ≤ 100k ÷ 4n %（整數門檻含等於；不是整數時 < 無條件進位後的整數）。
 */
export function itemStageThresholds(count: number): { q: number; threshold: number }[] {
  const out: { q: number; threshold: number }[] = [];
  for (let k = 4 * count - 1; k >= 0; k--) out.push({ q: k, threshold: (100 * k) / (4 * count) });
  return out;
}

const POP = {
  from: { transform: 'scale(1.3)', filter: 'brightness(1.8)' },
  to: { transform: 'none', filter: 'none' },
};

function itemRules(css: CssSheet, s: Settings, g: BarGeometry): void {
  if (!itemsActive(s)) return;
  const it = s.items;
  const plan = gridPlan(s, g);
  const S = it.size;
  const N = it.count;
  const pseudo = it.side === 'left' ? '::before' : '::after';
  const bars = withinCount(s);
  const images = Array.from({ length: N }, () => 'var(--tk-items, none)');
  const positions = Array.from(
    { length: N },
    (_, j) => `${px(j * (S + it.gap))} calc((clamp(0, var(--tk-q) - ${4 * j}, 4) - 4) * ${px(S)})`,
  );
  const flash = s.damageFlash;
  rule(css, `${bars}${pseudo}`, {
    content: '""',
    display: 'block',
    width: px(g.itemsW),
    height: px(S),
    'grid-column': it.side === 'left' ? plan.col('lead') : plan.col('trail'),
    'grid-row': '1 / -1',
    'align-self': 'center',
    'justify-self': it.side === 'left' ? 'start' : 'end',
    '--tk-q': 4 * N,
    'background-image': images.join(', '),
    'background-size': Array.from({ length: N }, () => `${px(S)} ${px(S * ITEM_STATES)}`).join(
      ', ',
    ),
    'background-repeat': 'no-repeat',
    'background-position': positions.join(', '),
    'transform-origin': 'center',
    'pointer-events': 'none',
    animation: flash
      ? `${css.keyframes('tk-pop-full', POP)} 0.5s cubic-bezier(0, 0, 0.2, 1) both`
      : 'none',
  });
  for (let n = 1; n <= s.barCount; n++) {
    const b = s.bars[n - 1];
    if (b.item === 'none') continue;
    rule(css, barSelector(n), {
      '--tk-items': `url("${svgUri(itemSpriteSvg(b.item, b.color1, b.color2))}")`,
    });
  }
  for (const { q, threshold } of itemStageThresholds(N)) {
    const cond = q === 0 ? `:where(${FILL_ZERO})` : fillBelowWhere(threshold, true);
    if (!cond) continue;
    const decls: Record<string, string | number> = { '--tk-q': q };
    if (flash)
      decls.animation = `${css.keyframes(`tk-pop-${q}`, POP)} 0.5s cubic-bezier(0, 0, 0.2, 1) both`;
    rule(css, `${bars}${barHasFill(cond)}${pseudo}`, decls);
  }
}

/* ---------- F84 角落括號 ---------- */

function bracketRules(css: CssSheet, s: Settings): void {
  const b = s.brackets;
  if (!b.on) return;
  const pseudo = itemsActive(s) && s.items.side === 'right' ? '::before' : '::after';
  rule(css, `${BAR}${pseudo}`, {
    content: '""',
    position: 'absolute',
    inset: px(-b.gap),
    'pointer-events': 'none',
    'z-index': 3,
    background: cornerBrackets({
      length: b.length,
      thickness: b.width,
      color: rgba(b.color, b.strength / 100),
    }),
  });
}
