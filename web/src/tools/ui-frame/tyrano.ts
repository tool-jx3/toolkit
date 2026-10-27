/**
 * TyranoScript 的配置程式碼（規格 3.9，本站自己產生）：
 * - `Tyrano_QuickPaste.ks`：訊息框（[position]）、名字框（[image]＋[ptext]＋[chara_config]）、翻頁游標（[glyph]）、
 *   系統按鈕 8 個（[button] 的 role，一般／滑過／按下三種圖）；開頭用 [loadcss] 讀補充樣式。
 * - `Choice_Example.ks`：選項按鈕的範例（[glink] 的 graphic／enterimg）。
 * - `data/others/uiframe/uiframe.css`：選項按鈕的大小＝PNG、文字置中；系統按鈕左右的透明邊不接受點擊。
 *
 * 標籤與參數照 TyranoScript 官方的標籤參考；座標、大小都是目前解析度的 px，檔名和 ZIP 裡的檔案一一對應。
 */
import {
  BUTTON_PAD,
  CURSOR_SIZE,
  FRAME_PAD,
  MSG_TEXT,
  novelLayout,
  pos,
  px,
  SYS_BUTTON,
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
import { S } from './strings';

export const QUICK_PASTE_FILE = 'Tyrano_QuickPaste.ks';
export const CHOICE_EXAMPLE_FILE = 'Choice_Example.ks';
export const CSS_FILE = `data/others/${IMAGE_DIR}/uiframe.css`;

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

/** 放進標籤屬性（雙引號）的文字：雙引號與方括號換成全形，換行變空白 */
export function tagText(s: string): string {
  return s.replace(/\r?\n/g, ' ').replace(/"/g, '＂').replace(/\[/g, '［').replace(/\]/g, '］');
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
  const B = BUTTON_PAD;
  const msg = L.msg;
  const name = L.name;

  const lines: string[] = [
    ';=====================================================================',
    `; ${S.code.title}`,
    `; ${S.code.meta(presetName, res, H)}`,
    ...S.code.steps.map((s) => `; ${s}`),
    ';=====================================================================',
    '',
    `; ${S.code.cssNote}`,
    tag('loadcss', [['file', `./${CSS_FILE}`]]),
    '',
    `; ---- 1. ${S.code.message} ----`,
    tag('position', [
      ['layer', 'message0'],
      ['page', 'fore'],
      ['left', n(msg.x - F)],
      ['top', n(msg.y - F)],
      ['width', px(msg.w + F * 2, res)],
      ['height', px(msg.h + F * 2, res)],
      ['frame', imagePath(`${NOVEL_IMAGE_ROOT}/message_window.png`)],
      ['opacity', 255],
      ['margint', n(F + MSG_TEXT.top)],
      ['marginl', n(F + MSG_TEXT.left)],
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
    `; ---- 2. ${S.code.name} ----`,
    `; ${S.code.nameNote}`,
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
    `; ---- 3. ${S.code.cursor} ----`,
    tag('glyph', [
      ['line', imagePath(`${NOVEL_IMAGE_ROOT}/cursor_next.png`)],
      ['folder', 'image'],
      ['fix', 'true'],
      ['left', n(L.cursor.cx - CURSOR_SIZE / 2)],
      ['top', n(L.cursor.cy - CURSOR_SIZE / 2)],
    ]),
    '',
    `; ---- 4. ${S.code.system} ----`,
    ...S.code.systemNotes.map((s) => `; ${s}`),
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
    list.push(['x', n(r.x - B)], ['y', n(r.y - B)], ['hint', S.code.hints[b]]);
    lines.push(tag('button', list));
  });
  lines.push('');
  const quickPaste = `${lines.join('\n')}\n`;

  /* 選項的範例 */
  const t = doc.texts;
  const choiceLines: string[] = [
    ';=====================================================================',
    `; ${S.code.choiceTitle}`,
    `; ${S.code.meta(presetName, res, H)}`,
    ...S.code.choiceNotes.map((s) => `; ${s}`),
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
        ['text', tagText(texts[i]) || S.code.choiceFallback(i + 1)],
        ['x', n(r.x - B)],
        ['y', n(r.y - B)],
        ['width', px(r.w + B * 2, res)],
        ['height', px(r.h + B * 2, res)],
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
      `${S.code.afterChoice(i)}[p]`,
      tag('jump', [['target', '*uiframe_choice_end']]),
      '',
    );
  choiceLines.push('*uiframe_choice_end', '');
  const choiceExample = choiceLines.join('\n');

  const clip = n(B - SYS_BUTTON.gap / 2);
  const css = [
    `/* ${S.code.cssTitle} */`,
    `/* ${S.code.cssChoice} */`,
    '.uiframe_choice.button_graphic {',
    '  box-sizing: border-box;',
    '  padding: 0;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  line-height: 1.2;',
    '}',
    `/* ${S.code.cssSystem} */`,
    '.uiframe_sys {',
    `  clip-path: inset(0 ${clip}px);`,
    '}',
    '',
  ].join('\n');

  return { quickPaste, choiceExample, css };
}

/** 程式碼裡用到的所有圖片（ZIP 裡的路徑）：用來檢查檔名對得上 */
export function referencedImages(code: TyranoCode): string[] {
  const out = new Set<string>();
  const re = /(?:frame|storage|line|graphic|enterimg|activeimg|autoimg|skipimg)="([^"]+\.png)"/g;
  for (const text of [code.quickPaste, code.choiceExample])
    for (const m of text.matchAll(re)) out.add(`data/image/${m[1]}`);
  return [...out].sort();
}
