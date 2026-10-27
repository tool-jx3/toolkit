/**
 * TyranoScript 的配置程式碼（規格 3.9，本站自己產生）：
 * - `Tyrano_QuickPaste.ks`：訊息框（[position]）、名字框（[image]＋[ptext]＋[chara_config]）、翻頁游標（[glyph]）、
 *   系統按鈕 8 個（[button] 的 role，一般／滑過／按下三種圖）；開頭用 [loadcss] 讀補充樣式。
 * - `Choice_Example.ks`：選項按鈕的範例（[glink] 的 graphic／enterimg）。
 * - `data/others/uiframe/uiframe.css`：選項按鈕的大小＝PNG、文字只排在左右裝飾之間（一行，放不下時「…」）。
 *
 * 標籤與參數照 TyranoScript 原始碼裡的標籤說明；座標、大小都是目前解析度的 px，檔名和 ZIP 裡的檔案一一對應。
 */
import {
  CHOICE_PAD,
  CURSOR_SIZE,
  FRAME_PAD,
  MSG_TEXT,
  novelLayout,
  pos,
  px,
  SYS_PAD,
} from './layout';
import { type DocState, SYSTEM_BUTTONS, type SystemButton } from './model';
import { paletteRgba, tyranoColor } from './palette';
import {
  CHOICE_FONT_SIZE,
  choiceFile,
  IMAGE_DIR,
  NAME_FONT_SIZE,
  NOVEL_IMAGE_ROOT,
  systemFile,
} from './parts';
import { labelInset } from './render';
import { S } from './strings';

export const QUICK_PASTE_FILE = 'Tyrano_QuickPaste.ks';
export const CHOICE_EXAMPLE_FILE = 'Choice_Example.ks';
export const CSS_FILE = `data/others/${IMAGE_DIR}/uiframe.css`;

/**
 * TyranoScript 的訊息框：文字的範圍（message_inner）比框（message_outer）往右、往下多 10 px，
 * 右緣與下緣和框相同（kag.layer.js 的 refMessageLayer）——所以左、上的邊距各扣 10，文字的起點才和預覽一樣。
 */
export const TYRANO_INNER_OFFSET = 10;

/** 系統按鈕 → [button] 的 role */
export const SYSTEM_ROLES: Record<SystemButton, string> = {
  save: 'save',
  load: 'load',
  auto: 'auto',
  skip: 'skip',
  log: 'backlog',
  config: 'menu',
  title: 'title',
  close: 'window',
};

/** data/image/ 底下的路徑（[position frame]、[button graphic] 等用） */
export const imagePath = (zipPath: string): string => zipPath.replace(/^data\/image\//, '');

/**
 * 放進標籤屬性（雙引號）的文字：
 * - 雙引號與方括號換成全形（會讓標籤的解析中斷），換行變空白；
 * - 前後的空白拿掉（TyranoScript 本來就會修掉）；
 * - 開頭是「&」或「%」時換成全形「＆」「％」：TyranoScript 把「&」開頭的值當成 JavaScript 執行、
 *   「%」開頭的值當成巨集的參數（kag.tag.js 的 convertEntity，只看第一個字）；
 * - 剛好是「undefined」時會被當成空值，換成全形。
 */
export function tagText(s: string): string {
  let t = s
    .replace(/\r?\n/g, ' ')
    .replace(/"/g, '＂')
    .replace(/\[/g, '［')
    .replace(/\]/g, '］')
    .trim();
  if (t.startsWith('&')) t = `＆${t.slice(1)}`;
  else if (t.startsWith('%')) t = `％${t.slice(1)}`;
  if (t === 'undefined') t = 'ｕｎｄｅｆｉｎｅｄ';
  return t;
}

function attrs(list: [string, string | number][]): string {
  return list.map(([k, v]) => `${k}="${v}"`).join(' ');
}

const tag = (name: string, list: [string, string | number][]) => `[${name} ${attrs(list)}]`;

export interface TyranoCode {
  quickPaste: string;
  choiceExample: string;
  css: string;
}

export function tyranoCode(doc: DocState, presetName: string): TyranoCode {
  const res = doc.resolution;
  const d = doc.design;
  const L = novelLayout(d);
  const n = (v: number) => pos(v, res);
  const textColor = tyranoColor(paletteRgba(d).text);
  const H = Math.round(res * (9 / 16));
  const F = FRAME_PAD;
  const msg = L.msg;
  const name = L.name;
  const c = S.code;

  const lines: string[] = [
    ';=====================================================================',
    `; ${c.title}`,
    `; ${c.meta(presetName, res, H)}`,
    ...c.steps.map((s) => `; ${s}`),
    ';=====================================================================',
    '',
    `; ${c.cssNote}`,
    tag('loadcss', [['file', `./${CSS_FILE}`]]),
    '',
    `; ---- ${c.message} ----`,
    tag('position', [
      ['layer', 'message0'],
      ['page', 'fore'],
      ['left', n(msg.x - F)],
      ['top', n(msg.y - F)],
      ['width', px(msg.w + F * 2, res)],
      ['height', px(msg.h + F * 2, res)],
      ['frame', imagePath(`${NOVEL_IMAGE_ROOT}/message_window.png`)],
      ['opacity', 255],
      ['margint', n(F + MSG_TEXT.top) - TYRANO_INNER_OFFSET],
      ['marginl', n(F + MSG_TEXT.left) - TYRANO_INNER_OFFSET],
      ['marginr', n(F + MSG_TEXT.right)],
      ['marginb', n(F + MSG_TEXT.bottom)],
    ]),
    tag('layopt', [
      ['layer', 'message0'],
      ['visible', 'true'],
    ]),
    tag('deffont', [
      ['size', n(MSG_TEXT.size)],
      ['color', textColor],
    ]),
    '[resetfont]',
    '',
    `; ---- ${c.name} ----`,
    tag('image', [
      ['layer', 'message0'],
      ['page', 'fore'],
      ['folder', 'image'],
      ['storage', imagePath(`${NOVEL_IMAGE_ROOT}/name_plate.png`)],
      ['left', n(name.x - F)],
      ['top', n(name.y - F)],
      ['name', 'uiframe_name_plate'],
    ]),
    tag('ptext', [
      ['layer', 'message0'],
      ['page', 'fore'],
      ['name', 'chara_name_area'],
      ['text', ''],
      ['x', n(name.x)],
      ['y', n(name.y + (name.h - NAME_FONT_SIZE * 1.2) / 2)],
      ['width', px(name.w, res)],
      ['align', 'center'],
      ['size', n(NAME_FONT_SIZE)],
      ['color', textColor],
      ['bold', 'true'],
    ]),
    tag('chara_config', [['ptext', 'chara_name_area']]),
    '',
    `; ---- ${c.cursor} ----`,
    tag('glyph', [
      ['line', imagePath(`${NOVEL_IMAGE_ROOT}/cursor_next.png`)],
      ['folder', 'image'],
      ['fix', 'true'],
      ['left', n(L.cursor.cx - CURSOR_SIZE / 2)],
      ['top', n(L.cursor.cy - CURSOR_SIZE / 2)],
      ['marginl', 0],
    ]),
    '',
    `; ---- ${c.system} ----`,
    ...c.systemNotes.map((s) => `; ${s}`),
  ];
  SYSTEM_BUTTONS.forEach((b, i) => {
    const r = L.sys[i];
    const list: [string, string | number][] = [
      ['name', 'uiframe_sys'],
      ['role', SYSTEM_ROLES[b]],
      ['graphic', imagePath(systemFile(b, 'normal'))],
      ['enterimg', imagePath(systemFile(b, 'hover'))],
      ['activeimg', imagePath(systemFile(b, 'active'))],
    ];
    if (b === 'auto') list.push(['autoimg', imagePath(systemFile(b, 'active'))]);
    if (b === 'skip') list.push(['skipimg', imagePath(systemFile(b, 'active'))]);
    list.push(['x', n(r.x - SYS_PAD)], ['y', n(r.y - SYS_PAD)], ['hint', c.hints[b]]);
    lines.push(tag('button', list));
  });
  lines.push('');
  const quickPaste = `${lines.join('\n')}\n`;

  /* 選項的範例 */
  const t = doc.texts;
  const choiceLines: string[] = [
    ';=====================================================================',
    `; ${c.choiceTitle}`,
    `; ${c.meta(presetName, res, H)}`,
    ...c.choiceNotes.map((s) => `; ${s}`),
    ';=====================================================================',
    '',
    '*uiframe_choice',
  ];
  const texts = [t.choice1, t.choice2, t.choice3];
  L.choices.forEach((r, i) => {
    choiceLines.push(
      tag('glink', [
        ['name', 'uiframe_choice'],
        ['graphic', imagePath(choiceFile('normal'))],
        ['enterimg', imagePath(choiceFile('hover'))],
        ['text', tagText(texts[i]) || c.choiceFallback(i + 1)],
        ['x', n(r.x - CHOICE_PAD)],
        ['y', n(r.y - CHOICE_PAD)],
        ['width', px(r.w + CHOICE_PAD * 2, res)],
        ['height', px(r.h + CHOICE_PAD * 2, res)],
        ['size', n(CHOICE_FONT_SIZE)],
        ['font_color', textColor],
        ['target', `*uiframe_choice_${i + 1}`],
      ]),
    );
  });
  choiceLines.push('[s]', '');
  for (let i = 1; i <= 3; i++)
    choiceLines.push(
      `*uiframe_choice_${i}`,
      '[cm]',
      `${c.afterChoice(i)}[p]`,
      tag('jump', [['target', '*uiframe_choice_end']]),
      '',
    );
  choiceLines.push('*uiframe_choice_end', '');
  const choiceExample = choiceLines.join('\n');

  /* 選項的文字：左右各讓出透明邊＋裝飾；一行、垂直置中（行高＝PNG 的高） */
  const ch = L.choices[0];
  const css = [
    `/* ${c.cssTitle} */`,
    `/* ${c.cssChoice} */`,
    '.uiframe_choice.button_graphic {',
    '  box-sizing: border-box;',
    `  padding: 0 ${choiceSidePadding(doc)}px;`,
    `  line-height: ${px(ch.h + CHOICE_PAD * 2, res)}px;`,
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  text-align: center;',
    '}',
    '',
  ].join('\n');

  return { quickPaste, choiceExample, css };
}

/** 選項文字的左右內距（px）：（透明邊＋裝飾佔的寬＋8）× 倍率 */
export function choiceSidePadding(doc: DocState): number {
  const ch = novelLayout(doc.design).choices[0];
  return pos(CHOICE_PAD + labelInset(doc.design, ch.w, ch.h), doc.resolution);
}

/** 程式碼裡用到的所有圖片（ZIP 裡的路徑）：用來檢查檔名對得上 */
export function referencedImages(code: TyranoCode): string[] {
  const out = new Set<string>();
  const re = /(?:frame|storage|line|graphic|enterimg|activeimg|autoimg|skipimg)="([^"]+\.png)"/g;
  for (const text of [code.quickPaste, code.choiceExample])
    for (const m of text.matchAll(re)) out.add(`data/image/${m[1]}`);
  return [...out].sort();
}
