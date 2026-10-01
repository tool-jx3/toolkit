/**
 * 訊息框的自訂 CSS 產生器（純函式）：設定 → 貼進 OBS 瀏覽器來源「自訂 CSS」欄的文字。
 *
 * 外觀依 message-box 規格 3.3 的量測描述；選擇器、結果配色 class、網址一律從 @/ccfolia 取，
 * 規則的優先順序（!important、動畫屬性、:has() 隔離）交給 @/core/css 的 CssSheet。
 *
 * 重點（規格第 5 節）：
 * - 房間畫面用「看不見」（visibility）而不是拿掉；訊息框根元素只在 style 屬性沒有 visibility: hidden 時才設成可見，
 *   CCFOLIA 按關閉後寫進去的隱藏才會生效。
 * - 訊息框改成以來源（視窗）為基準的固定定位；「原位出現」壓掉 CCFOLIA 寫在 style 屬性上的滑動位移。
 * - 方框、根元素原本的底色、陰影與深色模式的白色疊層都清掉。
 * - 窄來源（< 900 px）時 CCFOLIA 會縮小立繪與骰子圖：一律寫回設定的大小。
 * - 內文區上內距以上的部分裁掉，長文往上捲時不會跑進內距或名牌底下。
 */
import {
  DICE_RESULT_CLASS,
  type DiceOutcome,
  exampleRoomUrl,
  MESSAGE_BOX,
  roomUrlFrom,
} from '@/ccfolia';
import {
  type CssDecls,
  cornerBrackets,
  createCssSheet,
  cssComment,
  cssFontWeight,
  fontStack,
  googleFontUrls,
  localFontNames,
  num,
  px,
  rgba,
  textOutline,
  texture,
  textureDecls,
  yiqTextColor,
} from '@/core/css';
import {
  isPlate,
  type MbFont,
  type MbSettings,
  plateSink,
  textAreaHeight,
  usedFonts,
} from './settings';
import { templateById } from './templates';

/** 規格裡的固定外觀（量測值） */
export const LOOK = Object.freeze({
  /** 方框陰影：向下 4 px、模糊 18 px 的黑色 */
  shadowY: 4,
  shadowBlur: 18,
  /** 四角括號每邊長 */
  bracketLength: 18,
  /** 名稱、結果的行高與字距（em） */
  nameLineHeight: 1.35,
  nameLetterSpacing: 0.04,
  resultLetterSpacing: 0.02,
  /** 結果接在名稱後的間隔（em） */
  resultGap: 0.8,
  /** 細外框／色帶：外框粗細、底色濃度、圓角、內距（上下、左、右，em） */
  chipBorder: 1.5,
  chipTint: 0.12,
  chipRadius: 5,
  chipPad: { y: 0.23, left: 0.5, right: 0.7 },
  /** 名牌：內距（em）、名牌與結果的間隔、陰影 */
  platePad: { top: 0.28, bottom: 0.3, x: 0.95 },
  plateGapPx: 8,
  plateShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
  /** 按鈕：內距、圖示大小（一個約 34 × 34） */
  buttonPad: 6,
  buttonIcon: 22,
  buttonHoverBg: 'rgba(0, 0, 0, 0.7)',
  /** 骰子圖：離方框上緣（名牌模式改為名稱字級的倍數）、離側邊 */
  diceGap: 4,
  diceGapPlate: 1.9,
  diceSideInset: 16,
});

export const CSS_TITLE = 'CCFOLIA 訊息框（OBS 瀏覽器來源的自訂 CSS）';
export const CSS_TOOL_NAME = '訊息框產生器';

const M = MESSAGE_BOX;
/** 根元素「沒有被 CCFOLIA 關閉」（style 屬性裡沒有 visibility: hidden） */
const OPEN_ROOT = `${M.root}:not([style*="${M.hiddenStyle}"]):not([style*="visibility:hidden"])`;
/** 滑鼠在頁面上（OBS 的「互動」視窗） */
const HOVER = 'html:hover';

/** 骰子結果的配色選擇器 */
export const resultSelector = (o: DiceOutcome): string => `${M.result}.${DICE_RESULT_CLASS[o]}`;

/** calc(基準 ± n px)；n 為 0 時只有基準 */
export const calcPx = (base: string, delta: number): string =>
  Math.abs(delta) < 0.005 ? base : `calc(${base} ${delta < 0 ? '-' : '+'} ${px(Math.abs(delta))})`;

const outcomeColor = (s: MbSettings, o: DiceOutcome): string =>
  o === 'success' ? s.colorSuccess : o === 'failure' ? s.colorFailure : s.colorOther;

function fontDecls(font: MbFont, size: number): CssDecls {
  return {
    'font-family': fontStack(font),
    'font-weight': cssFontWeight(font),
    'font-size': px(size),
    'font-style': 'normal',
  };
}

/** 文字外框線（F38）的 text-shadow 值 */
export const outlineShadow = (s: MbSettings): string =>
  textOutline(s.outline, s.outlineColor, { opacity: s.outlineOpacity, width: s.outlineWidth });

/** 標題列（名稱、結果、按鈕那一行）在方框裡占位的情況 */
export type ToolbarMode = 'inside' | 'plate' | 'buttons-only' | 'hidden';

/**
 * - inside：名稱或結果在方框內的標題列；
 * - plate：名稱（與結果）在方框上緣外的名牌；
 * - buttons-only：名稱、結果都關閉，按鈕一直顯示（標題列只有按鈕）；
 * - hidden：名稱、結果都關閉，按鈕不是一直顯示（整列不顯示；滑鼠移上才顯示的按鈕在滑鼠移上時才出現）。
 */
export function toolbarMode(s: MbSettings): ToolbarMode {
  if (isPlate(s)) return 'plate';
  if (s.showName || s.showResult) return 'inside';
  return s.buttons === 'always' ? 'buttons-only' : 'hidden';
}

/** 內文區的上內距（px） */
export function bodyPaddingTop(s: MbSettings): number {
  const mode = toolbarMode(s);
  if (mode === 'plate') return s.padY + Math.max(0, plateSink(s)) + s.plateGap;
  if (mode === 'hidden') return s.padY;
  return 0;
}

export interface BuildOptions {
  /** 開頭說明裡的範本名稱（預設依 settings.template 查） */
  templateName?: string | null;
}

/** 產生完整的自訂 CSS */
export function buildMessageBoxCss(s: MbSettings, opts: BuildOptions = {}): string {
  const css = createCssSheet();
  const url = roomUrlFrom(s.room);
  const fonts = usedFonts(s);
  const plate = isPlate(s);
  const mode = toolbarMode(s);
  const B = s.borderWidth;
  const outline = outlineShadow(s);

  /* ---------- 開頭說明（F69） ---------- */
  css.header({
    title: CSS_TITLE,
    toolName: CSS_TOOL_NAME,
    template:
      opts.templateName !== undefined
        ? opts.templateName
        : (templateById(s.template)?.name ?? null),
    url,
    exampleUrl: exampleRoomUrl(),
    urlNote: '房間畫面的網址，不加 /chat',
    size: { width: s.width, height: s.height },
    localFonts: localFontNames(fonts),
    notes: [
      '房間畫面的其他部分全部隱藏、背景透明，只剩發言時出現的訊息框；只會顯示來源載入之後的發言，最後一則會一直留著，直到按關閉。',
      s.buttons === 'hover'
        ? '要關掉訊息框：在 OBS 的來源上按右鍵 →「互動」，滑鼠移到訊息框上按右上角的關閉（×）；或重新整理來源的快取。'
        : null,
      s.showDice
        ? '要顯示骰子圖，房間設定要開「旧ダイス演出を利用する」（舊式骰子演出）；秘密骰沒有骰子圖。'
        : null,
      '房間的 BGM 與骰子音效重複播放時：在來源屬性勾選「透過 OBS 控制音訊」，再到混音器把這個來源靜音。',
    ],
  });

  /* ---------- 字型匯入（F70） ---------- */
  for (const u of googleFontUrls(fonts)) css.import(u);

  /* ---------- 頁面：透明、沒有捲軸，只看得到訊息框（F71、F72） ---------- */
  /* 第一段說明用 raw：還沒有規則時 comment() 會被當成開頭說明的一部分（放在 @import 之前） */
  css.raw(cssComment('頁面：背景透明、沒有捲軸；除了訊息框以外全部看不見（不改動結構）'));
  css.rule('html, body', {
    background: 'transparent',
    'background-color': 'transparent',
    'background-image': 'none',
    overflow: 'hidden',
  });
  css.rule(`body *:not(:is(${M.root}, ${M.root} *))`, { visibility: 'hidden' });
  /* 關閉後 CCFOLIA 寫在 style 的 visibility: hidden 要保持有效：只有「沒被關閉」時才設成可見 */
  css.rule(OPEN_ROOT, { visibility: 'visible' });
  /* 外層若有 transform、filter 之類，固定定位會改以外層為基準：一律拿掉（需要 OBS 31 以上；較舊的版本只是略過這條） */
  css.rule(`body *:has(${M.root})`, {
    transform: 'none',
    filter: 'none',
    'backdrop-filter': 'none',
    perspective: 'none',
    contain: 'none',
    'will-change': 'auto',
  });

  /* ---------- 訊息框根元素：以來源為基準定位（F05～F09） ---------- */
  css.comment('訊息框：以來源（視窗）為基準的位置');
  const margin = s.align === 'left' ? '0 auto 0 0' : s.align === 'right' ? '0 0 0 auto' : '0 auto';
  css.rule(M.root, {
    position: 'fixed',
    top: 'auto',
    left: px(s.side),
    right: px(s.side),
    bottom: px(s.bottom),
    width: 'auto',
    'min-width': 0,
    'max-width': px(s.maxWidth),
    height: 'auto',
    'min-height': 0,
    margin,
    padding: 0,
    border: 0,
    'border-radius': 0,
    background: 'none',
    'box-shadow': 'none',
    overflow: 'visible',
    'box-sizing': 'border-box',
    'z-index': 2147483000,
    ...(s.entrance === 'instant' ? { transform: 'none', transition: 'none' } : {}),
  });

  /* ---------- 方框（F10～F16） ---------- */
  css.comment('方框');
  const tex = texture(s.texture, { color: s.boxColor, opacity: s.boxOpacity / 100 });
  const underlay = tex && !tex.overlay ? tex : null;
  css.rule(M.box, {
    position: 'relative',
    'box-sizing': 'border-box',
    width: 'auto',
    margin: 0,
    padding: 0,
    'background-color': underlay?.replacesColor
      ? 'transparent'
      : rgba(s.boxColor, s.boxOpacity / 100),
    'background-image': underlay ? underlay.backgroundImage : 'none',
    ...(underlay ? textureDecls(underlay) : {}),
    border: B > 0 ? `${px(B)} solid ${rgba(s.borderColor, s.borderOpacity / 100)}` : 0,
    'border-radius': px(s.radius),
    'box-shadow':
      s.shadow > 0
        ? `0 ${px(LOOK.shadowY)} ${px(LOOK.shadowBlur)} ${rgba('#000000', s.shadow / 100)}`
        : 'none',
    color: s.textColor,
    overflow: 'visible',
  });
  const innerRadius = px(Math.max(0, s.radius - B));
  const overlayBase: CssDecls = {
    content: '""',
    position: 'absolute',
    inset: 0,
    'border-radius': innerRadius,
    'pointer-events': 'none',
    'z-index': 1,
  };
  if (tex?.overlay)
    css.rule(`${M.box}::before`, {
      ...overlayBase,
      'background-image': tex.backgroundImage,
      'background-color': 'transparent',
    });
  if (s.brackets)
    css.rule(`${M.box}::after`, {
      ...overlayBase,
      background: cornerBrackets({
        length: LOOK.bracketLength,
        thickness: Math.max(2, B + 1),
        color: rgba(s.bracketColor, s.bracketOpacity / 100),
      }),
    });

  /* ---------- 骰子圖（F49、F50、F73） ---------- */
  /* 方框有外框時，距離從外框的內緣量起（絕對定位本來就以內緣為基準） */
  css.comment('骰子圖');
  if (s.showDice) {
    const above = plate ? Math.round(LOOK.diceGapPlate * s.nameSize) : LOOK.diceGap;
    const onLeft = s.showPortrait && s.portraitSide === 'right';
    css.rule(M.dice, {
      position: 'absolute',
      top: 'auto',
      bottom: calcPx('100%', above),
      left: onLeft ? px(LOOK.diceSideInset) : 'auto',
      right: onLeft ? 'auto' : px(LOOK.diceSideInset),
      margin: 0,
      padding: 0,
      width: 'auto',
      'max-width': calcPx('100%', -2 * LOOK.diceSideInset),
      display: 'flex',
      'flex-wrap': 'wrap-reverse',
      'justify-content': 'center',
      'align-items': 'flex-end',
      'z-index': -1,
      'pointer-events': 'none',
    });
    css.rule(M.diceImg, {
      width: px(s.diceSize),
      height: px(s.diceSize),
      'min-width': 0,
      'max-width': 'none',
      margin: 0,
    });
  } else {
    css.rule(M.dice, { display: 'none' });
  }

  /* ---------- 標題列（名稱、結果、按鈕） ---------- */
  css.comment('標題列：名稱、骰子結果、略過／關閉按鈕');
  const toolbarInside: CssDecls = {
    position: 'relative',
    display: 'flex',
    'flex-wrap': 'nowrap',
    'align-items': 'center',
    gap: 0,
    'min-height': 0,
    height: 'auto',
    margin: 0,
    padding: `${px(s.padY)} ${px(s.padX)} ${px(s.nameGap)}`,
    background: 'none',
    'box-sizing': 'border-box',
  };
  if (mode === 'plate') {
    /* 名牌的左右距離與沉入量都從方框外框的內緣量起 */
    const sink = plateSink(s);
    css.rule(M.toolbar, {
      position: 'absolute',
      top: 'auto',
      left: px(s.plateInset),
      right: px(s.plateInset),
      bottom: calcPx('100%', -sink),
      display: 'flex',
      'flex-wrap': 'nowrap',
      'align-items': 'flex-end',
      gap: px(LOOK.plateGapPx),
      'min-height': 0,
      height: 'auto',
      margin: 0,
      padding: 0,
      background: 'none',
      'box-sizing': 'border-box',
      'z-index': 2,
    });
  } else if (mode === 'hidden') {
    css.rule(M.toolbar, { display: 'none' });
    if (s.buttons === 'hover') css.rule(`${HOVER} ${M.toolbar}`, toolbarInside);
  } else {
    css.rule(M.toolbar, toolbarInside);
  }

  /* 名稱（F19～F28） */
  if (s.showName) {
    const nameBase: CssDecls = {
      ...fontDecls(s.nameFont, s.nameSize),
      color: s.nameColor,
      'line-height': num(LOOK.nameLineHeight),
      'letter-spacing': `${num(LOOK.nameLetterSpacing)}em`,
      margin: 0,
      flex: '0 1 auto',
      'min-width': 0,
      overflow: 'hidden',
      'white-space': 'nowrap',
      'text-overflow': 'ellipsis',
      'box-sizing': 'border-box',
    };
    if (plate) {
      const p = LOOK.platePad;
      css.rule(M.name, {
        ...nameBase,
        padding: `${num(p.top)}em ${num(p.x)}em ${num(p.bottom)}em`,
        'background-color': rgba(s.plateColor, s.plateOpacity / 100),
        'background-image': 'none',
        border: s.plateBorder > 0 ? `${px(s.plateBorder)} solid ${rgba(s.plateBorderColor, 1)}` : 0,
        'border-radius': px(s.plateRadius),
        'box-shadow': LOOK.plateShadow,
        'text-shadow': 'none',
      });
    } else {
      css.rule(M.name, {
        ...nameBase,
        padding: 0,
        background: 'none',
        border: 0,
        'border-radius': 0,
        'box-shadow': 'none',
        'text-shadow': outline,
      });
    }
  } else {
    css.rule(M.name, { display: 'none' });
  }

  /* 骰子結果（F29～F33） */
  if (s.showResult) {
    /* 標題列最右端：名牌模式也一樣放到那一列的最右邊（同舊版） */
    const atEnd = s.resultPos === 'end';
    css.rule(M.result, {
      ...fontDecls(s.resultFont, s.resultSize),
      'line-height': num(LOOK.nameLineHeight),
      'letter-spacing': `${num(LOOK.resultLetterSpacing)}em`,
      margin: plate ? 0 : `0 0 0 ${num(LOOK.resultGap)}em`,
      flex: '0 0 auto',
      'white-space': 'nowrap',
      'box-sizing': 'border-box',
      order: atEnd ? 2 : 0,
    });
    if (atEnd) css.rule(M.buttons, { order: 3 });
    const radius = px(plate ? s.plateRadius : LOOK.chipRadius);
    const c = LOOK.chipPad;
    const chipPadding = `${num(c.y)}em ${num(c.right)}em ${num(c.y)}em ${num(c.left)}em`;
    for (const o of ['success', 'failure', 'other'] as const) {
      const color = outcomeColor(s, o);
      let decls: CssDecls;
      if (s.resultStyle === 'band') {
        decls = {
          color: yiqTextColor(color),
          'background-color': rgba(color, 1),
          border: 0,
          'border-radius': radius,
          padding: chipPadding,
          'text-shadow': 'none',
        };
      } else if (s.resultStyle === 'outline') {
        decls = {
          color: rgba(color, 1),
          'background-color': plate ? 'transparent' : rgba(color, LOOK.chipTint),
          border: `${px(LOOK.chipBorder)} solid ${rgba(color, 1)}`,
          'border-radius': radius,
          padding: chipPadding,
          'text-shadow': plate ? 'none' : outline,
        };
      } else if (plate) {
        const p = LOOK.platePad;
        decls = {
          color: rgba(color, 1),
          'background-color': rgba(s.plateColor, s.plateOpacity / 100),
          border: 0,
          'border-radius': radius,
          padding: `${num(p.top)}em ${num(p.x)}em ${num(p.bottom)}em`,
          'text-shadow': 'none',
        };
      } else {
        decls = {
          color: rgba(color, 1),
          'background-color': 'transparent',
          border: 0,
          'border-radius': 0,
          padding: 0,
          'text-shadow': outline,
        };
      }
      css.rule(resultSelector(o), { ...decls, 'background-image': 'none' });
    }
  } else {
    css.rule(M.result, { display: 'none' });
  }

  /* 撐開空間（結果在最右端時排在名稱與結果之間） */
  css.rule(M.spacer, {
    flex: '1 1 0',
    'min-width': 0,
    margin: 0,
    padding: 0,
    order: s.showResult && s.resultPos === 'end' ? 1 : 0,
  });

  /* 略過／關閉按鈕（F18） */
  const buttonShown: CssDecls = {
    display: 'inline-flex',
    'align-items': 'center',
    'justify-content': 'center',
    flex: '0 0 auto',
    'align-self': plate ? 'flex-end' : 'center',
    width: 'auto',
    height: 'auto',
    'min-width': 0,
    'min-height': 0,
    margin: 0,
    padding: px(LOOK.buttonPad),
    border: 0,
    'border-radius': '50%',
    'box-shadow': 'none',
    'box-sizing': 'content-box',
  };
  const iconDecls: CssDecls = {
    width: px(LOOK.buttonIcon),
    height: px(LOOK.buttonIcon),
    'font-size': px(LOOK.buttonIcon),
    fill: 'currentColor',
  };
  if (s.buttons === 'always') {
    css.rule(M.buttons, { ...buttonShown, background: 'transparent', color: 'inherit' });
    css.rule(`${M.buttons} svg`, iconDecls);
  } else {
    css.rule(M.buttons, { display: 'none' });
    if (s.buttons === 'hover') {
      css.rule(`${HOVER} ${M.buttons}`, {
        ...buttonShown,
        background: LOOK.buttonHoverBg,
        color: '#ffffff',
      });
      css.rule(`${HOVER} ${M.buttons} svg`, iconDecls);
    }
  }

  /* ---------- 內文區（F17、F34～F38） ---------- */
  css.comment('內文區：固定行數，上內距以上的部分裁掉');
  const padTop = bodyPaddingTop(s);
  const contentH = textAreaHeight(s);
  const bodyDecls = (top: number): CssDecls => ({
    'box-sizing': 'border-box',
    height: px(top + contentH + s.padY),
    'min-height': 0,
    'max-height': 'none',
    margin: 0,
    padding: `${px(top)} ${px(s.padX)} ${px(s.padY)}`,
    overflow: 'hidden',
    'scrollbar-width': 'none',
    'clip-path': top > 0 ? `inset(${px(top)} 0 0 0)` : 'none',
    background: 'none',
  });
  css.rule(M.body, bodyDecls(padTop));
  if (mode === 'hidden' && s.buttons === 'hover') css.rule(`${HOVER} ${M.body}`, bodyDecls(0));
  css.rule(M.text, {
    ...fontDecls(s.textFont, s.textSize),
    color: s.textColor,
    'line-height': num(s.lineHeight),
    'letter-spacing': `${num(s.letterSpacing)}em`,
    margin: 0,
    padding: 0,
    'white-space': 'pre-wrap',
    /* 英文在空白處換行，只有整行放不下的長字才切開（中文照常逐字換行） */
    'overflow-wrap': 'anywhere',
    'word-break': 'normal',
    'text-shadow': outline,
    background: 'none',
  });

  /* ---------- 立繪（F41～F48、F73） ---------- */
  css.comment('立繪');
  if (s.showPortrait) {
    const left = s.portraitSide === 'left';
    /* 翻轉時圖片的對齊方向也跟著鏡像，所以要先反過來 */
    const alignX = left !== s.portraitFlip ? 'left' : 'right';
    css.rule(M.portrait, {
      position: 'absolute',
      top: 'auto',
      bottom: calcPx('100%', -s.portraitSink),
      left: left ? px(s.portraitOffset) : 'auto',
      right: left ? 'auto' : px(s.portraitOffset),
      width: px(s.portraitWidth),
      height: 'auto',
      'min-width': 0,
      'min-height': 0,
      'max-width': 'none',
      'max-height': px(s.portraitMaxHeight),
      'object-fit': 'contain',
      'object-position': `${alignX} bottom`,
      margin: 0,
      padding: 0,
      border: 0,
      'z-index': s.portraitFront ? 3 : -1,
      'transform-origin': 'center bottom',
      ...(s.portraitFlip ? { transform: 'scaleX(-1)' } : {}),
      'pointer-events': 'none',
    });
  } else {
    css.rule(M.portrait, { display: 'none' });
  }

  return css.toString();
}
