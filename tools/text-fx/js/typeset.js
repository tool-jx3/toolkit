/* 文字演出產生器：排版（斷行、禁則、橫書／直書、字形量測） */
import { isBlankChar } from './core.js';

/* ---------- 字元分類 ---------- */
const setOf = s => new Set(Array.from(s));
/* 行首禁則：句讀、閉括號、刪節號、長音、小假名等不放在行首 */
/* 日文小假名（促音、拗音用的小字）以碼位列出：U+3041～308E 與 U+30A1～30F6 之中的小字 */
const SMALL_KANA_CODES = [0x3041, 0x3043, 0x3045, 0x3047, 0x3049, 0x3063, 0x3083, 0x3085, 0x3087, 0x308e,
  0x30a1, 0x30a3, 0x30a5, 0x30a7, 0x30a9, 0x30c3, 0x30e3, 0x30e5, 0x30e7, 0x30ee, 0x30f5, 0x30f6];
const SMALL_KANA = new Set(SMALL_KANA_CODES.map(c => String.fromCodePoint(c)));
export const NO_LINE_START = new Set([...Array.from('，。、；：！？」』）】》〉〕〗〙〛｝］…‥・·ー～〜—―‐,.;:!?)]}%’”々'), ...SMALL_KANA]);
/* 行尾禁則：開括號不放在行尾 */
export const NO_LINE_END = setOf('「『（【《〈〔〖〘〚｛［([{‘“');
/* 直書時轉 90° 的全形符號（括號、引號、破折號、刪節號、冒號、分號、等號、直線、箭頭） */
const ROTATE_V = setOf('ー—―‐–－～〜…‥（）「」『』【】《》〈〉〔〕〖〗〘〙〚〛｛｝［］＜＞“”‘’：；＝｜←→↔⇒⇔＿');
/* 直書時移到字格右上角的句讀（可改成置中） */
const CORNER_V = setOf('、。，．');
/* 長文逐字顯示的停頓 */
export const PAUSE_LONG = setOf('。！？!?….．‥—―');
export const PAUSE_SHORT = setOf('、，,・；;：:');
export const CLOSERS = setOf('」』）】》〉〕〗”’)]');

export function isWide(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3)
    || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe10 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60)
    || (c >= 0xffe0 && c <= 0xffe6) || c >= 0x1f000 || c === 0x2026 || c === 0x2025 || c === 0x2014
    || c === 0x2015 || c === 0x203b || (c >= 0x2190 && c <= 0x21ff) || (c >= 0x2460 && c <= 0x27bf) || c === 0x3000;
}
const isHangul = ch => /[ᄀ-ᇿ㄰-㆏가-힣]/.test(ch);

/* ---------- 量測 ---------- */
let measureCtx = null;
function mctx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

/* 同一個字型字串的字寬、墨跡範圍快取 */
export class Meter {
  constructor(css, size, sample) {
    this.css = css;
    this.size = size;
    this.cache = new Map();
    /* 字身中心：有中文就用「永」的墨跡中心（接近表意字框中心），純西文用大寫 H 的中心 */
    const ref = /[⺀-鿿가-힣＀-￯]/.test(sample || '') ? '永' : 'H';
    const m = this.get(ref);
    this.central = (m.a - m.d) / 2;
    if (!(this.central > 0)) this.central = size * 0.38;
  }
  get(ch) {
    let r = this.cache.get(ch);
    if (!r) {
      const x = mctx();
      x.font = this.css;
      const t = x.measureText(ch);
      r = {
        w: t.width,
        l: t.actualBoundingBoxLeft || 0,
        r: t.actualBoundingBoxRight || t.width,
        a: t.actualBoundingBoxAscent || 0,
        d: t.actualBoundingBoxDescent || 0
      };
      this.cache.set(ch, r);
    }
    return r;
  }
}

/* ---------- 斷行 ---------- */
/* 一行拆成「詞」：中文字一字一詞；連續的西文或韓文（中間沒有空白）是一個詞，不從中間斷開 */
function tokenize(chars) {
  const out = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (isBlankChar(ch)) { out.push({ chars: [ch], space: true }); i++; continue; }
    const wordy = c => !isBlankChar(c) && (!isWide(c) || isHangul(c));
    if (wordy(ch)) {
      const hangul = isHangul(ch);
      let j = i + 1;
      while (j < chars.length && wordy(chars[j]) && isHangul(chars[j]) === hangul) j++;
      out.push({ chars: chars.slice(i, j), word: true });
      i = j;
      continue;
    }
    out.push({ chars: [ch] });
    i++;
  }
  return out;
}

/* 依寬度上限把一行斷成多行。unit(ch) 回傳該字佔的寬度（字數或 px）。
 * 行首禁則的字留在上一行行尾（允許超出），行尾禁則的開括號移到下一行開頭，
 * 自動換行後下一行開頭的空白拿掉。 */
export function wrapChars(chars, limit, unit) {
  if (!(limit > 0)) return [chars];
  const tokens = tokenize(chars);
  const lines = [];
  let cur = [];
  let curW = 0;
  const widthOf = arr => arr.reduce((s, c) => s + unit(c), 0);
  const flush = () => {
    while (cur.length && isBlankChar(cur[cur.length - 1])) cur.pop();
    lines.push(cur);
    cur = [];
    curW = 0;
  };
  const pushChar = c => { cur.push(c); curW += unit(c); };
  for (const tok of tokens) {
    const tw = widthOf(tok.chars);
    if (tok.space && cur.length === 0 && lines.length > 0) continue; // 換行後開頭的空白
    if (curW + tw <= limit + 1e-6 || cur.length === 0 && tw <= limit + 1e-6) {
      tok.chars.forEach(pushChar);
      continue;
    }
    if (tok.space) { flush(); continue; }
    /* 行首禁則：放不下也留在這一行 */
    if (!tok.word && NO_LINE_START.has(tok.chars[0])) { tok.chars.forEach(pushChar); continue; }
    /* 比一整行還長的詞才從中間斷 */
    if (tok.word && tw > limit) {
      for (const c of tok.chars) {
        if (curW + unit(c) > limit + 1e-6 && cur.length) {
          if (NO_LINE_START.has(c)) { pushChar(c); continue; }
          flush();
        }
        pushChar(c);
      }
      continue;
    }
    /* 行尾禁則：把行尾的開括號帶到下一行 */
    const carry = [];
    while (cur.length > 1 && NO_LINE_END.has(cur[cur.length - 1])) carry.unshift(cur.pop());
    flush();
    carry.forEach(pushChar);
    tok.chars.forEach(pushChar);
  }
  if (cur.length || lines.length === 0) flush();
  return lines;
}

/* 字串 → 行（保留原本換行，再依設定自動換行） */
export function breakText(text, { limit = 0, unit }) {
  const hard = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (const line of hard) {
    const chars = Array.from(line);
    if (!chars.length) { out.push([]); continue; }
    for (const l of wrapChars(chars, limit, unit)) out.push(l);
  }
  return out;
}

/* ---------- 單一字群（主文字或副文字）排版 ----------
 * 座標以字群外框左上角為原點；行的對齊在 composeBlock 處理。
 * 每個字的 (x, y) 是它的「樞紐點」：字身中心，縮放、旋轉都以這點為準。 */
export function layoutGroup(lines, o) {
  const { S, meter, vertical } = o;
  const track = o.tracking * S;
  const pitch = o.leading * S; // 行與行（直書是列與列）的間距
  const glyphs = [];
  const lineInfo = [];
  lines.forEach((chars, li) => {
    let pos = 0;
    const items = [];
    chars.forEach((ch, ci) => {
      const m = meter.get(ch);
      const space = isBlankChar(ch);
      let adv, rot0 = 0, sx = 0, sy = 0, wide = isWide(ch);
      if (!vertical) {
        adv = m.w;
      } else if (!wide && !o.latinUpright) {
        adv = m.w; rot0 = Math.PI / 2; // 半形英數整串順時針轉 90°
      } else if (ROTATE_V.has(ch)) {
        adv = Math.max(m.w, S * 0.5); rot0 = Math.PI / 2;
      } else {
        adv = space && ch === ' ' ? Math.max(m.w, S * 0.3) : S;
        if (CORNER_V.has(ch)) {
          /* 依墨跡把句讀放到字格右上角（或正中央），不受字型原本位置影響 */
          const inkX = (m.r - m.l) / 2 - m.w / 2;
          const inkY = (m.d - m.a) / 2 + meter.central;
          const tx = o.punctCenter ? 0 : S * 0.24;
          const ty = o.punctCenter ? 0 : -S * 0.24;
          sx = tx - inkX; sy = ty - inkY;
        } else if (SMALL_KANA.has(ch)) {
          sx = S * 0.1; sy = -S * 0.1;
        }
      }
      items.push({ ch, adv, rot0, sx, sy, space, wide, m, pos });
      pos += adv + (ci < chars.length - 1 ? track : 0);
    });
    const len = pos;
    let inkA = 0, inkD = 0;
    for (const it of items) { if (!it.space) { inkA = Math.max(inkA, it.m.a); inkD = Math.max(inkD, it.m.d); } }
    lineInfo.push({ len, inkA, inkD, count: items.length });
    items.forEach((it, ci) => {
      const along = it.pos + it.adv / 2;
      const across = li * pitch + S / 2;
      glyphs.push({
        ch: it.ch, line: li, col: ci, space: it.space, wide: it.wide, adv: it.adv, rot0: it.rot0, m: it.m,
        along, across, shiftX: it.sx, shiftY: it.sy
      });
    });
  });
  const lineCount = Math.max(1, lines.length);
  const extentAcross = (lineCount - 1) * pitch + S;
  const extentAlong = Math.max(0, ...lineInfo.map(l => l.len));
  return { glyphs, lineInfo, S, pitch, extentAcross, extentAlong, vertical, meter, lines };
}

/* ---------- 主文字＋副文字組成一個區塊 ----------
 * 回傳每個字的區塊內座標，以及主文字框、副文字框、整體框。 */
export function composeBlock(main, sub, o) {
  const vertical = o.vertical;
  const alignK = { start: 0, center: 0.5, end: 1 }[o.align] ?? 0.5;
  const gap = sub ? o.subGap : 0;
  const along = Math.max(main.extentAlong, sub ? sub.extentAlong : 0);
  const mainAcross = main.extentAcross;
  const subAcross = sub ? sub.extentAcross : 0;
  const blockAcross = mainAcross + (sub ? gap + subAcross : 0);
  /* 橫書：across = y；「後」= 下方。直書：across = x 由右往左；「前」= 右側 */
  let mainOff, subOff;
  if (!vertical) {
    if (o.subPos === 'before') { subOff = 0; mainOff = sub ? subAcross + gap : 0; } else { mainOff = 0; subOff = mainAcross + gap; }
  } else if (o.subPos === 'before') { subOff = 0; mainOff = sub ? subAcross + gap : 0; } else { mainOff = 0; subOff = mainAcross + gap; }

  const W = vertical ? blockAcross : along;
  const H = vertical ? along : blockAcross;
  const place = (grp, off, group) => {
    const out = [];
    for (const g of grp.glyphs) {
      const li = grp.lineInfo[g.line];
      const shiftAlong = (along - li.len) * alignK;
      const a = g.along + shiftAlong;
      const c = g.across + off;
      let x, y;
      if (!vertical) { x = a; y = c; } else { x = W - c; y = a; }
      out.push({
        ...g, group,
        x: x + g.shiftX, y: y + g.shiftY,
        axisPos: a, lineCenter: shiftAlong + li.len / 2, lineStart: shiftAlong, lineLen: li.len,
        lineInkA: li.inkA, lineInkD: li.inkD
      });
    }
    return out;
  };
  const glyphs = place(main, mainOff, 'main');
  const subGlyphs = sub ? place(sub, subOff, 'sub') : [];
  const boxOf = (off, across, len) => (!vertical
    ? { x: (along - len) * alignK, y: off, w: len, h: across }
    : { x: W - off - across, y: (along - len) * alignK, w: across, h: len });
  return {
    w: W, h: H,
    glyphs, subGlyphs,
    mainBox: boxOf(mainOff, mainAcross, main.extentAlong),
    subBox: sub ? boxOf(subOff, subAcross, sub.extentAlong) : null,
    gapPx: gap
  };
}

/* 每個字群裡給可見字（非空白）編號，供逐字順序、交錯、波浪使用 */
export function indexVisible(glyphs) {
  let n = 0;
  const perLine = new Map();
  for (const g of glyphs) {
    if (g.space) { g.vis = -1; continue; }
    g.vis = n++;
    const k = g.line;
    g.lineVis = perLine.get(k) || 0;
    perLine.set(k, g.lineVis + 1);
  }
  for (const g of glyphs) g.lineVisN = perLine.get(g.line) || 0;
  return n;
}
